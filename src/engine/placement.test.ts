import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { PlacementBands } from "@/content/schema";
import { PLACEMENT } from "./config";
import { BANDS, type Band } from "./distractors";
import bandsJson from "./fixtures/bands.json";
import {
  buildPlacementPlan,
  estimateKnown,
  nextPlacementStep,
  pickVerificationItems,
  type PlacementAnswer,
  type PlacementStep,
  scorePlacement,
} from "./placement";
import { mulberry32 } from "./random";

// Fixture sizes (the real ones come from content/placement/bands.json, docs/DECISIONS.md #31).
// Σ = 8570, deliberately not a multiple of 250.
const sizes = PlacementBands.parse(bandsJson);
const TOTAL = 8570;

const bank = BANDS.flatMap((band) =>
  Array.from({ length: 8 }, (_, i) => ({ id: `${band}-${i}`, lemma: `${band}w${i}`, band })),
);
const pseudos = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, text: `pseudo${i}` }));

const real = (band: Band, i: number): PlacementStep => ({
  kind: "real",
  id: `${band}-${i}`,
  lemma: `${band}w${i}`,
  band,
});
const pseudo = (i: number): PlacementStep => ({ kind: "pseudo", id: `p${i}`, text: `pseudo${i}` });
/** A hand-built plan: 5 reals per band in order, pseudowords at the given 0-based slots. */
function handPlan(pseudoSlots: number[]): PlacementStep[] {
  const reals = BANDS.flatMap((b) => [0, 1, 2, 3, 4].map((i) => real(b, i)));
  const plan: PlacementStep[] = [];
  let p = 0;
  while (reals.length > 0 || p < pseudoSlots.length) {
    if (pseudoSlots.includes(plan.length)) plan.push(pseudo(p++));
    else plan.push(reals.shift()!);
  }
  return plan;
}
/** Answers the whole plan (or a prefix) with a rule per step. */
function answer(
  plan: readonly PlacementStep[],
  yes: (s: PlacementStep, i: number) => boolean,
  upTo = plan.length,
): PlacementAnswer[] {
  const out: PlacementAnswer[] = [];
  for (let i = 0; i < upTo; i++) {
    const next = nextPlacementStep(plan, out);
    if (next.type === "finished") break;
    out.push({ id: next.step.id, yes: yes(next.step, i) });
  }
  return out;
}
const noVerification = { correct: 0, total: 0 };
const fullPlan = handPlan([2, 6, 10, 14, 18, 22, 26, 30, 34, 38]); // 4 pseudos by item 15

describe("buildPlacementPlan (docs/ENGINE.md §4 Bank/Flow)", () => {
  const plans = Array.from({ length: 300 }, (_, seed) =>
    buildPlacementPlan(bank, pseudos, mulberry32(seed)),
  );

  it("has 5 real items per band and 10 pseudowords (40 yes/no items)", () => {
    for (const plan of plans) {
      expect(plan.filter((s) => s.kind === "pseudo")).toHaveLength(PLACEMENT.pseudowords);
      for (const band of BANDS) {
        expect(plan.filter((s) => s.kind === "real" && s.band === band)).toHaveLength(5);
      }
      expect(new Set(plan.map((s) => s.id)).size).toBe(plan.length);
    }
  });

  it("orders bands ascending, ACAD last", () => {
    for (const plan of plans) {
      const order = plan.flatMap((s) => (s.kind === "real" ? [BANDS.indexOf(s.band)] : []));
      expect(order).toEqual([...order].sort((a, b) => a - b));
    }
  });

  it("puts at least 4 pseudowords inside the first 20 items, never first", () => {
    for (const plan of plans) {
      const early = plan.slice(0, 20).filter((s) => s.kind === "pseudo").length;
      expect(early).toBeGreaterThanOrEqual(PLACEMENT.minPseudoInFirst);
      expect(plan[0]!.kind).toBe("real");
    }
  });

  it("interleaves: pseudowords also appear after item 20", () => {
    for (const plan of plans) expect(plan.slice(20).some((s) => s.kind === "pseudo")).toBe(true);
  });

  it("is deterministic per seed and varies across seeds", () => {
    expect(buildPlacementPlan(bank, pseudos, mulberry32(9))).toEqual(
      buildPlacementPlan(bank, pseudos, mulberry32(9)),
    );
    expect(new Set(plans.map((p) => p.map((s) => s.id).join())).size).toBeGreaterThan(250);
  });

  it("uses every item of a band that has fewer than 5", () => {
    const small = bank.filter((i) => i.band !== "B2" || i.id === "B2-0");
    const plan = buildPlacementPlan(small, pseudos.slice(0, 3), mulberry32(1));
    expect(plan.filter((s) => s.kind === "real" && s.band === "B2")).toHaveLength(1);
    expect(plan.filter((s) => s.kind === "pseudo")).toHaveLength(3);
  });
});

