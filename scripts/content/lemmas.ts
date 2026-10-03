/**
 * Lemma ranking for the placement bands (docs/DECISIONS.md #31): aggregates wordfreq word forms to
 * lemmas and ranks lemmas by summed frequency. Pure — the inputs (forms, families, dictionary,
 * lemmatizer) are injected; scripts/content/build-reference.ts wires the real ones.
 *
 * A form resolves to a lemma in this order (method recorded in content/SOURCES.md):
 * 1. NGSL 1.2 / NAWL 1.2 lemma families (authoritative for common words; they already fold
 *    British spellings and irregular forms: colour → color, felt → feel). Headwords map to
 *    themselves; a form listed in several families goes to the first (NGSL by rank, then NAWL).
 * 2. A dictionary base word (WordNet via wink-lexicon, NGSL, NAWL, CEFR-J) is its own lemma.
 * 3. Otherwise the WordNet "morphy" lemmatizer (verb, then noun, then adjective); the first
 *    candidate that is a dictionary word wins. Nothing found → not a word (dropped).
 * 4. A British base spelling folds to its American variant when that variant is a dictionary
 *    word and more frequent in wordfreq (organisation → organization), never for the exceptions.
 * Only lemmas on a source list, or WordNet words with a sense outside the proper-noun-like
 * lexicographer files (person/location/group), are ranked — that drops "london", "israel".
 */

export type LemmaInputs = {
  /** wordfreq forms in wordfreq order (descending frequency) with their frequency. */
  forms: readonly { form: string; freq: number }[];
  /** NGSL families in rank order, then NAWL families: headword + its forms. */
  families: readonly { lemma: string; forms: readonly string[] }[];
  /** Every dictionary base word: WordNet ∪ NGSL ∪ NAWL ∪ CEFR-J headwords. */
  dictionary: ReadonlySet<string>;
  /** Headwords of NGSL, NAWL and CEFR-J: always rankable. */
  listed: ReadonlySet<string>;
  /** WordNet words whose only senses are person/location/group nouns (likely proper nouns). */
  properOnly: ReadonlySet<string>;
  /** WordNet words that also have a capitalized (proper-noun) entry: "john", "mark". */
  properUse: ReadonlySet<string>;
  /** Morphological lemma candidates for a word (verb, noun, adjective), excluding the word. */
  lemmatize: (word: string) => string[];
};

export type LemmaRow = {
  lemma: string;
  rank: number;
  freq: number;
  /** Forms aggregated into this lemma (including the lemma itself when it occurs). */
  forms: string[];
  /** Other ranked lemmas this lemma is also an inflected form of (found → find). */
  formOf: string[];
  /** Also a proper noun in WordNet (the placement bank skips these unless on a source list). */
  proper: boolean;
};

const WORD = /^[a-z]+(?:-[a-z]+)*$/;

/**
 * wordfreq splits contractions ("don't" → "don", "t"); NGSL lists the pieces as forms (t → not,
 * won → will). Pieces are never counted; neither they nor "won" are family-mapped.
 */
const CONTRACTION_PIECES = new Set([
  "s", "t", "m", "d", "re", "ve", "ll", "ain", "isn", "aren", "wasn", "weren", "haven", "hasn",
  "hadn", "didn", "doesn", "don", "wouldn", "couldn", "shouldn", "mustn", "needn", "shan",
  "mightn", "em", "cept",
]); // prettier-ignore
/** Real words NGSL lists under another family only because of a contraction (won't → will). */
const NOT_FAMILY_FORMS = new Set([...CONTRACTION_PIECES, "won"]);

/** British base spellings never folded: their "American" twin is another word. */
const NOT_BRITISH = new Set([
  "four", "hour", "pour", "your", "tour", "sour", "dour", "flour", "devour", "contour",
  "amour", "velour", "paramour", "troubadour", "advertise", "advise", "arise", "comprise",
  "compromise", "despise", "devise", "disguise", "enterprise", "excise", "exercise",
  "expertise", "franchise", "improvise", "merchandise", "premise", "revise", "supervise",
  "surmise", "surprise", "televise", "chastise", "precise", "concise", "wise", "rise",
  "otherwise", "likewise", "clockwise", "timbre",
]); // prettier-ignore

const BRITISH: readonly [RegExp, string][] = [
  [/^([a-z]{2,})our$/, "$1or"],
  [/^([a-z]{3,})isation$/, "$1ization"],
  [/^([a-z]{3,})ise$/, "$1ize"],
  [/^([a-z]{3,})iser$/, "$1izer"],
  [/^([a-z]{2,})yse$/, "$1yze"],
  [/^([a-z]{2,})tre$/, "$1ter"],
  [/^([a-z]{3,})ogue$/, "$1og"],
  [/^(def|off|lic|pret)ence$/, "$1ense"],
  [/^([a-z]*[aeiou][a-z]*[aeiou])ller$/, "$1ler"],
  [/^jewellery$/, "jewelry"],
];

