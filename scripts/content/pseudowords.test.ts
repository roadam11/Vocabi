import { describe, expect, it } from "vitest";
import { pseudoContext, pseudowordProblems } from "./pseudo-rule";
import {
  containedName,
  containedWord,
  generatePseudowords,
  orthographyProblem,
  type PseudoFilters,
} from "./pseudowords";

const reference = ["tree", "house", "brother", "strength", "bring", "tent", "mate"];
const ctx = pseudoContext(reference, ["abandon"]);
const filters = (over: Partial<PseudoFilters> = {}): PseudoFilters => ({
  knownForms: new Set([...reference, "flesp"]),
  commonWords: new Set(reference.filter((w) => w.length >= 4)),
  names: ["noa", "tamar", "yael", "gal"],
  taken: [],
  ...over,
});

describe("generatePseudowords", () => {
  it("is deterministic per seed and every word passes rule 9 and the review rules", () => {
    const a = generatePseudowords(20, 1, ctx, filters());
    expect(a).toEqual(generatePseudowords(20, 1, ctx, filters()));
    expect(a).not.toEqual(generatePseudowords(20, 2, ctx, filters()));
    expect(new Set(a).size).toBe(20);
    for (const w of a) {
      expect(pseudowordProblems(w, ctx)).toEqual([]);
      expect(orthographyProblem(w)).toBeNull();
      expect(containedWord(w, filters().commonWords)).toBeNull();
      expect(containedName(w, filters().names)).toBeNull();
    }
  });

  it("never returns a known form, a known word plus an ending, or a taken word", () => {
    const first = generatePseudowords(10, 3, ctx, filters());
    const next = generatePseudowords(10, 3, ctx, filters({ taken: first }));
    expect(next.some((w) => first.includes(w))).toBe(false);
    expect(next.some((w) => first.some((f) => f.slice(0, 4) === w.slice(0, 4)))).toBe(false);
    expect(first.some((w) => w.startsWith("tree") || w.startsWith("flesp"))).toBe(false);
  });

  it("throws when it cannot find enough", () => {
    expect(() => generatePseudowords(5, 1, ctx, filters(), 3)).toThrow(/only/);
  });
});

describe("review orthography rules (docs/DECISIONS.md #58)", () => {
  it('"oa" only before t/d/n/st', () => {
    for (const ok of ["broatish", "skoadle", "ploanter", "groastle", "bloan"]) {
      expect(orthographyProblem(ok)).toBeNull();
    }
    for (const bad of ["froashoule", "voarostage", "goabustage", "brinoamp"]) {
      expect(orthographyProblem(bad)).toMatch(/oa/);
    }
  });

  it("no u-vowel in two syllables in a row", () => {
    expect(orthographyProblem("wahustous")).toMatch(/u-vowel/);
    expect(orthographyProblem("struntuful")).toMatch(/u-vowel/);
    expect(orthographyProblem("brustimful")).toBeNull(); // u, i, u: not in a row
  });

  it("-ful only after a consonant", () => {
    expect(orthographyProblem("saimuful")).not.toBeNull();
    expect(orthographyProblem("brenteful")).toMatch(/-ful/);
    expect(orthographyProblem("brostiful")).toMatch(/-ful/);
    expect(orthographyProblem("planskful")).toBeNull();
  });

  it("finds a common 4+ letter word or a Hebrew name inside a candidate", () => {
    expect(containedWord("flaistent", new Set(["tent"]))).toBe("tent");
    expect(containedWord("brimate", new Set(["mat"]))).toBeNull(); // under 4 letters
    expect(containedName("bretamarish", ["tamar"])).toBe("tamar");
    expect(containedName("galdorish", ["gal"])).toBe("gal");
    expect(containedName("brogalish", ["gal"])).toBeNull(); // 3-letter names only at the start
  });
});
