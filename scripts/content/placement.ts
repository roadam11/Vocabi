/**
 * Placement bank sampling (docs/ENGINE.md §4): real yes/no items per band, drawn
 * deterministically from the lemma partition (bands.ts). Pure; build-placement.ts writes
 * content/placement/items.json.
 */
import type { PlacementItem } from "../../src/content/schema";
import type { Band } from "../../src/engine/distractors";
import { mulberry32, shuffle } from "../../src/engine/random";
import type { LemmaRow } from "./lemmas";
import { lemmaSlug } from "./validate";

export type BankContext = {
  band: ReadonlyMap<string, Band>;
  /** NGSL ∪ NAWL ∪ CEFR-J headwords: proper-noun uses are fine for these (mark, bill). */
  listed: ReadonlySet<string>;
  /** Offensive words and Hebrew loanwords every Israeli knows. */
  excluded: ReadonlySet<string>;
};

/**
 * Why a ranked lemma cannot be a yes/no item, or null when it can. "Do you know this word?" is
 * invalid for a lemma the learner may recognize as a form of another word (found → find,
 * lives → live), for names and abbreviations, and for excluded words.
 */
export function ineligible(row: LemmaRow, ctx: BankContext): string | null {
  if (!ctx.band.has(row.lemma)) return "no band";
  if (!/^[a-z]{3,}$/.test(row.lemma)) return "short, hyphenated or not a-z";
  if (!/[aeiouy]/.test(row.lemma)) return "abbreviation";
  if (row.formOf.length > 0) return `also a form of ${row.formOf.join(", ")}`;
  if (row.proper && !ctx.listed.has(row.lemma)) return "proper noun";
  if (ctx.excluded.has(row.lemma)) return "excluded list";
  return null;
}

/** `perBand` eligible lemmas per band, sampled with a seeded shuffle of the rank-ordered pool. */
export function sampleBank(
  rows: readonly LemmaRow[],
  ctx: BankContext,
  bands: readonly Band[],
  perBand: number,
  seed: number,
): PlacementItem[] {
  return bands.flatMap((b, i) => {
    const pool = rows
      .filter((r) => ctx.band.get(r.lemma) === b && ineligible(r, ctx) === null)
      .sort((x, y) => x.rank - y.rank)
      .map((r) => r.lemma);
    if (pool.length < perBand) throw new Error(`${b}: only ${pool.length} eligible lemmas`);
    return shuffle(pool, mulberry32(seed + i))
      .slice(0, perBand)
      .sort()
      .map((lemma) => ({ id: `${b}-${lemmaSlug(lemma)}`, lemma, band: b }));
  });
}
