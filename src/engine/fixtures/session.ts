/** Test fixtures for the session builder and on-track status (not shipped content). */
import type { Layer } from "@/content/schema";
import type { Band } from "../distractors";
import { applyReview, cardKey, type CardState, newCardState, type RatingName } from "../fsrs";
import type { Cards, SessionSense } from "../workload";

export const TZ = "Asia/Jerusalem";
export const REC: Layer[] = ["recognition"];
export const REC_CTX: Layer[] = ["recognition", "context"];
export const ALL: Layer[] = ["recognition", "context", "production"];

export function sense(id: string, layers: Layer[] = REC_CTX, freqBand: Band = "B2"): SessionSense {
  return { id, layers, freqBand };
}

/** `n` senses `w00.n.01` … in track order. */
export function senses(n: number, layers: Layer[] = REC_CTX, freqBand: Band = "B2") {
  return Array.from({ length: n }, (_, i) =>
    sense(`w${String(i).padStart(2, "0")}.n.01`, layers, freqBand),
  );
}

/** A card of `senseId`/`layer` reviewed with `rating` at each instant. */
export function reviewed(
  senseId: string,
  layer: Layer,
  at: readonly Date[],
  rating: RatingName = "good",
): CardState {
  let s = newCardState(senseId, layer, at[0]!);
  for (const t of at) s = applyReview(s, rating, t);
  return s;
}

export function cardMap(cs: readonly CardState[]): Cards {
  return Object.fromEntries(cs.map((c) => [cardKey(c.senseId, c.layer), c]));
}

const DAY = 86_400_000;
export const daysBefore = (now: Date, days: number) => new Date(now.getTime() - days * DAY);
