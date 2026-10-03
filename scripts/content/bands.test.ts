import { describe, expect, it } from "vitest";
import { computeBands, formatBands } from "./bands";

/** n ranked lemmas w1..wn (rank i). */
const ranked = (n: number) => new Map(Array.from({ length: n }, (_, i) => [`w${i + 1}`, i + 1]));

describe("computeBands (docs/DECISIONS.md #31)", () => {
  it("B1-B5 by rank boundaries; lemmas past 8000 are in no band", () => {
    const { band, sizes } = computeBands({ ranks: ranked(9000), nawl: [] });
    expect(sizes).toEqual({ B1: 1000, B2: 1000, B3: 1000, B4: 2000, B5: 3000, ACAD: 0 });
    expect(
      [1, 1000, 1001, 2000, 2001, 3000, 3001, 5000, 5001, 8000].map((r) => band.get(`w${r}`)),
    ).toEqual(["B1", "B1", "B2", "B2", "B3", "B3", "B4", "B4", "B5", "B5"]);
    expect(band.has("w8001")).toBe(false);
  });

  it("ACAD takes NAWL lemmas ranked above 3000 out of B4/B5 without backfilling", () => {
    const { band, sizes } = computeBands({
      ranks: ranked(9000),
      nawl: ["w3000", "w3001", "w6000", "w8500", "unranked"],
    });
    expect(band.get("w3000")).toBe("B3"); // rank ≤ 3000: stays in its band
    expect(["w3001", "w6000", "w8500", "unranked"].map((w) => band.get(w))).toEqual(
      Array(4).fill("ACAD"),
    );
    expect(sizes).toEqual({ B1: 1000, B2: 1000, B3: 1000, B4: 1999, B5: 2999, ACAD: 4 });
  });

  it("is a disjoint partition: every banded lemma counted exactly once", () => {
    const { band, sizes } = computeBands({ ranks: ranked(9000), nawl: ["w10", "w4000", "x"] });
    expect(Object.values(sizes).reduce((a, b) => a + b, 0)).toBe(band.size);
  });

  it("is deterministic and formats in band order", () => {
    const a = computeBands({ ranks: ranked(9000), nawl: ["w4000"] });
    const b = computeBands({ ranks: ranked(9000), nawl: ["w4000"] });
    expect(formatBands(a.sizes)).toBe(formatBands(b.sizes));
    expect(Object.keys(JSON.parse(formatBands(a.sizes)))).toEqual([
      "B1",
      "B2",
      "B3",
      "B4",
      "B5",
      "ACAD",
    ]);
  });
});
