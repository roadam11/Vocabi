/**
 * Placement bands as a disjoint, lemma-based partition (docs/ENGINE.md §4, docs/DECISIONS.md #31).
 * B1-B5 by lemma frequency rank (BAND_RANKS); ACAD = NAWL lemmas with rank ≥ ACAD_MIN_RANK or no
 * rank at all, removed from B4/B5 (the rank bands are not backfilled). Pure; used by
 * `pnpm content:bands` to write content/placement/bands.json and by content:check (BANDS_STALE,
 * PLACEMENT_BAND) to prove the file and the placement items are up to date.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PlacementBands } from "../../src/content/schema";
import { ACAD_MIN_RANK, BAND_RANKS } from "../../src/engine/config";
import { BANDS, type Band } from "../../src/engine/distractors";
import { parseLemmaRows } from "./lemmas";
import { parseFamilies, readSource, SOURCES } from "./sources";

export type BandInputs = {
  /** Lemma → frequency rank (content/reference/lemmas-en.tsv). */
  ranks: ReadonlyMap<string, number>;
  /** NAWL 1.2 headwords. */
  nawl: readonly string[];
};

export type Partition = { band: Map<string, Band>; sizes: PlacementBands };

export function computeBands({ ranks, nawl }: BandInputs): Partition {
  const band = new Map<string, Band>();
  for (const [lemma, rank] of ranks) {
    for (const [b, [lo, hi]] of Object.entries(BAND_RANKS) as [Band, readonly [number, number]][]) {
      if (rank >= lo && rank <= hi) band.set(lemma, b);
    }
  }
  for (const lemma of nawl) {
    const rank = ranks.get(lemma);
    if (rank === undefined || rank >= ACAD_MIN_RANK) band.set(lemma, "ACAD");
  }
  const sizes = Object.fromEntries(BANDS.map((b) => [b, 0])) as PlacementBands;
  for (const b of band.values()) sizes[b]++;
  return { band, sizes };
}

/** bands.json text: one stable, formatted JSON object in BANDS order. */
export function formatBands(sizes: PlacementBands): string {
  return `${JSON.stringify(Object.fromEntries(BANDS.map((b) => [b, sizes[b]])), null, 2)}\n`;
}

/** Band inputs from the committed reference files (lemmas-en.tsv + NAWL 1.2 headwords). */
export function readBandInputs(dir: string): BandInputs {
  const rows = parseLemmaRows(readFileSync(join(dir, "lemmas-en.tsv"), "utf8"));
  const nawl = parseFamilies(readSource(SOURCES.nawlFamilies, dir)).map((f) => f.lemma);
  return { ranks: new Map(rows.map((r) => [r.lemma, r.rank])), nawl };
}