describe("nextPlacementStep: resume and early stop", () => {
  it("resumes at the first unanswered item", () => {
    const answers = answer(fullPlan, () => true, 7);
    expect(nextPlacementStep(fullPlan, answers)).toEqual({ type: "item", step: fullPlan[7] });
  });

  it("finishes after the last item, not truncated", () => {
    const answers = answer(fullPlan, () => true);
    expect(answers).toHaveLength(40);
    expect(nextPlacementStep(fullPlan, answers)).toEqual({ type: "finished", truncated: false });
  });

  it("rejects answers that do not match the plan (corrupted state)", () => {
    expect(() => nextPlacementStep(fullPlan, [{ id: "nope", yes: true }])).toThrow();
  });

  it("stops early after two consecutive bands at ≤ 20% yes, once ≥ 4 pseudowords are answered", () => {
    // B1 all yes, B2 and B3 one yes each (0.2): stop after B3, skipping B4, B5, ACAD.
    const yes = (s: PlacementStep) =>
      s.kind === "real" &&
      (s.band === "B1" || ((s.band === "B2" || s.band === "B3") && s.id.endsWith("-0")));
    const answers = answer(fullPlan, yes);
    expect(nextPlacementStep(fullPlan, answers)).toEqual({ type: "finished", truncated: true });
    const answeredBands = new Set(
      answers
        .map((a) => fullPlan.find((s) => s.id === a.id)!)
        .flatMap((s) => (s.kind === "real" ? [s.band] : [])),
    );
    expect([...answeredBands]).toEqual(["B1", "B2", "B3"]);
  });

  it("does not stop early with fewer than 4 pseudowords answered, and stops once the 4th is", () => {
    // Pseudowords only at slots 3, 30, 31, 32, 33: after B1 + B2 (both 0%) only 1 is answered.
    const plan = handPlan([3, 30, 31, 32, 33]);
    const afterB2 = answer(plan, () => false, 11);
    expect(nextPlacementStep(plan, afterB2).type).toBe("item");
    const all = answer(plan, () => false);
    expect(nextPlacementStep(plan, all)).toEqual({ type: "finished", truncated: true });
    // The 4th pseudoword (slot 32) is the last thing answered.
    expect(all.at(-1)!.id).toBe("p3");
  });

  it("a band at exactly 20% counts as low; 40% does not", () => {
    const at = (rate: number) => (s: PlacementStep) =>
      s.kind === "real" && s.band !== "B1" && Number(s.id.split("-")[1]) < rate * 5;
    expect(nextPlacementStep(fullPlan, answer(fullPlan, at(0.2)))).toMatchObject({
      truncated: true,
    });
    expect(nextPlacementStep(fullPlan, answer(fullPlan, at(0.4)))).toMatchObject({
      truncated: false,
    });
  });
});

