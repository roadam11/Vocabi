/**
 * content:check rules (docs/CONTENT.md "Validator rules"). Pure over already-read content: the CLI
 * (check.ts) and the tests (validate.test.ts) both call runCheck / validateContent.
 */
import { isEligibleRecognitionDistractor } from "../../src/engine/distractors";
import {
  glossesCollide,
  normalizeEn,
  normalizeEnLoose,
} from "../../src/engine/text";
import { readContent, type RawContent, type RawRecord } from "../../src/content/read";
import {
  LexiconEntry,
  PlacementBands,
  PlacementItem,
  Pseudoword,
  Sense,
  SHIPPING_TRACK,
  Track,
} from "../../src/content/schema";
import { type BandInputs, computeBands } from "./bands";
import { pseudoContext, pseudowordProblems } from "./pseudo-rule";
import { computeNearWords, referenceForms } from "./near";

export const ERROR_CODES = [
  "SCHEMA",
  "ID_DUPLICATE",
  "ID_MISMATCH",
  "TRACK_REF",
  "HE_LATIN_TOUCHING",
  "EN_HEBREW",
  "HE_DASH_DIGITS",
  "CLOZE_BLANK_COUNT",
  "CLOZE_GIVEAWAY",
  "CLOZE_EQUALS_EXAMPLE",
  "CLOZE_ANSWER_FORM",
  "CLOZE_DISTRACTORS",
  "CONTEXT_REQUIRES_CLOZE",
  "SHIPPING_UNVERIFIED",
  "PSEUDO_REAL_WORD",
  "PSEUDO_LENGTH",
  "PSEUDO_NEAR_WORD",
  "LENGTH_HE_PRIMARY",
  "LENGTH_EXAMPLE_EN",
  "RECOGNITION_DISTRACTORS",
  "NEAR_WORDS_STALE",
  "BANDS_STALE",
  "PLACEMENT_BAND",
] as const;
export const WARNING_CODES = ["W_GLOSS_COLLISION", "W_CLOZE_INFLECTION"] as const;
export type RuleCode = (typeof ERROR_CODES)[number] | (typeof WARNING_CODES)[number];

export type Diagnostic = {
  severity: "error" | "warning";
  file: string;
  id: string;
  code: RuleCode;
  message: string;
};

// CALIBRATE-free limits straight from docs/CONTENT.md.
const HE_PRIMARY_MAX = 40;
const EXAMPLE_EN_MAX = 120;
const MIN_RECOGNITION_DISTRACTORS = 3;

// ---- text predicates -------------------------------------------------------------------------

const HE_LETTER = "[\\u05D0-\\u05EA\\u05F0-\\u05F2\\uFB1D-\\uFB4F]";
// What may sit between a Hebrew letter and a Latin one and still count as "touching": niqqud and
// cantillation, maqaf, hyphens, geresh/gershayim (and their ASCII look-alikes), invisible marks.
const JOINER = "[\\u0591-\\u05C7\\u05F3\\u05F4\\-\\u2010\\u2011'\"\\u200B-\\u200F]*";
const LATIN = "\\p{Script=Latin}";
const LATIN_TOUCHING_HEBREW = new RegExp(
  `${HE_LETTER}${JOINER}${LATIN}|${LATIN}${JOINER}${HE_LETTER}`,
  "u",
);
const ANY_HEBREW = /[֐-׿יִ-ﭏ]/;
const DASH_BETWEEN_DIGITS = /\d\s*[–—]\s*\d/;
const BLANK = /_{3,}/g;

const graphemes = (s: string) =>
  [...new Intl.Segmenter("he", { granularity: "grapheme" }).segment(s)].length;
