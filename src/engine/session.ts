/**
 * Session builder and in-session flow (docs/ENGINE.md §7). `buildSession` turns the learner's state
 * into a plan; `applyEvent` advances it. The plan is plain JSON, deterministic from its inputs and
 * `seed`, and meant to be persisted after every event so a reload resumes the same plan
 * (docs/DECISIONS.md #42). Ratings are returned to the caller (`toRate`), which applies them with
 * `fsrs.review` and stores the log; the engine stays pure.
 */
import type { Layer } from "@/content/schema";
import { SESSION } from "./config";
import { addDays, dayKey, zonedDayStart } from "./days";
import type { Band } from "./distractors";
import {
  type Answer,
  type AnswerMode,
  applyReview,
  cardKey,
  newCardState,
  type ReviewLogEntry,
} from "./fsrs";
import { masteryHorizon, requiredLayers } from "./mastery";
import { mulberry32, type Rng } from "./random";
import {
  bandKnowledge,
  type BandKnowledge,
  byRetrievability,
  type Cards,
  dueCards,
  examDays,
  isStarted,
  isVerifyFirst,
  itemSeconds,
  layerCards,
  ratedOn,
  reviewedCard,
  senseCost,
  type SessionSense,
  unmasteredSenses,
} from "./workload";

export type ItemKind = "learn" | "review" | "practice" | "check";

export interface SessionItem {
  /** Unique within the session; also seeds the item's question (`itemRng`). */
  id: string;
  /** learn = teach card; review = due card; practice = layer question; check = verification. */
  kind: ItemKind;
  senseId: string;
  /** null only for a learn step. */
  layer: Layer | null;
  /** Mode for the raw review log (docs/DECISIONS.md #38). */
  mode: AnswerMode;
  /** Never rates a card: relearning copies and weak-word practice. */
  unrated: boolean;
  /** A relearning copy; never re-queued again. */
  requeue: boolean;
}

export interface SessionState {
  v: 1;
  seed: number;
  /** Local day the plan was built for; a plan from another day is stale (`isStale`). */
  dayKey: string;
  /** Estimated-seconds budget for optional insertions (relearning copies, follow-ups). */
  budgetSec: number;
  /** The 30-minute hard cap (docs/DECISIONS.md #13): nothing is ever inserted past it. */
  capSec: number;
  items: SessionItem[];
  /** Index of the current item; `items.length` when the session is finished. */
  cursor: number;
  /** Card keys already rated today: a layer is rated at most once per local day. */
  ratedToday: string[];
  /** Required layers of every sense in the plan (for teach flows and follow-ups). */
  senseLayers: Record<string, Layer[]>;
  nextId: number;
}

export type ExtraPractice =
  /** "Learn N more new words": normal new-sense units, rated normally, within the 30-minute cap. */
  | { kind: "newWords"; count: number }
  /** "Review weak words": unrated practice of the weakest started senses. */
  | { kind: "weakWords"; minutes: number };

export interface SessionInput {
  now: Date;
  timeZone: string;
  minutesPerDay: number;
  examDayKey?: string;
  /** Verified track senses in track order. */
  senses: readonly SessionSense[];
  cards: Cards;
  placement?: { perBand: readonly { band: Band; p: number }[] };
  /** Ids of senses first reviewed today (`sensesIntroducedOn`). */
  introducedToday: readonly string[];
  seed: number;
  /** Set for an optional session after "done for today". */
  extra?: ExtraPractice;
}

export type BuildResult =
  | { kind: "session"; state: SessionState }
  /** "You're done for today", with the extra-practice choices that have something to offer. */
  | {
      kind: "done";
      extra: {
        /** "Learn N more new words" is offered: unstarted senses exist, daily ceiling not reached. */
        newWords: boolean;
        /** How many more new senses today allows (`dailyNewLimits`). */
        newWordsLeft: number;
        weakWords: boolean;
      };
    };

const GAP = SESSION.relearnGap;
const CAP_SEC = SESSION.hardCapMinutes * 60;

const itemCost = (item: SessionItem) => itemSeconds(item.layer);
const plannedSec = (items: readonly SessionItem[]) => items.reduce((t, i) => t + itemCost(i), 0);