describe("scorePlacement (docs/ENGINE.md §4 Scoring, §9)", () => {
  const score = (answers: PlacementAnswer[], verification = noVerification) =>
    scorePlacement({ plan: fullPlan, answers, verification, bandSizes: sizes });

  it("all yes (f = 1): every p_b = 0, unreliable, no NaN", () => {
    const r = score(answer(fullPlan, () => true));
    expect(r.perBand.map((b) => b.p)).toEqual(BANDS.map(() => 0));
    expect(r.reliable).toBe(false);
    expect(Number.isFinite(r.low) && Number.isFinite(r.high)).toBe(true);
    expect(r.low).toBe(0);
  });

  it("all no: truncated early, low clamps at 0, reliable", () => {
    const r = score(answer(fullPlan, () => false));
    expect(r.truncated).toBe(true);
    expect(r.low).toBe(0);
    expect(r.perBand.every((b) => b.p === 0)).toBe(true);
    expect(r.reliable).toBe(true);
  });

  it("f = 0.5 is unreliable; f = 0.4 is reliable", () => {
    const withPseudoYes = (k: number) => (s: PlacementStep) =>
      s.kind === "real" || Number(s.id.slice(1)) < k;
    expect(score(answer(fullPlan, withPseudoYes(5))).reliable).toBe(false);
    expect(score(answer(fullPlan, withPseudoYes(4))).reliable).toBe(true);
  });

  it("corrects for guessing: p_b = (h_b − f) / (1 − f), clamped to [0, 1]", () => {
    // f = 0.3 (3 of 10 pseudowords); B1 h = 1, B2 h = 0.6, B3 h = 0.2 (< f → clamped to 0),
    // B4-ACAD h = 0.4 (no two consecutive bands ≤ 0.2, so no early stop).
    const idx = (s: PlacementStep) => Number(s.id.split("-")[1]);
    const yes = (s: PlacementStep) =>
      s.kind === "pseudo"
        ? Number(s.id.slice(1)) < 3
        : s.band === "B1" ||
          (s.band === "B2" && idx(s) < 3) ||
          (s.band === "B3" && idx(s) < 1) ||
          (!["B1", "B2", "B3"].includes(s.band) && idx(s) < 2);
    const r = score(answer(fullPlan, yes));
    const p = Object.fromEntries(r.perBand.map((b) => [b.band, b.p]));
    expect(p.B1).toBeCloseTo(1);
    expect(p.B2).toBeCloseTo(0.3 / 0.7);
    expect(p.B3).toBe(0);
    expect(p.B4).toBeCloseTo(0.1 / 0.7);
    expect(r.truncated).toBe(false);
  });

  it("fewer than 4 pseudowords answered → unreliable", () => {
    const plan = handPlan([3, 30, 31, 32, 33]);
    const answers = answer(plan, () => true, 25);
    expect(
      scorePlacement({ plan, answers, verification: noVerification, bandSizes: sizes }).reliable,
    ).toBe(false);
  });

  it("verification accuracy < 0.5 with ≥ 2 items → unreliable; 1 wrong of 1 is not enough", () => {
    const answers = answer(fullPlan, (s) => s.kind === "real");
    expect(score(answers, { correct: 0, total: 2 }).reliable).toBe(false);
    expect(score(answers, { correct: 1, total: 3 }).reliable).toBe(false);
    expect(score(answers, { correct: 1, total: 2 }).reliable).toBe(true);
    expect(score(answers, { correct: 0, total: 1 }).reliable).toBe(true);
  });

  it("rounds low down and high up to the nearest 250", () => {
    const yes = (s: PlacementStep) => s.kind === "real" && Number(s.id.split("-")[1]) < 3;
    const r = score(answer(fullPlan, yes));
    expect(r.low % 250).toBe(0);
    expect(r.high % 250).toBe(0);
    // p = 0.6 everywhere: known = 0.6 × 8570 = 5142; smoothed p̃ = 4/7.
    const known = 0.6 * TOTAL;
    const pt = 4 / 7;
    const sd = Math.sqrt(BANDS.reduce((s, b) => s + (sizes[b] ** 2 * pt * (1 - pt)) / 5, 0));
    expect(r.low).toBe(Math.floor((known - 1.645 * sd) / 250) * 250);
    expect(r.high).toBe(Math.ceil((known + 1.645 * sd) / 250) * 250);
  });

  it("clamps the high bound at Σ size_b even after rounding up (8570, not 8750)", () => {
    const r = score(answer(fullPlan, (s) => s.kind === "real"));
    expect(estimateKnown(r.perBand, sizes)).toBe(TOTAL);
    expect(r.high).toBe(TOTAL);
    expect(r.low).toBeLessThan(TOTAL);
  });

  it("truncated: skipped bands add 0 to the estimate and 0.15 × size to the high bound", () => {
    // B1 all yes, B2 and B3 all no, f = 0 → stop after B3; B4, B5, ACAD skipped.
    const answers = answer(fullPlan, (s) => s.kind === "real" && s.band === "B1");
    const r = score(answers);
    expect(r.truncated).toBe(true);
    expect(estimateKnown(r.perBand, sizes)).toBe(1000);
    // var: B1 p̃ = 6/7, B2 = B3 p̃ = 1/7 → each 1000² · (6/49) / 5.
    const sd = Math.sqrt(3 * ((1000 ** 2 * (6 / 49)) / 5));
    const skipped = 0.15 * (2000 + 3000 + 570);
    expect(r.high).toBe(Math.ceil((1000 + 1.645 * sd + skipped) / 250) * 250);
    expect(r.low).toBe(Math.max(0, Math.floor((1000 - 1.645 * sd) / 250) * 250));
    expect(r.perBand.find((b) => b.band === "ACAD")!.p).toBe(0);
  });

  it("returns exactly { low, high, perBand, reliable, truncated } — never a single number", () => {
    const r = score(answer(fullPlan, () => false));
    expect(Object.keys(r).sort()).toEqual(["high", "low", "perBand", "reliable", "truncated"]);
    expect(r.perBand.map((b) => b.band)).toEqual([...BANDS]);
  });
});

