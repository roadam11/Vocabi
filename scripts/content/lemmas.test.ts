import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import {
  americanCandidate,
  canSpell,
  formatLemmaRows,
  type LemmaInputs,
  parseLemmaRows,
  rankLemmas,
} from "./lemmas";

const wink = createRequire(import.meta.url)("wink-lemmatizer") as Record<
  "verb" | "noun" | "adjective",
  (w: string) => string
>;
const lemmatize = (w: string) =>
  [wink.verb(w), wink.noun(w), wink.adjective(w)].filter((c) => c !== w);

function inputs(forms: [string, number][], over: Partial<LemmaInputs> = {}): LemmaInputs {
  return {
    forms: forms.map(([form, freq]) => ({ form, freq })),
    families: [],
    dictionary: new Set([
      "run",
      "study",
      "color",
      "colour",
      "organization",
      "organisation",
      "four",
      "for",
      "find",
      "found",
      "london",
      "flee",
      "left",
      "leave",
    ]),
    listed: new Set(["for", "run", "find", "leave"]),
    properOnly: new Set(["london"]),
    properUse: new Set(["london", "for"]),
    verbs: new Set([
      "run",
      "study",
      "find",
      "leave",
      "flee",
      "rout",
      "route",
      "hop",
      "hope",
      "tap",
      "tape",
      "hiss",
      "relieve",
    ]),
    lemmatize,
    ...over,
  };
}
const lemmaOf = (rows: ReturnType<typeof rankLemmas>, form: string) =>
  rows.find((r) => r.forms.includes(form))?.lemma;