/** Ids of senses whose first review log falls on local day `todayKey`. */
export function sensesIntroducedOn(
  logs: readonly ReviewLogEntry[],
  todayKey: string,
  timeZone: string,
): string[] {
  const first = new Map<string, string>();
  for (const l of logs) {
    const prev = first.get(l.senseId);
    if (prev === undefined || l.reviewedAt < prev) first.set(l.senseId, l.reviewedAt);
  }
  return [...first]
    .filter(([, at]) => dayKey(new Date(at), timeZone) === todayKey)
    .map(([id]) => id);
}

type Draft = Omit<SessionItem, "id">;

const draft = (
  kind: ItemKind,
  senseId: string,
  layer: Layer | null,
  mode: AnswerMode,
  unrated = false,
): Draft => ({ kind, senseId, layer, mode, unrated, requeue: false });

/** A new sense's unit: a verify-first check, or learn + one practice item per required layer. */
function newUnit(sense: SessionSense, p: BandKnowledge): Draft[] {
  if (isVerifyFirst(sense, p)) return [draft("check", sense.id, "recognition", "verify")];
  return [
    draft("learn", sense.id, null, "learn"),
    ...requiredLayers(sense).map((l) => draft("practice", sense.id, l, "learn")),
  ];
}

export function buildSession(input: SessionInput): BuildResult {
  const { now, timeZone, senses, cards } = input;
  const today = dayKey(now, timeZone);
  const p = bandKnowledge(input.placement);
  const horizon = masteryHorizon(now, timeZone, input.examDayKey);
  const unmastered = unmasteredSenses(senses, cards, horizon);
  const unstarted = senses.filter((s) => !isStarted(s, cards));
  const limits = dailyNewLimits(input);

  let budgetSec: number;
  let items: Draft[];
  if (input.extra?.kind === "weakWords") {
    budgetSec = Math.min(input.extra.minutes * 60, CAP_SEC);
    items = weakWords(
      unmastered.filter((s) => isStarted(s, cards)),
      cards,
      now,
      budgetSec,
    );
  } else if (input.extra?.kind === "newWords") {
    // "Learn N more": the 30-minute cap per session, the daily ceiling across the day (#48).
    budgetSec = CAP_SEC;
    const count = Math.min(input.extra.count, limits.newWordsLeft);
    items = arrange([], pickNew(unstarted, p, count, budgetSec, Infinity));
  } else {
    budgetSec = dailyBudgetSec(input);
    items = regular(input, p, unmastered.length, unstarted, budgetSec, limits.newWordsLeft);
  }

  if (items.length === 0) {
    return {
      kind: "done",
      extra: {
        newWords: unstarted.length > 0 && limits.newWordsLeft > 0,
        newWordsLeft: Math.min(limits.newWordsLeft, unstarted.length),
        weakWords: unmastered.some((s) => isStarted(s, cards)),
      },
    };
  }

  const inPlan = new Set(items.map((i) => i.senseId));
  return {
    kind: "session",
    state: {
      v: 1,
      seed: input.seed >>> 0,
      dayKey: today,
      budgetSec,
      capSec: CAP_SEC,
      items: items.map((d, i) => ({ ...d, id: `i${i}` })),
      cursor: 0,
      ratedToday: senses
        .flatMap((s) => Object.values(layerCards(s, cards)))
        .filter((c) => ratedOn(c, today, timeZone))
        .map((c) => cardKey(c.senseId, c.layer)),
      senseLayers: Object.fromEntries(
        senses.filter((s) => inPlan.has(s.id)).map((s) => [s.id, [...requiredLayers(s)]]),
      ),
      nextId: items.length,
    },
  };
}

/**
 * §7 fill order within the budget: (1) due reviews, lowest retrievability first; (2) recent
 * lapses; (3) missing layers of started senses; (4) new senses in track order, within the
 * new-word quota.
 */
