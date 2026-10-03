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
