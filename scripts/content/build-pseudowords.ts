/**
 * `pnpm content:pseudowords` — writes content/placement/pseudo.json (COUNT pseudowords, ids
 * `p-<text>`) and review/pseudowords.csv (UTF-8 with BOM) for the human slang/brand/
 * other-language check (docs/DECISIONS.md #7). Run after content:placement: the placement lemmas
 * count as content words for rule 9.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { readContent } from "../../src/content/read";
import { parseLemmaRows } from "./lemmas";
import { pseudoContext } from "./pseudo-rule";
import { generatePseudowords } from "./pseudowords";
import { REFERENCE_DIR } from "./sources";

const COUNT = 50; // ≥ 40 must survive human review
const SEED = 7;
const ROOT = resolve(import.meta.dirname, "../..");

const reference = readFileSync(join(REFERENCE_DIR, "top20k-en.txt"), "utf8")
  .split("\n")
  .filter((l) => l && !l.startsWith("#"));
const contentWords = readContent(join(ROOT, "content"))
  .records.filter((r) => r.kind !== "pseudoword" && r.kind !== "bands" && r.kind !== "track")
  .flatMap((r) => {
    const v = r.value as {
      lemma?: string;
      answers?: string[];
      family?: string[];
      synonyms?: string[];
    };
    return [v.lemma ?? "", ...(v.answers ?? []), ...(v.family ?? []), ...(v.synonyms ?? [])];
  })
  .filter(Boolean);
const rows = parseLemmaRows(readFileSync(join(REFERENCE_DIR, "lemmas-en.tsv"), "utf8"));
const knownForms = new Set(rows.flatMap((r) => [r.lemma, ...r.forms]));

const words = generatePseudowords(COUNT, SEED, pseudoContext(reference, contentWords), knownForms);
const pseudo = words.map((text) => ({ id: `p-${text}`, text }));
writeFileSync(join(ROOT, "content/placement/pseudo.json"), `${JSON.stringify(pseudo, null, 2)}\n`);
mkdirSync(join(ROOT, "review"), { recursive: true });
writeFileSync(
  join(ROOT, "review/pseudowords.csv"),
  "﻿" +
    ["id,text,decision,notes", ...pseudo.map((p) => `${p.id},${p.text},,`)].join("\r\n") +
    "\r\n",
);
console.log(words.join(" "));
