import { DISTRACTORS } from "./config";
import { type Rng, shuffle } from "./random";
import { glossesCollide, type HebrewGloss, normalizeEnLoose } from "./text";

export const POS = ["n", "v", "adj", "adv", "prep", "conj", "phrase"] as const;
export type Pos = (typeof POS)[number];

/** Frequency bands, docs/ENGINE.md §4. */
export const BANDS = ["B1", "B2", "B3", "B4", "B5", "ACAD"] as const;
export type Band = (typeof BANDS)[number];

// ACAD = academic words ranked above 3000, so its ±1 neighbours are B4 and B5 (docs/DECISIONS.md
// #27); further steps go through them (ACAD–B3 = 2).
const ACAD_NEIGHBOURS: readonly Band[] = ["B4", "B5"];

/** Steps between two frequency bands: B1-B5 are linear, ACAD sits next to B4 and B5. */
export function bandDistance(a: Band, b: Band): number {
  if (a === b) return 0;
  if (a === "ACAD" || b === "ACAD") {
    const other = a === "ACAD" ? b : a;
    return 1 + Math.min(...ACAD_NEIGHBOURS.map((n) => bandDistance(n, other)));
  }
  return Math.abs(BANDS.indexOf(a) - BANDS.indexOf(b));
}

/** "Frequency band within ±1" for recognition distractors (docs/ENGINE.md §6). */
export function bandsAdjacent(a: Band, b: Band): boolean {
  return bandDistance(a, b) <= 1;
}

/** The fields eligibility needs; satisfied by both senses and distractor-only lexicon entries. */
export type DistractorCandidate = {
  lemma: string;
  pos: Pos;
  freqBand: Band;
  he: HebrewGloss;
  family?: readonly string[];
  synonyms?: readonly string[];
};

const words = (xs: readonly string[] = []) => new Set(xs.map(normalizeEnLoose));

/**
 * docs/ENGINE.md §6: same POS, band ±1, not the same word family (lemma or a shared family member,
 * either direction), not a listed synonym (either direction), no shared normalized Hebrew gloss.
 * Content must pass at ±1 (content:check rule 11); only the runtime fallback passes
 * `maxBandDistance` 2 (docs/DECISIONS.md #3).
 */
export function isEligibleRecognitionDistractor(
  target: DistractorCandidate,
  candidate: DistractorCandidate,
  maxBandDistance: number = DISTRACTORS.bandDistance,
): boolean {
  if (
    candidate.pos !== target.pos ||
    bandDistance(target.freqBand, candidate.freqBand) > maxBandDistance
  ) {
    return false;
  }
  const tLemma = normalizeEnLoose(target.lemma);
  const cLemma = normalizeEnLoose(candidate.lemma);
  const tFamily = words([target.lemma, ...(target.family ?? [])]);
  const cFamily = words([candidate.lemma, ...(candidate.family ?? [])]);
  if ([...cFamily].some((w) => tFamily.has(w))) return false;
  if (words(target.synonyms).has(cLemma) || words(candidate.synonyms).has(tLemma)) return false;
  return !glossesCollide(target.he, candidate.he);
}

export type DistractorSelection<T> = {
  distractors: T[];
  /**
   * null: found at ±1. "widened": needed ±2 (should never happen; content:check rule 11 makes it
   * an error). "practiceOnly": still short — the item must not count toward mastery or rate an
   * FSRS card, and the caller logs an error (the engine does no I/O).
   */
  fallback: null | "widened" | "practiceOnly";
};

/**
 * Picks 3 recognition distractors uniformly at random from the combined eligible pool (the
 * track's senses and the distractor-only lexicon alike — a taught word as a distractor is extra
 * exposure), with mutually distinct glosses (docs/DECISIONS.md #30, #35). Short at ±1 → widen to
 * ±2 → practice-only.
 */
export function selectRecognitionDistractors<T extends DistractorCandidate>(
  target: DistractorCandidate,
  pool: readonly T[],
  rng: Rng,
): DistractorSelection<T> {
  const picked: T[] = [];
  const take = (maxBandDistance: number) => {
    const eligible = pool.filter(
      (c) => !picked.includes(c) && isEligibleRecognitionDistractor(target, c, maxBandDistance),
    );
    for (const c of shuffle(eligible, rng)) {
      if (picked.length === DISTRACTORS.needed) return;
      if (!picked.some((p) => glossesCollide(p.he, c.he))) picked.push(c);
    }
  };
  take(DISTRACTORS.bandDistance);
  if (picked.length === DISTRACTORS.needed) return { distractors: picked, fallback: null };
  take(DISTRACTORS.widenedBandDistance);
  if (picked.length === DISTRACTORS.needed) return { distractors: picked, fallback: "widened" };
  return { distractors: picked, fallback: "practiceOnly" };
}

export type Mcq<T> = {
  /** Shuffled with the injected rng; the correct option sits at `correctIndex`. */
  options: T[];
  correctIndex: number;
  /** Only a full 4-option, non-practice item may count toward mastery or rate a card. */
  countsTowardMastery: boolean;
};

function shuffled<T>(
  correct: T,
  others: readonly T[],
  rng: Rng,
): Pick<Mcq<T>, "options" | "correctIndex"> {
  const order = shuffle([0, ...others.map((_, i) => i + 1)], rng);
  const all = [correct, ...others];
  return { options: order.map((i) => all[i]!), correctIndex: order.indexOf(0) };
}

/** Recognition MCQ: the target and its distractors (the UI shows each option's Hebrew gloss). */
export function buildRecognitionMcq<T extends DistractorCandidate>(
  target: T,
  selection: DistractorSelection<T>,
  rng: Rng,
): Mcq<T> {
  const mcq = shuffled(target, selection.distractors, rng);
  return {
    ...mcq,
    countsTowardMastery:
      selection.fallback !== "practiceOnly" && mcq.options.length === DISTRACTORS.needed + 1,
  };
}

/**
 * Context MCQ (§6): `cloze.answerForm` plus the 3 curated `clozeDistractors`. Without them the
 * sense is not eligible for the context layer: null, never improvised.
 */
export function buildContextMcq(
  sense: { cloze?: { answerForm: string }; clozeDistractors?: readonly string[] },
  rng: Rng,
): Mcq<string> | null {
  if (!sense.cloze || sense.clozeDistractors?.length !== DISTRACTORS.needed) return null;
  return {
    ...shuffled(sense.cloze.answerForm, sense.clozeDistractors, rng),
    countsTowardMastery: true,
  };
}
