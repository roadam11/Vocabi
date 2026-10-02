import { describe, expect, it } from "vitest";
import type { Layer } from "@/content/schema";
import { SESSION } from "./config";
import { dayKey } from "./days";
import {
  ALL,
  cardMap,
  daysBefore,
  REC,
  REC_CTX,
  reviewed,
  sense,
  senses,
  TZ,
} from "./fixtures/session";
import {
  type Answer,
  cardKey,
  type CardState,
  newCardState,
  review,
  type ReviewLogEntry,
} from "./fsrs";
import {
  applyEvent,
  buildSession,
  currentItem,
  isFinished,
  isStale,
  itemRng,
  type SessionInput,
  type SessionItem,
  sensesIntroducedOn,
  type SessionState,
} from "./session";
import type { Cards, SessionSense } from "./workload";

const NOW = new Date("2026-10-03T07:00:00Z"); // 10:00 local
const GAP = SESSION.relearnGap;
const ok: Answer = { outcome: "correct", ms: 3000, typo: false, mode: "practice" };
const bad: Answer = { outcome: "wrong", ms: 3000, typo: false, mode: "practice" };

function input(over: Partial<SessionInput>): SessionInput {
  return {
    now: NOW,
    timeZone: TZ,
    minutesPerDay: 10,
    senses: [],
    cards: {},
    introducedToday: [],
    seed: 42,
    ...over,
  };
}

function session(over: Partial<SessionInput>): SessionState {
  const r = buildSession(input(over));
  if (r.kind !== "session") throw new Error(`expected a session, got ${JSON.stringify(r)}`);
  return r.state;
}

const sec = (items: readonly SessionItem[]) =>
  items.reduce(
    (t, i) => t + (i.layer ? SESSION.itemSeconds[i.layer] : SESSION.itemSeconds.learn),
    0,
  );

const label = (i: SessionItem) => `${i.kind}:${i.senseId}${i.layer ? `:${i.layer}` : ""}`;

/** Due recognition cards for `ss` (one Good review `daysAgo` days back). */
const dueCards = (ss: readonly SessionSense[], daysAgo = 3, layer: Layer = "recognition") =>
  cardMap(ss.map((s) => reviewed(s.id, layer, [daysBefore(NOW, daysAgo)])));

/** Answer / continue the current item. */
function step(s: SessionState, answer: Answer = ok, counts = true) {
  const item = currentItem(s)!;
  const r =
    item.kind === "learn"
      ? applyEvent(s, { type: "continue", itemId: item.id })
      : applyEvent(s, { type: "answer", itemId: item.id, answer, countsTowardMastery: counts });
  expect(r.accepted).toBe(true);
  return r;
}

/** Indices of a sense's items in plan order. */
const positions = (items: readonly SessionItem[], senseId: string) =>
  items.flatMap((it, i) => (it.senseId === senseId ? [i] : []));

/** Fewest items strictly between two consecutive items of one sense. */
function minGap(items: readonly SessionItem[]): number {
  let min = Infinity;
  for (const id of new Set(items.map((i) => i.senseId))) {
    const ps = positions(items, id);
    for (let k = 1; k < ps.length; k++) min = Math.min(min, ps[k]! - ps[k - 1]! - 1);
  }
  return min;
}

