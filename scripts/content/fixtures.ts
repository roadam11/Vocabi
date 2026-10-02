/**
 * content:check fixtures (ROADMAP M3): for every rule code, a content tree that is clean except for
 * one defect, plus passing edge cases. validate.test.ts writes each tree to a temp dir and runs the
 * real reader + validator on it. Keys of `files` are paths relative to the content root.
 */
import type { RuleCode } from "./validate";

type Json = Record<string, unknown>;
export type Fixture = {
  name: string;
  files: Record<string, unknown>;
  /** Overrides the real top-20k list. */
  reference?: string[];
};
export type FailingFixture = Fixture & { code: RuleCode };

const VERIFIED = { status: "verified", reviewedBy: "roie", reviewedAt: "2026-10-02" };

/** A clean, non-shipping verb sense (tracks: []), so rules 8 and 11 stay out of the way. */
export function sense(over: Json = {}): Json {
  return {
    id: "abandon.v.01",
    lemma: "abandon",
    pos: "v",
    senseEn: "to leave something and not come back",
    he: { primary: "לנטוש", alternates: ["לזנוח"] },
    knowledge: "rec",
    layers: ["recognition", "context"],
    example: { en: "The crew had to abandon the ship.", he: "הצוות נאלץ לנטוש את הספינה." },
    cloze: { en: "They decided to ___ the project when the money ran out.", answerForm: "abandon" },
    clozeDistractors: ["achieve", "approve", "attend"],
    answers: ["abandon", "abandons", "abandoned", "abandoning"],
    family: ["abandonment"],
    synonyms: ["desert", "give up"],
    freqBand: "B4",
    tracks: [],
    verification: VERIFIED,
    ...over,
  };
}

const withExample = (over: Json) => ({
  example: { en: "The crew had to abandon the ship.", he: "הצוות נאלץ לנטוש את הספינה.", ...over },
});
const withCloze = (en: string, answerForm = "abandon") => ({ cloze: { en, answerForm } });

/** Four mutually eligible shipping verbs (same POS, B3/B4, distinct glosses and families). */
function shippingVerbs(over: { devOnly?: boolean } = {}): Json[] {
  const verbs: [string, string, string][] = [
    ["achieve", "B3", "להשיג"],
    ["approve", "B4", "לאשר"],
    ["attend", "B3", "להשתתף ב־"],
    ["ignore", "B3", "להתעלם מ־"],
  ];
  return verbs.map(([lemma, band, he]) =>
    sense({
      id: `${lemma}.v.01`,
      lemma,
      he: { primary: he, alternates: [] },
      example: { en: `You can ${lemma} it.`, he: "אפשר." },
      cloze: { en: "We need to ___ this soon.", answerForm: lemma },
      clozeDistractors: ["hesitate", "postpone", "require"],
      answers: [lemma, `${lemma}s`],
      family: [],
      synonyms: [],
      freqBand: band,
      tracks: ["amirnet"],
      ...over,
    }),
  );
}
const track = (id: string, senses: Json[]) => ({ id, order: senses.map((s) => s.id) });
const lexiconEntry = (over: Json = {}): Json => ({
  id: "accept.v.01",
  lemma: "accept",
  pos: "v",
  freqBand: "B4",
  he: { primary: "לקבל" },
  verification: VERIFIED,
  ...over,
});

const one = (s: Json) => ({ "senses/a.json": [s] });

