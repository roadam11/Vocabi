import { describe, expect, it } from "vitest";
import {
  bandsAdjacent,
  type DistractorCandidate,
  isEligibleRecognitionDistractor,
} from "./distractors";

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