describe("scorePlacement properties (fast-check)", () => {
  const sizesArb = fc.record(
    Object.fromEntries(BANDS.map((b) => [b, fc.integer({ min: 1, max: 5000 })])) as Record<
      Band,
      fc.Arbitrary<number>
    >,
  );

  it("the interval contains the estimate; 0 ≤ low ≤ high ≤ Σ size_b", () => {
    fc.assert(
      fc.property(
        fc.integer(),
        fc.array(fc.boolean(), { minLength: 0, maxLength: 40 }),
        sizesArb,
        fc.nat({ max: 4 }),
        fc.nat({ max: 4 }),
        (seed, yeses, bandSizes, correct, extra) => {
          const plan = buildPlacementPlan(bank, pseudos, mulberry32(seed));
          const answers = answer(plan, (_, i) => yeses[i] ?? false, yeses.length);
          const r = scorePlacement({
            plan,
            answers,
            verification: { correct, total: correct + extra },
            bandSizes,
          });
          const total = BANDS.reduce((s, b) => s + bandSizes[b], 0);
          const est = estimateKnown(r.perBand, bandSizes);
          expect(r.low).toBeLessThanOrEqual(est);
          expect(est).toBeLessThanOrEqual(r.high);
          expect(r.low).toBeGreaterThanOrEqual(0);
          expect(r.high).toBeLessThanOrEqual(total);
          expect(r.perBand.every((b) => b.p >= 0 && b.p <= 1)).toBe(true);
        },
      ),
      { numRuns: 2000 },
    );
  });
});

describe("pickVerificationItems (§4 Verification)", () => {
  const senseFor = (lemma: string) => ({ id: `${lemma}.n.01`, lemma });
  const sensesByLemma = new Map(bank.map((i) => [i.lemma, senseFor(i.lemma)]));

  it("draws up to 4 senses from real words answered yes in B3-B5/ACAD", () => {
    const answers = answer(fullPlan, () => true);
    const picks = pickVerificationItems(fullPlan, answers, sensesByLemma, mulberry32(3));
    expect(picks).toHaveLength(PLACEMENT.maxVerification);
    for (const s of picks)
      expect(["B3", "B4", "B5", "ACAD"]).toContain(s.lemma.slice(0, s.lemma.indexOf("w")));
    expect(new Set(picks.map((s) => s.id)).size).toBe(picks.length);
  });

  it("never picks a word answered no, a B1/B2 word, or a lemma without a sense", () => {
    const answers = answer(
      fullPlan,
      (s) =>
        s.kind === "real" &&
        (["B1", "B2", "B3"].includes(s.band) || s.id === "B4-0" || s.id === "B5-1"),
    );
    const only = new Map([
      ["B4w0", senseFor("B4w0")],
      ["B1w0", senseFor("B1w0")],
    ]);
    expect(pickVerificationItems(fullPlan, answers, only, mulberry32(1))).toEqual([
      senseFor("B4w0"),
    ]);
  });

  it("returns none when nothing qualifies", () => {
    expect(
      pickVerificationItems(
        fullPlan,
        answer(fullPlan, () => false),
        sensesByLemma,
        mulberry32(1),
      ),
    ).toEqual([]);
  });
});
