/**
 * AMIRNET starter selection (Phase 0, ~150 senses; content/SOURCES.md). Candidates = NAWL ∪ Noa ∪
 * CEFR-J B2 lemmas minus NGSL's top 1000. Tier 1 is every NAWL ∩ Noa lemma; the rest alternates
 * NAWL-only and Noa-only (NAWL covers reading-text vocabulary, Noa's list sentence-completion
 * vocabulary — AMIRNET tests both), each by wordfreq frequency (descending; CEFR-J B2 membership,
 * then the lemma, break ties); CEFR-J-B2-only lemmas are a third pool used only if both run out.
 */
import type { Pos } from "../../src/engine/distractors";

export type Source = "nawl" | "noa" | "cefrj-b2";

export type Candidate = {
  lemma: string;
  pos: Pos;
  /** Intended academic sense for P5b generation (the NAWL definition), or "". */
  hint: string;
  freq: number;
  rank: number | null;
  band: string;
  sources: ReadonlySet<Source>;
};

export type Selected = Candidate & { tier: "nawl+noa" | "nawl" | "noa" | "cefrj-b2" };

const byFreq = (a: Candidate, b: Candidate) =>
  b.freq - a.freq ||
  Number(b.sources.has("cefrj-b2")) - Number(a.sources.has("cefrj-b2")) ||
  (a.lemma < b.lemma ? -1 : a.lemma > b.lemma ? 1 : 0);

export function selectStarter(candidates: readonly Candidate[], target: number): Selected[] {
  const has = (c: Candidate, s: Source) => c.sources.has(s);
  const pool = (f: (c: Candidate) => boolean) => candidates.filter(f).sort(byFreq);
  const tier1 = pool((c) => has(c, "nawl") && has(c, "noa"));
  const nawl = pool((c) => has(c, "nawl") && !has(c, "noa"));
  const noa = pool((c) => has(c, "noa") && !has(c, "nawl"));
  const b2 = pool((c) => !has(c, "nawl") && !has(c, "noa"));

  const out: Selected[] = tier1.map((c) => ({ ...c, tier: "nawl+noa" }));
  let [i, j, k] = [0, 0, 0];
  while (out.length < target && (i < nawl.length || j < noa.length)) {
    if (i < nawl.length) out.push({ ...nawl[i++]!, tier: "nawl" });
    if (out.length < target && j < noa.length) out.push({ ...noa[j++]!, tier: "noa" });
  }
  while (out.length < target && k < b2.length) out.push({ ...b2[k++]!, tier: "cefrj-b2" });
  return out;
}

/**
 * A Noa headword as a lemma: a ranked word that is also a form of another lemma (distorted →
 * distort, slain → slay) maps to that lemma, unless a source list has it as a headword itself
 * (NAWL "bound" stays "bound").
 */
export function noaLemma(
  word: string,
  formOf: readonly string[] | undefined,
  listed: ReadonlySet<string>,
): string {
  return formOf && formOf.length > 0 && !listed.has(word) ? formOf[0]! : word;
}

/**
 * A phrase is as rare as its rarest word ("in vain" ranks with "vain", never with "in"), and
 * takes that word's band; an unranked word makes the whole phrase unranked (frequency 0, B5).
 */
export function phraseStats(words: readonly { freq: number; band: string | undefined }[]): {
  freq: number;
  band: string;
} {
  const rarest = words.reduce((a, b) => (b.freq < a.freq ? b : a));
  return { freq: rarest.freq, band: rarest.freq > 0 ? (rarest.band ?? "B5") : "B5" };
}

/** Spreadsheet error values that leaked into a source column ("#NAME?"): no hint at all. */
export const cleanHint = (def: string) => (/^#[A-Z/0!?]+$/.test(def.trim()) ? "" : def.trim());

export const STARTER_HEADER = "lemma,pos,sense_hint,band,rank,sources";

export function starterCsv(rows: readonly Selected[]): string {
  const cell = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const order: Source[] = ["nawl", "noa", "cefrj-b2"];
  return (
    [
      STARTER_HEADER,
      ...rows.map((r) =>
        [
          r.lemma,
          r.pos,
          r.hint,
          r.band,
          r.rank === null ? "" : String(r.rank),
          order.filter((s) => r.sources.has(s)).join("|"),
        ]
          .map(cell)
          .join(","),
      ),
    ].join("\n") + "\n"
  );
}
