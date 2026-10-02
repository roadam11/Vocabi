/**
 * Workload math shared by the session builder and the on-track status (docs/ENGINE.md §7): item
 * time estimates, verify-first costing (docs/DECISIONS.md #1), the unmastered target, exam day
 * counting and due cards. Pure: time comes in as `now`.
 */
import { State } from "ts-fsrs";
import type { Layer } from "@/content/schema";
import { SESSION } from "./config";
import { addDays, dayKey, daysBetween, zonedDayStart } from "./days";
import type { Band } from "./distractors";
import { type CardState, cardKey, retrievabilityAt } from "./fsrs";
import { isMastered, type LayerCards, requiredLayers } from "./mastery";

/** The sense fields the session needs (a verified track sense). */
export type SessionSense = { id: string; layers: readonly Layer[]; freqBand: Band };
/** Card states keyed by `cardKey(senseId, layer)`. */
export type Cards = Readonly<Record<string, CardState>>;
/** Placement p_b per band; a band without a value counts as 0. */
export type BandKnowledge = Partial<Record<Band, number>>;

export function bandKnowledge(placement?: {
  perBand: readonly { band: Band; p: number }[];
}): BandKnowledge {
  return Object.fromEntries((placement?.perBand ?? []).map(({ band, p }) => [band, p]));
}

/** §7: a new sense from a band with p_b ≥ 0.8 starts with a recognition check, not a teach card. */
export function isVerifyFirst(sense: SessionSense, p: BandKnowledge): boolean {
  return (p[sense.freqBand] ?? 0) >= SESSION.verifyFirstMinP;
}

/** Estimated seconds of one item: a teach card (`null`) or a question on `layer`. */
export function itemSeconds(layer: Layer | null): number {
  return layer === null ? SESSION.itemSeconds.learn : SESSION.itemSeconds[layer];
}

/**
 * Cost of introducing a new sense (DECISIONS #1): verify-first price (one recognition item) for
 * p_b ≥ 0.8 bands, else the teach card plus one practice item per required layer.
 */
export function senseCost(sense: SessionSense, p: BandKnowledge): number {
  if (isVerifyFirst(sense, p)) return itemSeconds("recognition");
  return requiredLayers(sense).reduce((sum, l) => sum + itemSeconds(l), itemSeconds(null));
}

/** A reviewed card of the sense's layer, or undefined when the layer was never reviewed. */
export function reviewedCard(cards: Cards, senseId: string, layer: Layer): CardState | undefined {
  const c = cards[cardKey(senseId, layer)];
  return c !== undefined && c.fsrs.reps > 0 ? c : undefined;
}

export function layerCards(sense: SessionSense, cards: Cards): LayerCards {
  const out: LayerCards = {};
  for (const l of requiredLayers(sense)) {
    const c = reviewedCard(cards, sense.id, l);
    if (c) out[l] = c;
  }
  return out;
}

/** A sense is started once any required layer has a reviewed card. */
export function isStarted(sense: SessionSense, cards: Cards): boolean {
  return requiredLayers(sense).some((l) => reviewedCard(cards, sense.id, l) !== undefined);
}

/** `unmasteredTarget` (DECISIONS #1): every not-yet-mastered sense, independent of placement. */
export function unmasteredSenses(
  senses: readonly SessionSense[],
  cards: Cards,
  horizon: Date,
): SessionSense[] {
  return senses.filter((s) => !isMastered(s, layerCards(s, cards), horizon));
}

export type ExamDays =
  | { kind: "none" }
  | { kind: "past" }
  /** Local calendar days until the exam day; 0 = the exam is today. */
  | { kind: "upcoming"; daysLeft: number };

export function examDays(now: Date, timeZone: string, examDayKey?: string): ExamDays {
  if (examDayKey === undefined) return { kind: "none" };
  const daysLeft = daysBetween(dayKey(now, timeZone), examDayKey);
  return daysLeft < 0 ? { kind: "past" } : { kind: "upcoming", daysLeft };
}

/** The card's last rating fell on local day `todayKey`. */
export function ratedOn(card: CardState, todayKey: string, timeZone: string): boolean {
  const last = card.fsrs.last_review;
  return last !== undefined && dayKey(last, timeZone) === todayKey;
}

/**
 * Cards due by the end of the local day and not yet rated today (a layer is rated at most once per
 * day), lowest retrievability first; ties by card key.
 */
export function dueCards(
  senses: readonly SessionSense[],
  cards: Cards,
  now: Date,
  timeZone: string,
): CardState[] {
  const today = dayKey(now, timeZone);
  const endOfDay = zonedDayStart(addDays(today, 1), timeZone).getTime();
  return byRetrievability(
    allCards(senses, cards).filter(
      (c) =>
        c.fsrs.state !== State.New &&
        c.fsrs.due.getTime() < endOfDay &&
        !ratedOn(c, today, timeZone),
    ),
    now,
  );
}

/** The reviewed cards of the given senses' required layers. */
export function allCards(senses: readonly SessionSense[], cards: Cards): CardState[] {
  return senses.flatMap((s) => Object.values(layerCards(s, cards)));
}

export function byRetrievability(cs: readonly CardState[], now: Date): CardState[] {
  const r = new Map(cs.map((c) => [c, retrievabilityAt(c, now)]));
  const key = (c: CardState) => cardKey(c.senseId, c.layer);
  return [...cs].sort((a, b) => r.get(a)! - r.get(b)! || (key(a) < key(b) ? -1 : 1));
}
