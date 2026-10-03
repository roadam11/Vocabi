/**
 * content:check rule 9 for one pseudoword (docs/CONTENT.md, docs/DECISIONS.md #7), shared by the
 * validator and the pseudoword generator (pseudowords.ts) so both apply exactly the same test.
 */
import { damerauLevenshtein, normalizeEn } from "../../src/engine/text";
import { inflections } from "./inflect";

export const PSEUDO_MIN = 7;
export const PSEUDO_MAX = 10;
const PSEUDO_MIN_DISTANCE = 3; // DL ≤ 2 to a common word is a collision (docs/DECISIONS.md #7)

export type PseudoContext = {
  /** Inflections of every content word (lemmas, answers, family, synonyms, placement lemmas). */
  contentForms: ReadonlySet<string>;
  /** Inflections of every reference (top-20k) word. */
  referenceForms: readonly string[];
  referenceSet: ReadonlySet<string>;
};

export function pseudoContext(
  reference: readonly string[],
  contentWords: readonly string[],
): PseudoContext {
  const referenceForms = [...new Set(reference.flatMap((w) => inflections(normalizeEn(w))))];
  return {
    contentForms: new Set(contentWords.flatMap((w) => inflections(normalizeEn(w)))),
    referenceForms,
    referenceSet: new Set(referenceForms),
  };
}

export type PseudoProblem = {
  code: "PSEUDO_LENGTH" | "PSEUDO_REAL_WORD" | "PSEUDO_NEAR_WORD";
  message: string;
};

/** Every rule-9 problem of `text`; empty when it is a valid pseudoword. */
export function pseudowordProblems(text: string, ctx: PseudoContext): PseudoProblem[] {
  const out: PseudoProblem[] = [];
  const t = normalizeEn(text);
  const len = [...t].length;
  if (len < PSEUDO_MIN || len > PSEUDO_MAX) {
    out.push({
      code: "PSEUDO_LENGTH",
      message: `"${text}" has ${len} characters; ${PSEUDO_MIN}-${PSEUDO_MAX} required`,
    });
  }
  if (ctx.contentForms.has(t) || ctx.referenceSet.has(t)) {
    out.push({ code: "PSEUDO_REAL_WORD", message: `"${text}" is a real word or inflection` });
    return out;
  }
  const near = ctx.referenceForms.find(
    (w) => damerauLevenshtein(t, w, PSEUDO_MIN_DISTANCE - 1) < PSEUDO_MIN_DISTANCE,
  );
  if (near) {
    out.push({
      code: "PSEUDO_NEAR_WORD",
      message: `"${text}" is within distance ${PSEUDO_MIN_DISTANCE - 1} of "${near}"`,
    });
  }
  return out;
}
