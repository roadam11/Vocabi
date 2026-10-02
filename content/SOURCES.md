# Content sources

Every external list used by VOCABI content or tooling is recorded here (`docs/CONTENT.md` "Sources and licensing").

## wordfreq top-20k English reference list
- **File:** `content/reference/top20k-en.txt` (19,757 words after filtering).
- **Source:** [wordfreq](https://github.com/rspeer/wordfreq) **3.1.1**, data file `wordfreq/data/large_en.msgpack.gz` from the PyPI wheel `wordfreq-3.1.1-py3-none-any.whl` (sha256 `4b1c6ecffc6198be3396d5cf871c4423ca71c907c231348d352dd54d62b97473`). Equivalent to `wordfreq.top_n_list("en", 20000)`, lowercased and filtered to `^[a-z][a-z'-]*$`.
- **License:** wordfreq code Apache-2.0; word-frequency data **CC-BY-SA 4.0** (share-alike).
- **Generated:** 2026-10-02 with `pnpm content:build-reference` (`scripts/content/build-reference.ts`).
- **Use:** internal validation only — `pnpm content:check` rule 9 (pseudowords must not be, or be within Damerau-Levenshtein distance 2 of, a common English word or inflection; `docs/DECISIONS.md` #7). Never shipped: `src/` may not import or read it (ESLint ban + `scripts/content/reference-guard.test.ts`, `docs/DECISIONS.md` #28). Revisit the license before any use beyond internal tooling.
