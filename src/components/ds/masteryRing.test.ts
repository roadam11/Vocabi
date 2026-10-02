import { describe, expect, it } from "vitest";
import {
  aggregateRingLabel,
  aggregateSegments,
  senseRingLabel,
  senseSegments,
} from "./masteryRing";

describe("senseSegments (docs/DECISIONS.md #2)", () => {
  it("renders exactly the required layers, never a fixed 3", () => {
    expect(senseSegments({ recognition: true })).toEqual([{ layer: "recognition", fill: 1 }]);
    expect(senseSegments({ recognition: true, context: false })).toHaveLength(2);
  });

  it("keeps the fixed order recognition → context → production regardless of input order", () => {
    const layers = senseSegments({ production: false, recognition: true, context: true });
    expect(layers.map((s) => s.layer)).toEqual(["recognition", "context", "production"]);
    expect(layers.map((s) => s.fill)).toEqual([1, 1, 0]);
  });

  it("rejects a sense with no required layer", () => {
    expect(() => senseSegments({})).toThrow();
  });
});

describe("aggregateSegments", () => {
  it("always has 3 segments with shares clamped to [0, 1]", () => {
    expect(aggregateSegments({ recognition: 0.8, context: 1.4, production: -0.2 })).toEqual([
      { layer: "recognition", fill: 0.8 },
      { layer: "context", fill: 1 },
      { layer: "production", fill: 0 },
    ]);
  });
});

describe("text alternatives (never color-only)", () => {
  it("describes each required layer of a sense", () => {
    const label = senseRingLabel({ recognition: true, context: false });
    expect(label).toContain("1 מתוך 2");
    expect(label).toContain("זיהוי: הושלם");
    expect(label).toContain("הקשר: עוד לא");
    expect(label).not.toContain("כתיבה");
  });

  it("gives rounded percentages for the aggregate ring", () => {
    const label = aggregateRingLabel({ recognition: 0.666, context: 0.5, production: 0 });
    expect(label).toContain("זיהוי: 67%");
    expect(label).toContain("הקשר: 50%");
    expect(label).toContain("כתיבה: 0%");
  });
});