describe("buildSession: empty state (docs/ENGINE.md §7 edge cases)", () => {
  it("no content at all → done, no extra practice offered", () => {
    expect(buildSession(input({}))).toEqual({
      kind: "done",
      extra: { newWords: false, weakWords: false },
    });
  });

  it("everything mastered → done, nothing to offer", () => {
    const strong = [0, 1, 4, 12, 40].map((d) => daysBefore(NOW, 60 - d));
    const ss = [sense("a.n.01", REC)];
    // Last review 20 days ago with a long interval: not due today.
    const cards = cardMap([reviewed("a.n.01", "recognition", strong)]);
    expect(cards[cardKey("a.n.01", "recognition")]!.fsrs.due > NOW).toBe(true);
    expect(buildSession(input({ senses: ss, cards }))).toEqual({
      kind: "done",
      extra: { newWords: false, weakWords: false },
    });
  });

  it("nothing due and no new allowed → done, with both extra-practice choices offered", () => {
    const ss = senses(3, REC);
    // Sense 0 reviewed today (not due again today); the new-word share is used up today.
    const cards = cardMap([reviewed(ss[0]!.id, "recognition", [daysBefore(NOW, 0.01)])]);
    const r = buildSession(input({ senses: ss, cards, minutesPerDay: 1 }));
    expect(r).toEqual({ kind: "done", extra: { newWords: true, weakWords: true } });
  });
});

describe("buildSession: budget and hard cap (§7, DECISIONS #13)", () => {
  const ss = senses(300, REC);
  const cards = dueCards(ss);

  it.each([5, 10, 20])("%i minutes: fills with due reviews up to the budget", (minutes) => {
    const s = session({ senses: ss, cards, minutesPerDay: minutes });
    expect(sec(s.items)).toBeLessThanOrEqual(minutes * 60);
    expect(sec(s.items)).toBeGreaterThan(minutes * 60 - 8);
    expect(s.budgetSec).toBe(minutes * 60);
  });

  it("the 30-minute cap holds whatever minutes are asked for, extra practice included", () => {
    expect(session({ senses: ss, cards, minutesPerDay: 45 }).budgetSec).toBe(1800);
    const weak = session({ senses: ss, cards, extra: { kind: "weakWords", minutes: 45 } });
    expect(weak.budgetSec).toBe(1800);
    expect(sec(weak.items)).toBeLessThanOrEqual(1800);
    const fresh = senses(200, REC_CTX);
    const more = session({ senses: fresh, extra: { kind: "newWords", count: 100 } });
    expect(sec(more.items)).toBeLessThanOrEqual(1800);
    expect(more.capSec).toBe(1800);
  });
});

describe("buildSession: fill order (§7)", () => {
  it("due reviews lowest retrievability first, then recent lapses, then started senses, then new", () => {
    const ss = [
      sense("old.n.01", REC),
      sense("recent.n.01", REC),
      sense("lapse.n.01", REC),
      sense("part.n.01", REC_CTX),
      sense("new.n.01", REC_CTX),
    ];
    const lapse = reviewed("lapse.n.01", "recognition", [daysBefore(NOW, 9), daysBefore(NOW, 2)]);
    const lapsed: CardState = {
      ...lapse,
      successes: 1,
      lastRating: "again",
      fsrs: { ...lapse.fsrs, due: new Date(NOW.getTime() + 5 * 86_400_000) },
    };
    const cards = cardMap([
      reviewed("old.n.01", "recognition", [daysBefore(NOW, 30)]),
      reviewed("recent.n.01", "recognition", [daysBefore(NOW, 2)]),
      lapsed,
      reviewed("part.n.01", "recognition", [daysBefore(NOW, 0.01)]),
    ]);
    const s = session({ senses: ss, cards, minutesPerDay: 20 });
    const reviews = s.items.filter((i) => i.kind === "review").map((i) => i.senseId);
    expect(reviews).toEqual(["old.n.01", "recent.n.01", "lapse.n.01"]);
    expect(s.items.map(label)).toContain("practice:part.n.01:context");
    expect(s.items.map(label)).not.toContain("practice:part.n.01:recognition");
    expect(s.items.filter((i) => i.senseId === "new.n.01").map((i) => i.kind)).toEqual([
      "learn",
      "practice",
      "practice",
    ]);
    // Reviews were filled first: with room only for them, nothing else is planned.
    const tight = session({ senses: ss, cards, minutesPerDay: 0.4 });
    expect(tight.items.map((i) => i.kind)).toEqual(["review", "review", "review"]);
  });

  it("a card rated today is never due again today; ratedToday is seeded from the cards", () => {
    const ss = senses(2, REC);
    const cards = cardMap([
      reviewed(ss[0]!.id, "recognition", [daysBefore(NOW, 5), daysBefore(NOW, 0.01)], "again"),
      reviewed(ss[1]!.id, "recognition", [daysBefore(NOW, 3)]),
    ]);
    const s = session({ senses: ss, cards });
    expect(s.items.map(label)).toEqual([`review:${ss[1]!.id}:recognition`]);
    expect(s.ratedToday).toEqual([cardKey(ss[0]!.id, "recognition")]);
  });
});

