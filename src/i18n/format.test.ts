import { describe, expect, it } from "vitest";
import { format, interpolate } from "./format";

describe("format", () => {
  it("fills named placeholders, repeated or not", () => {
    expect(format("עוד {count} ימים", { count: 12 })).toBe("עוד 12 ימים");
    expect(format("{a}/{a}/{b}", { a: "x", b: 2 })).toBe("x/x/2");
  });

  it("leaves unknown placeholders untouched", () => {
    expect(format("{known} {unknown}", { known: "כן" })).toBe("כן {unknown}");
  });
});

describe("interpolate", () => {
  it("returns ordered pieces with non-string values in place", () => {
    const word = { el: "ignore" };
    expect(interpolate("המילה {word} מופיעה", { word })).toEqual(["המילה ", word, " מופיעה"]);
  });

  it("handles placeholders at the edges and adjacent ones", () => {
    expect(interpolate("{a}{b}", { a: 1, b: 2 })).toEqual([1, 2]);
    expect(interpolate("plain", {})).toEqual(["plain"]);
  });
});