export const failing: FailingFixture[] = [
  // Rule 1
  { name: "schema: bad pos", code: "SCHEMA", files: one(sense({ pos: "verb" })) },
  { name: "schema: not JSON", code: "SCHEMA", files: { "senses/a.json": "{ not json" } },
  {
    name: "duplicate id across files",
    code: "ID_DUPLICATE",
    files: { "senses/a.json": [sense()], "senses/b.json": [sense()] },
  },
  { name: "id pos mismatch", code: "ID_MISMATCH", files: one(sense({ id: "abandon.n.01" })) },
  {
    name: "multi-word lemma id not slugged",
    code: "ID_MISMATCH",
    files: one(
      sense({
        id: "get along with.phrase.01",
        lemma: "get along with",
        pos: "phrase",
        example: { en: "She gets along with everyone.", he: "היא מסתדרת עם כולם." },
        cloze: { en: "It is easier when you ___ your colleagues.", answerForm: "get along with" },
        clozeDistractors: ["run out of", "carry out", "look forward to"],
        answers: ["get along with", "gets along with"],
        family: [],
        synonyms: [],
      }),
    ),
  },
  {
    name: "sense in a track but not in its order",
    code: "TRACK_REF",
    files: {
      "senses/a.json": [sense({ tracks: ["sample"] })],
      "tracks/sample.json": { id: "sample", order: [] },
    },
  },
  {
    name: "track order lists an unknown sense",
    code: "TRACK_REF",
    files: {
      "senses/a.json": [sense()],
      "tracks/sample.json": { id: "sample", order: ["ghost.v.01"] },
    },
  },
  // Rule 2
  {
    name: "Latin inside parentheses touching a Hebrew prefix",
    code: "HE_LATIN_TOUCHING",
    files: one(sense(withExample({ he: "הצוות נאלץ לנטוש את הספינה (בship)." }))),
  },
  {
    name: "Hebrew prefix + maqaf on a Latin word",
    code: "HE_LATIN_TOUCHING",
    files: one(sense({ he: { primary: "לנטוש", alternates: ["לעזוב ב־VOCABI"] } })),
  },
  {
    name: "Latin after niqqud",
    code: "HE_LATIN_TOUCHING",
    files: one(sense({ he: { primary: "לִנְטוֹשׁx", alternates: [] } })),
  },
  {
    name: "Hebrew in English",
    code: "EN_HEBREW",
    files: one(sense({ senseEn: "to leave (לנטוש)" })),
  },
  // Rule 3
  {
    name: "en dash between digits",
    code: "HE_DASH_DIGITS",
    files: one(sense(withExample({ he: "הצוות נאלץ לנטוש את הספינה אחרי 3–4 ימים." }))),
  },
  {
    name: "em dash with spaces between digits",
    code: "HE_DASH_DIGITS",
    files: one(sense(withExample({ he: "הצוות נאלץ לנטוש את הספינה אחרי 3 — 4 ימים." }))),
  },
  // Rule 4
  {
    name: "two blanks",
    code: "CLOZE_BLANK_COUNT",
    files: one(sense(withCloze("They ___ decided to ___ the project."))),
  },
  {
    name: "no blank",
    code: "CLOZE_BLANK_COUNT",
    files: one(sense(withCloze("They decided to drop the project."))),
  },
  {
    name: "cloze contains an inflected answer",
    code: "CLOZE_GIVEAWAY",
    files: one(sense(withCloze("They ___ the project, so it stayed abandoned."))),
  },
  {
    name: "cloze contains a multi-word lemma",
    code: "CLOZE_GIVEAWAY",
    files: one(
      sense({
        id: "get-along-with.phrase.01",
        lemma: "get along with",
        pos: "phrase",
        example: { en: "She gets along with everyone.", he: "היא מסתדרת עם כולם." },
        cloze: {
          en: "People who ___ others usually get along with them.",
          answerForm: "get along with",
        },
        clozeDistractors: ["run out of", "carry out", "look forward to"],
        answers: ["get along with", "gets along with"],
        family: [],
        synonyms: [],
      }),
    ),
  },
  {
    name: "cloze contains the space variant of a hyphenated answer",
    code: "CLOZE_GIVEAWAY",
    files: one(
      sense({
        id: "well-known.adj.01",
        lemma: "well-known",
        pos: "adj",
        example: {
          en: "The town is well-known for its beaches.",
          he: "העיירה מוכרת בזכות החופים.",
        },
        cloze: { en: "The ___ singer is well known everywhere.", answerForm: "well-known" },
        clozeDistractors: ["ancient", "empty", "reliable"],
        answers: ["well-known"],
        family: [],
        synonyms: [],
      }),
    ),
  },
  {
    name: "filled cloze equals the example",
    code: "CLOZE_EQUALS_EXAMPLE",
    files: one(sense(withCloze("The crew had to ___ the ship."))),
  },
  // Rule 5
  {
    name: "answerForm not in answers",
    code: "CLOZE_ANSWER_FORM",
    files: one(sense(withCloze("They decided to ___ the project.", "forsake"))),
  },
  // Rule 6
  {
    name: "a distractor is the lemma",
    code: "CLOZE_DISTRACTORS",
    files: one(sense({ clozeDistractors: ["achieve", "approve", "abandon"] })),
  },
  {
    name: "only two distractors",
    code: "CLOZE_DISTRACTORS",
    files: one(sense({ clozeDistractors: ["achieve", "approve"] })),
  },
  {
    name: "a distractor is in the family",
    code: "CLOZE_DISTRACTORS",
    files: one(sense({ clozeDistractors: ["achieve", "approve", "abandonment"] })),
  },
  {
    name: "duplicate distractors",
    code: "CLOZE_DISTRACTORS",
    files: one(sense({ clozeDistractors: ["achieve", "Achieve", "attend"] })),
  },
  // Rule 7
  {
    name: "context layer without cloze",
    code: "CONTEXT_REQUIRES_CLOZE",
    files: one(sense({ cloze: undefined, clozeDistractors: undefined })),
  },
  // Rule 8
  {
    name: "draft sense in the shipping track",
    code: "SHIPPING_UNVERIFIED",
    files: {
      "senses/a.json": [sense({ tracks: ["amirnet"], verification: { status: "draft" } })],
      "tracks/amirnet.json": { id: "amirnet", order: ["abandon.v.01"] },
    },
  },
  // Rule 9
  {
    name: "pseudoword is a real word",
    code: "PSEUDO_REAL_WORD",
    files: { "placement/pseudo.json": [{ id: "p01", text: "abandoning" }] },
  },
  {
    name: "pseudoword is an inflection of a reference word",
    code: "PSEUDO_REAL_WORD",
    files: { "placement/pseudo.json": [{ id: "p01", text: "flombites" }] },
    reference: ["flombite"],
  },
  {
    name: "pseudoword is a lexicon form",
    code: "PSEUDO_REAL_WORD",
    files: {
      "senses/a.json": [sense({ family: ["abandonment", "flombiter"] })],
      "placement/pseudo.json": [{ id: "p01", text: "flombiter" }],
    },
  },
  {
    name: "pseudoword too short",
    code: "PSEUDO_LENGTH",
    files: { "placement/pseudo.json": [{ id: "p01", text: "zqxvjk" }] },
  },
  {
    name: "pseudoword too long",
    code: "PSEUDO_LENGTH",
    files: { "placement/pseudo.json": [{ id: "p01", text: "grallistorq" }] },
  },
  {
    name: "pseudoword within distance 2 of a common word",
    code: "PSEUDO_NEAR_WORD",
    files: { "placement/pseudo.json": [{ id: "p01", text: "hesitatin" }] },
  },
  {
    name: "pseudoword at exactly distance 2 (boundary)",
    code: "PSEUDO_NEAR_WORD",
    files: { "placement/pseudo.json": [{ id: "p01", text: "brontaxy" }] },
    reference: ["brontali"],
  },
  // Rule 10
  {
    name: "he.primary over 40 characters",
    code: "LENGTH_HE_PRIMARY",
    files: one(sense({ he: { primary: "לנטוש ".repeat(7).trim(), alternates: [] } })),
  },
  {
    name: "example.en over 120 characters",
    code: "LENGTH_EXAMPLE_EN",
    files: one(
      sense(withExample({ en: `The crew had to abandon the ship${" very".repeat(18)} quickly.` })),
    ),
  },
  // Rule 11
  {
    name: "shipping sense with no eligible distractors",
    code: "RECOGNITION_DISTRACTORS",
    files: {
      "senses/a.json": [sense({ tracks: ["amirnet"] })],
      "tracks/amirnet.json": { id: "amirnet", order: ["abandon.v.01"] },
    },
  },
  {
    name: "devOnly senses do not count for a real shipping sense",
    code: "RECOGNITION_DISTRACTORS",
    files: (() => {
      const dev = shippingVerbs({ devOnly: true }).slice(0, 3);
      const real = sense({ tracks: ["amirnet"] });
      return {
        "senses/a.json": [real, ...dev],
        "tracks/amirnet.json": track("amirnet", [real, ...dev]),
      };
    })(),
  },
  {
    name: "a gloss collision makes a candidate ineligible",
    code: "RECOGNITION_DISTRACTORS",
    files: (() => {
      // Target pool: approve, attend, and a lexicon entry glossed לְנְטוֹשׁ (= לנטוש after
      // normalization), which is ineligible → 2. approve and attend still reach 3 each. Lexicon
      // entries are in no track, so no W_GLOSS_COLLISION fires alongside.
      const [, b, c] = shippingVerbs();
      const target = sense({ tracks: ["amirnet"] });
      const all = [target, b!, c!];
      return {
        "senses/a.json": all,
        "lexicon/distractors.json": [lexiconEntry({ he: { primary: "לְנְטוֹשׁ" } })],
        "tracks/amirnet.json": track("amirnet", all),
      };
    })(),
  },
  // Warnings
  {
    name: "two senses in one track share a gloss",
    code: "W_GLOSS_COLLISION",
    files: {
      "senses/a.json": [
        sense({ tracks: ["sample"] }),
        sense({
          id: "desert.v.01",
          lemma: "desert",
          he: { primary: "לנטוש", alternates: [] },
          example: { en: "He would never desert his friends.", he: "הוא לעולם לא ינטוש את חבריו." },
          cloze: { en: "Soldiers who ___ their posts are punished.", answerForm: "desert" },
          answers: ["desert", "deserts", "deserted", "deserting"],
          family: ["deserter"],
          synonyms: ["abandon"],
          tracks: ["sample"],
        }),
      ],
      "tracks/sample.json": { id: "sample", order: ["abandon.v.01", "desert.v.01"] },
    },
  },
  {
    name: "distractor inflection differs from answerForm",
    code: "W_CLOZE_INFLECTION",
    files: one(sense({ clozeDistractors: ["achieved", "approve", "attend"] })),
  },
];

