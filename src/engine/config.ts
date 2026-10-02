/**
 * Engine constants (docs/ENGINE.md). CALIBRATE = heuristic, revisit with real usage data.
 * Band sizes are NOT here: they are computed from data into content/placement/bands.json
 * (docs/DECISIONS.md #31).
 */
import type { Layer } from "@/content/schema";
import type { Band } from "./distractors";

// ---- §4 Placement ----------------------------------------------------------------------------

/**
 * Frequency-rank boundaries of the disjoint lemma bands (CALIBRATE). ACAD = academic-list lemmas
 * with rank > ACAD_MIN_RANK - 1, removed from B4/B5 (docs/DECISIONS.md #31). Used by the M5
 * band builder; scoring reads sizes from bands.json.
 */
export const BAND_RANKS: Record<Exclude<Band, "ACAD">, readonly [number, number]> = {
  B1: [1, 1000],
  B2: [1001, 2000],
  B3: [2001, 3000],
  B4: [3001, 5000],
  B5: [5001, 8000],
};
export const ACAD_MIN_RANK = 3001;

export const PLACEMENT = {
  realPerBand: 5,
  pseudowords: 10,
  /** "at least 4 pseudowords inside the first 20 items". */
  minPseudoInFirst: 4,
  firstWindow: 20,
  /** Pseudowords placed inside the first window (≥ minPseudoInFirst). */
  pseudoInFirstWindow: 5,
  maxVerification: 4,
  /** Bands whose "yes" words feed verification MCQs. */
  verificationBands: ["B3", "B4", "B5", "ACAD"] as readonly Band[],
  earlyStopYesRate: 0.2, // CALIBRATE
  earlyStopMinPseudo: 4,
  /** reliable = false at or above this pseudoword yes-rate. */
  maxPseudoYesRate: 0.5,
  minPseudoAnswered: 4,
  minVerificationAccuracy: 0.5,
  minVerificationItems: 2,
  z: 1.645,
  roundTo: 250,
  /** A skipped band adds this share of its size to the high bound (CALIBRATE). */
  skippedBandHighShare: 0.15,
} as const;

// ---- §5 Answer checking ----------------------------------------------------------------------

/** Typo tolerance: DL ≤ maxTypoDistance only when the accepted answer is ≥ typoMinLength. */
export const ANSWERS = { typoMinLength: 5, maxTypoDistance: 1 } as const;

// ---- §6 Distractors --------------------------------------------------------------------------

export const DISTRACTORS = {
  needed: 3,
  /** Content must pass at ±1 (content:check rule 11); runtime may widen to ±2 (DECISIONS #3). */
  bandDistance: 1,
  widenedBandDistance: 2,
} as const;

// ---- §1-2 FSRS cards and ratings -------------------------------------------------------------

/**
 * ts-fsrs desired retention (CALIBRATE). Built-in default weights via generatorParameters
 * (docs/DECISIONS.md #14); fuzz stays at the library default (off), so scheduling is deterministic.
 */
export const FSRS = { requestRetention: 0.9 } as const;

/** A correct answer slower than this (strictly) is rated Hard (CALIBRATE, §2). */
export const SLOW_MS: Readonly<Record<Layer, number>> = {
  recognition: 8000,
  context: 15000,
  production: 20000,
};

// ---- §3 Mastery ------------------------------------------------------------------------------

export const MASTERY = {
  /** Predicted retrievability at the horizon needed for "mastered". */
  minRetrievability: 0.9,
  /** Horizon without a future exam date: this many local calendar days from now. */
  defaultHorizonDays: 30,
} as const;

// ---- §8 Streaks ------------------------------------------------------------------------------

/** One automatic freeze per rolling window of this many local days (docs/DECISIONS.md #6). */
export const STREAK = { freezeWindowDays: 7 } as const;
