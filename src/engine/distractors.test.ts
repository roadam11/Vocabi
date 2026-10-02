import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  bandDistance,
  bandsAdjacent,
  buildContextMcq,
  buildRecognitionMcq,
  type DistractorCandidate,
  isEligibleRecognitionDistractor,
  selectRecognitionDistractors,
} from "./distractors";
import { mulberry32 } from "./random";

const sense = (over: Partial<DistractorCandidate> = {}): DistractorCandidate => ({
  lemma: "abandon",
  pos: "v",
  freqBand: "B4",
  he: { primary: "לנטוש", alternates: ["לזנוח"] },
  family: ["abandonment"],
  synonyms: ["desert", "give up"],
  ...over,
});

describe("bandsAdjacent (frequency band ±1, docs/DECISIONS.md #27)", () => {
  it.each([
    ["B1", "B1", true],
    ["B1", "B2", true],
    ["B1", "B3", false],
    ["B4", "B5", true],
    ["B3", "B5", false],
    ["ACAD", "ACAD", true],
    ["ACAD", "B4", true],
    ["ACAD", "B5", true],
    ["ACAD", "B3", false],
    ["ACAD", "B1", false],
  ] as const)("%s ~ %s → %s", (a, b, expected) => {
    expect(bandsAdjacent(a, b)).toBe(expected);
    expect(bandsAdjacent(b, a)).toBe(expected);
  });
});

describe("isEligibleRecognitionDistractor (docs/ENGINE.md §6)", () => {
  const target = sense();
  const ok = sense({
    lemma: "achieve",
    freqBand: "B5",
    he: { primary: "להשיג", alternates: [] },
    family: ["achievement"],
    synonyms: ["accomplish"],
  });

  it("accepts same POS, adjacent band, different family, not a synonym, no gloss collision", () => {
    expect(isEligibleRecognitionDistractor(target, ok)).toBe(true);
  });

  it("rejects a different part of speech", () => {
    expect(isEligibleRecognitionDistractor(target, { ...ok, pos: "n" })).toBe(false);
  });

  it("rejects a band two steps away", () => {
    expect(isEligibleRecognitionDistractor(target, { ...ok, freqBand: "B2" })).toBe(false);
  });

  it("accepts a band two steps away when widened to ±2, never three", () => {
    expect(isEligibleRecognitionDistractor(target, { ...ok, freqBand: "B2" }, 2)).toBe(true);
    expect(isEligibleRecognitionDistractor(target, { ...ok, freqBand: "B1" }, 2)).toBe(false);
  });

  it("rejects the same lemma (another sense of the same word)", () => {
    expect(isEligibleRecognitionDistractor(target, { ...ok, lemma: "Abandon" })).toBe(false);
  });

  it("rejects the same word family, in either direction or through a shared member", () => {
    expect(isEligibleRecognitionDistractor(target, { ...ok, lemma: "abandonment" })).toBe(false);
    expect(isEligibleRecognitionDistractor(target, { ...ok, family: ["abandon"] })).toBe(false);
    expect(isEligibleRecognitionDistractor(target, { ...ok, family: ["abandonment"] })).toBe(false);
  });

  it("rejects a listed synonym, in either direction, hyphen/space-insensitive", () => {
    expect(isEligibleRecognitionDistractor(target, { ...ok, lemma: "desert" })).toBe(false);
    expect(isEligibleRecognitionDistractor(target, { ...ok, lemma: "give-up" })).toBe(false);
    expect(isEligibleRecognitionDistractor(target, { ...ok, synonyms: ["abandon"] })).toBe(false);
  });

  it("rejects a Hebrew gloss collision, including through alternates and niqqud", () => {
    expect(
      isEligibleRecognitionDistractor(target, {
        ...ok,
        he: { primary: "לעזוב", alternates: ["לִזְנוֹחַ"] },
      }),
    ).toBe(false);
  });

  it("works without optional family/synonyms/alternates (lexicon entries)", () => {
    const bare: DistractorCandidate = {
      lemma: "attend",
      pos: "v",
      freqBand: "B4",
      he: { primary: "להשתתף" },
    };
    expect(isEligibleRecognitionDistractor(target, bare)).toBe(true);
    expect(isEligibleRecognitionDistractor(bare, target)).toBe(true);
  });
});