export const passing: Fixture[] = [
  {
    name: "Latin in parentheses not touching Hebrew",
    files: one(sense(withExample({ he: "הצוות נאלץ לנטוש את הספינה (ship) בלילה." }))),
  },
  {
    name: "Hebrew with niqqud, maqaf and gershayim, ASCII hyphen between digits",
    files: one(
      sense({
        he: { primary: "לִנְטוֹשׁ", alternates: ["לְהִימָּנַע מ־"] },
        ...withExample({ he: "לפי הדו״ח, הצוות נטש את הספינה אחרי 3-4 ימים." }),
      }),
    ),
  },
  {
    name: "a four-underscore blank counts as one",
    files: one(sense(withCloze("They decided to ____ the project."))),
  },
  {
    name: "hyphenated answer, cloze mentions neither variant",
    files: one(
      sense({
        id: "well-known.adj.01",
        lemma: "well-known",
        pos: "adj",
        example: {
          en: "The town is well-known for its beaches.",
          he: "העיירה מוכרת בזכות החופים.",
        },
        cloze: { en: "The singer is ___ all over the world.", answerForm: "well known" },
        clozeDistractors: ["ancient", "empty", "reliable"],
        answers: ["well-known", "well known"],
        family: [],
        synonyms: [],
      }),
    ),
  },
  {
    name: "four mutually eligible shipping senses",
    files: (() => {
      const v = shippingVerbs();
      return { "senses/a.json": v, "tracks/amirnet.json": track("amirnet", v) };
    })(),
  },
  {
    name: "a lexicon entry supplies the third distractor",
    files: (() => {
      const v = shippingVerbs().slice(0, 3);
      return {
        "senses/a.json": v,
        "lexicon/distractors.json": [lexiconEntry()],
        "tracks/amirnet.json": track("amirnet", v),
      };
    })(),
  },
  {
    name: "ACAD target with B5 and B4 candidates",
    files: (() => {
      const v = shippingVerbs()
        .slice(0, 3)
        .map((s, i) => ({ ...s, freqBand: ["ACAD", "B5", "B4"][i] }));
      return {
        "senses/a.json": v,
        "lexicon/distractors.json": [lexiconEntry({ freqBand: "B5" })],
        "tracks/amirnet.json": track("amirnet", v),
      };
    })(),
  },
  {
    name: "devOnly senses support each other",
    files: (() => {
      const v = shippingVerbs({ devOnly: true });
      return { "senses/a.json": v, "tracks/amirnet.json": track("amirnet", v) };
    })(),
  },
  {
    name: "pseudoword at exactly distance 3 (boundary)",
    files: { "placement/pseudo.json": [{ id: "p01", text: "brontxyz" }] },
    reference: ["brontali"],
  },
  {
    name: "valid pseudowords",
    files: {
      "placement/pseudo.json": [
        { id: "p01", text: "flombiter" },
        { id: "p02", text: "grallistor" },
        { id: "p03", text: "trosklade" },
      ],
    },
  },
];