/** The American spelling candidate of a British base spelling, or null. */
export function americanCandidate(word: string): string | null {
  if (NOT_BRITISH.has(word)) return null;
  for (const [re, by] of BRITISH) if (re.test(word)) return word.replace(re, by);
  return null;
}

export function rankLemmas(input: LemmaInputs): LemmaRow[] {
  const { dictionary, listed, properOnly, properUse, lemmatize } = input;
  const formFreq = new Map(input.forms.map((f) => [f.form, f.freq]));

  const family = new Map<string, string>();
  for (const f of input.families) family.set(f.lemma, f.lemma);
  for (const f of input.families) {
    for (const x of f.forms) {
      if (!family.has(x) && !NOT_FAMILY_FORMS.has(x)) family.set(x, f.lemma);
    }
  }

  const fold = (base: string): string => {
    const hit = family.get(base);
    if (hit) return hit;
    const am = americanCandidate(base);
    if (am && dictionary.has(am) && (formFreq.get(am) ?? 0) > (formFreq.get(base) ?? 0)) {
      return family.get(am) ?? am;
    }
    return base;
  };

  const resolve = (form: string): string | null => {
    const hit = family.get(form);
    if (hit) return hit;
    if (dictionary.has(form)) return fold(form);
    const base = lemmatize(form).find((c) => dictionary.has(c));
    return base ? fold(base) : null;
  };

  const rankable = (lemma: string) =>
    WORD.test(lemma) &&
    (listed.has(lemma) || (dictionary.has(lemma) && !properOnly.has(lemma))) &&
    (lemma.length > 1 || listed.has(lemma));

  const agg = new Map<string, { freq: number; forms: string[] }>();
  for (const { form, freq } of input.forms) {
    if (!WORD.test(form) || CONTRACTION_PIECES.has(form)) continue;
    const lemma = resolve(form);
    if (!lemma || !rankable(lemma)) continue;
    const a = agg.get(lemma) ?? { freq: 0, forms: [] };
    a.freq += freq;
    a.forms.push(form);
    agg.set(lemma, a);
  }

  const familyForms = new Map<string, Set<string>>();
  for (const f of input.families) {
    const set = familyForms.get(f.lemma) ?? new Set<string>();
    for (const x of f.forms) if (x !== f.lemma && !NOT_FAMILY_FORMS.has(x)) set.add(x);
    familyForms.set(f.lemma, set);
  }

  const rows = [...agg]
    .sort(([a, x], [b, y]) => y.freq - x.freq || (a < b ? -1 : 1))
    .map(([lemma, a], i) => ({
      lemma,
      rank: i + 1,
      freq: a.freq,
      forms: a.forms,
      formOf: [],
      proper: false,
    }));
  const ranked = new Set(rows.map((r) => r.lemma));
  for (const row of rows) {
    const of = new Set<string>();
    for (const [lemma, forms] of familyForms) {
      if (lemma !== row.lemma && forms.has(row.lemma) && ranked.has(lemma)) of.add(lemma);
    }
    for (const c of lemmatize(row.lemma)) {
      const m = family.get(c) ?? (dictionary.has(c) ? fold(c) : null);
      if (m && m !== row.lemma && ranked.has(m)) of.add(m);
    }
    (row as LemmaRow).formOf = [...of].sort();
    (row as LemmaRow).proper = properUse.has(row.lemma);
  }
  return rows;
}

// ---- lemmas-en.tsv ----------------------------------------------------------------------------

export const LEMMAS_HEADER = "lemma\trank\tfreq\tforms\tformOf\tproper";

export function formatLemmaRows(rows: readonly LemmaRow[]): string[] {
  return rows.map((r) =>
    [
      r.lemma,
      r.rank,
      r.freq.toExponential(6),
      r.forms.join(" "),
      r.formOf.join(" "),
      r.proper ? "1" : "",
    ].join("\t"),
  );
}

export function parseLemmaRows(text: string): LemmaRow[] {
  return text
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l !== LEMMAS_HEADER)
    .map((l) => {
      const [lemma, rank, freq, forms, formOf, proper] = l.split("\t");
      return {
        lemma: lemma!,
        rank: Number(rank),
        freq: Number(freq),
        forms: forms ? forms.split(" ") : [],
        formOf: formOf ? formOf.split(" ") : [],
        proper: proper === "1",
      };
    });
}
