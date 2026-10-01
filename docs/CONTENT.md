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
9. Pseudowords (`content/placement/pseudo.json`) do not appear in the lexicon or the reference word list, including common inflections.
10. Lengths: `he.primary` ≤ 40 chars, `example.en` ≤ 120 chars.

Warnings (printed, not failing):
- Hebrew gloss collisions between senses in the same track (they cannot be recognition distractors for each other).
- `clozeDistractors` whose inflection suffix (-s/-ed/-ing) differs from `answerForm`.
- Fewer than 3 eligible recognition distractors available for a sense.

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
4. Human review (Roie) of every record.
5. `scripts/content/import-review.ts` applies decisions, sets `verified`, `reviewedBy`, `reviewedAt`. Rejected senses stay in the file with status `rejected`.

### Phase 1 (scale)
Add a blind cross-check by a model from a different provider, licensed dictionary evidence, a confidence score (green/yellow/red), human review of yellow/red, and a random sample of 300 green records per batch (0 errors in 300 ⇒ error rate < 1% at 95% confidence, "rule of three").

## Sources and licensing (open — resolve before public launch)
- Do NOT copy the Israeli Ministry of Education lexical band PDFs into the repo or database (they prohibit reproduction, translation and storage without written permission).
- Frequency bands and academic lists: candidate open sources exist (e.g. NGSL family, wordfreq data) but several are share-alike licensed. Use them for internal sampling in Phase 0 only, and record the source of every list in `content/SOURCES.md`.
- Never scrape Morfix or other dictionary sites.