function regular(
  input: SessionInput,
  p: BandKnowledge,
  target: number,
  unstarted: readonly SessionSense[],
  budgetSec: number,
  newWordsLeft: number,
): Draft[] {
  const { now, timeZone, senses, cards } = input;
  const today = dayKey(now, timeZone);
  let used = 0;
  const fits = (sec: number) => used + sec <= budgetSec;

  const due = dueCards(senses, cards, now, timeZone);
  const dueKeys = new Set(due.map((c) => cardKey(c.senseId, c.layer)));
  const lapses = byRetrievability(
    senses
      .flatMap((s) => Object.values(layerCards(s, cards)))
      .filter(
        (c) =>
          c.successes > 0 &&
          c.lastRating === "again" &&
          !dueKeys.has(cardKey(c.senseId, c.layer)) &&
          !ratedOn(c, today, timeZone),
      ),
    now,
  );
  const reviews: Draft[] = [];
  for (const c of [...due, ...lapses]) {
    if (!fits(itemSeconds(c.layer))) continue;
    used += itemSeconds(c.layer);
    reviews.push(draft("review", c.senseId, c.layer, "practice"));
  }

  const chains: Draft[][] = [];
  let missingAny = false;
  for (const s of senses) {
    if (!isStarted(s, cards)) continue;
    const chain: Draft[] = [];
    for (const l of requiredLayers(s)) {
      if (reviewedCard(cards, s.id, l) !== undefined) continue;
      missingAny = true;
      if (!fits(itemSeconds(l))) break;
      used += itemSeconds(l);
      chain.push(draft("practice", s.id, l, "practice"));
    }
    if (chain.length > 0) chains.push(chain);
  }

  // New-word quota (§7).
  const exam = examDays(now, timeZone, input.examDayKey);
  const somethingElseDue = due.length + lapses.length > 0 || missingAny;
  let maxCount = Infinity;
  let shareSec = Infinity;
  if (exam.kind === "upcoming" && exam.daysLeft > SESSION.taperDays) {
    const perDay = Math.ceil(target / (exam.daysLeft - SESSION.taperDays));
    maxCount = Math.max(0, perDay - input.introducedToday.length);
  } else if (exam.kind === "upcoming" && somethingElseDue) {
    maxCount = 0; // Taper window: no new words unless nothing else is due.
  } else {
    // No exam, a past exam, or a taper day with nothing due: a share of the budget.
    const byId = new Map(senses.map((s) => [s.id, s]));
    const spent = input.introducedToday.reduce((t, id) => {
      const s = byId.get(id);
      return t + (s ? senseCost(s, p) : 0);
    }, 0);
    shareSec = Math.max(0, SESSION.newShareNoExam * budgetSec - spent);
  }
  maxCount = Math.min(maxCount, newWordsLeft);
  chains.push(...pickNew(unstarted, p, maxCount, budgetSec - used, shareSec));
  return arrange(reviews, chains);
}

const dailyBudgetSec = (input: Pick<SessionInput, "minutesPerDay">) =>
  Math.min(input.minutesPerDay * 60, CAP_SEC);

/**
 * Daily new-sense limits (docs/DECISIONS.md #48). `plannedNewPerDay` is what the regular quota
 * plans for a day: ceil(unmasteredTarget / (daysLeft − taperDays)) with an exam beyond the taper
 * window, else the new senses (track order) that fit the 40% share of the daily budget.
 * `dailyNewMax = max(2 × plannedNewPerDay, 20)` caps every new sense of the day, extra practice
 * included; `newWordsLeft` is what remains of it after `introducedToday`.
 */
export function dailyNewLimits(input: SessionInput): {
  plannedNewPerDay: number;
  dailyNewMax: number;
  newWordsLeft: number;
} {
  const { now, timeZone, senses, cards } = input;
  const p = bandKnowledge(input.placement);
  const exam = examDays(now, timeZone, input.examDayKey);
  let plannedNewPerDay: number;
  if (exam.kind === "upcoming" && exam.daysLeft > SESSION.taperDays) {
    const horizon = masteryHorizon(now, timeZone, input.examDayKey);
    const target = unmasteredSenses(senses, cards, horizon).length;
    plannedNewPerDay = Math.ceil(target / (exam.daysLeft - SESSION.taperDays));
  } else {
    const budget = dailyBudgetSec(input);
    const unstarted = senses.filter((s) => !isStarted(s, cards));
    plannedNewPerDay = pickNew(
      unstarted,
      p,
      Infinity,
      budget,
      SESSION.newShareNoExam * budget,
    ).length;
  }
  const dailyNewMax = Math.max(SESSION.dailyNewMultiplier * plannedNewPerDay, SESSION.dailyNewMin);
  return {
    plannedNewPerDay,
    dailyNewMax,
    newWordsLeft: Math.max(0, dailyNewMax - input.introducedToday.length),
  };
}

