/**
 * Pinned external word lists (content/SOURCES.md) and their parsers. Downloaded byte-for-byte into
 * content/reference/ by `pnpm content:build-reference`, which checks every sha256. Internal use
 * only: never read from src/ (docs/DECISIONS.md #28).
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const REFERENCE_DIR = resolve(import.meta.dirname, "../../content/reference");

export type PinnedSource = {
  file: string;
  url: string;
  sha256: string;
  encoding: "utf8" | "latin1";
};

const SQ = "https://static1.squarespace.com/static/64336926d7c6bb38965fdf3b/t";

export const SOURCES = {
  ngslStats: {
    file: "ngsl-1.2-stats.csv",
    url: `${SQ}/644e0be4ad7bae3d45b9e62a/1682836452194/NGSL_1.2_stats.csv`,
    sha256: "2098bab8955a120a9766c6282a51d7d578c6cb0a7d946600d2ffb73ba25a0b44",
    encoding: "utf8",
  },
  ngslFamilies: {
    file: "ngsl-1.2-lemmatized.csv",
    url: `${SQ}/66e83ee8dc33447753c03f88/1726496489020/NGSL_1.2_lemmatized_for_research.csv`,
    sha256: "d814f2a0a3c61479a2c5ad037661719a0cc6e7dbcde31f181b54f12d0f1e11a4",
    encoding: "utf8",
  },
  nawlFamilies: {
    file: "nawl-1.2-lemmatized.csv",
    url: `${SQ}/643c7cf96a3ed81c74e87a01/1681685753444/NAWL_1.2_lemmatized_for_research.csv`,
    sha256: "c28ef95623d79c08a4060d6d6d51d3331115e75a18ee247caa4cc3ae5506b92e",
    encoding: "latin1",
  },
  nawlDefinitions: {
    file: "nawl-1.2-definitions.csv",
    url: `${SQ}/643c7da6097db81d6db11e39/1681685926392/NAWL_1.2_with_en_definitions.csv`,
    sha256: "2eca6b402b2cd17a8a0ce79f0ab6880bef8af2f4dbab38d045321cecaa3284a4",
    encoding: "utf8",
  },
  cefrj: {
    file: "cefrj-1.5.csv",
    url: "https://raw.githubusercontent.com/openlanguageprofiles/olp-en-cefrj/d4e45b75b38f27b30dfc5c44d8c571aec7e7092f/cefrj-vocabulary-profile-1.5.csv",
    sha256: "b0dd3c635f1c9a4fdf1490c7e5b7c48e8bbe55b652ad0c9860a95f98e10ae498",
    encoding: "utf8",
  },
} as const satisfies Record<string, PinnedSource>;

export function readSource(s: PinnedSource, dir = REFERENCE_DIR): string {
  return new TextDecoder(s.encoding === "latin1" ? "latin1" : "utf-8").decode(
    readFileSync(join(dir, s.file)),
  );
}

// ---- parsers -----------------------------------------------------------------------------------

/** Minimal RFC 4180 CSV: quoted fields, doubled quotes, CRLF; strips a UTF-8 BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const s = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

const clean = (w: string) => w.trim().toLowerCase();

/** NGSL_1.2_stats.csv → lemma and SFI rank, in rank order. */
export function parseNgslStats(text: string): { lemma: string; rank: number }[] {
  return parseCsv(text)
    .slice(1)
    .map(([lemma, rank]) => ({ lemma: clean(lemma!), rank: Number(rank) }))
    .sort((a, b) => a.rank - b.rank);
}

/** "*_lemmatized_for_research.csv": `lemma,form,form,…` lines; `##` lines are comments. */
export function parseFamilies(text: string): { lemma: string; forms: string[] }[] {
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => {
      const [lemma, ...forms] = l.split(",").map(clean).filter(Boolean);
      return { lemma: lemma!, forms };
    });
}

/** NAWL with English definitions: one row per meaning (lemma, definition, POS). */
export function parseNawlDefinitions(text: string): { lemma: string; def: string; pos: string }[] {
  return parseCsv(text)
    .slice(1)
    .map(([lemma, def, pos]) => ({
      lemma: clean(lemma!),
      def: def!.trim(),
      pos: clean(pos ?? ""),
    }));
}

export type CefrjEntry = { headword: string; pos: string; level: string };

/** CEFR-J 1.5: `headword,pos,CEFR,…`; "a/b" headwords are variants, each its own entry. */
export function parseCefrj(text: string): CefrjEntry[] {
  return parseCsv(text)
    .slice(1)
    .flatMap(([head, pos, level]) =>
      head!
        .split("/")
        .map(clean)
        .filter((h) => /^[a-z][a-z' -]*$/.test(h))
        .map((headword) => ({ headword, pos: clean(pos ?? ""), level: (level ?? "").trim() })),
    );
}