describe("buildSession: new-word quota (§7)", () => {
  it("no exam date: new senses take at most 40% of the budget", () => {
    // 10 min → 240 s share; a recognition+context unit costs 43 s → 5 units.
    const s = session({ senses: senses(20, REC_CTX) });
    expect(s.items.filter((i) => i.kind === "learn")).toHaveLength(5);
  });

  it("senses introduced earlier today use up the 40% share", () => {
    const ss = senses(20, REC_CTX);
    const today = daysBefore(NOW, 0.01);
    const cards = cardMap([
      reviewed(ss[0]!.id, "recognition", [today]),
      reviewed(ss[0]!.id, "context", [today]),
      reviewed(ss[1]!.id, "recognition", [today]),
      reviewed(ss[1]!.id, "context", [today]),
    ]);
    const s = session({ senses: ss, cards, introducedToday: [ss[0]!.id, ss[1]!.id] });
    expect(s.items.filter((i) => i.kind === "learn")).toHaveLength(3); // 240 − 86 = 154 s
  });

  it("exam in 30 days: newPerDay = ceil(unmasteredTarget / (daysLeft − 14)), minus today's", () => {
    const ss = senses(40, REC_CTX);
    const s = session({ senses: ss, examDayKey: "2026-11-02", minutesPerDay: 20 });
    expect(s.items.filter((i) => i.kind === "learn")).toHaveLength(3); // ceil(40 / 16)
    const later = buildSession(
      input({ senses: ss, examDayKey: "2026-11-02", introducedToday: ["x", "y", "z"] }),
    );
    expect(later.kind).toBe("done");
  });

  it("exam in 30 days: the quota is still capped by the budget", () => {
    const s = session({ senses: senses(400, REC_CTX), examDayKey: "2026-11-02", minutesPerDay: 5 });
    expect(s.items.filter((i) => i.kind === "learn")).toHaveLength(6); // 300 s / 43 s
  });

  describe("taper window (exam ≤ 14 days)", () => {
    const fresh = senses(10, REC_CTX, "B2");
    const due = [sense("d1.n.01", REC, "B3"), sense("d2.n.01", REC, "B3")];
    const both = [...due, ...fresh];

    it.each([
      ["exam today", "2026-10-03"],
      ["exam in 10 days", "2026-10-13"],
    ])("%s: no new words while anything else is due", (_, exam) => {
      const s = session({ senses: both, cards: dueCards(due), examDayKey: exam });
      expect(s.items.map((i) => i.kind)).toEqual(["review", "review"]);
    });

    it.each([
      ["exam today", "2026-10-03"],
      ["exam in 10 days", "2026-10-13"],
    ])("%s: with nothing else due, new words come back (40% share)", (_, exam) => {
      const s = session({ senses: fresh, examDayKey: exam });
      expect(s.items.filter((i) => i.kind === "learn")).toHaveLength(5);
    });
  });

  it("exam in the past: new words follow the no-exam rule", () => {
    const s = session({ senses: senses(20, REC_CTX), examDayKey: "2026-09-01" });
    expect(s.items.filter((i) => i.kind === "learn")).toHaveLength(5);
  });

  it("DST week in Asia/Jerusalem: the taper starts at local midnight of 2026-10-25", () => {
    const fresh = senses(5, REC_CTX, "B2");
    const due = [sense("d1.n.01", REC, "B3")];
    const at = (iso: string) => {
      const now = new Date(iso);
      const cards = cardMap([reviewed(due[0]!.id, "recognition", [daysBefore(now, 3)])]);
      return session({ now, senses: [...due, ...fresh], cards, examDayKey: "2026-11-08" });
    };
    const learns = (s: SessionState) => s.items.filter((i) => i.kind === "learn").length;
    expect(learns(at("2026-10-24T20:30:00Z"))).toBeGreaterThan(0); // 23:30 local, 15 days left
    expect(learns(at("2026-10-24T21:30:00Z"))).toBe(0); // 00:30 local, 14 days left
    expect(learns(at("2026-10-25T22:30:00Z"))).toBe(0); // 00:30 local (UTC+2), 13 days left
  });
});

