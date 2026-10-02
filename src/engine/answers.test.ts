import { describe, expect, it } from "vitest";
import { type AnswerTarget, buildConfusableIndex, checkAnswer, isSubmittable } from "./answers";

const t = (lemma: string, answers: string[], nearWords?: string[]): AnswerTarget => ({
  lemma,
  answers,
  nearWords,
});
const affect = t("affect", ["affect", "affects", "affected", "affecting"]);
const effect = t("effect", ["effect", "effects"]);
const adapt = t("adapt", ["adapt", "adapts", "adapted", "adapting"]);
const adopt = t("adopt", ["adopt", "adopts", "adopted", "adopting"]);
const color = t("color", ["color", "colour", "colors", "colours"]);
const wellKnown = t("well-known", ["well-known", "well known"]);
const wellKnownHyphenOnly = t("well-known", ["well-known"]);
const dont = t("don't", ["don't"]);
const talk = t("talk", ["talk", "talks"]);
const adjust = t("adjust", ["adjust", "adjusts"]);
const giveUp = t("give up", ["give up", "gives up", "gave up"]);
const quiet = t("quiet", ["quiet", "quieter", "quietest"], ["quit", "quite"]);
// A second sense of the same lemma: its forms are not "another lemma".
const quietVerb = t("quiet", ["quiet", "quiets", "quieted", "quieting"]);

const index = buildConfusableIndex(
  [affect, effect, adapt, adopt, color, wellKnown, dont, talk, adjust, giveUp, quiet, quietVerb],
  [{ lemma: "accept" }],
);

describe("checkAnswer (docs/ENGINE.md §5, §9 Answers)", () => {
  it("exact match is correct", () => {
    expect(checkAnswer("affect", affect, index)).toEqual({
      verdict: "correct",
      expected: "affect",
    });
    expect(checkAnswer("affected", affect, index)).toMatchObject({ verdict: "correct" });
  });

  it("affect/effect: another lemma is wrong with a confusion pair, no typo tolerance", () => {
    expect(checkAnswer("effect", affect, index)).toEqual({
      verdict: "wrong",
      expected: "affect",
      confusion: { target: "affect", typed: "effect" },
    });
    expect(checkAnswer("affects", effect, index)).toMatchObject({
      verdict: "wrong",
      confusion: { target: "effect", typed: "affects" },
    });
  });

  it("adapt/adopt: a listed form of another lemma is wrong, even one edit away", () => {
    expect(checkAnswer("adopted", adapt, index)).toMatchObject({
      verdict: "wrong",
      confusion: { target: "adapt", typed: "adopted" },
    });
  });

  it("a distractor-only lexicon lemma also counts as another lemma", () => {
    expect(checkAnswer("accept", t("except", ["except"]), index)).toMatchObject({
      verdict: "wrong",
      confusion: { target: "except", typed: "accept" },
    });
  });

  it("color/colour: listed US/UK variants are both correct", () => {
    expect(checkAnswer("colour", color, index).verdict).toBe("correct");
    expect(checkAnswer("Color", color, index).verdict).toBe("correct");
  });

  it('"well-known"/"well known": a listed variant is correct; unlisted is one typo (Hard)', () => {
    expect(checkAnswer("well known", wellKnown, index).verdict).toBe("correct");
    expect(checkAnswer("well-known", wellKnown, index).verdict).toBe("correct");
    expect(checkAnswer("well known", wellKnownHyphenOnly, buildConfusableIndex([], []))).toEqual({
      verdict: "typo",
      expected: "well-known",
    });
  });

  it("normalizes: trailing period, case, outer and inner whitespace, NFKC", () => {
    expect(checkAnswer("affect.", affect, index).verdict).toBe("correct");
    expect(checkAnswer("  AFFECTED!  ", affect, index).verdict).toBe("correct");
    expect(checkAnswer("give    up", giveUp, index).verdict).toBe("correct");
    expect(checkAnswer("ａｆｆｅｃｔ", affect, index).verdict).toBe("correct");
  });

  it("curly apostrophe matches the straight one", () => {
    expect(checkAnswer("don’t", dont, index).verdict).toBe("correct");
  });

  it("4-letter word with one typo is rejected (no tolerance under 5 characters)", () => {
    expect(checkAnswer("tolk", talk, index)).toEqual({ verdict: "wrong", expected: "talk" });
  });

  it("6-letter word with a transposition is accepted as a typo (rated Hard), showing the spelling", () => {
    expect(checkAnswer("adjsut", adjust, index)).toEqual({ verdict: "typo", expected: "adjust" });
  });

  it("an inflected answer with a typo shows the closest accepted form", () => {
    expect(checkAnswer("adjsuts", adjust, index)).toEqual({ verdict: "typo", expected: "adjusts" });
  });

  it("two typos are rejected", () => {
    expect(checkAnswer("adjsutt", adjust, index).verdict).toBe("wrong");
  });

  it("multi-word answers allow at most one typo in total", () => {
    expect(checkAnswer("giv up", giveUp, index)).toEqual({ verdict: "typo", expected: "give up" });
    expect(checkAnswer("giv op", giveUp, index).verdict).toBe("wrong");
  });

  it("quiet/quite: a real word from nearWords is wrong + confusion pair, never a typo", () => {
    expect(checkAnswer("quite", quiet, index)).toEqual({
      verdict: "wrong",
      expected: "quiet",
      confusion: { target: "quiet", typed: "quite" },
    });
    // Without nearWords the same input would have passed as a typo.
    expect(checkAnswer("quite", quietVerb, buildConfusableIndex([], [])).verdict).toBe("typo");
  });

  it("a genuine typo next to a nearWord is still a typo", () => {
    expect(checkAnswer("queit", quiet, index)).toEqual({ verdict: "typo", expected: "quiet" });
  });

  it("forms of another sense of the same lemma are not a confusion", () => {
    expect(checkAnswer("quiets", quiet, index)).toEqual({ verdict: "typo", expected: "quiet" });
  });

  it("an empty answer is wrong (the UI never submits it)", () => {
    expect(checkAnswer("   ", affect, index)).toEqual({ verdict: "wrong", expected: "affect" });
  });
});

describe("isSubmittable (§5.6)", () => {
  it.each([
    ["", false],
    ["   ", false],
    ["...", false],
    ["a", true],
    [" affect ", true],
  ])("%j → %s", (input, ok) => {
    expect(isSubmittable(input)).toBe(ok);
  });
});