/**
 * Extra reviews tomorrow if the learner takes "learn `count` more new words" now: the same senses
 * `buildSession` would pick, every required layer rated once today (assuming correct answers), and
 * each card counted when FSRS would make it due by the end of tomorrow. For the UI's "more words
 * today = more reviews tomorrow".
 */
export function projectTomorrowReviews(
  input: SessionInput,
  count: number,
): { reviews: number; seconds: number } {
  const { now, timeZone, senses, cards } = input;
  const p = bandKnowledge(input.placement);
  const n = Math.min(count, dailyNewLimits(input).newWordsLeft);
  const unstarted = senses.filter((s) => !isStarted(s, cards));
  const picked = new Set(pickNew(unstarted, p, n, CAP_SEC, Infinity).map((u) => u[0]!.senseId));
  const endOfTomorrow = zonedDayStart(addDays(dayKey(now, timeZone), 2), timeZone).getTime();
  const dueTomorrow = (layer: Layer) =>
    applyReview(newCardState("probe", layer, now), "good", now).fsrs.due.getTime() < endOfTomorrow;
  let reviews = 0;
  let seconds = 0;
  for (const s of unstarted) {
    if (!picked.has(s.id)) continue;
    for (const l of requiredLayers(s)) {
      if (!dueTomorrow(l)) continue;
      reviews++;
      seconds += itemSeconds(l);
    }
  }
  return { reviews, seconds };
}

/** New senses in track order while the count, budget and share allow; stops at the first misfit. */
function pickNew(
  unstarted: readonly SessionSense[],
  p: BandKnowledge,
  maxCount: number,
  budgetSec: number,
  shareSec: number,
): Draft[][] {
  const out: Draft[][] = [];
  let used = 0;
  for (const s of unstarted) {
    const cost = senseCost(s, p);
    if (out.length >= maxCount || used + cost > Math.min(budgetSec, shareSec)) break;
    used += cost;
    out.push(newUnit(s, p));
  }
  return out;
}

/** Extra practice "review weak words": weakest cards of started, unmastered senses, unrated. */
function weakWords(
  senses: readonly SessionSense[],
  cards: Cards,
  now: Date,
  budgetSec: number,
): Draft[] {
  const out: Draft[] = [];
  let used = 0;
  for (const c of byRetrievability(
    senses.flatMap((s) => Object.values(layerCards(s, cards))),
    now,
  )) {
    if (used + itemSeconds(c.layer) > budgetSec) continue;
    used += itemSeconds(c.layer);
    out.push(draft("practice", c.senseId, c.layer, "practice", true));
  }
  respace(out, 0);
  return out;
}

/**
 * Presentation order with spacing (docs/DECISIONS.md #43): learn steps grouped; within a sense,
 * each next item (first practice after its learn step, layer after layer) at least `GAP` other
 * items later where possible, else as late as the remaining items allow. Reviews come first,
 * except for as many trailing reviews as the new block needs as spacers.
 */
function arrange(reviews: readonly Draft[], chains: readonly Draft[][]): Draft[] {
  const fillersNeeded = spaceChains(chains, Infinity).fillers;
  const spareCount = Math.min(fillersNeeded, reviews.length);
  const lead = reviews.slice(0, reviews.length - spareCount);
  const spares = reviews.slice(reviews.length - spareCount);
  const { order } = spaceChains(chains, spares.length);
  let s = 0;
  const out = [...lead, ...order.map((d) => d ?? spares[s++]!), ...spares.slice(s)];
  respace(out, 0);
  return out;
}