describe("spacing within a session (docs/DECISIONS.md #43)", () => {
  it("learn steps are grouped; each next item of a sense comes at least 3 items later", () => {
    const ss = senses(4, REC_CTX);
    const s = session({ senses: ss });
    expect(s.items.slice(0, 4).every((i) => i.kind === "learn")).toBe(true);
    expect(minGap(s.items)).toBeGreaterThanOrEqual(GAP);
    for (const x of ss) {
      expect(s.items.filter((i) => i.senseId === x.id).map((i) => i.layer)).toEqual([
        null,
        "recognition",
        "context",
      ]);
    }
  });

  it("a three-layer sense: learn → recognition → context → production, never back-to-back when room", () => {
    const ss = senses(4, ALL);
    const s = session({ senses: ss, minutesPerDay: 20 });
    expect(minGap(s.items)).toBeGreaterThanOrEqual(GAP);
    for (const x of ss) {
      expect(s.items.filter((i) => i.senseId === x.id).map((i) => i.layer)).toEqual([
        null,
        "recognition",
        "context",
        "production",
      ]);
    }
  });

  it("small session, one sense: the order still holds (no room for a gap)", () => {
    const s = session({ senses: senses(1, ALL), minutesPerDay: 20 });
    expect(s.items.map((i) => i.layer)).toEqual([null, "recognition", "context", "production"]);
  });

  it("small session, two senses: the gap is as large as possible (1) and the order holds", () => {
    const ss = senses(2, ALL);
    const s = session({ senses: ss, minutesPerDay: 20 });
    expect(s.items.map(label)).toEqual([
      `learn:${ss[0]!.id}`,
      `learn:${ss[1]!.id}`,
      `practice:${ss[0]!.id}:recognition`,
      `practice:${ss[1]!.id}:recognition`,
      `practice:${ss[0]!.id}:context`,
      `practice:${ss[1]!.id}:context`,
      `practice:${ss[0]!.id}:production`,
      `practice:${ss[1]!.id}:production`,
    ]);
    expect(minGap(s.items)).toBe(1);
  });

  it("due reviews serve as spacers: trailing reviews move between a learn step and its practice", () => {
    const fresh = senses(1, REC, "B2");
    const due = [sense("r1.n.01", REC), sense("r2.n.01", REC), sense("r3.n.01", REC)];
    const more = [sense("r4.n.01", REC), sense("r5.n.01", REC)];
    const s = session({ senses: [...due, ...more, ...fresh], cards: dueCards([...due, ...more]) });
    expect(s.items.map((i) => i.kind)).toEqual([
      "review",
      "review",
      "learn",
      "review",
      "review",
      "review",
      "practice",
    ]);
    expect(positions(s.items, fresh[0]!.id)).toEqual([2, 6]);
  });

  it("with too few reviews to space, the gap is as large as the items allow", () => {
    const fresh = senses(1, REC, "B2");
    const due = [sense("r1.n.01", REC)];
    const s = session({ senses: [...due, ...fresh], cards: dueCards(due) });
    expect(s.items.map((i) => i.kind)).toEqual(["learn", "review", "practice"]);
  });
});

