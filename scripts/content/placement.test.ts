import { describe, expect, it } from "vitest";
import type { Band } from "../../src/engine/distractors";
import type { LemmaRow } from "./lemmas";
import { type BankContext, ineligible, sampleBank } from "./placement";

const row = (lemma: string, rank: number, over: Partial<LemmaRow> = {}): LemmaRow => ({
  lemma,
  rank,
  freq: 1 / rank,
  forms: [lemma],
  formOf: [],
  proper: false,
  ...over,
});

const ctx = (rows: LemmaRow[], over: Partial<BankContext> = {}): BankContext => ({
  band: new Map(rows.map((r) => [r.lemma, "B1" as Band])),
  listed: new Set(["mark"]),
  excluded: new Set(["pizza"]),
  ...over,
});

describe("placement bank eligibility", () => {
  it("skips a lemma that is also an inflected form of a different lemma (found → find)", () => {
    const rows = [
      row("found", 1, { formOf: ["find"] }),
      row("lives", 2, { formOf: ["live"] }),
      row("find", 3),
    ];
    expect(ineligible(rows[0]!, ctx(rows))).toBe("also a form of find");
    expect(ineligible(rows[1]!, ctx(rows))).toBe("also a form of live");
    expect(ineligible(rows[2]!, ctx(rows))).toBeNull();
    // Still sampled from the rest: the skipped words never become items.
    expect(sampleBank(rows, ctx(rows), ["B1"], 1, 1).map((i) => i.lemma)).toEqual(["find"]);
  });

  it("skips proper nouns not on a source list, abbreviations, short words and excluded words", () => {
    const rows = [
      row("john", 1, { proper: true }),
      row("mark", 2, { proper: true }),
      row("mph", 3),
      row("ox", 4),
      row("well-known", 5),
      row("pizza", 6),
      row("outside", 9000),
    ];
    const c = ctx(rows, { band: new Map(rows.slice(0, 6).map((r) => [r.lemma, "B1" as Band])) });
    expect(rows.map((r) => ineligible(r, c))).toEqual([
      "proper noun",
      null,
      "abbreviation",
      "short, hyphenated or not a-z",
      "short, hyphenated or not a-z",
      "excluded list",
      "no band",
    ]);
  });

  it("samples deterministically per band, ids <band>-<slug>", () => {
    const letters = "abcdefghijklmnopqrstuvwxy";
    const rows = Array.from({ length: 50 }, (_, i) =>
      row(`word${letters[i % 25]}${letters[Math.floor(i / 25)]}`, i + 1),
    );
    const a = sampleBank(rows, ctx(rows), ["B1"], 5, 7);
    expect(a).toEqual(sampleBank(rows, ctx(rows), ["B1"], 5, 7));
    expect(a).not.toEqual(sampleBank(rows, ctx(rows), ["B1"], 5, 8));
    expect(a.every((i) => i.id === `B1-${i.lemma}` && i.band === "B1")).toBe(true);
    expect(() => sampleBank(rows, ctx(rows), ["B1"], 51, 7)).toThrow(/only 50/);
  });

  it("is stable under exclusions: excluding a sampled word replaces only that word", () => {
    const letters = "abcdefghijklmnopqrstuvwxy";
    const rows = Array.from({ length: 50 }, (_, i) =>
      row(`word${letters[i % 25]}${letters[Math.floor(i / 25)]}`, i + 1),
    );
    const before = sampleBank(rows, ctx(rows), ["B1"], 10, 7).map((i) => i.lemma);
    const gone = before[3]!;
    const after = sampleBank(rows, ctx(rows, { excluded: new Set([gone]) }), ["B1"], 10, 7).map(
      (i) => i.lemma,
    );
    expect(after).not.toContain(gone);
    expect(after.filter((l) => !before.includes(l))).toHaveLength(1);
  });
});