const codePoints = (s: string) => [...s].length;
const tokens = (s: string) =>
  normalizeEnLoose(s)
    .split(/[^\p{L}\p{N}']+/u)
    .filter(Boolean);

/** True if `phrase` occurs in `sentence` as whole words (case/hyphen/space-insensitive). */
function containsPhrase(sentence: string, phrase: string): boolean {
  const s = tokens(sentence);
  const p = tokens(phrase);
  if (p.length === 0) return false;
  return s.some((_, i) => p.every((t, j) => s[i + j] === t));
}

/** -s / -ed / -ing class of a form (first word for phrases: "gets along with" → s). */
function suffixClass(form: string): "ing" | "ed" | "s" | "base" {
  const w = tokens(form)[0] ?? "";
  if (w.endsWith("ing")) return "ing";
  if (w.endsWith("ed")) return "ed";
  if (/[^s]s$/.test(w)) return "s";
  return "base";
}

/** `<lemma-slug>.<pos>.<NN>`: lowercase, runs of other characters become "-". */
export function lemmaSlug(lemma: string): string {
  return normalizeEn(lemma)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ---- validation ------------------------------------------------------------------------------

type Parsed<T> = { file: string; index: number; value: T };

export type CheckOptions = {
  /** Top ~20k English words (content/reference/top20k-en.txt), for rules 9 and 12. */
  reference: readonly string[];
  /**
   * Lemma ranks + NAWL headwords (content/reference/), for rules 13-14. Omitted (test fixtures
   * that are not about bands), both rules are skipped.
   */
  bands?: BandInputs;
};

export function validateContent(
  raw: RawContent,
  { reference, bands: bandInputs }: CheckOptions,
): Diagnostic[] {
  const out: Diagnostic[] = [];
  const error = (file: string, id: string, code: RuleCode, message: string) =>
    out.push({ severity: "error", file, id, code, message });
  const warn = (file: string, id: string, code: RuleCode, message: string) =>
    out.push({ severity: "warning", file, id, code, message });

  for (const f of raw.fileErrors) error(f.file, "-", "SCHEMA", f.message);

  // Rule 1: schema. Records that fail it are reported once and skipped by every other rule.
  const senses: Parsed<Sense>[] = [];
  const lexicon: Parsed<LexiconEntry>[] = [];
  const items: Parsed<PlacementItem>[] = [];
  const pseudos: Parsed<Pseudoword>[] = [];
  const tracks: Parsed<Track>[] = [];
  const bandFiles: Parsed<PlacementBands>[] = [];
  const schemas = {
    sense: Sense,
    lexicon: LexiconEntry,
    placementItem: PlacementItem,
    pseudoword: Pseudoword,
    track: Track,
    bands: PlacementBands,
  };
  const buckets = {
    sense: senses,
    lexicon,
    placementItem: items,
    pseudoword: pseudos,
    track: tracks,
    bands: bandFiles,
  };
  for (const r of raw.records) {
    const result = schemas[r.kind].safeParse(r.value);
    if (!result.success) {
      const issues = result.error.issues.map(
        (i) => `${i.path.join(".") || "(root)"}: ${i.message}`,
      );
      error(r.file, recordLabel(r), "SCHEMA", issues.join("; "));
      continue;
    }
    (buckets[r.kind] as Parsed<unknown>[]).push({
      file: r.file,
      index: r.index,
      value: result.data,
    });
  }

  // Rule 1: unique ids. Senses and lexicon entries share the `<lemma>.<pos>.<NN>` namespace;
  // placement items and pseudowords share the placement bank's.
  for (const group of [[...senses, ...lexicon], [...items, ...pseudos], tracks] as Parsed<{
    id: string;
  }>[][]) {
    const seen = new Map<string, string>();
    for (const r of group) {
      const first = seen.get(r.value.id);
      if (first) error(r.file, r.value.id, "ID_DUPLICATE", `id already used in ${first}`);
      else seen.set(r.value.id, r.file);
    }
  }

  // Rule 1: id matches lemma and pos.
  for (const r of [...senses, ...lexicon]) {
    const { id, lemma, pos } = r.value;
    const prefix = `${lemmaSlug(lemma)}.${pos}.`;
    if (!id.startsWith(prefix) || !/^\d{2}$/.test(id.slice(prefix.length))) {
      error(r.file, id, "ID_MISMATCH", `expected "${prefix}NN" for lemma "${lemma}" (pos ${pos})`);
    }
  }

  // Rule 1: track references (a track's order and the senses' `tracks` must agree).
  const senseById = new Map(senses.map((s) => [s.value.id, s.value]));
  const trackIds = new Set(tracks.map((t) => t.value.id));
  for (const t of tracks) {
    const { id: trackId, order } = t.value;
    if (t.file !== `tracks/${trackId}.json`) {
      error(t.file, trackId, "TRACK_REF", `track "${trackId}" must live in tracks/${trackId}.json`);
    }
    const seen = new Set<string>();
    for (const id of order) {
      const s = senseById.get(id);
      if (seen.has(id)) error(t.file, trackId, "TRACK_REF", `"${id}" appears twice in order`);
      else if (!s) error(t.file, trackId, "TRACK_REF", `order lists unknown sense "${id}"`);
      else if (!s.tracks.includes(trackId)) {
        error(t.file, trackId, "TRACK_REF", `order lists "${id}", whose tracks omit "${trackId}"`);
      }
      seen.add(id);
    }
    for (const s of senses) {
      if (s.value.tracks.includes(trackId) && !seen.has(s.value.id)) {
        error(s.file, s.value.id, "TRACK_REF", `in track "${trackId}" but missing from its order`);
      }
    }
  }
  for (const s of senses) {
    for (const trackId of s.value.tracks) {
      if (!trackIds.has(trackId)) {
        error(s.file, s.value.id, "TRACK_REF", `track "${trackId}" has no tracks/${trackId}.json`);
      }
    }
  }

  // Rules 2 and 3: script mixing and dashes.
  const checkHe = (file: string, id: string, field: string, value: string) => {
    if (LATIN_TOUCHING_HEBREW.test(value)) {
      error(
        file,
        id,
        "HE_LATIN_TOUCHING",
        `${field}: Latin letters touch Hebrew letters in "${value}"`,
      );
    }
    if (DASH_BETWEEN_DIGITS.test(value)) {
      error(
        file,
        id,
        "HE_DASH_DIGITS",
        `${field}: en/em dash between digits in "${value}" (use "-" or "עד")`,
      );
    }
  };
  const checkEn = (file: string, id: string, field: string, value: string) => {
    if (ANY_HEBREW.test(value))
      error(file, id, "EN_HEBREW", `${field}: Hebrew in English text "${value}"`);
  };
  for (const { file, value: s } of senses) {
    checkHe(file, s.id, "he.primary", s.he.primary);
    s.he.alternates.forEach((a, i) => checkHe(file, s.id, `he.alternates[${i}]`, a));
    checkHe(file, s.id, "example.he", s.example.he);
    const en: [string, string][] = [
      ["lemma", s.lemma],
      ["senseEn", s.senseEn],
      ["example.en", s.example.en],
      ...(s.cloze
        ? ([
            ["cloze.en", s.cloze.en],
            ["cloze.answerForm", s.cloze.answerForm],
          ] as [string, string][])
        : []),
      ...listFields(s, ["clozeDistractors", "answers", "collocations", "family", "synonyms"]),
    ];
    for (const [field, v] of en) checkEn(file, s.id, field, v);
  }
  for (const { file, value: l } of lexicon) {
    checkHe(file, l.id, "he.primary", l.he.primary);
    (l.he.alternates ?? []).forEach((a, i) => checkHe(file, l.id, `he.alternates[${i}]`, a));
    for (const [field, v] of [
      ["lemma", l.lemma] as [string, string],
      ...listFields(l, ["family", "synonyms"]),
    ]) {
      checkEn(file, l.id, field, v);
    }
  }
  for (const { file, value: p } of items) checkEn(file, p.id, "lemma", p.lemma);
  for (const { file, value: p } of pseudos) checkEn(file, p.id, "text", p.text);

  // Rules 4-7: cloze.
  for (const { file, value: s } of senses) {
    const { cloze, clozeDistractors: distractors } = s;
    if (cloze) {
      const blanks = cloze.en.match(BLANK)?.length ?? 0;
      if (blanks !== 1) {
        error(
          file,
          s.id,
          "CLOZE_BLANK_COUNT",
          `cloze.en has ${blanks} "___" blanks; exactly 1 required`,
        );
      }
      const unblanked = cloze.en.replace(BLANK, " ");
      const given = [s.lemma, ...s.answers].filter((a) => containsPhrase(unblanked, a));
      if (given.length > 0) {
        error(file, s.id, "CLOZE_GIVEAWAY", `cloze.en gives the answer away: ${quoteList(given)}`);
      }
      if (blanks === 1) {
        const filled = cloze.en.replace(BLANK, cloze.answerForm);
        if (tokens(filled).join(" ") === tokens(s.example.en).join(" ")) {
          error(file, s.id, "CLOZE_EQUALS_EXAMPLE", "cloze.en with the blank filled is example.en");
        }
      }
      if (!s.answers.some((a) => normalizeEn(a) === normalizeEn(cloze.answerForm))) {
        error(
          file,
          s.id,
          "CLOZE_ANSWER_FORM",
          `cloze.answerForm "${cloze.answerForm}" is not in answers`,
        );
      }
    }
    if (distractors) {
      const problems: string[] = [];
      if (distractors.length !== 3)
        problems.push(`${distractors.length} given, exactly 3 required`);
      const norm = distractors.map(normalizeEnLoose);
      if (new Set(norm).size !== norm.length) problems.push("duplicates");
      const answers = new Set(s.answers.map(normalizeEnLoose));
      const family = new Set((s.family ?? []).map(normalizeEnLoose));
      distractors.forEach((d, i) => {
        if (norm[i] === normalizeEnLoose(s.lemma)) problems.push(`"${d}" is the lemma`);
        else if (answers.has(norm[i]!)) problems.push(`"${d}" is an accepted answer`);
        if (family.has(norm[i]!)) problems.push(`"${d}" is in the word family`);
      });
      if (problems.length > 0)
        error(file, s.id, "CLOZE_DISTRACTORS", `clozeDistractors: ${problems.join("; ")}`);
    }
    if (s.layers.includes("context") && (!cloze || !distractors)) {
      error(
        file,
        s.id,
        "CONTEXT_REQUIRES_CLOZE",
        "context layer requires cloze and clozeDistractors",
      );
    }
    if (cloze && distractors) {
      const target = suffixClass(cloze.answerForm);
      const off = distractors.filter((d) => suffixClass(d) !== target);
      if (off.length > 0) {
        warn(
          file,
          s.id,
          "W_CLOZE_INFLECTION",
          `clozeDistractors ${quoteList(off)} differ in inflection from answerForm "${cloze.answerForm}"`,
        );
      }
    }
  }

  // Rule 8: shipping senses are verified (docs/DECISIONS.md #11: shipping = tracks has "amirnet").
  const shipping = (s: Sense) => s.tracks.includes(SHIPPING_TRACK);
  for (const { file, value: s } of senses) {
    if (shipping(s) && s.verification.status !== "verified") {
      error(
        file,
        s.id,
        "SHIPPING_UNVERIFIED",
        `in shipping track "${SHIPPING_TRACK}" but status is "${s.verification.status}"`,
      );
    }
  }

  // Rule 9: pseudowords.
  if (pseudos.length > 0) {
    const ctx = pseudoContext(reference, [
      ...senses.flatMap(({ value: s }) => [
        s.lemma,
        ...s.answers,
        ...(s.family ?? []),
        ...(s.synonyms ?? []),
      ]),
      ...lexicon.flatMap(({ value: l }) => [l.lemma, ...(l.family ?? []), ...(l.synonyms ?? [])]),
      ...items.map(({ value: p }) => p.lemma),
    ]);
    for (const { file, value: p } of pseudos) {
      for (const { code, message } of pseudowordProblems(p.text, ctx)) {
        error(file, p.id, code, message);
      }
    }
  }

  // Rule 10: lengths.
  for (const { file, value: s } of senses) {
    const he = graphemes(s.he.primary);
    if (he > HE_PRIMARY_MAX)
      error(
        file,
        s.id,
        "LENGTH_HE_PRIMARY",
        `he.primary is ${he} characters; max ${HE_PRIMARY_MAX}`,
      );
    const en = codePoints(s.example.en);
    if (en > EXAMPLE_EN_MAX)
      error(
        file,
        s.id,
        "LENGTH_EXAMPLE_EN",
        `example.en is ${en} characters; max ${EXAMPLE_EN_MAX}`,
      );
  }
  for (const { file, value: l } of lexicon) {
    const he = graphemes(l.he.primary);
    if (he > HE_PRIMARY_MAX)
      error(
        file,
        l.id,
        "LENGTH_HE_PRIMARY",
        `he.primary is ${he} characters; max ${HE_PRIMARY_MAX}`,
      );
  }

  // Rule 11: ≥ 3 eligible recognition distractors per verified shipping sense, from other
  // verified shipping senses and verified lexicon entries (docs/DECISIONS.md #3). devOnly records
  // count only for devOnly targets, mirroring what each build actually loads.
  const verifiedShipping = senses
    .map((s) => s.value)
    .filter((s) => shipping(s) && s.verification.status === "verified");
  const verifiedLexicon = lexicon
    .map((l) => l.value)
    .filter((l) => l.verification.status === "verified");
  for (const { file, value: target } of senses) {
    if (!verifiedShipping.includes(target)) continue;
    const visible = (c: { devOnly?: boolean }) => target.devOnly === true || c.devOnly !== true;
    const pool = [
      ...verifiedShipping.filter((c) => c !== target && visible(c)),
      ...verifiedLexicon.filter(visible),
    ];
    // The 4 options are Hebrew glosses, so the distractors must not collide with each other
    // either. Greedy pick in pool order: may undercount, never overcounts (safe for a gate).
    const eligible: typeof pool = [];
    for (const c of pool) {
      if (
        isEligibleRecognitionDistractor(target, c) &&
        !eligible.some((e) => glossesCollide(e.he, c.he))
      ) {
        eligible.push(c);
      }
    }
    if (eligible.length < MIN_RECOGNITION_DISTRACTORS) {
      error(
        file,
        target.id,
        "RECOGNITION_DISTRACTORS",
        `${eligible.length} eligible recognition distractors with distinct glosses (${pos(target)}, band ±1); ${MIN_RECOGNITION_DISTRACTORS} required — add lexicon entries${eligible.length ? `; have ${quoteList(eligible.map((c) => c.lemma))}` : ""}`,
      );
    }
  }

  // Rule 12: nearWords is exactly what the reference list gives today (docs/DECISIONS.md #34).
  if (senses.length > 0) {
    const forms = referenceForms(reference);
    for (const { file, value: s } of senses) {
      const expected = computeNearWords(s, forms);
      const actual = s.nearWords ?? [];
      if (expected.join("\n") === actual.join("\n")) continue;
      const missing = expected.filter((w) => !actual.includes(w));
      const extra = actual.filter((w) => !expected.includes(w));
      const parts = [
        missing.length ? `missing ${quoteList(missing)}` : "",
        extra.length ? `unexpected ${quoteList(extra)}` : "",
        !missing.length && !extra.length ? "not sorted" : "",
      ].filter(Boolean);
      error(
        file,
        s.id,
        "NEAR_WORDS_STALE",
        `nearWords out of date (${parts.join("; ")}) — run pnpm content:near-words`,
      );
    }
  }

  // Warning: Hebrew gloss collisions between senses in the same track.
  for (const trackId of new Set(senses.flatMap((s) => s.value.tracks))) {
    const inTrack = senses.filter((s) => s.value.tracks.includes(trackId));
    inTrack.forEach((b, j) => {
      for (const a of inTrack.slice(0, j)) {
        if (glossesCollide(a.value.he, b.value.he)) {
          warn(
            b.file,
            b.value.id,
            "W_GLOSS_COLLISION",
            `Hebrew gloss collides with "${a.value.id}" in track "${trackId}"`,
          );
        }
      }
    });
  }

  // Rules 13-14: bands.json and the placement items match the lemma partition (DECISIONS #31).
  if (bandInputs) {
    const { band, sizes } = computeBands(bandInputs);
    const stored = bandFiles[0]?.value;
    const hasFile = raw.records.some((r) => r.kind === "bands");
    if (!hasFile) {
      error("placement/bands.json", "-", "BANDS_STALE", "missing; run pnpm content:bands");
    } else if (stored && JSON.stringify(stored) !== JSON.stringify(sizes)) {
      error(
        "placement/bands.json",
        "-",
        "BANDS_STALE",
        `is ${JSON.stringify(stored)}, expected ${JSON.stringify(sizes)}; run pnpm content:bands`,
      );
    }
    for (const { file, value: p } of items) {
      const b = band.get(normalizeEn(p.lemma));
      if (b !== p.band) {
        error(
          file,
          p.id,
          "PLACEMENT_BAND",
          b ? `"${p.lemma}" is in ${b}, not ${p.band}` : `"${p.lemma}" is in no band`,
        );
      }
    }
  }

  return out;
}

const pos = (s: Sense) => `pos ${s.pos}, ${s.freqBand}`;
const quoteList = (xs: string[]) => xs.map((x) => `"${x}"`).join(", ");

function listFields<T extends object>(r: T, keys: (keyof T & string)[]): [string, string][] {
  return keys.flatMap((k) =>
    ((r[k] as string[] | undefined) ?? []).map((v, i) => [`${k}[${i}]`, v] as [string, string]),
  );
}

function recordLabel(r: RawRecord): string {
  const v = r.value as { id?: unknown } | null;
  return typeof v === "object" && v !== null && typeof v.id === "string" ? v.id : `#${r.index}`;
}

/** Reads `root` and validates it. Diagnostics are sorted: errors first, then by file. */
export function runCheck(root: string, options: CheckOptions): Diagnostic[] {
  return validateContent(readContent(root), options).sort(
    (a, b) =>
      (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1) ||
      a.file.localeCompare(b.file),
  );
}

export function formatDiagnostic(d: Diagnostic, prefix = "content/"): string {
  return `${prefix}${d.file} › ${d.id} › ${d.code} › ${d.message}`;
}