describe("verify-first (§7: p_b ≥ 0.8)", () => {
  const ss = senses(10, REC_CTX, "B1");
  const placement = { perBand: [{ band: "B1" as const, p: 0.9 }] };

  it("a new sense from a known band starts with a recognition check and no teach card", () => {
    const s = session({ senses: ss, placement });
    expect(s.items.map((i) => `${i.kind}:${i.layer}:${i.mode}`)).toEqual(
      Array(10).fill("check:recognition:verify"),
    );
    // Without placement (or below 0.8), the same senses are taught.
    expect(session({ senses: ss }).items[0]!.kind).toBe("learn");
  });

  it("correct → recognition rated, follow-up practice for the other layers spaced after it", () => {
    const s = session({ senses: ss, placement });
    const r = step(s, ok);
    expect(r.toRate).toEqual({ senseId: ss[0]!.id, layer: "recognition", answer: ok });
    const items = r.state.items;
    expect(items.some((i) => i.kind === "learn")).toBe(false);
    expect(label(items[0 + 1 + GAP]!)).toBe(`practice:${ss[0]!.id}:context`);
  });

  it("wrong → rated Again, then the normal teach flow; its recognition practice is unrated", () => {
    let s = session({ senses: ss, placement });
    const first = step(s, bad);
    expect(first.toRate).toEqual({ senseId: ss[0]!.id, layer: "recognition", answer: bad });
    s = first.state;
    expect(label(currentItem(s)!)).toBe(`learn:${ss[0]!.id}`);
    const mine = s.items.filter((i, k) => k >= s.cursor && i.senseId === ss[0]!.id);
    expect(mine.map((i) => `${i.kind}:${i.layer}`)).toEqual([
      "learn:null",
      "practice:recognition",
      "practice:context",
    ]);
    expect(minGap(s.items.slice(s.cursor))).toBeGreaterThanOrEqual(GAP);
    // Play to the end: recognition is not rated a second time today; context is.
    const rated: string[] = [];
    while (!isFinished(s)) {
      const r = step(s, ok);
      if (r.toRate) rated.push(`${r.toRate.senseId}:${r.toRate.layer}`);
      s = r.state;
    }
    expect(rated.filter((x) => x.startsWith(ss[0]!.id))).toEqual([`${ss[0]!.id}:context`]);
  });

  it("a wrong check's teach flow may exceed the daily budget but never the 30-minute cap", () => {
    // 21 s budget: the 40% share (8.4 s) fits one 8 s check; its 43 s teach flow does not.
    const one = session({ senses: ss.slice(0, 1), placement, minutesPerDay: 0.35 });
    expect(one.items).toHaveLength(1);
    const r = step(one, bad);
    expect(r.state.items.map((i) => i.kind)).toEqual(["check", "learn", "practice", "practice"]);
  });
});

