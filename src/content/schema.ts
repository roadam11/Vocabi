import { z } from "zod";
import { BANDS, POS } from "@/engine/distractors";

// docs/CONTENT.md. Strict objects: an unknown (e.g. misspelled) key is a schema error, not ignored.
// Cross-record rules (ids, clozes, distractor counts, …) live in scripts/content/validate.ts.

const text = z.string().trim().min(1);
const isoDate = z.iso.date();

export const LAYERS = ["recognition", "context", "production"] as const;
export type Layer = (typeof LAYERS)[number];

/** Track id slug. Only "amirnet" ships in Phase 0 (docs/DECISIONS.md #11). */
export const TrackId = z.string().regex(/^[a-z0-9-]+$/);
export const SHIPPING_TRACK = "amirnet";

export const Verification = z
  .strictObject({
    status: z.enum(["draft", "verified", "rejected"]),
    reviewedBy: text.optional(),
    reviewedAt: isoDate.optional(),
  })
  .refine((v) => v.status !== "verified" || (v.reviewedBy && v.reviewedAt), {
    message: "a verified record needs reviewedBy and reviewedAt",
  });

const HebrewGloss = z.strictObject({ primary: text, alternates: z.array(text) });

export const Sense = z
  .strictObject({
    id: text,
    lemma: text,
    pos: z.enum(POS),
    senseEn: text,
    he: HebrewGloss,
    knowledge: z.enum(["rec", "prod"]),
    layers: z.array(z.enum(LAYERS)).min(1),
    example: z.strictObject({ en: text, he: text }),
    cloze: z.strictObject({ en: text, answerForm: text }).optional(),
    clozeDistractors: z.array(text).optional(),
    answers: z.array(text).min(1),
    /**
     * Real words one edit away from an accepted answer, sorted (docs/DECISIONS.md #34). Built by
     * `pnpm content:near-words`; content:check rule 12 keeps it up to date. Absent means none.
     */
    nearWords: z.array(text).optional(),
    collocations: z.array(text).optional(),
    family: z.array(text).optional(),
    synonyms: z.array(text).optional(),
    freqBand: z.enum(BANDS),
    tracks: z.array(TrackId),
    verification: Verification,
    /** Hand-written fixture: loads only in development (docs/DECISIONS.md #10). */
    devOnly: z.boolean().optional(),
  })
  .superRefine((s, ctx) => {
    if (new Set(s.layers).size !== s.layers.length) {
      ctx.addIssue({ code: "custom", path: ["layers"], message: "layers must be unique" });
    }
    if (!s.layers.includes("recognition")) {
      ctx.addIssue({ code: "custom", path: ["layers"], message: "recognition is always required" });
    }
    if (s.layers.includes("production") !== (s.knowledge === "prod")) {
      ctx.addIssue({
        code: "custom",
        path: ["layers"],
        message: 'production must be in layers iff knowledge === "prod"',
      });
    }
  });
export type Sense = z.infer<typeof Sense>;

/** Distractor-only lexicon entry: verified gloss, never taught (docs/DECISIONS.md #3). */
export const LexiconEntry = z.strictObject({
  id: text,
  lemma: text,
  pos: z.enum(POS),
  freqBand: z.enum(BANDS),
  he: z.strictObject({ primary: text, alternates: z.array(text).optional() }),
  family: z.array(text).optional(),
  synonyms: z.array(text).optional(),
  verification: Verification,
  devOnly: z.boolean().optional(),
});
export type LexiconEntry = z.infer<typeof LexiconEntry>;

/** A real word in the placement bank (docs/ENGINE.md §4). Verification MCQs come from senses. */
export const PlacementItem = z.strictObject({
  id: text,
  lemma: text,
  band: z.enum(BANDS),
});
export type PlacementItem = z.infer<typeof PlacementItem>;

/** A pronounceable non-word for the placement yes/no test (docs/DECISIONS.md #7). */
export const Pseudoword = z.strictObject({
  id: text,
  text: text,
});
export type Pseudoword = z.infer<typeof Pseudoword>;

/** A track: its id and the order in which new senses are introduced (docs/ENGINE.md §7). */
export const Track = z.strictObject({
  id: TrackId,
  order: z.array(text),
});
export type Track = z.infer<typeof Track>;