type Spaced = { senseId: string; kind: ItemKind };

/** Pairs of neighbours of the same sense, counting from the pair (from − 1, from). */
function adjacentPairs(items: readonly Spaced[], from: number): number {
  let n = 0;
  for (let i = Math.max(from, 1); i < items.length; i++) {
    if (items[i]!.senseId === items[i - 1]!.senseId) n++;
  }
  return n;
}

/** Maximal runs of consecutive learn steps (1 = grouped). */
function learnRuns(items: readonly Spaced[]): number {
  return items.filter((it, i) => it.kind === "learn" && items[i - 1]?.kind !== "learn").length;
}

/** Other items between each item and the previous item of its sense, keyed by item. */
function gapsBefore<T extends Spaced>(items: readonly T[]): Map<T, number> {
  const last = new Map<string, number>();
  const out = new Map<T, number>();
  items.forEach((it, i) => {
    const prev = last.get(it.senseId);
    if (prev !== undefined) out.set(it, i - prev - 1);
    last.set(it.senseId, i);
  });
  return out;
}

/**
 * No two consecutive items of one sense whenever another order exists (docs/DECISIONS.md #49).
 * Repairs each same-sense pair by moving the nearest other item (from `from` on; earlier items
 * are done) in between, never past an item of its own sense (each sense keeps its order), never
 * splitting the learn group. Moves that keep every gap ≥ min(GAP, its old gap) are preferred;
 * otherwise any move that removes a pair is taken; as a last resort the tail is rebuilt
 * (`rebuildTail`), which fixes runs like BABAA → ABABA that no single move can. Every accepted
 * change leaves fewer pairs, so it terminates.
 */
function respace<T extends Spaced>(items: T[], from: number): void {
  let i = Math.max(from, 1);
  while (i < items.length) {
    if (items[i]!.senseId !== items[i - 1]!.senseId) {
      i++;
      continue;
    }
    const moved =
      tryRepair(items, i, from, true) ??
      tryRepair(items, i, from, false) ??
      rebuildTail(items, from);
    if (moved) {
      items.splice(0, items.length, ...moved);
      i = Math.max(from, 1);
    } else {
      i++;
    }
  }
}

function tryRepair<T extends Spaced>(
  items: readonly T[],
  i: number,
  from: number,
  keepGaps: boolean,
): T[] | null {
  const sense = items[i]!.senseId;
  const pairs = adjacentPairs(items, from);
  const runs = learnRuns(items);
  const gaps = gapsBefore(items);
  const acceptable = (cand: T[]) => {
    if (adjacentPairs(cand, from) >= pairs || learnRuns(cand) > runs) return false;
    if (!keepGaps) return true;
    for (const [it, g] of gapsBefore(cand)) if (g < Math.min(GAP, gaps.get(it)!)) return false;
    return true;
  };
  for (let d = 1; d < items.length; d++) {
    // Forward: pull items[j] (j > i) in before items[i].
    const j = i + d;
    if (j < items.length) {
      const it = items[j]!;
      if (it.senseId !== sense && !items.slice(i, j).some((x) => x.senseId === it.senseId)) {
        const cand = [...items];
        cand.splice(j, 1);
        cand.splice(i, 0, it);
        if (acceptable(cand)) return cand;
      }
    }
    // Backward: push items[k] (k < i − 1) in between items[i − 1] and items[i].
    const k = i - 1 - d;
    if (k >= from) {
      const it = items[k]!;
      if (it.senseId !== sense && !items.slice(k + 1, i).some((x) => x.senseId === it.senseId)) {
        const cand = [...items];
        cand.splice(k, 1);
        cand.splice(i - 1, 0, it);
        if (acceptable(cand)) return cand;
      }
    }
  }
  return null;
}

/**
 * Last resort: rebuilds the tail from `from` as close to its current order as possible. Each
 * step takes the earliest item that is next in its sense's order, is not of the previous item's
 * sense, and leaves a remainder that can still be ordered without neighbours. Succeeds whenever
 * such an order exists (BABAA → ABABA, which no single move reaches); null otherwise, or if it
 * would split the learn group.
 */
