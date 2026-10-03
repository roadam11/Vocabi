# Content sources

Every external list used by VOCABI content or tooling is recorded here (`docs/CONTENT.md` "Sources and licensing").

## wordfreq top-20k English reference list
- **File:** `content/reference/top20k-en.txt` (19,757 words after filtering).
- **Source:** [wordfreq](https://github.com/rspeer/wordfreq) **3.1.1**, data file `wordfreq/data/large_en.msgpack.gz` from the PyPI wheel `wordfreq-3.1.1-py3-none-any.whl` (sha256 `4b1c6ecffc6198be3396d5cf871c4423ca71c907c231348d352dd54d62b97473`). Equivalent to `wordfreq.top_n_list("en", 20000)`, lowercased and filtered to `^[a-z][a-z'-]*$`.
- **License:** wordfreq code Apache-2.0; word-frequency data **CC-BY-SA 4.0** (share-alike).
- **Generated:** 2026-10-02 with `pnpm content:build-reference` (`scripts/content/build-reference.ts`).
- **Use:** also the source of `lemmas-en.tsv` (the top 80,000 forms with their bucket frequencies, below). Internal validation only — `pnpm content:check` rule 9 (pseudowords must not be, or be within Damerau-Levenshtein distance 2 of, a common English word or inflection; `docs/DECISIONS.md` #7). Never shipped: `src/` may not import or read it (ESLint ban + `scripts/content/reference-guard.test.ts`, `docs/DECISIONS.md` #28). Revisit the license before any use beyond internal tooling.

## Pinned word lists (`pnpm content:build-reference`, `scripts/content/sources.ts`)
All downloaded byte-for-byte with plain HTTPS and a sha256 check, on **2026-10-03**. Internal use only (placement bands, placement bank, starter selection); `src/` may never read `content/reference/` (`docs/DECISIONS.md` #28).

### NGSL 1.2 (New General Service List)
- **Files:** `ngsl-1.2-stats.csv` (lemma, SFI rank), sha256 `2098bab8955a120a9766c6282a51d7d578c6cb0a7d946600d2ffb73ba25a0b44`; `ngsl-1.2-lemmatized.csv` (lemma families, for research), sha256 `d814f2a0a3c61479a2c5ad037661719a0cc6e7dbcde31f181b54f12d0f1e11a4`.
- **URLs:** `https://static1.squarespace.com/static/64336926d7c6bb38965fdf3b/t/644e0be4ad7bae3d45b9e62a/1682836452194/NGSL_1.2_stats.csv`, `…/t/66e83ee8dc33447753c03f88/1726496489020/NGSL_1.2_lemmatized_for_research.csv` (linked from https://www.newgeneralservicelist.com/new-general-service-list).
- **License:** CC BY-SA 4.0 (commercial use allowed, share-alike).
- **Citation:** Browne, C., Culligan, B., & Phillips, J. (2013). *The New General Service List*, version 1.2. http://www.newgeneralservicelist.com
- **Use:** lemma families (authoritative form → lemma map), the NGSL top-1000 exclusion of the starter selection.

### NAWL 1.2 (New Academic Word List)
- **Files:** `nawl-1.2-lemmatized.csv` (959 lemma families; Latin-1, read as such), sha256 `c28ef95623d79c08a4060d6d6d51d3331115e75a18ee247caa4cc3ae5506b92e`; `nawl-1.2-definitions.csv` (lemma, English definition, POS), sha256 `2eca6b402b2cd17a8a0ce79f0ab6880bef8af2f4dbab38d045321cecaa3284a4`.
- **URLs:** `…/t/643c7cf96a3ed81c74e87a01/1681685753444/NAWL_1.2_lemmatized_for_research.csv`, `…/t/643c7da6097db81d6db11e39/1681685926392/NAWL_1.2_with_en_definitions.csv` (same Squarespace host; linked from https://www.newgeneralservicelist.com/new-academic-word-list).
- **License:** CC BY-SA 4.0.
- **Citation:** Browne, C., Culligan, B., & Phillips, J. (2013). *The New Academic Word List*, version 1.2. http://www.newacademicwordlist.org
- **Use:** the ACAD band (`docs/DECISIONS.md` #31), starter candidates and their sense hints.

### CEFR-J Wordlist 1.5
- **File:** `cefrj-1.5.csv`, sha256 `b0dd3c635f1c9a4fdf1490c7e5b7c48e8bbe55b652ad0c9860a95f98e10ae498`.
- **URL:** https://raw.githubusercontent.com/openlanguageprofiles/olp-en-cefrj/d4e45b75b38f27b30dfc5c44d8c571aec7e7092f/cefrj-vocabulary-profile-1.5.csv (commit-pinned).
- **License (verbatim):** "CEFR-J vocabulary and grammar profile datasets can be used for research and commercial purposes with no charge, provided that you cite the dataset properly. The copyright belongs to Tono Laboratory at TUFS (Tokyo University of Foreign Studies)."
- **Citation:** *The CEFR-J Wordlist Version 1.5.* Compiled by Yukio Tono, Tokyo University of Foreign Studies. Retrieved from http://www.cefr-j.org/download.html.
- **Use:** dictionary words, POS fallback, the CEFR-J B2 starter pool.

### WordNet 3.1
- **Source:** npm package `wordnet-db` 3.1.14 tarball, https://registry.npmjs.org/wordnet-db/-/wordnet-db-3.1.14.tgz, sha256 `9b93831ae01771d02f360c1ebf3fe415ed2426a31f2201cb0943025c7403e79a` (read at build time, not committed).
- **License:** WordNet license (Princeton University; free use, copy, modification and distribution with the copyright notice); package MIT.
- **Citation:** Princeton University. *About WordNet.* WordNet. Princeton University. 2010.
- **Use:** the dictionary filter and the proper-noun signals (WordNet writes "Paris" capitalized, "john" (toilet) lowercase).

### wink-lemmatizer 3.0.4 / wink-lexicon 2.2.0 (devDependency, MIT)
WordNet "morphy" lemmatization of forms outside the NGSL/NAWL families, and the WordNet POS fallback of the starter selection.

## Derived reference files
- `lemmas-en.tsv` (`lemma, rank, freq, forms, formOf, proper`): 28,582 lemmas from the top 80,000 wordfreq forms. Method in `docs/DECISIONS.md` #51 and `scripts/content/lemmas.ts`: NGSL/NAWL families first, then dictionary base words, then morphy; British spellings fold to a more frequent American dictionary variant; contraction pieces are dropped; WordNet-only-capitalized words (proper nouns) are dropped unless listed; ranks by summed frequency, ties alphabetical.
- `exclude-offensive.txt`, `exclude-he-loanwords.txt`, `exclude-names.txt`: curated by VOCABI for the placement bank (`docs/DECISIONS.md` #53); to be confirmed by Roie.

## Noa's word list (private contribution)
- **File:** `candidates/noa.txt` — 852 unique English headwords (910 headword lines, 57 duplicate lines removed: 54 headwords appear more than once, 4 of them only after normalization, plus "deffer" → defer, already listed). Extracted 2026-10-03 by `pnpm content:noa` from `review/input/noa.docx` (git-ignored).
- **Permission:** confirmed by Roie (2026-10-03) for use as a VOCABI candidate list.
- **Scope:** English headwords ONLY. Her Hebrew translations are never extracted, stored or used. Spelling fixes: 2 applied automatically (undervent → underwent, warth → wrath), 2 kept (hampered, cunning), and Roie's decisions in `candidates/noa-decisions.tsv` (bire → bare, deffer → defer, alleg → allege, incess → incessant, cumbed → succumb, ommision → omission, scantest → scanty, sword kept, imburse dropped since reimburse is listed); all logged in `review/noa-typos.csv`.
