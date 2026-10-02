/**
 * FSRS cards and answer ratings (docs/ENGINE.md §1-2) on top of ts-fsrs 5. One card per
 * (senseId, layer). Every review yields a raw log entry so card state can be rebuilt from logs
 * alone (docs/DECISIONS.md #8, #38). ts-fsrs falls back to `new Date()` wherever `now` is omitted,
 * so every call here passes the injected `now` explicitly.
 */
import {
  type Card,
  createEmptyCard,
  fsrs,
  generatorParameters,
  type Grade,
  Rating,
  State,
} from "ts-fsrs";
import type { Layer } from "@/content/schema";
import { FSRS, SLOW_MS } from "./config";

/** §2 ratings. `Easy` is not used in Phase 0, so it is not representable. */
export type RatingName = "again" | "hard" | "good";

export type Outcome = "correct" | "wrong" | "dontKnow";
/** Where the answer was given: learn step, practice, or a verify-first / "I know this" check. */
export type AnswerMode = "learn" | "practice" | "verify";

/** A raw answer, as the UI observed it. */
export interface Answer {
  outcome: Outcome;
  /** Response time in milliseconds. */
  ms: number;
  /** Correct only through typo tolerance (docs/ENGINE.md §5). */
  typo: boolean;
  mode: AnswerMode;
}

/**
 * Raw review log (docs/ENGINE.md §7 store contract). `rating` is what scheduled the card and is
 * what replay uses; the raw `outcome`/`ms`/`typo`/`mode` are kept so the CALIBRATE thresholds can
 * be re-fit from real data without rewriting history (docs/DECISIONS.md #38).
 */
export interface ReviewLogEntry extends Answer {
  senseId: string;
  layer: Layer;
  rating: RatingName;
  /** ISO 8601 UTC instant. */
  reviewedAt: string;
}

export interface CardState {
  senseId: string;
  layer: Layer;
  fsrs: Card;
  /** Reviews rated Hard or Good. */
  successes: number;
  lastRating: RatingName | null;
}

export const schedulerParams = generatorParameters({ request_retention: FSRS.requestRetention });
const scheduler = fsrs(schedulerParams);

const GRADE: Record<RatingName, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
};

/** Stable store key of a card: never an array index (docs/DECISIONS.md #8). */
export function cardKey(senseId: string, layer: Layer): string {
  return `${senseId}#${layer}`;
}

/** §2: wrong / "I don't know" → Again; correct but slow or with a typo → Hard; correct → Good. */
export function rateOutcome(
  layer: Layer,
  answer: Pick<Answer, "outcome" | "ms" | "typo">,
): RatingName {
  if (answer.outcome !== "correct") return "again";
  if (answer.typo || answer.ms > SLOW_MS[layer]) return "hard";
  return "good";
}

export function newCardState(senseId: string, layer: Layer, now: Date): CardState {
  return { senseId, layer, fsrs: createEmptyCard(now), successes: 0, lastRating: null };
}

/** Schedules one review with an already-decided rating. Used by `review` and by replay. */
export function applyReview(state: CardState, rating: RatingName, now: Date): CardState {
  const { card } = scheduler.next(state.fsrs, now, GRADE[rating]);
  return {
    ...state,
    fsrs: card,
    successes: state.successes + (rating === "again" ? 0 : 1),
    lastRating: rating,
  };
}

/** Rates a raw answer (§2), schedules the card and returns the raw log entry to persist. */
export function review(
  state: CardState,
  answer: Answer,
  now: Date,
): { state: CardState; log: ReviewLogEntry } {
  const rating = rateOutcome(state.layer, answer);
  const log: ReviewLogEntry = {
    senseId: state.senseId,
    layer: state.layer,
    rating,
    reviewedAt: now.toISOString(),
    outcome: answer.outcome,
    ms: answer.ms,
    typo: answer.typo,
    mode: answer.mode,
  };
  return { state: applyReview(state, rating, now), log };
}

/**
 * Rebuilds a card from raw logs (any order; other cards' logs are ignored), using each log's
 * stored rating so a later SLOW_MS change never rewrites history.
 */
export function replayCard(
  senseId: string,
  layer: Layer,
  logs: readonly ReviewLogEntry[],
): CardState {
  const mine = logs
    .filter((l) => l.senseId === senseId && l.layer === layer)
    .map((l) => ({ rating: l.rating, at: new Date(l.reviewedAt) }))
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  let state = newCardState(senseId, layer, mine[0]?.at ?? new Date(0));
  for (const { rating, at } of mine) state = applyReview(state, rating, at);
  return state;
}

/** Predicted probability of recall at `at`; 0 for a card that was never reviewed. */
export function retrievabilityAt(state: CardState, at: Date): number {
  if (state.fsrs.state === State.New) return 0;
  return scheduler.get_retrievability(state.fsrs, at, false);
}