function rebuildTail<T extends Spaced>(items: readonly T[], from: number): T[] | null {
  const rest = items.slice(from);
  const left = new Map<string, number>();
  for (const it of rest) left.set(it.senseId, (left.get(it.senseId) ?? 0) + 1);
  // No-neighbour order of the remainder exists iff every sense fits in alternate slots.
  const feasible = (last: string, n: number) =>
    [...left].every(([id, c]) => c <= (id === last ? Math.floor(n / 2) : Math.ceil(n / 2)));
  const out: T[] = [];
  let last = items[from - 1]?.senseId;
  while (rest.length > 0) {
    const k = rest.findIndex((it, i) => {
      if (it.senseId === last || rest.slice(0, i).some((x) => x.senseId === it.senseId)) {
        return false;
      }
      left.set(it.senseId, left.get(it.senseId)! - 1);
      const ok = feasible(it.senseId, rest.length - 1);
      left.set(it.senseId, left.get(it.senseId)! + 1);
      return ok;
    });
    if (k < 0) return null;
    const [it] = rest.splice(k, 1);
    left.set(it!.senseId, left.get(it!.senseId)! - 1);
    out.push(it!);
    last = it!.senseId;
  }
  const cand = [...items.slice(0, from), ...out];
  return learnRuns(cand) <= learnRuns(items) ? cand : null;
}

/**
 * Greedy spacing of the chains. `null` marks a spare-review slot (used while spares last when no
 * chain item is ready); with none left, the item closest to ready is placed early.
 */
function spaceChains(
  chains: readonly Draft[][],
  spares: number,
): { order: (Draft | null)[]; fillers: number } {
  const order: (Draft | null)[] = [];
  const qs = chains.map((items) => ({ items, next: 0, readyAt: 0 }));
  const place = (q: (typeof qs)[number]) => {
    order.push(q.items[q.next++]!);
    q.readyAt = order.length + GAP;
  };
  for (const q of qs) if (q.items[0]?.kind === "learn") place(q);
  let fillers = 0;
  for (;;) {
    const open = qs.filter((q) => q.next < q.items.length);
    if (open.length === 0) break;
    const earliest = open.reduce((a, b) => (b.readyAt < a.readyAt ? b : a));
    if (earliest.readyAt > order.length && fillers < spares) {
      fillers++;
      order.push(null);
      continue;
    }
    if (earliest.readyAt > order.length) fillers++;
    place(earliest);
  }
  return { order, fillers };
}

// ---- In-session flow -------------------------------------------------------------------------

export type SessionEvent =
  /** A question answered. `countsTowardMastery` comes from the MCQ (false = practice-only, #3). */
  | { type: "answer"; itemId: string; answer: Answer; countsTowardMastery: boolean }
  /** Past a learn step. */
  | { type: "continue"; itemId: string }
  /** "I know this" on a learn step: schedules a verification check, never rates. */
  | { type: "knowIt"; itemId: string };

/** A rating the caller must apply with `fsrs.review` (and persist with its log). */
export type ToRate = { senseId: string; layer: Layer; answer: Answer };

export type EventResult = { state: SessionState; toRate: ToRate | null; accepted: boolean };

export function currentItem(state: SessionState): SessionItem | null {
  return state.items[state.cursor] ?? null;
}

export function isFinished(state: SessionState): boolean {
  return state.cursor >= state.items.length;
}

/** A plan built for another local day must be rebuilt, not resumed. */
export function isStale(state: SessionState, now: Date, timeZone: string): boolean {
  return dayKey(now, timeZone) !== state.dayKey;
}

/** Deterministic rng for an item's question (MCQ distractors and option order). */
export function itemRng(state: Pick<SessionState, "seed">, itemId: string): Rng {
  let h = 0x811c9dc5;
  for (let i = 0; i < itemId.length; i++) h = Math.imul(h ^ itemId.charCodeAt(i), 0x01000193);
  return mulberry32((state.seed ^ h) >>> 0);
}

/**
 * Advances the session. An event for anything but the current item (e.g. a replay after a
 * reload) is rejected and changes nothing.
 */
