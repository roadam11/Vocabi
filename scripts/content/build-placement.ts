/**
 * `pnpm content:placement` — writes content/placement/items.json: PER_BAND real lemmas per band,
 * sampled deterministically from the lemma partition (placement.ts, docs/ENGINE.md §4), and
 * review/placement-items.csv for a human look. Re-running gives the same file.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { BANDS } from "../../src/engine/distractors";
import { computeBands, readBandInputs } from "./bands";
import { parseLemmaRows } from "./lemmas";
import { sampleBank } from "./placement";
import { parseCefrj, parseFamilies, readSource, REFERENCE_DIR, SOURCES } from "./sources";

const PER_BAND = 30;
const SEED = 20261003;
const ROOT = resolve(import.meta.dirname, "../..");

const list = (file: string) =>
  readFileSync(join(REFERENCE_DIR, file), "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

const rows = parseLemmaRows(readFileSync(join(REFERENCE_DIR, "lemmas-en.tsv"), "utf8"));
const { band } = computeBands(readBandInputs(REFERENCE_DIR));
const listed = new Set([
  ...parseFamilies(readSource(SOURCES.ngslFamilies)).map((f) => f.lemma),
  ...parseFamilies(readSource(SOURCES.nawlFamilies)).map((f) => f.lemma),
  ...parseCefrj(readSource(SOURCES.cefrj)).map((e) => e.headword),
]);
const excluded = new Set(["exclude-offensive.txt", "exclude-names.txt"].flatMap(list));

const items = sampleBank(rows, { band, listed, excluded }, BANDS, PER_BAND, SEED);
writeFileSync(join(ROOT, "content/placement/items.json"), `${JSON.stringify(items, null, 2)}\n`);

const rank = new Map(rows.map((r) => [r.lemma, r.rank]));
mkdirSync(join(ROOT, "review"), { recursive: true });
writeFileSync(
  join(ROOT, "review/placement-items.csv"),
  "﻿" +
    [
      "id,lemma,band,rank,decision,notes",
      ...items.map((i) => `${i.id},${i.lemma},${i.band},${rank.get(i.lemma) ?? ""},,`),
    ].join("\r\n") +
    "\r\n",
);
for (const b of BANDS) {
  console.log(
    `${b}: ${items
      .filter((i) => i.band === b)
      .map((i) => i.lemma)
      .join(" ")}`,
  );
}
