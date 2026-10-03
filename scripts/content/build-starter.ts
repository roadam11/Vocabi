/**
 * `pnpm content:starter` — content/input/amirnet-starter.csv (starter.ts) for P5b generation,
 * plus Noa coverage: how many of her unique headwords the open lists (NAWL ∪ CEFR-J B2) cover,
 * and how many survive into the candidate pool. Uncovered headwords → review/noa-not-in-pool.txt.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import type { Pos } from "../../src/engine/distractors";
import { computeBands, readBandInputs } from "./bands";
import { parseLemmaRows } from "./lemmas";
import {
  parseCefrj,
  parseFamilies,
  parseNawlDefinitions,
  parseNgslStats,
  readSource,
  REFERENCE_DIR,
  SOURCES,
} from "./sources";
import { type Candidate, selectStarter, type Source, starterCsv } from "./starter";

const TARGET = 150;
const NGSL_EXCLUDE_TOP = 1000;
const ROOT = resolve(import.meta.dirname, "../..");

const rows = parseLemmaRows(readFileSync(join(REFERENCE_DIR, "lemmas-en.tsv"), "utf8"));
const lemmaRow = new Map(rows.map((r) => [r.lemma, r]));
const formLemma = new Map<string, string>();
for (const r of rows) for (const f of r.forms) if (!formLemma.has(f)) formLemma.set(f, r.lemma);
const { band } = computeBands(readBandInputs(REFERENCE_DIR));

const require = createRequire(import.meta.url);
const wink = require("wink-lemmatizer") as Record<
  "verb" | "noun" | "adjective",
  (w: string) => string
>;
const lexReq = createRequire(require.resolve("wink-lemmatizer"));
const wnWords = lexReq("wink-lexicon/src/wn-words.js") as Record<string, number>;
const wnSenses = lexReq("wink-lexicon/src/wn-word-senses.js") as number[][];

/**
 * A word as a lemma: itself if ranked as a lemma, else the lemma its form belongs to, else (rare
 * forms beyond lemmas-en.tsv: "adjourns") the first WordNet lemma the morphy lemmatizer finds.
 */
function toLemma(w: string): string {
  if (lemmaRow.has(w)) return w;
  const hit = formLemma.get(w);
  if (hit) return hit;
  const base = [wink.verb(w), wink.noun(w), wink.adjective(w)].find((c) => c !== w && c in wnWords);
  return base ? (formLemma.get(base) ?? base) : w;
}
const isPhrase = (w: string) => w.includes(" ");

// Sources.
const nawlFamilies = parseFamilies(readSource(SOURCES.nawlFamilies));
const nawl = new Set(nawlFamilies.map((f) => f.lemma));
const defs = new Map<string, { def: string; pos: string }>();
for (const d of parseNawlDefinitions(readSource(SOURCES.nawlDefinitions))) {
  // One NAWL definition row is keyed by a form ("cheers" for the family "cheer").
  const lemma = nawl.has(d.lemma)
    ? d.lemma
    : (nawlFamilies.find((f) => f.forms.includes(d.lemma))?.lemma ?? d.lemma);
  defs.set(lemma, d);
}
const cefrj = parseCefrj(readSource(SOURCES.cefrj));
const b2 = new Set(cefrj.filter((e) => e.level === "B2").map((e) => toLemma(e.headword)));
const cefrjPos = new Map<string, string>();
for (const e of cefrj)
  if (!cefrjPos.has(toLemma(e.headword))) cefrjPos.set(toLemma(e.headword), e.pos);
const ngslTop = new Set(
  parseNgslStats(readSource(SOURCES.ngslStats))
    .filter((r) => r.rank <= NGSL_EXCLUDE_TOP)
    .map((r) => r.lemma),
);
const noaHeadwords = readFileSync(join(REFERENCE_DIR, "candidates/noa.txt"), "utf8")
  .split("\n")
  .filter((l) => l && !l.startsWith("#"));
const noa = new Map(noaHeadwords.map((h) => [h, isPhrase(h) ? h : toLemma(h)]));

// POS: NAWL definition, else CEFR-J, else the WordNet POS with the most senses.
const NAWL_POS: Record<string, Pos> = {
  n: "n",
  "n pl.": "n",
  verb: "v",
  adj: "adj",
  adv: "adv",
  prep: "prep",
};
const CEFRJ_POS: Record<string, Pos> = {
  noun: "n", verb: "v", adjective: "adj", adverb: "adv", preposition: "prep", conjunction: "conj",
}; // prettier-ignore
function wordnetPos(w: string): Pos | null {
  const senses = wnSenses[wnWords[w] ?? -1];
  if (!senses) return null;
  const n = { n: 0, v: 0, adj: 0, adv: 0 };
  for (const s of senses) {
    if (s === 2) n.adv++;
    else if (s <= 1 || s === 44) n.adj++;
    else if (s <= 28) n.n++;
    else n.v++;
  }
  return (["n", "v", "adj", "adv"] as const).reduce((a, b) => (n[b] > n[a] ? b : a));
}
function posOf(lemma: string): Pos | null {
  if (isPhrase(lemma)) return "phrase";
  const d = defs.get(lemma);
  if (d && d.pos === "prefix") return null;
  return (
    (d && NAWL_POS[d.pos]) ??
    CEFRJ_POS[cefrjPos.get(lemma) ?? ""] ??
    wordnetPos(lemma) ??
    // Hyphenated compounds take their last part's POS ("ill-fated" → fated, adj).
    (lemma.includes("-") ? wordnetPos(toLemma(lemma.split("-").at(-1)!)) : null)
  );
}

