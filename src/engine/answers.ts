/** Production-layer answer checking (docs/ENGINE.md §5). */
import { ANSWERS } from "./config";
import { damerauLevenshtein, normalizeEn } from "./text";

export type AnswerTarget = {
  lemma: string;
  /** Accepted answers: lemma, listed inflections, US/UK and hyphen/space variants. */
  answers: readonly string[];
  /** Real words one edit away, from content (docs/DECISIONS.md #34). */
  nearWords?: readonly string[];
};

/** Normalized lemma or listed form → the lemmas it belongs to. */
export type ConfusableIndex = ReadonlyMap<string, ReadonlySet<string>>;

export type AnswerCheck =
  | { verdict: "correct"; expected: string }
  /** Correct with an accepted typo: rated Hard, and `expected` is the spelling to show. */
  | { verdict: "typo"; expected: string }
  | { verdict: "wrong"; expected: string; confusion?: { target: string; typed: string } };

/** Every lemma and listed answer form in the content (senses + distractor-only lexicon). */
export function buildConfusableIndex(
  senses: readonly { lemma: string; answers: readonly string[] }[],
  lexicon: readonly { lemma: string }[],
): ConfusableIndex {
  const index = new Map<string, Set<string>>();
  const add = (form: string, lemma: string) => {
    const key = normalizeEn(form);
    const lemmas = index.get(key) ?? new Set();
    index.set(key, lemmas.add(normalizeEn(lemma)));
  };
  for (const s of senses) for (const form of [s.lemma, ...s.answers]) add(form, s.lemma);
  for (const l of lexicon) add(l.lemma, l.lemma);
  return index;
}

/** §5.6: an empty answer (after normalization) cannot be submitted; "I don't know" is separate. */
export function isSubmittable(input: string): boolean {
  return normalizeEn(input) !== "";
}

/**
 * §5: exact match → correct; another lemma's form, or a real word from `nearWords` → wrong with
 * a confusion pair (no typo tolerance: affect ≠ effect, quiet ≠ quite); otherwise one
 * Damerau-Levenshtein edit (in total, also for multi-word answers) against an accepted answer of
 * ≥ 5 characters → typo.
 */
export function checkAnswer(
  input: string,
  target: AnswerTarget,
  index: ConfusableIndex,
): AnswerCheck {
  const typed = normalizeEn(input);
  const accepted = target.answers.map((a) => ({ raw: a, norm: normalizeEn(a) }));
  const fallback = target.answers[0] ?? target.lemma;
  if (typed === "") return { verdict: "wrong", expected: fallback };

  const exact = accepted.find((a) => a.norm === typed);
  if (exact) return { verdict: "correct", expected: exact.raw };

  const lemma = normalizeEn(target.lemma);
  const otherLemma = [...(index.get(typed) ?? [])].some((l) => l !== lemma);
  const nearWord = (target.nearWords ?? []).some((w) => normalizeEn(w) === typed);
  if (otherLemma || nearWord) {
    return { verdict: "wrong", expected: fallback, confusion: { target: target.lemma, typed } };
  }

  const max = ANSWERS.maxTypoDistance;
  const typo = accepted.find(
    (a) =>
      [...a.norm].length >= ANSWERS.typoMinLength && damerauLevenshtein(typed, a.norm, max) <= max,
  );
  if (typo) return { verdict: "typo", expected: typo.raw };
  return { verdict: "wrong", expected: fallback };
}
