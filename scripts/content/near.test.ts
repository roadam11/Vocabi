import { describe, expect, it } from "vitest";
import { computeNearWords, referenceForms } from "./near";

const forms = referenceForms([
  "quite",
  "quit",
  "quiet",
  "abandon",
  "effect",
  "affect",
  "affected",
  "cat",
  "cot",
]);

describe("computeNearWords (docs/DECISIONS.md #34)", () => {
  it("lists real words within DL ≤ 1 of an accepted answer: quiet → quite, quit", () => {
    const near = computeNearWords({ lemma: "quiet", answers: ["quiet"] }, forms);
    expect(near).toContain("quite");
    expect(near).toContain("quit");
  });

  it("includes inflections of reference words (affects is DL 1 from the answer effects)", () => {
    const near = computeNearWords({ lemma: "effect", answers: ["effect", "effects"] }, forms);
    expect(near).toContain("affects");
  });

  it("excludes the sense's own forms: lemma, answers, family and the lemma's inflections", () => {
    const near = computeNearWords(
      { lemma: "quiet", answers: ["quiet", "quieter"], family: ["quietly"] },
      forms,
    );
    expect(near).not.toContain("quiet");
    expect(near).not.toContain("quieter");
    expect(near).not.toContain("quiets");
    expect(near).not.toContain("quietly");
  });

  it("skips answers shorter than the typo threshold (no tolerance there anyway)", () => {
    expect(computeNearWords({ lemma: "cat", answers: ["cat"] }, forms)).toEqual([]);
  });

  it("is sorted and unique, normalized like answers", () => {
    const near = computeNearWords({ lemma: "Effect", answers: ["Effect", "effects"] }, forms);
    expect(near).toEqual([...new Set(near)].sort());
    expect(near).toContain("affect");
  });

  it("adds a base's inflections only when the reference attests another of them", () => {
    const f = referenceForms(["decide", "decided", "igor", "hesitant", "approx"]);
    const all = [...f.values()].flat();
    expect(all).toContain("decides");
    expect(all).not.toContain("igored");
    expect(all).not.toContain("hesitanted");
    expect(all).not.toContain("approxes");
    expect(all).toEqual(expect.arrayContaining(["igor", "hesitant", "approx"]));
  });

  it("a plural alone is not verb evidence (dessert + desserts ⇏ desserted)", () => {
    const all = [...referenceForms(["dessert", "desserts"]).values()].flat();
    expect(all).not.toContain("desserted");
    expect(all).not.toContain("desserting");
  });

  it("is empty when nothing real is one edit away", () => {
    expect(computeNearWords({ lemma: "abandon", answers: ["abandon"] }, forms)).toEqual([]);
  });
});
