import { describe, expect, it } from "vitest";
import { mulberry32, shuffle } from "./random";

describe("mulberry32 (seeded rng for tests and callers)", () => {
  it("is deterministic per seed and stays in [0, 1)", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const xs = Array.from({ length: 1000 }, () => a());
    expect(xs).toEqual(Array.from({ length: 1000 }, () => b()));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(mulberry32(43)()).not.toBe(mulberry32(42)());
  });
});

describe("shuffle (Fisher-Yates with injected rng)", () => {
  it("returns a permutation and leaves the input untouched", () => {
    const xs = [1, 2, 3, 4, 5, 6];
    const out = shuffle(xs, mulberry32(1));
    expect(xs).toEqual([1, 2, 3, 4, 5, 6]);
    expect([...out].sort()).toEqual(xs);
  });

  it("puts each element at each position about equally often", () => {
    const rng = mulberry32(7);
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < 20000; i++) counts[shuffle([0, 1, 2, 3], rng).indexOf(0)]!++;
    for (const c of counts) expect(Math.abs(c - 5000)).toBeLessThan(300);
  });

  it("handles empty and single-element arrays", () => {
    expect(shuffle([], mulberry32(1))).toEqual([]);
    expect(shuffle(["a"], mulberry32(1))).toEqual(["a"]);
  });
});