describe("bandDistance (±1 / ±2 steps; ACAD next to B4 and B5)", () => {
  it.each([
    ["B1", "B1", 0],
    ["B1", "B3", 2],
    ["B2", "B5", 3],
    ["ACAD", "ACAD", 0],
    ["ACAD", "B4", 1],
    ["ACAD", "B5", 1],
    ["ACAD", "B3", 2],
    ["ACAD", "B2", 3],
    ["ACAD", "B1", 4],
  ] as const)("%s ~ %s = %i", (a, b, d) => {
    expect(bandDistance(a, b)).toBe(d);
    expect(bandDistance(b, a)).toBe(d);
  });
});

// ---- Recognition MCQ (docs/ENGINE.md §6) ----------------------------------------------------

let n = 0;
/** A verb in the given band with its own family and a unique gloss unless one is given. */
const cand = (band: DistractorCandidate["freqBand"], over: Partial<DistractorCandidate> = {}) => {
  n++;
  return {
    lemma: `word${n}`,
    pos: "v" as const,
    freqBand: band,
    he: { primary: `גלוס${n}`, alternates: [] },
    family: [],
    synonyms: [],
    ...over,
  } satisfies DistractorCandidate;
};
const target = sense();

describe("selectRecognitionDistractors", () => {
  it("picks 3 eligible distractors at ±1 with no fallback", () => {
    const pool = [cand("B4"), cand("B5"), cand("B3"), cand("B4")];
    const r = selectRecognitionDistractors(target, pool, mulberry32(1));
    expect(r.fallback).toBeNull();
    expect(r.distractors).toHaveLength(3);
    for (const d of r.distractors) expect(pool).toContain(d);
  });

  it("blocks a gloss collision: about/approximately both → בערך", () => {
    const about = cand("B2", {
      lemma: "about",
      pos: "adv",
      he: { primary: "בערך", alternates: ["על"] },
    });
    const approx = cand("B2", { lemma: "approximately", pos: "adv", he: { primary: "בְּעֵרֶךְ" } });
    const others = [
      cand("B2", { pos: "adv" }),
      cand("B2", { pos: "adv" }),
      cand("B2", { pos: "adv" }),
    ];
    for (let seed = 0; seed < 50; seed++) {
      const r = selectRecognitionDistractors(about, [approx, ...others], mulberry32(seed));
      expect(r.distractors).not.toContain(approx);
    }
  });

  it("blocks the same word family", () => {
    const sibling = cand("B4", { lemma: "abandonment" });
    for (let seed = 0; seed < 50; seed++) {
      const pool = [sibling, cand("B4"), cand("B4"), cand("B4")];
      expect(
        selectRecognitionDistractors(target, pool, mulberry32(seed)).distractors,
      ).not.toContain(sibling);
    }
  });

  it("never picks two distractors that share a gloss (docs/DECISIONS.md #30)", () => {
    const twinA = cand("B4", { he: { primary: "לקבל" } });
    const twinB = cand("B4", { he: { primary: "לְקַבֵּל" } });
    for (let seed = 0; seed < 100; seed++) {
      const r = selectRecognitionDistractors(
        target,
        [twinA, twinB, cand("B4"), cand("B4")],
        mulberry32(seed),
      );
      expect(r.distractors.filter((d) => d === twinA || d === twinB).length).toBeLessThanOrEqual(1);
      expect(r.distractors).toHaveLength(3);
    }
  });

  it("samples uniformly from the combined pool: taught senses and lexicon entries alike", () => {
    // 3 track senses + 3 lexicon entries, all eligible: each is picked about half the time.
    const pool = [cand("B4"), cand("B4"), cand("B4"), cand("B5"), cand("B5"), cand("B5")];
    const counts = new Map(pool.map((c) => [c, 0]));
    const rng = mulberry32(11);
    for (let i = 0; i < 6000; i++) {
      for (const d of selectRecognitionDistractors(target, pool, rng).distractors) {
        counts.set(d, counts.get(d)! + 1);
      }
    }
    for (const c of counts.values()) expect(Math.abs(c - 3000)).toBeLessThan(200);
  });

  it("widens to ±2 bands when ±1 is short, preferring nothing beyond what is needed", () => {
    const near = [cand("B4"), cand("B5")];
    const far = cand("B2");
    const tooFar = cand("B1");
    const r = selectRecognitionDistractors(target, [...near, far, tooFar], mulberry32(3));
    expect(r.fallback).toBe("widened");
    expect(new Set(r.distractors)).toEqual(new Set([...near, far]));
  });

  it("falls back to practice-only when still short after widening", () => {
    const r = selectRecognitionDistractors(
      target,
      [cand("B4"), cand("B2"), cand("B1")],
      mulberry32(3),
    );
    expect(r.fallback).toBe("practiceOnly");
    expect(r.distractors).toHaveLength(2);
  });
});

