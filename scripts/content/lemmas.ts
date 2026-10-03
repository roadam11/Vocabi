/**
 * Lemma ranking for the placement bands (docs/DECISIONS.md #31): aggregates wordfreq word forms to
 * lemmas and ranks lemmas by summed frequency. Pure — the inputs (forms, families, dictionary,
 * lemmatizer) are injected; scripts/content/build-reference.ts wires the real ones.
 *
 * A form resolves to a lemma in this order (method recorded in content/SOURCES.md):
 * 1. NGSL 1.2 / NAWL 1.2 lemma families (authoritative for common words; they already fold
 *    British spellings and irregular forms: colour → color, felt → feel). Headwords map to
 *    themselves; a form listed in several families goes to the first (NGSL by rank, then NAWL).
 * 2. A dictionary base word (WordNet 3.1, NGSL, NAWL, CEFR-J) is its own lemma.
 * 3. Otherwise, for an -ing/-ed form, every WordNet verb whose spelling can produce it (plain,
 *    e-drop, doubling) competes and the most frequent wins (routing → route, not rout;
 *    docs/DECISIONS.md #63); any other form takes the WordNet "morphy" lemmatizer's first
 *    dictionary candidate (verb, then noun, then adjective). Nothing found → dropped.
 * 4. A British base spelling folds to its American variant when that variant is a dictionary
 *    word and more frequent in wordfreq (organisation → organization), never for the exceptions.
 * Only lemmas on a source list, or dictionary words that WordNet does not write only capitalized,
 * are ranked — that drops "london", "israel" (proper nouns).
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
  /** Words WordNet writes only capitalized (proper nouns: London, Paris). */
  properOnly: ReadonlySet<string>;
  /** WordNet words that also have a capitalized (proper-noun) entry: "john", "mark". */
  properUse: ReadonlySet<string>;
  /** WordNet verbs: only they can be the base of an -ing/-ed form in a frequency contest. */
  verbs: ReadonlySet<string>;
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

/** A one-syllable base ending consonant-vowel-consonant doubles before -ing/-ed (hop → hopping). */
const doublesFinal = (base: string) => /^[^aeiou]*[aeiou][bcdfgklmnprstvz]$/.test(base);

/**
 * Whether English spelling can turn `base` into `form` with -ing/-ed: plain (rout → routing),
 * e-drop (route → routing), or doubling (hop → hopping, never hoping). Other forms (-s, -ies,
 * irregulars) are left to the lemmatizer.
 */
export function canSpell(base: string, form: string): boolean {
  for (const suf of ["ing", "ed"]) {
    if (!form.endsWith(suf)) continue;
    if (form === base + suf) return !doublesFinal(base);
    if (base.endsWith("e") && form === base.slice(0, -1) + suf) return true;
    if (form === base + base.at(-1) + suf) return doublesFinal(base);
  }
  return true;
}

/**
 * Base lemma candidates of a form: the lemmatizer's (verb, noun, adjective), plus the -ing/-ed
 * alternatives it does not try — with or without a final e, and undoubled (routing → rout,
 * route; hopping → hop) — so that two bases that can both produce a form compete.
 */
function baseCandidates(form: string, lemmatize: (w: string) => string[]): string[] {
  const out = [...lemmatize(form)];
  const m = form.match(/^(.+?)(ing|ed)$/);
  if (m) {
    const stem = m[1]!;
    out.push(stem, `${stem}e`);
    if (/(.)\1$/.test(stem)) out.push(stem.slice(0, -1));
  }
  return [...new Set(out)].filter((c) => c !== form);
}

export function rankLemmas(input: LemmaInputs): LemmaRow[] {
  const { dictionary, listed, properOnly, properUse, verbs, lemmatize } = input;
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
    // -ing/-ed: every verb whose spelling can produce the form competes; the most frequent wins
    // (routing → route, not rout). Anything else keeps the lemmatizer's first dictionary word.
    const verbBases = /(ing|ed)$/.test(form)
      ? baseCandidates(form, lemmatize).filter(
          (c) => dictionary.has(c) && verbs.has(c) && canSpell(c, form),
        )
      : [];
    const base =
      verbBases.length > 0
        ? verbBases.reduce((best, c) =>
            (formFreq.get(c) ?? 0) > (formFreq.get(best) ?? 0) ? c : best,
          )
        : lemmatize(form).find((c) => dictionary.has(c));
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
