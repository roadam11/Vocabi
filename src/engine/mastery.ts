/**
 * Mastery and per-sense display state (docs/ENGINE.md §3). Only FSRS cards count: a self-mark
 * ("I know this") never creates a reviewed card, so it can never produce `mastered`.
 */
import type { Layer } from "@/content/schema";
import { MASTERY } from "./config";
import { addDays, dayKey, zonedDayStart } from "./days";
import { type CardState, retrievabilityAt } from "./fsrs";

export type DisplayState = "new" | "learning" | "recognized" | "mastered";

/** The sense's cards, by layer. A missing layer has never been reviewed. */
export type LayerCards = Partial<Record<Layer, CardState>>;

/**
 * §1 required layers. The content schema guarantees `layers` holds recognition, holds production
 * iff `knowledge === "prod"`, and holds context only when the sense has curated cloze distractors.
 */
export function requiredLayers(sense: { layers: readonly Layer[] }): readonly Layer[] {
  return sense.layers;
}

/**
 * §3 horizon (docs/DECISIONS.md #37): the local start of the exam day if it is after today,
 * else the same local wall time 30 calendar days from now (not 30 × 24h).
 */
export function masteryHorizon(now: Date, timeZone: string, examDayKey?: string): Date {
  const today = dayKey(now, timeZone);
  if (examDayKey !== undefined && examDayKey > today) return zonedDayStart(examDayKey, timeZone);
  const sinceMidnight = now.getTime() - zonedDayStart(today, timeZone).getTime();
  const target = zonedDayStart(addDays(today, MASTERY.defaultHorizonDays), timeZone);
  return new Date(target.getTime() + sinceMidnight);
}

const passed = (c: CardState | undefined): c is CardState =>
  c !== undefined && c.successes > 0 && c.lastRating !== "again";

/** A lapse: Again on a layer that had succeeded before (docs/DECISIONS.md #36). */
const lapsed = (c: CardState | undefined) =>
  c !== undefined && c.successes > 0 && c.lastRating === "again";

/** §3: every required layer passed (and not lapsed) with retrievability ≥ 0.90 at the horizon. */
export function isMastered(
  sense: { layers: readonly Layer[] },
  cards: LayerCards,
  horizon: Date,
): boolean {
  return requiredLayers(sense).every((layer) => {
    const c = cards[layer];
    return passed(c) && retrievabilityAt(c, horizon) >= MASTERY.minRetrievability;
  });
}

/** §3 display state: new → learning → recognized → mastered; a lapse drops back to learning. */
export function displayState(
  sense: { layers: readonly Layer[] },
  cards: LayerCards,
  horizon: Date,
): DisplayState {
  const layers = requiredLayers(sense);
  if (!layers.some((l) => (cards[l]?.fsrs.reps ?? 0) > 0)) return "new";
  if (isMastered(sense, cards, horizon)) return "mastered";
  if (layers.some((l) => lapsed(cards[l]))) return "learning";
  return passed(cards.recognition) ? "recognized" : "learning";
}
