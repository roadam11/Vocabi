# VOCABI — Content spec

Content is the product's main asset. It is versioned JSON in `content/`, validated by Zod (`src/content/schema.ts`) and by `pnpm content:check`. A sense that fails validation never ships.

## Sense record
```json
{
  "id": "abandon.v.01",
  "lemma": "abandon",
  "pos": "v",
  "senseEn": "to leave something and not come back; to give up a plan",
  "he": { "primary": "לנטוש", "alternates": ["לעזוב", "לזנוח"] },
  "knowledge": "rec",
  "layers": ["recognition", "context"],
  "example": { "en": "The crew had to abandon the ship.", "he": "הצוות נאלץ לנטוש את הספינה." },
  "cloze": { "en": "They decided to ___ the project when the money ran out.", "answerForm": "abandon" },
  "clozeDistractors": ["achieve", "approve", "attend"],
  "answers": ["abandon", "abandons", "abandoned", "abandoning"],
  "collocations": ["abandon a plan", "abandon hope"],
  "family": ["abandonment"],
  "synonyms": ["desert", "give up"],
  "freqBand": "B4",
  "tracks": ["amirnet"],
  "verification": { "status": "verified", "reviewedBy": "roie", "reviewedAt": "2026-10-10" }
}
```
- `id`: `<lemma-slug>.<pos>.<NN>`, stable forever (progress is keyed by it). Never reuse a retired id.
- `pos`: `n | v | adj | adv | prep | conj | phrase`.
- `knowledge`: `rec` (receptive) or `prod` (productive). `production` must be in `layers` iff `knowledge === "prod"`.
- `verification.status`: `draft | verified | rejected`. Only `verified` senses load in the app.
- `devOnly?: boolean`: marks hand-written fixture senses (ROADMAP M3's 20 dev senses) that load only in development, never in production, but are validated by `content:check` like any other sense (`docs/DECISIONS.md` #10).
- "Shipping track" (validator rule 8 below) means `tracks` containing `"amirnet"` — the only track that ships content in Phase 0 (`docs/DECISIONS.md` #11).

## Distractor-only lexicon
`content/lexicon/distractors.json`: verified-gloss entries (lemma, pos, freqBand, Hebrew gloss) that are never taught as senses — they exist only to supply recognition-MCQ distractors when a shipping sense doesn't have 3 eligible distractors among other shipping senses. Same Hebrew-gloss-collision rule as real senses applies (`docs/ENGINE.md` §6, `docs/DECISIONS.md` #3).

## Validator rules (`pnpm content:check`)
Errors (exit code 1):
1. Schema valid; ids unique; id matches lemma and pos.
2. Hebrew fields contain no Latin letters touching Hebrew letters; English fields contain no Hebrew letters.
3. No en dash or em dash between digits inside Hebrew strings (bidi reverses it).
4. `cloze.en` contains exactly one `___`; it does not contain the lemma or any item of `answers` (no give-away); and with the blank filled it is NOT the same sentence as `example.en` (otherwise the learner memorizes the sentence, not the word).
5. `cloze.answerForm` ∈ `answers`.
6. `clozeDistractors`: exactly 3, unique, none in `answers`, none in `family`, none equal to the lemma.
7. `context` in `layers` requires `cloze` and `clozeDistractors`.
8. Every sense in a shipping track has `verification.status === "verified"`.
9. Pseudowords (`content/placement/pseudo.json`) do not appear in the lexicon or the reference word list, including common inflections. Additionally (`docs/DECISIONS.md` #7): each pseudoword must be length 7-10 characters, AND must have Damerau-Levenshtein distance ≥ 3 from every word/inflection among the top ~20,000 most frequent English words (a reference frequency list, not the full lexicon — checking against every word would reject almost every candidate at distance ≤2; the length floor exists because short strings collide at that distance by chance far too often).
10. Lengths: `he.primary` ≤ 40 chars, `example.en` ≤ 120 chars.
11. Every shipping sense has at least 3 eligible recognition distractors (same POS, freq band ±1, not same family/synonym, no Hebrew gloss collision — `docs/ENGINE.md` §6), counting both other shipping senses and the distractor-only lexicon. Previously a warning; promoted to an error because a mastery-gating question must never be weakened at runtime (`docs/DECISIONS.md` #3).

Warnings (printed, not failing):
- Hebrew gloss collisions between senses in the same track (they cannot be recognition distractors for each other).
- `clozeDistractors` whose inflection suffix (-s/-ed/-ing) differs from `answerForm`.

## Translation standard (for generation and review)
- The Hebrew must translate the chosen **sense**, not the word in general. Put the most common natural Hebrew first.
- Include the required preposition: "להימנע מ־", "מודע ל־", "להשפיע על".
- Verbs in infinitive (ל…), nouns in singular unless the English is plural, adjectives in masculine singular.
- Use Hebrew quotation marks ״…״, geresh ׳ and maqaf ־. No mixed-script words.
- The example sentence uses the target sense, is natural, at B1-B2 difficulty, ≤ 120 characters, with no names of real people.

## Pipeline
### Phase 0 (manual verification, ~150 senses)
1. `scripts/content/generate.ts`: reads `content/input/*.csv` (lemma, optional sense hint, band) → Anthropic Message Batches API → draft records (`status: "draft"`). Model from `ANTHROPIC_MODEL`, key from `ANTHROPIC_API_KEY` (server env only). The prompt demands JSON matching the schema; invalid output is retried at most 2 times, then logged.
2. `pnpm content:check` on the drafts.
3. `scripts/content/export-review.ts` → `review/*.csv` (UTF-8 **with BOM** so Excel shows Hebrew correctly). Columns: id, lemma, pos, senseEn, he.primary, he.alternates, example.en, example.he, cloze.en, clozeDistractors, decision (approve/fix/reject), fix notes.
4. Human review (Roie) of every record. For pseudowords specifically, also reject any candidate that is a real word in another language, slang, or a brand name (`docs/DECISIONS.md` #7) — the automated Damerau-Levenshtein/length check above (rule 9) only catches near-collisions with common English words.
5. `scripts/content/import-review.ts` applies decisions, sets `verified`, `reviewedBy`, `reviewedAt`. Rejected senses stay in the file with status `rejected`.

### Phase 1 (scale)
Add a blind cross-check by a model from a different provider, licensed dictionary evidence, a confidence score (green/yellow/red), human review of yellow/red, and a random sample of 300 green records per batch (0 errors in 300 ⇒ error rate < 1% at 95% confidence, "rule of three").

## Sources and licensing (open — resolve before public launch)
- Do NOT copy the Israeli Ministry of Education lexical band PDFs into the repo or database (they prohibit reproduction, translation and storage without written permission).
- Frequency bands and academic lists: candidate open sources exist (e.g. NGSL family, wordfreq data) but several are share-alike licensed. Use them for internal sampling in Phase 0 only, and record the source of every list in `content/SOURCES.md`.
- Never scrape Morfix or other dictionary sites.
