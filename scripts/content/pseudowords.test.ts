import { describe, expect, it } from "vitest";
import { pseudoContext, pseudowordProblems } from "./pseudo-rule";
import { generatePseudowords } from "./pseudowords";

const reference = ["tree", "house", "brother", "strength", "bring"];
const ctx = pseudoContext(reference, ["abandon"]);
const known = new Set([...reference, "flesp"]);

describe("generatePseudowords", () => {
  it("is deterministic per seed and every word passes rule 9", () => {
    const a = generatePseudowords(20, 1, ctx, known);
    expect(a).toEqual(generatePseudowords(20, 1, ctx, known));
    expect(a).not.toEqual(generatePseudowords(20, 2, ctx, known));
    expect(new Set(a).size).toBe(20);
    for (const w of a) expect(pseudowordProblems(w, ctx)).toEqual([]);
  });

  it("never returns a known form, or a known word plus an ending", () => {
    const a = generatePseudowords(40, 3, ctx, known);
    expect(a.some((w) => known.has(w) || w.startsWith("tree") || w.startsWith("flesp"))).toBe(
      false,
    );
  });

  it("throws when it cannot find enough", () => {
    expect(() => generatePseudowords(5, 1, ctx, known, 3)).toThrow(/only/);
  });
});
