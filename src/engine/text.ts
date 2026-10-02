/** Text helpers shared by answer checking (§5), distractors (§6) and the content validator. */

/**
 * Damerau-Levenshtein distance, optimal-string-alignment variant (adjacent transpositions count 1;
 * no substring is edited twice), over Unicode code points. With `max`, returns `max + 1` as soon
 * as the distance is known to exceed it.
 */
export function damerauLevenshtein(a: string, b: string, max = Infinity): number {
  const s = Array.from(a);
  const t = Array.from(b);
  if (Math.abs(s.length - t.length) > max) return max + 1;
  if (s.length === 0 || t.length === 0) return Math.min(Math.max(s.length, t.length), max + 1);

  let prev2: number[] = [];
  let prev = Array.from({ length: t.length + 1 }, (_, j) => j);
  for (let i = 1; i <= s.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      let d = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
      if (i > 1 && j > 1 && s[i - 1] === t[j - 2] && s[i - 2] === t[j - 1]) {
        d = Math.min(d, prev2[j - 2]! + 1);
      }
      cur.push(d);
      if (d < rowMin) rowMin = d;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return Math.min(prev[t.length]!, max + 1);
}

const EDGE_PUNCT = /^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu;

/** docs/ENGINE.md §5 step 1: NFKC, trim, lowercase, collapse whitespace, ’ → ', strip edge punctuation. */
export function normalizeEn(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[‘’ʼ]/g, "'")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(EDGE_PUNCT, "");
}

/** normalizeEn plus hyphen ↔ space folding, for "well-known" vs "well known" comparisons. */
export function normalizeEnLoose(s: string): string {
  return normalizeEn(s.replace(/[-‐‑]/g, " "));
}

// Hebrew points and cantillation (U+0591-U+05C7), excluding the punctuation in that block:
// maqaf U+05BE, paseq U+05C0, sof pasuq U+05C3, nun hafukha U+05C6.
const NIQQUD = /[֑-ׇֽֿׁׂׅׄ]/g;

/**
 * docs/ENGINE.md §6: strip niqqud, maqaf → space, remove parenthetical text, split on `,` and `;`.
 * Returns the non-empty normalized glosses.
 */
export function normalizeHebrewGloss(s: string): string[] {
  return s
    .normalize("NFC")
    .replace(NIQQUD, "")
    .replace(/־/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .split(/[,;]/)
    .map((g) => g.replace(/\s+/g, " ").trim())
    .filter((g) => g.length > 0);
}

export type HebrewGloss = { primary: string; alternates?: readonly string[] };

function glossSet(he: HebrewGloss): Set<string> {
  return new Set([he.primary, ...(he.alternates ?? [])].flatMap(normalizeHebrewGloss));
}

/** True if the two glosses share any normalized gloss (they cannot be distractors for each other). */
export function glossesCollide(a: HebrewGloss, b: HebrewGloss): boolean {
  const sa = glossSet(a);
  return [...glossSet(b)].some((g) => sa.has(g));
}
