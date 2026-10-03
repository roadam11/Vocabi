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
  /** Lemma → summed wordfreq frequency (lemmas-en.tsv), for the end-letter look-alike rule. */
  freq: ReadonlyMap<string, number>;
};

/** A lemma at least this many times more frequent makes a one-end-letter neighbour invalid. */
export const LOOKALIKE_RATIO = 10;

/**
 * The most frequent lemma that is `lemma` plus one letter at the end (rout → route, sometime →
 * sometimes) if it is at least LOOKALIKE_RATIO times more frequent: a "yes" would mean the
 * learner recognized that word, not this one (docs/DECISIONS.md #60, #61).
 */
export function endLetterLookalike(
  lemma: string,
  freq: ReadonlyMap<string, number>,
): { word: string; ratio: number } | null {
  const own = freq.get(lemma) ?? 0;
  // One direction only: removing a letter (barn → bar, provider → provide) finds distinct words
  // or transparent derivations whose knowledge is real (docs/DECISIONS.md #61).
  const neighbours = "abcdefghijklmnopqrstuvwxyz".split("").map((c) => lemma + c);
  let best: { word: string; ratio: number } | null = null;
  for (const word of neighbours) {
    const f = freq.get(word);
    if (f === undefined || own <= 0) continue;
    const ratio = f / own;
    if (ratio >= LOOKALIKE_RATIO && (!best || ratio > best.ratio)) best = { word, ratio };
  }
  return best;
}

/**
 * Why a ranked lemma cannot be a yes/no item, or null when it can. "Do you know this word?" is
 * invalid for a lemma the learner may recognize as a form of another word (found → find,
 * lives → live) or as a much more frequent word one end-letter away (rout → route), for names and
 * abbreviations, and for excluded words.
 */
export function ineligible(row: LemmaRow, ctx: BankContext): string | null {
  if (!ctx.band.has(row.lemma)) return "no band";
  if (!/^[a-z]{3,}$/.test(row.lemma)) return "short, hyphenated or not a-z";
  if (!/[aeiouy]/.test(row.lemma)) return "abbreviation";
  if (row.formOf.length > 0) return `also a form of ${row.formOf.join(", ")}`;
  if (row.proper && !ctx.listed.has(row.lemma)) return "proper noun";
  if (ctx.excluded.has(row.lemma)) return "excluded list";
  const like = endLetterLookalike(row.lemma, ctx.freq);
  if (like) return `one letter from "${like.word}" (${Math.floor(like.ratio)}x more frequent)`;
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
