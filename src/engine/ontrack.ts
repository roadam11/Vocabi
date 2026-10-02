/**
 * On-track status (docs/ENGINE.md §7, docs/DECISIONS.md #4). Pure: hysteresis memory is the
 * caller-persisted `previousStatus`, passed back in on every call.
 */
import { SESSION } from "./config";
import { masteryHorizon, requiredLayers } from "./mastery";
import {
  bandKnowledge,
  type BandKnowledge,
  type Cards,
  dueCards,
  examDays,
  itemSeconds,
  senseCost,
  type SessionSense,
  unmasteredSenses,
} from "./workload";
import type { Band } from "./distractors";

export type OnTrackStatus = "onTrack" | "needsMore";

export type OnTrackResult =
  /** No exam date: no status is shown at all. */
  | null
  /** The exam date is in the past: prompt the learner to update it. */
  | { kind: "examPast" }
  | {
      kind: "status";
      status: OnTrackStatus;
      neededMinutesPerDay: number;
      /** Inside the taper window the need is today's due-review time, not a projection. */
      inTaper: boolean;
    };

/**
 * Hysteresis: "needs more" above 110% of minutesPerDay, "on track" below 95%, otherwise the
 * previous status. Without a previous status the plain 100% threshold decides.
 */
export function applyHysteresis(
  neededMinutesPerDay: number,
  minutesPerDay: number,
  previousStatus: OnTrackStatus | null,
): OnTrackStatus {
  const ratio = neededMinutesPerDay / minutesPerDay;
  if (previousStatus === null) return ratio > 1 ? "needsMore" : "onTrack";
  if (ratio > SESSION.tripAbove) return "needsMore";
  if (ratio < SESSION.clearBelow) return "onTrack";
  return previousStatus;
}

/**
 * Seconds still needed for the unmastered target (DECISIONS #1, #4): teach+practice per sense
 * (verify-first price for p_b ≥ 0.8 bands) and the projected reviews of every required layer.
 */
export function onTrackCosts(
  senses: readonly SessionSense[],
  cards: Cards,
  p: BandKnowledge,
  horizon: Date,
): { target: number; newLearningCost: number; projectedReviewCost: number } {
  const target = unmasteredSenses(senses, cards, horizon);
  let newLearningCost = 0;
  let projectedReviewCost = 0;
  for (const s of target) {
    newLearningCost += senseCost(s, p);
    for (const l of requiredLayers(s))
      projectedReviewCost += SESSION.reviewsPerLayer * itemSeconds(l);
  }
  return { target: target.length, newLearningCost, projectedReviewCost };
}

export function onTrackStatus(input: {
  now: Date;
  timeZone: string;
  examDayKey?: string;
  minutesPerDay: number;
  senses: readonly SessionSense[];
  cards: Cards;
  placement?: { perBand: readonly { band: Band; p: number }[] };
  previousStatus: OnTrackStatus | null;
}): OnTrackResult {
  const { now, timeZone, examDayKey, minutesPerDay, senses, cards, previousStatus } = input;
  const exam = examDays(now, timeZone, examDayKey);
  if (exam.kind === "none") return null;
  if (exam.kind === "past") return { kind: "examPast" };

  let neededSec: number;
  const inTaper = exam.daysLeft <= SESSION.taperDays;
  if (inTaper) {
    // Taper window: no projection; only today's actual due reviews can exceed the budget.
    neededSec = dueCards(senses, cards, now, timeZone).reduce(
      (t, c) => t + itemSeconds(c.layer),
      0,
    );
  } else {
    const horizon = masteryHorizon(now, timeZone, examDayKey);
    const costs = onTrackCosts(senses, cards, bandKnowledge(input.placement), horizon);
    neededSec =
      (costs.newLearningCost + costs.projectedReviewCost) /
      Math.max(exam.daysLeft - SESSION.taperDays, 1);
  }
  const neededMinutesPerDay = neededSec / 60;
  return {
    kind: "status",
    status: applyHysteresis(neededMinutesPerDay, minutesPerDay, previousStatus),
    neededMinutesPerDay,
    inTaper,
  };
}