describe("buildRecognitionMcq", () => {
  const pool = [cand("B4"), cand("B5"), cand("B3")];

  it("has 4 options with the target at correctIndex, counting toward mastery", () => {
    const rng = mulberry32(5);
    const mcq = buildRecognitionMcq(target, selectRecognitionDistractors(target, pool, rng), rng);
    expect(mcq.options).toHaveLength(4);
    expect(mcq.options[mcq.correctIndex]).toBe(target);
    expect(mcq.countsTowardMastery).toBe(true);
  });

  it("a widened MCQ with 4 options still counts", () => {
    const rng = mulberry32(5);
    const sel = selectRecognitionDistractors(target, [cand("B4"), cand("B5"), cand("B2")], rng);
    expect(sel.fallback).toBe("widened");
    expect(buildRecognitionMcq(target, sel, rng).countsTowardMastery).toBe(true);
  });

  it("practice-only: never counts toward mastery (and so never rates an FSRS card)", () => {
    const rng = mulberry32(5);
    const mcq = buildRecognitionMcq(
      target,
      selectRecognitionDistractors(target, [cand("B4")], rng),
      rng,
    );
    expect(mcq.options).toHaveLength(2);
    expect(mcq.countsTowardMastery).toBe(false);
  });

  it("places the correct answer uniformly: 10,000 seeded draws, χ² below the p = 0.001 bound", () => {
    const rng = mulberry32(2026);
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < 10_000; i++) {
      counts[
        buildRecognitionMcq(target, selectRecognitionDistractors(target, pool, rng), rng)
          .correctIndex
      ]!++;
    }
    expect(chiSquare(counts)).toBeLessThan(CHI2_DF3_P001);
  });

  it("property: uniform correct position for any seed (fast-check)", () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const rng = mulberry32(seed);
        const counts = [0, 0, 0, 0];
        for (let i = 0; i < 4000; i++) {
          counts[
            buildRecognitionMcq(target, selectRecognitionDistractors(target, pool, rng), rng)
              .correctIndex
          ]!++;
        }
        return chiSquare(counts) < CHI2_DF3_P001;
      }),
      // Fixed fast-check seed: a statistical bound must not flake from run to run.
      { numRuns: 50, seed: 42 },
    );
  });
});

describe("buildContextMcq", () => {
  const ctx = {
    cloze: { en: "They decided to ___ the project.", answerForm: "abandon" },
    clozeDistractors: ["achieve", "approve", "attend"],
  };

  it("offers answerForm + the 3 curated distractors, counting toward mastery", () => {
    const mcq = buildContextMcq(ctx, mulberry32(1))!;
    expect([...mcq.options].sort()).toEqual(["abandon", "achieve", "approve", "attend"]);
    expect(mcq.options[mcq.correctIndex]).toBe("abandon");
    expect(mcq.countsTowardMastery).toBe(true);
  });

  it("is not eligible without cloze or curated distractors — never improvises", () => {
    expect(buildContextMcq({ cloze: ctx.cloze }, mulberry32(1))).toBeNull();
    expect(buildContextMcq({ clozeDistractors: ctx.clozeDistractors }, mulberry32(1))).toBeNull();
    expect(
      buildContextMcq({ ...ctx, clozeDistractors: ["achieve", "approve"] }, mulberry32(1)),
    ).toBeNull();
  });

  it("places the correct answer uniformly over 10,000 seeded draws", () => {
    const rng = mulberry32(7);
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < 10_000; i++) counts[buildContextMcq(ctx, rng)!.correctIndex]!++;
    expect(chiSquare(counts)).toBeLessThan(CHI2_DF3_P001);
  });
});

/** χ² critical value, 3 degrees of freedom, p = 0.001. */
const CHI2_DF3_P001 = 16.266;
function chiSquare(counts: number[]): number {
  const expected = counts.reduce((a, b) => a + b, 0) / counts.length;
  return counts.reduce((sum, c) => sum + (c - expected) ** 2 / expected, 0);
}
