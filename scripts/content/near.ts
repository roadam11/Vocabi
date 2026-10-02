/**
 * nearWords (docs/DECISIONS.md #34): real words one edit away from a sense's accepted answers,
 * computed at content-build time from the top-20k reference list so the app can reject them as
 * wrong (with a confusion pair) instead of accepting them as typos — target "quiet", typed
 * "quite". The reference list itself never reaches src/ (docs/DECISIONS.md #28).
 */
import { ANSWERS } from "../../src/engine/config";
import { damerauLevenshtein, normalizeEn } from "../../src/engine/text";
import { regularInflections } from "./inflect";

export type NearWordsInput = { lemma: string; answers: readonly string[] };

/** Reference words plus their attested-paradigm inflections, deduplicated, bucketed by length. */
export type ReferenceForms = Map<number, string[]>;

const cache = new WeakMap<readonly string[], ReferenceForms>();

/**
 * Every reference word, plus the regular inflections of a base only when the reference already
 * contains its -ed or -ing form (decide + decided ⇒ decides). Without part-of-speech data that is
 * the evidence the base really inflects; it keeps names, abbreviations and adjectives ("igor",
 * "approx", "hesitant") from producing junk like "igored".
 */
export function referenceForms(reference: readonly string[]): ReferenceForms {
  const hit = cache.get(reference);
  if (hit) return hit;
  const words = new Set(reference.map(normalizeEn));
  const forms = new Set(words);
  for (const base of words) {
    const paradigm = regularInflections(base).filter((f) => f !== base);
    // An attested -ed/-ing form is verb evidence; a plural alone is not (desserts ⇏ desserted).
    if (paradigm.some((f) => /(ed|ing)$/.test(f) && words.has(f))) {
      for (const f of paradigm) forms.add(f);
    }
  }
  const byLength: ReferenceForms = new Map();
  for (const w of forms) {
    const n = [...w].length;
    const bucket = byLength.get(n);
    if (bucket) bucket.push(w);
    else byLength.set(n, [w]);
  }
  cache.set(reference, byLength);
  return byLength;
}

/**
 * Sorted, unique reference forms within the typo distance of any accepted answer that gets typo
 * tolerance (≥ ANSWERS.typoMinLength), excluding the sense's own forms: lemma, its regular
 * inflections, answers. Own forms are under-generated like the reference forms, so a real word
 * ("stared" for target "star") is never dropped as an invented own form. Family members are
 * different words (breath ≠ breathe), so they stay in.
 */
export function computeNearWords(sense: NearWordsInput, forms: ReferenceForms): string[] {
  const own = new Set([
    ...regularInflections(normalizeEn(sense.lemma)),
    ...[sense.lemma, ...sense.answers].map(normalizeEn),
  ]);
  const near = new Set<string>();
  const max = ANSWERS.maxTypoDistance;
  for (const answer of sense.answers.map(normalizeEn)) {
    const n = [...answer].length;
    if (n < ANSWERS.typoMinLength) continue;
    for (let len = n - max; len <= n + max; len++) {
      for (const w of forms.get(len) ?? []) {
        if (!own.has(w) && damerauLevenshtein(answer, w, max) <= max) near.add(w);
      }
    }
  }
  return [...near].sort();
}
