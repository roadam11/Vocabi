import { describe, expect, it } from "vitest";
import {
  type Candidate,
  cleanHint,
  noaLemma,
  phraseStats,
  selectStarter,
  type Source,
  starterCsv,
} from "./starter";

const c = (
  lemma: string,
  freq: number,
  sources: Source[],
  over: Partial<Candidate> = {},
): Candidate => ({
  lemma,
  pos: "n",
  hint: "",
  freq,
  rank: null,
  band: "B5",
  sources: new Set(sources),
  ...over,
});

describe("selectStarter (tiered)", () => {
  const cands = [
    c("both1", 1, ["nawl", "noa"]),
    c("both2", 5, ["nawl", "noa"]),
    c("nawlA", 9, ["nawl"]),
    c("nawlB", 3, ["nawl", "cefrj-b2"]),
    c("nawlC", 3, ["nawl"]),
    c("noaA", 8, ["noa"]),
    c("noaB", 2, ["noa", "cefrj-b2"]),
    c("b2A", 50, ["cefrj-b2"]),
  ];

  it("tier 1 = all NAWL ∩ Noa, then alternates NAWL-only / Noa-only by frequency", () => {
    expect(selectStarter(cands, 6).map((r) => [r.lemma, r.tier])).toEqual([
      ["both2", "nawl+noa"],
      ["both1", "nawl+noa"],
      ["nawlA", "nawl"],
      ["noaA", "noa"],
      ["nawlB", "nawl"], // ties with nawlC: CEFR-J B2 membership breaks it
      ["noaB", "noa"],
    ]);
  });

  it("uses CEFR-J B2-only only when both other pools run out", () => {
    const all = selectStarter(cands, 20);
    expect(all.map((r) => r.lemma)).toEqual([
      "both2",
      "both1",
      "nawlA",
      "noaA",
      "nawlB",
      "noaB",
      "nawlC",
      "b2A",
    ]);
    expect(selectStarter(cands, 7).some((r) => r.tier === "cefrj-b2")).toBe(false);
  });

  it("keeps all of tier 1 even past the target", () => {
    expect(selectStarter(cands, 1).map((r) => r.lemma)).toEqual(["both2", "both1"]);
  });

  it("writes lemma,pos,sense_hint,band,rank,sources with CSV quoting", () => {
    const rows = selectStarter(
      [c("gauge", 1, ["nawl", "noa"], { hint: 'a "measure", tool', rank: 9001, pos: "v" })],
      1,
    );
    expect(starterCsv(rows)).toBe(
      'lemma,pos,sense_hint,band,rank,sources\ngauge,v,"a ""measure"", tool",B5,9001,nawl|noa\n',
    );
  });
});

describe("starter edge cases", () => {
  it("a phrase is as rare as its rarest word, so it never outranks a rarer single word by its 'in'", () => {
    const inVain = phraseStats([
      { freq: 0.02, band: "B1" }, // in
      { freq: 0.00001, band: "B5" }, // vain
    ]);
    expect(inVain).toEqual({ freq: 0.00001, band: "B5" });
    expect(
      phraseStats([
        { freq: 0.02, band: "B1" },
        { freq: 0, band: undefined },
      ]),
    ).toEqual({
      freq: 0,
      band: "B5",
    });
    const picked = selectStarter(
      [c("in vain", inVain.freq, ["noa"]), c("gauge", 0.0001, ["noa"])],
      2,
    );
    expect(picked.map((r) => r.lemma)).toEqual(["gauge", "in vain"]);
  });

  it("maps a Noa form that is also a lemma to its lemma, unless a source list has it", () => {
    expect(noaLemma("distorted", ["distort"], new Set())).toBe("distort");
    expect(noaLemma("bound", ["bind"], new Set(["bound"]))).toBe("bound");
    expect(noaLemma("vital", [], new Set())).toBe("vital");
  });

  it("drops spreadsheet error values from hints", () => {
    expect(cleanHint("#NAME?")).toBe("");
    expect(cleanHint("#N/A")).toBe("");
    expect(cleanHint(" an agreement between nations ")).toBe("an agreement between nations");
  });
});
