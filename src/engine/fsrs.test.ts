import { describe, expect, it } from "vitest";
import { FSRS, SLOW_MS } from "./config";
import {
  type Answer,
  applyReview,
  cardKey,
  type CardState,
  newCardState,
  rateOutcome,
  replayCard,
  retrievabilityAt,
  review,
  type ReviewLogEntry,
  schedulerParams,
} from "./fsrs";

const T0 = new Date("2026-10-01T09:00:00Z");
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);
const DAY = 24 * 60;

const good: Answer = { outcome: "correct", ms: 3000, typo: false, mode: "practice" };
const wrong: Answer = { outcome: "wrong", ms: 4000, typo: false, mode: "practice" };

describe("cardKey (docs/ENGINE.md §1: one card per sense × layer)", () => {
  it("is stable and distinct per layer and per sense", () => {
    expect(cardKey("abandon.v.01", "recognition")).toBe("abandon.v.01#recognition");
    const keys = new Set([
      cardKey("abandon.v.01", "recognition"),
      cardKey("abandon.v.01", "context"),
      cardKey("abandon.v.01", "production"),
      cardKey("abandon.v.02", "recognition"),
    ]);
    expect(keys.size).toBe(4);
  });
});

describe("scheduler parameters (docs/ENGINE.md §1, DECISIONS #14)", () => {
  it("uses the configured desired retention with built-in default weights and no fuzz", () => {
    expect(FSRS.requestRetention).toBe(0.9);
    expect(schedulerParams.request_retention).toBe(0.9);
    expect(schedulerParams.enable_fuzz).toBe(false);
  });
});

describe("rateOutcome (docs/ENGINE.md §2)", () => {
  it("wrong and I-don't-know are Again", () => {
    expect(rateOutcome("recognition", wrong)).toBe("again");
    expect(rateOutcome("recognition", { ...wrong, outcome: "dontKnow" })).toBe("again");
    // A typo flag on a wrong answer never upgrades it.
    expect(rateOutcome("production", { ...wrong, typo: true })).toBe("again");
  });

  it("correct within the time limit is Good", () => {
    expect(rateOutcome("recognition", good)).toBe("good");
  });

  it.each([
    ["recognition", 8000],
    ["context", 15000],
    ["production", 20000],
  ] as const)("%s: slowMs is %d; exactly at it is Good, 1ms over is Hard", (layer, ms) => {
    expect(SLOW_MS[layer]).toBe(ms);
    expect(rateOutcome(layer, { ...good, ms })).toBe("good");
    expect(rateOutcome(layer, { ...good, ms: ms + 1 })).toBe("hard");
  });

  it("correct with an accepted typo is Hard", () => {
    expect(rateOutcome("production", { ...good, typo: true })).toBe("hard");
  });
});

describe("review (docs/ENGINE.md §1-2, §7 raw review logs)", () => {
  it("a Good review schedules the card forward and counts a success", () => {
    const s0 = newCardState("abandon.v.01", "recognition", T0);
    expect(s0.successes).toBe(0);
    expect(s0.lastRating).toBeNull();
    const { state } = review(s0, good, at(1));
    expect(state.successes).toBe(1);
    expect(state.lastRating).toBe("good");
    expect(state.fsrs.reps).toBe(1);
    expect(state.fsrs.due.getTime()).toBeGreaterThan(at(1).getTime());
  });

  it("an Again review does not count a success", () => {
    const s0 = newCardState("abandon.v.01", "recognition", T0);
    const { state } = review(s0, wrong, at(1));
    expect(state.successes).toBe(0);
    expect(state.lastRating).toBe("again");
  });

  it("every review returns a raw log entry with the rating and the raw outcome", () => {
    const s0 = newCardState("abandon.v.01", "production", T0);
    const answer: Answer = { outcome: "correct", ms: 21000, typo: true, mode: "learn" };
    const { log } = review(s0, answer, at(2));
    expect(log).toEqual<ReviewLogEntry>({
      senseId: "abandon.v.01",
      layer: "production",
      rating: "hard",
      reviewedAt: "2026-10-01T09:02:00.000Z",
      outcome: "correct",
      ms: 21000,
      typo: true,
      mode: "learn",
    });
  });

  it("does not mutate its input", () => {
    const s0 = newCardState("abandon.v.01", "recognition", T0);
    const snapshot = structuredClone(s0);
    review(s0, good, at(1));
    expect(s0).toEqual(snapshot);
  });

  it("is deterministic", () => {
    const run = () => {
      let s = newCardState("abandon.v.01", "context", T0);
      for (const [m, a] of [
        [1, good],
        [11, wrong],
        [2 * DAY, good],
      ] as const) {
        s = review(s, a, at(m)).state;
      }
      return s;
    };
    expect(run()).toEqual(run());
  });
});

describe("replayCard (docs/DECISIONS.md #8, #38: state is recomputable from raw logs)", () => {
  const steps: [number, Answer][] = [
    [0, good],
    [10, { ...good, ms: 9000 }],
    [DAY, wrong],
    [DAY + 10, good],
    [4 * DAY, { ...good, outcome: "dontKnow" }],
    [5 * DAY, good],
  ];

  function incremental() {
    let state: CardState = newCardState("abandon.v.01", "recognition", at(0));
    const logs: ReviewLogEntry[] = [];
    for (const [m, a] of steps) {
      const r = review(state, a, at(m));
      state = r.state;
      logs.push(r.log);
    }
    return { state, logs };
  }

  it("replaying the raw logs reproduces the incrementally built state", () => {
    const { state, logs } = incremental();
    expect(replayCard("abandon.v.01", "recognition", logs)).toEqual(state);
  });

  it("orders logs by timestamp, so storage order does not matter", () => {
    const { state, logs } = incremental();
    expect(replayCard("abandon.v.01", "recognition", [...logs].reverse())).toEqual(state);
  });

  it("uses the stored rating, never re-derives it from the raw outcome", () => {
    // Recorded as Good under an older SLOW_MS; today's thresholds would say Hard.
    const log: ReviewLogEntry = {
      senseId: "abandon.v.01",
      layer: "recognition",
      rating: "good",
      reviewedAt: at(0).toISOString(),
      outcome: "correct",
      ms: SLOW_MS.recognition + 5000,
      typo: false,
      mode: "practice",
    };
    const replayed = replayCard("abandon.v.01", "recognition", [log]);
    const expected = applyReview(newCardState("abandon.v.01", "recognition", at(0)), "good", at(0));
    expect(replayed).toEqual(expected);
    expect(replayed.lastRating).toBe("good");
  });

  it("ignores logs of other cards and returns an empty card without logs", () => {
    const { logs } = incremental();
    const other = replayCard("abandon.v.01", "context", logs);
    expect(other.successes).toBe(0);
    expect(other.fsrs.reps).toBe(0);
  });
});

describe("retrievabilityAt", () => {
  it("is 0 for a never-reviewed card", () => {
    expect(retrievabilityAt(newCardState("a.n.01", "recognition", T0), at(DAY))).toBe(0);
  });

  it("decays with time after a review", () => {
    const { state } = review(newCardState("a.n.01", "recognition", T0), good, T0);
    const r1 = retrievabilityAt(state, at(DAY));
    const r30 = retrievabilityAt(state, at(30 * DAY));
    expect(r1).toBeGreaterThan(r30);
    expect(r1).toBeLessThanOrEqual(1);
    expect(r30).toBeGreaterThan(0);
  });
});