export function applyEvent(state: SessionState, event: SessionEvent): EventResult {
  const item = currentItem(state);
  const isLearn = item?.kind === "learn";
  if (!item || item.id !== event.itemId || isLearn !== (event.type !== "answer")) {
    return { state, toRate: null, accepted: false };
  }
  const s: SessionState = {
    ...state,
    items: [...state.items],
    ratedToday: [...state.ratedToday],
    cursor: state.cursor + 1,
  };
  if (event.type === "continue") return { state: s, toRate: null, accepted: true };
  if (event.type === "knowIt") return { state: knowIt(s, item), toRate: null, accepted: true };

  const layer = item.layer!;
  const key = cardKey(item.senseId, layer);
  let toRate: ToRate | null = null;
  if (!item.unrated && event.countsTowardMastery && !s.ratedToday.includes(key)) {
    toRate = { senseId: item.senseId, layer, answer: event.answer };
    s.ratedToday.push(key);
  }
  const correct = event.answer.outcome === "correct";
  const layers = s.senseLayers[item.senseId] ?? [layer];
  if (item.kind === "check") {
    if (correct) {
      // Follow-ups for the other layers, spaced after the check, within the budget.
      const rest = layers.filter((l) => l !== "recognition");
      insertChain(
        s,
        rest.map((l) => draft("practice", item.senseId, l, "practice")),
        s.cursor + GAP,
        s.budgetSec,
      );
    } else {
      // Normal teach flow; the recognition practice in it is unrated (already rated today).
      const flow = [
        draft("learn", item.senseId, null, "learn"),
        ...layers.map((l) => draft("practice", item.senseId, l, "learn")),
      ];
      insertChain(s, flow, s.cursor, s.capSec);
    }
  } else if (!correct && !item.requeue) {
    // In-session relearning (docs/DECISIONS.md #40): one unrated copy, GAP items later.
    const copy = { ...draft("practice", item.senseId, layer, "practice", true), requeue: true };
    insertChain(s, [copy], s.cursor + GAP, relearnLimitSec(s));
  }
  respace(s.items, s.cursor);
  return { state: s, toRate, accepted: true };
}

/** "I know this" (docs/DECISIONS.md #41): drop the sense's pending practice, check it later. */
function knowIt(s: SessionState, learn: SessionItem): SessionState {
  const check = draft("check", learn.senseId, "recognition", "verify");
  const kept = s.items.filter(
    (it, i) => i < s.cursor || it.senseId !== learn.senseId || it.kind !== "practice",
  );
  if (plannedSec(kept) + itemSeconds("recognition") > s.capSec) return s; // acts as "continue"
  s.items = kept;
  insertChain(s, [check], s.cursor + GAP, s.capSec);
  respace(s.items, s.cursor);
  return s;
}

/** Relearning copies may overflow the budget by max(50%, 2 minutes), never past the cap (#47). */
export function relearnLimitSec(s: Pick<SessionState, "budgetSec" | "capSec">): number {
  const overflow = Math.max(
    SESSION.relearnOverflowShare * s.budgetSec,
    SESSION.relearnOverflowMinSec,
  );
  return Math.min(s.budgetSec + overflow, s.capSec);
}

/**
 * Inserts `chain` in order: the first item at `firstIndex` (or the end), each next one GAP items
 * after the previous (or the end), while the plan stays within `limitSec`.
 */
function insertChain(
  s: SessionState,
  chain: readonly Draft[],
  firstIndex: number,
  limitSec: number,
) {
  let at = firstIndex;
  for (const d of chain) {
    if (plannedSec(s.items) + itemSeconds(d.layer) > limitSec) return;
    const idx = freeSlot(s, d.senseId, Math.min(at, s.items.length));
    s.items.splice(idx, 0, { ...d, id: `i${s.nextId++}` });
    at = idx + 1 + GAP;
  }
}

/** The first index from `start` whose neighbours are both of another sense, else `start`. */
function freeSlot(s: SessionState, senseId: string, start: number): number {
  for (let k = start; k <= s.items.length; k++) {
    if (s.items[k - 1]?.senseId !== senseId && s.items[k]?.senseId !== senseId) return k;
  }
  return start;
}