describe('"I know this" in the learn step (docs/DECISIONS.md #41)', () => {
  const ss = senses(4, REC_CTX);

  it("never rates; drops the sense's practice and schedules a check at least 3 items later", () => {
    const s = session({ senses: ss });
    const learn = currentItem(s)!;
    const r = applyEvent(s, { type: "knowIt", itemId: learn.id });
    expect(r.accepted).toBe(true);
    expect(r.toRate).toBeNull();
    const mine = r.state.items.filter((i) => i.senseId === learn.senseId);
    expect(mine.map((i) => `${i.kind}:${i.layer}`)).toEqual(["learn:null", "check:recognition"]);
    const checkAt = r.state.items.findIndex((i) => i.kind === "check");
    expect(checkAt).toBe(0 + 1 + GAP);
    expect(r.state.items[checkAt]!.mode).toBe("verify");
  });

  it("at the end of a short session the check goes last", () => {
    const s = session({ senses: senses(1, REC) });
    const r = applyEvent(s, { type: "knowIt", itemId: currentItem(s)!.id });
    expect(r.state.items.map((i) => i.kind)).toEqual(["learn", "check"]);
  });

  it("check correct → recognition rated, other layers follow; wrong → teach flow, recognition unrated twice", () => {
    let s = session({ senses: ss });
    const id = currentItem(s)!.senseId;
    s = applyEvent(s, { type: "knowIt", itemId: currentItem(s)!.id }).state;
    const rated: (string | null)[] = [];
    while (currentItem(s)!.kind !== "check" || currentItem(s)!.senseId !== id) s = step(s).state;
    const r = step(s, ok);
    expect(r.toRate).toMatchObject({ senseId: id, layer: "recognition" });
    expect(r.state.items.slice(r.state.cursor).map(label)).toContain(`practice:${id}:context`);

    // Wrong instead: Again, then learn + practice; the later recognition practice is unrated.
    let w = applyEvent(s, {
      type: "answer",
      itemId: currentItem(s)!.id,
      answer: bad,
      countsTowardMastery: true,
    });
    expect(w.toRate).toMatchObject({ senseId: id, layer: "recognition" });
    let t = w.state;
    expect(label(currentItem(t)!)).toBe(`learn:${id}`);
    while (!isFinished(t)) {
      w = step(t, ok);
      if (w.toRate?.senseId === id) rated.push(w.toRate.layer);
      t = w.state;
    }
    expect(rated).toEqual(["context"]);
  });

  it("acts as a plain continue when a check would pass the 30-minute cap", () => {
    const s = session({ senses: ss });
    const r = applyEvent({ ...s, capSec: 0 }, { type: "knowIt", itemId: currentItem(s)!.id });
    expect(r.toRate).toBeNull();
    expect(r.state.items).toEqual(s.items);
    expect(r.state.cursor).toBe(1);
  });

  it("is only accepted on a learn step", () => {
    const s = session({ senses: senses(1, REC) });
    const after = step(s).state; // past the learn step, now on practice
    const r = applyEvent(after, { type: "knowIt", itemId: currentItem(after)!.id });
    expect(r.accepted).toBe(false);
    expect(r.state).toBe(after);
  });
});

describe("in-session relearning (docs/DECISIONS.md #40)", () => {
  const ss = senses(20, REC);
  const cards = dueCards(ss);

  it("a wrong answer is re-queued once, 3 items later, unrated", () => {
    const s = session({ senses: ss, cards });
    const first = currentItem(s)!;
    const r = step(s, bad);
    expect(r.toRate).toMatchObject({ senseId: first.senseId, answer: bad });
    const copy = r.state.items[0 + 1 + GAP]!;
    expect(copy).toMatchObject({
      kind: "practice",
      senseId: first.senseId,
      layer: "recognition",
      unrated: true,
      requeue: true,
    });
    expect(r.state.items).toHaveLength(s.items.length + 1);
  });

  it('"I don\'t know" re-queues too; with fewer than 3 items left the copy goes last', () => {
    const s = session({ senses: ss.slice(0, 2), cards });
    const dontKnow: Answer = { outcome: "dontKnow", ms: 900, typo: false, mode: "practice" };
    const r = step(s, dontKnow);
    expect(r.state.items.map((i) => i.requeue)).toEqual([false, false, true]);
  });

  it("the copy is never rated and never re-queued again", () => {
    let s = session({ senses: ss.slice(0, 1), cards });
    s = step(s, bad).state;
    expect(currentItem(s)!.requeue).toBe(true);
    const r = step(s, bad);
    expect(r.toRate).toBeNull();
    expect(isFinished(r.state)).toBe(true);
  });

  it("is skipped when the copy would exceed the time budget", () => {
    const s = session({ senses: ss, cards, minutesPerDay: 1 }); // 7 × 8 s = 56 s of 60
    expect(sec(s.items)).toBe(56);
    const r = step(s, bad);
    expect(r.state.items).toHaveLength(s.items.length);
  });

  it("a layer is rated once per day: a review of a layer already rated today is not rated again", () => {
    const s = session({ senses: ss.slice(0, 2), cards });
    const seeded = { ...s, ratedToday: [cardKey(ss[0]!.id, "recognition")] };
    expect(step(seeded, ok).toRate).toBeNull();
  });

  it("a practice-only item (fallback, DECISIONS #3) never rates, but a wrong one still re-queues", () => {
    const s = session({ senses: ss, cards });
    const r = step(s, bad, false);
    expect(r.toRate).toBeNull();
    expect(r.state.items[0 + 1 + GAP]!.requeue).toBe(true);
    expect(step(s, ok, false).toRate).toBeNull();
  });
});