// Candidates.
const sources = new Map<string, Set<Source>>();
const add = (lemma: string, s: Source) =>
  sources.set(lemma, (sources.get(lemma) ?? new Set()).add(s));
for (const l of nawl) add(l, "nawl");
for (const l of noa.values()) add(l, "noa");
for (const l of b2) add(l, "cefrj-b2");

const excluded: { lemma: string; why: string }[] = [];
const candidates: Candidate[] = [];
for (const [lemma, src] of [...sources].sort(([a], [b]) => (a < b ? -1 : 1))) {
  if (ngslTop.has(lemma)) {
    excluded.push({ lemma, why: `NGSL top ${NGSL_EXCLUDE_TOP}` });
    continue;
  }
  const pos = posOf(lemma);
  if (!pos) {
    excluded.push({ lemma, why: "no usable POS (prefix, determiner, pronoun, unknown)" });
    continue;
  }
  const head = isPhrase(lemma) ? toLemma(lemma.split(" ")[0]!) : lemma;
  const row = lemmaRow.get(lemma) ?? lemmaRow.get(head);
  candidates.push({
    lemma,
    pos,
    hint: defs.get(lemma)?.def ?? "",
    freq: row?.freq ?? 0,
    rank: lemmaRow.get(lemma)?.rank ?? null,
    band: band.get(lemma) ?? "B5",
    sources: src,
  });
}

const selected = selectStarter(candidates, TARGET);
mkdirSync(join(ROOT, "content/input"), { recursive: true });
writeFileSync(join(ROOT, "content/input/amirnet-starter.csv"), starterCsv(selected));

// Report.
const count = <T>(xs: readonly T[], f: (x: T) => boolean) => xs.filter(f).length;
const pct = (a: number, b: number) => `${((100 * a) / b).toFixed(1)}%`;
const tiers = ["nawl+noa", "nawl", "noa", "cefrj-b2"] as const;
console.log(
  `candidates: ${candidates.length} (excluded ${excluded.length}); selected ${selected.length}`,
);
for (const t of tiers) console.log(`  tier ${t}: ${count(selected, (s) => s.tier === t)} selected`);
console.log(
  `  sources in selection: nawl ${count(selected, (s) => s.sources.has("nawl"))}, noa ${count(selected, (s) => s.sources.has("noa"))}, cefrj-b2 ${count(selected, (s) => s.sources.has("cefrj-b2"))}`,
);
const inPool = new Set(candidates.map((c) => c.lemma));
const noaN = noa.size;
const openCovered = [...noa].filter(([, l]) => nawl.has(l) || b2.has(l));
const notOpen = [...noa].filter(([, l]) => !nawl.has(l) && !b2.has(l));
console.log(`Noa unique headwords: ${noaN}`);
console.log(
  `  covered by NAWL ∪ CEFR-J B2: ${openCovered.length} (${pct(openCovered.length, noaN)})`,
);
console.log(
  `  in the candidate pool after exclusions: ${count([...noa.values()], (l) => inPool.has(l))} (${pct(
    count([...noa.values()], (l) => inPool.has(l)),
    noaN,
  )})`,
);
const noaExcluded = [...noa].filter(([, l]) => !inPool.has(l));
console.log(
  `  excluded from the pool: ${noaExcluded.map(([h, l]) => (h === l ? h : `${h}→${l}`)).join(" ")}`,
);
mkdirSync(join(ROOT, "review"), { recursive: true });
writeFileSync(
  join(ROOT, "review/noa-not-in-pool.txt"),
  [
    `# Noa headwords not in NAWL ∪ CEFR-J B2 (${notOpen.length} of ${noaN}); they stay candidates via Noa's list.`,
    ...notOpen.map(([h, l]) => (h === l ? h : `${h}\t(${l})`)),
    "",
    `# Noa headwords excluded from the candidate pool (${noaExcluded.length}):`,
    ...noaExcluded.map(([h, l]) => `${h}\t${excluded.find((e) => e.lemma === l)?.why ?? ""}`),
  ].join("\n") + "\n",
);
