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
  /**
   * Invalid items only (docs/DECISIONS.md #57): offensive words, and names/abbreviations WordNet
   * does not flag. Never words a learner simply knows (loanwords): that would bias p_b.
   */
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

/** `perBand` eligible lemmas per band: the first eligible ones of a seeded shuffle of the band. */
export function sampleBank(
  rows: readonly LemmaRow[],
  ctx: BankContext,
  bands: readonly Band[],
  perBand: number,
  seed: number,
): PlacementItem[] {
  return bands.flatMap((b, i) => {
    // Shuffle the whole band, then take the first eligible lemmas: excluding one more word
    // replaces only that word instead of reshuffling the band (docs/DECISIONS.md #59).
    const band = rows.filter((r) => ctx.band.get(r.lemma) === b).sort((x, y) => x.rank - y.rank);
    const picked = shuffle(band, mulberry32(seed + i))
      .filter((r) => ineligible(r, ctx) === null)
      .map((r) => r.lemma);
    if (picked.length < perBand) throw new Error(`${b}: only ${picked.length} eligible lemmas`);
    return picked
      .slice(0, perBand)
      .sort()
      .map((lemma) => ({ id: `${b}-${lemmaSlug(lemma)}`, lemma, band: b }));
  });
}