describe("rankLemmas", () => {
  it("aggregates forms to lemmas and ranks by summed frequency", () => {
    const rows = rankLemmas(
      inputs([
        ["study", 5],
        ["running", 4],
        ["studies", 3],
        ["run", 2],
      ]),
    );
    expect(rows.map((r) => [r.lemma, r.rank, r.freq])).toEqual([
      ["study", 1, 8],
      ["run", 2, 6],
    ]);
    expect(lemmaOf(rows, "running")).toBe("run");
    expect(lemmaOf(rows, "studies")).toBe("study");
  });

  it("NGSL/NAWL families are authoritative (felt → feel, left → leave), headwords stay themselves", () => {
    const families = [
      { lemma: "leave", forms: ["leaves", "left", "leaving"] },
      { lemma: "find", forms: ["finds", "found", "finding"] },
      { lemma: "found", forms: ["founds", "founded"] },
    ];
    const rows = rankLemmas(
      inputs(
        [
          ["left", 9],
          ["found", 8],
          ["founded", 1],
          ["find", 1],
          ["leave", 1],
        ],
        { families },
      ),
    );
    expect(lemmaOf(rows, "left")).toBe("leave");
    expect(lemmaOf(rows, "found")).toBe("found"); // a headword itself
    expect(lemmaOf(rows, "founded")).toBe("found");
    // …but it is also a form of another ranked lemma (for the placement bank).
    expect(rows.find((r) => r.lemma === "found")!.formOf).toEqual(["find"]);
  });

  it("folds British to American spelling only when the American form is more frequent", () => {
    const rows = rankLemmas(
      inputs([
        ["color", 5],
        ["colour", 2],
        ["organisation", 3],
        ["organization", 1],
      ]),
    );
    expect(lemmaOf(rows, "colour")).toBe("color");
    expect(lemmaOf(rows, "organisation")).toBe("organisation"); // American is rarer here
    expect(americanCandidate("colour")).toBe("color");
    expect(americanCandidate("four")).toBeNull();
    expect(americanCandidate("advertise")).toBeNull();
    expect(americanCandidate("centre")).toBe("center");
  });

  it("drops proper nouns, non-words and contractions; ties break alphabetically", () => {
    const rows = rankLemmas(
      inputs([
        ["london", 9],
        ["xqzt", 9],
        ["don't", 9],
        ["for", 1],
        ["four", 1],
      ]),
    );
    expect(rows.map((r) => r.lemma)).toEqual(["for", "four"]);
  });

  it("contraction pieces are never counted or family-mapped (won stays win's)", () => {
    const families = [{ lemma: "will", forms: ["won", "ll"] }];
    const rows = rankLemmas(
      inputs(
        [
          ["ll", 9],
          ["won", 3],
          ["will", 2],
        ],
        {
          families,
          dictionary: new Set(["will", "win", "won"]),
        },
      ),
    );
    expect(rows.map((r) => [r.lemma, r.forms])).toEqual([
      ["won", ["won"]],
      ["will", ["will"]],
    ]);
    expect(rows[0]!.formOf).toEqual([]); // "win" is not ranked in this input
  });

  it("flags lemmas that are also proper nouns", () => {
    const rows = rankLemmas(
      inputs([
        ["for", 2],
        ["run", 1],
      ]),
    );
    expect(rows.map((r) => [r.lemma, r.proper])).toEqual([
      ["for", true],
      ["run", false],
    ]);
  });

  it("lemmas-en.tsv round-trips", () => {
    const rows = rankLemmas(
      inputs([
        ["study", 5],
        ["studies", 3],
        ["run", 2],
      ]),
    );
    expect(parseLemmaRows(formatLemmaRows(rows).join("\n"))).toEqual(
      rows.map((r) => ({ ...r, freq: Number(r.freq.toExponential(6)) })),
    );
  });

  it("a form two base lemmas can produce goes to the more frequent one (routing → route)", () => {
    const dictionary = new Set(["rout", "route", "hop", "hope", "tap", "tape"]);
    const lemmaOfIn = (forms: [string, number][]) =>
      rankLemmas(inputs(forms, { dictionary, listed: new Set(), properUse: new Set() }));
    const rows = lemmaOfIn([
      ["route", 50],
      ["rout", 2],
      ["routing", 10],
      ["routed", 5],
    ]);
    expect(lemmaOf(rows, "routing")).toBe("route");
    expect(lemmaOf(rows, "routed")).toBe("route");
    // Reversed frequencies: the forms follow the more frequent base.
    const flipped = lemmaOfIn([
      ["rout", 50],
      ["route", 2],
      ["routing", 10],
    ]);
    expect(lemmaOf(flipped, "routing")).toBe("rout");
  });

  it("only bases that can spell the form compete: hop gives hopping, never hoping", () => {
    const dictionary = new Set(["hop", "hope", "tap", "tape"]);
    const rows = rankLemmas(
      inputs(
        [
          ["hop", 90],
          ["hope", 10],
          ["tap", 90],
          ["tape", 10],
          ["hoping", 5],
          ["hopping", 5],
          ["taping", 3],
          ["tapped", 3],
        ],
        { dictionary, listed: new Set(), properUse: new Set() },
      ),
    );
    expect(lemmaOf(rows, "hoping")).toBe("hope"); // hop is 9x more frequent but would double
    expect(lemmaOf(rows, "hopping")).toBe("hop");
    expect(lemmaOf(rows, "taping")).toBe("tape");
    expect(lemmaOf(rows, "tapped")).toBe("tap");
    // Not one of those patterns (y → i): left to the lemmatizer.
    expect(canSpell("study", "studied")).toBe(true);
    expect(canSpell("hop", "hoping")).toBe(false);
  });

  it("only verbs compete for -ing/-ed forms; other forms keep the lemmatizer's choice", () => {
    const dictionary = new Set(["hiss", "his", "relieve", "relief", "lung", "lunge"]);
    const rows = rankLemmas(
      inputs(
        [
          ["his", 900],
          ["hiss", 5],
          ["hissed", 3],
          ["relief", 90],
          ["relieve", 10],
          ["relieves", 2],
          ["lung", 50],
          ["lunge", 5],
          ["lunged", 2],
        ],
        {
          dictionary,
          listed: new Set(),
          properUse: new Set(),
          verbs: new Set(["hiss", "relieve", "lunge"]),
        },
      ),
    );
    expect(lemmaOf(rows, "hissed")).toBe("hiss"); // "his" could spell it (doubling) but is no verb
    expect(lemmaOf(rows, "lunged")).toBe("lunge"); // lung is more frequent but no verb
    expect(lemmaOf(rows, "relieves")).toBe("relieve"); // -s: not a frequency contest
  });
});
