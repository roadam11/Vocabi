import { glossesCollide, type HebrewGloss, normalizeEnLoose } from "./text";

export const POS = ["n", "v", "adj", "adv", "prep", "conj", "phrase"] as const;
export type Pos = (typeof POS)[number];

/** Frequency bands, docs/ENGINE.md §4. */
export const BANDS = ["B1", "B2", "B3", "B4", "B5", "ACAD"] as const;
export type Band = (typeof BANDS)[number];

// ACAD = academic words not in B1-B3, so its ±1 neighbours are B4 and B5 (docs/DECISIONS.md #27).
const ACAD_NEIGHBOURS: readonly Band[] = ["B4", "B5", "ACAD"];

/** "Frequency band within ±1" for recognition distractors (docs/ENGINE.md §6). */
export function bandsAdjacent(a: Band, b: Band): boolean {
  if (a === "ACAD" || b === "ACAD")
    return ACAD_NEIGHBOURS.includes(a) && ACAD_NEIGHBOURS.includes(b);
  return Math.abs(BANDS.indexOf(a) - BANDS.indexOf(b)) <= 1;
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
 * The runtime ±2 widening is not here; content must pass at ±1 (docs/DECISIONS.md #3).
 */
export function isEligibleRecognitionDistractor(
  target: DistractorCandidate,
  candidate: DistractorCandidate,
): boolean {
  if (candidate.pos !== target.pos || !bandsAdjacent(target.freqBand, candidate.freqBand)) {
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