describe("extra practice after done (docs/DECISIONS.md #45)", () => {
  it('"learn N more new words": normal units, rated, up to N, within 30 minutes', () => {
    const ss = senses(10, REC_CTX);
    const s = session({ senses: ss, extra: { kind: "newWords", count: 3 } });
    expect(s.items.filter((i) => i.kind === "learn")).toHaveLength(3);
    let st = s;
    while (currentItem(st)!.kind === "learn") st = step(st).state;
    expect(step(st, ok).toRate).not.toBeNull();
  });

  it('"review weak words": the weakest started, unmastered cards, never rated', () => {
    const ss = senses(3, REC);
    const cards = cardMap([
      reviewed(ss[0]!.id, "recognition", [daysBefore(NOW, 2)]),
      reviewed(ss[1]!.id, "recognition", [daysBefore(NOW, 20)]),
    ]);
    const s = session({ senses: ss, cards, extra: { kind: "weakWords", minutes: 5 } });
    expect(s.items.map((i) => [i.senseId, i.unrated])).toEqual([
      [ss[1]!.id, true],
      [ss[0]!.id, true],
    ]);
    expect(step(s, ok).toRate).toBeNull();
  });
});

describe("deterministic, persistable plan (docs/DECISIONS.md #42)", () => {
  const ss = senses(30, REC_CTX);
  const cards = dueCards(senses(10, REC, "B4").map((x) => ({ ...x, id: `d${x.id}` })));
  const all = [...senses(10, REC, "B4").map((x) => ({ ...x, id: `d${x.id}` })), ...ss];

  it("same inputs + seed → the same plan; the plan is plain JSON", () => {
    const a = session({ senses: all, cards });
    const b = session({ senses: all, cards });
    expect(a).toEqual(b);
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
  });

  it("item question rngs depend on the seed and the item id only", () => {
    const a = session({ senses: all, cards, seed: 1 });
    const b = session({ senses: all, cards, seed: 2 });
    const draw = (s: SessionState, id: string) => {
      const rng = itemRng(s, id);
      return [rng(), rng(), rng()];
    };
    expect(draw(a, "i3")).toEqual(draw(JSON.parse(JSON.stringify(a)), "i3"));
    expect(draw(a, "i3")).not.toEqual(draw(b, "i3"));
    expect(draw(a, "i3")).not.toEqual(draw(a, "i4"));
  });

  it("resume mid-session: a JSON round-trip of the state continues identically", () => {
    const answers = [ok, bad, ok, ok, bad, ok, ok, ok, bad, ok, ok, ok];
    const run = (roundTrip: boolean) => {
      let s = session({ senses: all, cards });
      const out: unknown[] = [];
      answers.forEach((a, k) => {
        if (roundTrip && k === 5) s = JSON.parse(JSON.stringify(s)) as SessionState;
        const r = step(s, a);
        out.push(r.toRate);
        s = r.state;
      });
      return { out, s };
    };
    expect(run(true)).toEqual(run(false));
  });

  it("a replayed or out-of-order event is rejected and changes nothing", () => {
    const s = session({ senses: all, cards });
    const item = currentItem(s)!;
    const ev = { type: "answer" as const, itemId: item.id, answer: ok, countsTowardMastery: true };
    const next = applyEvent(s, ev).state;
    const replay = applyEvent(next, ev);
    expect(replay).toEqual({ state: next, toRate: null, accepted: false });
    expect(applyEvent(s, { type: "continue", itemId: item.id }).accepted).toBe(false);
    const done = { ...s, cursor: s.items.length };
    expect(applyEvent(done, ev).accepted).toBe(false);
    expect(currentItem(done)).toBeNull();
  });

  it("a plan from another local day is stale", () => {
    const s = session({ senses: all, cards });
    expect(isStale(s, NOW, TZ)).toBe(false);
    expect(isStale(s, new Date("2026-10-03T20:59:00Z"), TZ)).toBe(false); // 23:59 local
    expect(isStale(s, new Date("2026-10-03T21:00:00Z"), TZ)).toBe(true); // 00:00 local
  });
});

