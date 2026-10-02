import { describe, expect, it } from "vitest";
import {
  damerauLevenshtein,
  glossesCollide,
  normalizeEn,
  normalizeEnLoose,
  normalizeHebrewGloss,
} from "./text";

describe("damerauLevenshtein (optimal string alignment)", () => {
  it.each([
    ["", "", 0],
    ["abc", "", 3],
    ["kitten", "sitting", 3],
    ["affect", "effect", 1],
    ["recieve", "receive", 1], // adjacent transposition counts as 1
    ["ca", "abc", 3], // OSA, not unrestricted DL (which would give 2)
    ["prendity", "pretty", 3],
  ])("%s ↔ %s = %i", (a, b, d) => {
    expect(damerauLevenshtein(a, b)).toBe(d);
    expect(damerauLevenshtein(b, a)).toBe(d);
  });

  it("works on code points, not UTF-16 units", () => {
    expect(damerauLevenshtein("שָׁלוֹם", "שלום")).toBe(3);
    expect(damerauLevenshtein("a😀b", "ab")).toBe(1);
  });

  it("stops early above max and returns max + 1", () => {
    expect(damerauLevenshtein("abcdefgh", "zyxwvuts", 2)).toBe(3);
    expect(damerauLevenshtein("abcdefgh", "abcdefgz", 2)).toBe(1);
    expect(damerauLevenshtein("ab", "abcdef", 2)).toBe(3); // length gap alone exceeds max
  });
});

describe("normalizeEn (docs/ENGINE.md §5 step 1)", () => {
  it("NFKC, trim, lowercase, collapses whitespace, unifies apostrophes, strips edge punctuation", () => {
    expect(normalizeEn("  Don’t   Give\tUP! ")).toBe("don't give up");
    expect(normalizeEn("ﬁne.")).toBe("fine");
    expect(normalizeEn('"well-known"')).toBe("well-known");
  });

  it("normalizeEnLoose also folds hyphens into spaces", () => {
    expect(normalizeEnLoose("Well-known")).toBe(normalizeEnLoose("well known"));
    expect(normalizeEnLoose("get   along-with")).toBe("get along with");
  });
});

describe("normalizeHebrewGloss (docs/ENGINE.md §6)", () => {
  it("strips niqqud, maqaf → space, removes parentheticals, splits on , and ;", () => {
    expect(normalizeHebrewGloss("לְהִימָּנַע מ־ (משהו); להתרחק, לחמוק")).toEqual([
      "להימנע מ",
      "להתרחק",
      "לחמוק",
    ]);
  });

  it("keeps geresh and gershayim (they are letters' marks, not niqqud)", () => {
    expect(normalizeHebrewGloss("צ׳יפס")).toEqual(["צ׳יפס"]);
    expect(normalizeHebrewGloss("דו״ח")).toEqual(["דו״ח"]);
  });

  it("drops empty pieces", () => {
    expect(normalizeHebrewGloss(" ; ,(רק הערה)")).toEqual([]);
  });
});

describe("glossesCollide", () => {
  it("blocks about/approximately, which share בערך (docs/ENGINE.md §6)", () => {
    const about = { primary: "בערך", alternates: ["בקירוב"] };
    const approximately = { primary: "בְּעֵרֶךְ", alternates: ["כמעט"] };
    expect(glossesCollide(about, approximately)).toBe(true);
  });

  it("compares alternates too, after normalization", () => {
    expect(
      glossesCollide(
        { primary: "לנטוש", alternates: ["לעזוב"] },
        { primary: "לצאת", alternates: ["לַעֲזוֹב (מקום)"] },
      ),
    ).toBe(true);
    expect(glossesCollide({ primary: "לנטוש" }, { primary: "להשיג" })).toBe(false);
  });
});
