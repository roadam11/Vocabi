/**
 * Pseudoword generator for the placement yes/no test (docs/ENGINE.md §4, docs/DECISIONS.md #7):
 * pronounceable English-like strings from onset/nucleus/coda tables and word-final endings,
 * deterministic for a seed. Every candidate must pass content:check rule 9 (pseudo-rule.ts) and,
 * stricter than the rule, must not be any form in lemmas-en.tsv (rarer real words). Human review
 * still rejects slang, brands and words of other languages.
 */
import { mulberry32, type Rng } from "../../src/engine/random";
import { type PseudoContext, pseudowordProblems } from "./pseudo-rule";

const ONSETS = [
  "b", "bl", "br", "d", "dr", "f", "fl", "fr", "g", "gl", "gr", "h", "l", "m", "n", "p", "pl",
  "pr", "r", "s", "sk", "sl", "sp", "st", "str", "t", "tr", "v", "w",
]; // prettier-ignore
const NUCLEI = ["a", "e", "i", "o", "u", "ai", "ea", "oa", "ou", "ee"];
const CODAS = ["", "", "", "n", "m", "l", "r", "s", "nd", "nt", "st", "rk", "lt", "mp"];
const ENDINGS = [
  "ate",
  "ish",
  "ent",
  "ure",
  "ine",
  "ous",
  "age",
  "ify",
  "ism",
  "ance",
  "ery",
  "ful",
  "ity",
  "le",
];

const pick = <T>(xs: readonly T[], rng: Rng) => xs[Math.floor(rng() * xs.length)]!;

const VOWEL = /[aeiou]$/;

function candidate(rng: Rng): string {
  const syllables = 1 + Math.floor(rng() * 2);
  let w = "";
  for (let i = 0; i < syllables; i++) {
    // A later syllable may skip its onset only after a coda (no vowel hiatus: "straark").
    const onset = i === 0 || VOWEL.test(w) || rng() < 0.6 ? pick(ONSETS, rng) : "";
    w += onset + pick(NUCLEI, rng) + pick(CODAS, rng);
  }
  if (rng() < 0.15) return w;
  // A vowel-initial ending needs a consonant before it ("brostiure").
  const endings = VOWEL.test(w) ? ENDINGS.filter((e) => !/^[aeiou]/.test(e)) : ENDINGS;
  return w + pick(endings, rng);
}

const readable = (w: string) =>
  !/(.)\1\1/.test(w) && // no tripled letters
  !/[aeiou]{3}/.test(w) && // no three vowels in a row
  !/[^aeiouy]{3}/.test(w.slice(1)); // no clusters of 3+ consonants after the onset ("glindv")

export function generatePseudowords(
  count: number,
  seed: number,
  ctx: PseudoContext,
  knownForms: ReadonlySet<string>,
  maxTries = 200_000,
): string[] {
  const rng = mulberry32(seed);
  const out: string[] = [];
  const seen = new Set<string>();
  for (let t = 0; t < maxTries && out.length < count; t++) {
    const w = candidate(rng);
    if (seen.has(w)) continue;
    seen.add(w);
    if (!readable(w) || knownForms.has(w)) continue;
    // A real word + ending ("tree" + "ful") is a transparent coinage, not a non-word.
    const stem = ENDINGS.filter((e) => w.endsWith(e)).map((e) => w.slice(0, -e.length));
    if (stem.some((x) => knownForms.has(x) || knownForms.has(`${x}e`))) continue;
    // Not too close to an already accepted pseudoword either (variety for the test).
    if (out.some((o) => o.slice(0, 4) === w.slice(0, 4))) continue;
    if (pseudowordProblems(w, ctx).length === 0) out.push(w);
  }
  if (out.length < count) throw new Error(`only ${out.length} pseudowords in ${maxTries} tries`);
  return out;
}