describe("sensesIntroducedOn", () => {
  const log = (senseId: string, iso: string): ReviewLogEntry => ({
    senseId,
    layer: "recognition",
    rating: "good",
    reviewedAt: iso,
    outcome: "correct",
    ms: 1000,
    typo: false,
    mode: "learn",
  });

  it("counts senses whose first log falls on the local day", () => {
    const logs = [
      log("a", "2026-10-02T20:00:00Z"), // 23:00 local on 10-02
      log("a", "2026-10-03T06:00:00Z"),
      log("b", "2026-10-02T21:30:00Z"), // 00:30 local on 10-03
      log("c", "2026-10-03T09:00:00Z"),
    ];
    expect(sensesIntroducedOn(logs, "2026-10-03", TZ).sort()).toEqual(["b", "c"]);
  });
});

describe("day 1 → day 2 → day 8 with an injected clock", () => {
  const ss = senses(3, REC);

  /** Plays a whole session correctly, applying ratings like the app will. */
  function play(
    s: SessionState,
    cards: Record<string, CardState>,
    logs: ReviewLogEntry[],
    now: Date,
  ) {
    while (!isFinished(s)) {
      const r = step(s, ok);
      if (r.toRate) {
        const key = cardKey(r.toRate.senseId, r.toRate.layer);
        const prev = cards[key] ?? newCardState(r.toRate.senseId, r.toRate.layer, now);
        const out = review(prev, r.toRate.answer, now);
        cards[key] = out.state;
        logs.push(out.log);
      }
      s = r.state;
    }
  }

  it("teaches on day 1, is done after, reviews on day 2, done on day 8, reviews on day 9", () => {
    const cards: Record<string, CardState> = {};
    const logs: ReviewLogEntry[] = [];
    const build = (now: Date) =>
      buildSession(
        input({
          now,
          senses: ss,
          cards: cards as Cards,
          introducedToday: sensesIntroducedOn(logs, dayKey(now, TZ), TZ),
        }),
      );

    const day1 = build(NOW);
    expect(day1.kind).toBe("session");
    if (day1.kind === "session") {
      expect(day1.state.items.filter((i) => i.kind === "learn")).toHaveLength(3);
      play(day1.state, cards, logs, NOW);
    }
    expect(Object.keys(cards)).toHaveLength(3);
    expect(build(new Date(NOW.getTime() + 3_600_000))).toEqual({
      kind: "done",
      extra: { newWords: false, weakWords: true },
    });

    const d2 = new Date(NOW.getTime() + 86_400_000);
    const day2 = build(d2);
    expect(day2.kind === "session" && day2.state.items.map((i) => i.kind)).toEqual([
      "review",
      "review",
      "review",
    ]);
    if (day2.kind === "session") play(day2.state, cards, logs, d2);

    // Good on day 1 and day 2 schedules the next review 8 days after day 2 (ts-fsrs defaults).
    const d8 = new Date(NOW.getTime() + 7 * 86_400_000);
    expect(build(d8)).toEqual({ kind: "done", extra: { newWords: false, weakWords: true } });
    const day9 = build(new Date(NOW.getTime() + 8 * 86_400_000));
    expect(day9.kind === "session" && day9.state.items.map((i) => i.kind)).toEqual([
      "review",
      "review",
      "review",
    ]);
  });
});
