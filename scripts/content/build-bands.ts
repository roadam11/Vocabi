/**
 * `pnpm content:bands` — writes content/placement/bands.json (band sizes in lemmas) from the
 * committed reference files (docs/DECISIONS.md #31). content:check fails with BANDS_STALE when the
 * file no longer matches what this computes.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { computeBands, formatBands, readBandInputs } from "./bands";
import { REFERENCE_DIR } from "./sources";

const OUT = resolve(import.meta.dirname, "../../content/placement/bands.json");
const { sizes } = computeBands(readBandInputs(REFERENCE_DIR));
writeFileSync(OUT, formatBands(sizes));
console.log(`bands.json: ${JSON.stringify(sizes)}`);
