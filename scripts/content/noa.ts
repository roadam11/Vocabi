/**
 * Noa's candidate list (content/SOURCES.md): English headwords ONLY from her docx of
 * "headword – Hebrew translation" lines. Hebrew is used only to find where the headword ends
 * and to read annotation markers; it is never returned or written anywhere.
 */
const HEBREW = /[֐-׿]/;
const HEBREW_ALL = /[֐-׿יִ-ﭏ]/g;

/** Paragraph texts of a docx `word/document.xml`. */
export function docxParagraphs(xml: string): string[] {
  return xml.split(/<\/w:p>/).map((p) =>
    [...p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)]
      .map((m) => m[1]!)
      .join("")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .trim(),
  );
}

export type AnnotationKind = "or" | "looks-like" | "typo-for" | "written-as" | "corrected-from";

/** Annotation markers in her notes ("(או defer)" = "or defer", …), checked in order. */
const MARKERS: [RegExp, AnnotationKind][] = [
  [/^\s*או(\s|$)/, "or"],
  [/נראה\s*כ/, "looks-like"],
  [/שגיאת\s*כתיב/, "typo-for"],
  [/מתוקן\s*מ/, "corrected-from"],
  [/נכתב/, "written-as"],
];

export type Headword = {
  /** As written (case and spacing normalized). */
  original: string;
  annotation?: { kind: AnnotationKind; word: string };
};

/** Lowercase, single spaces, no numbering, no leading "to ", no trailing punctuation. */
export function normalizeHeadword(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/^\s*\d+[.)]\s*/, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^to /, "")
    .replace(/[\s.,;:!?'"-]+$/, "")
    .trim();
}

/** The English headword of one paragraph, or null (empty, notes, no Latin headword). */
export function parseLine(text: string): Headword | null {
  const ann = text.match(/^([^(֐-׿]*?)\s*\(([^)]*)\)/);
  if (ann && /[a-z]/i.test(ann[1]!)) {
    const note = ann[2]!;
    const word = normalizeHeadword(note.replace(HEBREW_ALL, " ").replace(/^[\s:-]+/, ""));
    const kind = MARKERS.find(([re]) => re.test(note))?.[1];
    const original = normalizeHeadword(ann[1]!);
    if (kind && /^[a-z][a-z' -]*$/.test(word)) return { original, annotation: { kind, word } };
    return original ? { original } : null;
  }
  const hebrewAt = text.search(HEBREW);
  const head = (hebrewAt < 0 ? text : text.slice(0, hebrewAt)).replace(/[\s–—-]+$/, "");
  if (!/^[\s\d.)]*[a-z]/i.test(head)) return null;
  const original = normalizeHeadword(head.split(/\s+[–—-]\s+|[–—]/)[0]!);
  return /^[a-z][a-z' -]*$/.test(original) ? { original } : null;
}

export type Resolution = {
  original: string;
  annotation?: Headword["annotation"];
  /** The headword kept for the list, or null while pending human review. */
  headword: string | null;
  status: "plain" | "applied" | "kept" | "pending";
  reason: string;
};

/**
 * Applies an annotation only when it names the correction ("looks like X", "typo for X") AND X
 * is a known word (top20k ∪ CEFR-J ∪ NAWL). "or X" is ambiguous (deffer: defer or differ?) and an
 * unknown X is unverifiable: both wait for review. "written as" / "corrected from" keep the
 * headword (the transcription already chose).
 */
export function resolve(h: Headword, known: ReadonlySet<string>): Resolution {
  const base = { original: h.original, annotation: h.annotation };
  if (!h.annotation) return { ...base, headword: h.original, status: "plain", reason: "" };
  const { kind, word } = h.annotation;
  if (kind === "written-as" || kind === "corrected-from") {
    return { ...base, headword: h.original, status: "kept", reason: `${kind}: headword kept` };
  }
  if (kind === "or") {
    return { ...base, headword: null, status: "pending", reason: `"or ${word}" is ambiguous` };
  }
  if (!known.has(word)) {
    return {
      ...base,
      headword: null,
      status: "pending",
      reason: `"${word}" not in reference lists`,
    };
  }
  return {
    ...base,
    headword: word,
    status: "applied",
    reason: `${kind} "${word}", in reference lists`,
  };
}

export type NoaList = {
  headwords: string[];
  resolutions: Resolution[];
  counts: { lines: number; duplicates: number; unique: number; pending: number };
};

export function extractNoa(paragraphs: readonly string[], known: ReadonlySet<string>): NoaList {
  const resolutions = paragraphs
    .map(parseLine)
    .filter((h): h is Headword => h !== null)
    .map((h) => resolve(h, known));
  const kept = resolutions.flatMap((r) => (r.headword ? [r.headword] : []));
  const headwords = [...new Set(kept)].sort();
  const pending = resolutions.filter((r) => r.status === "pending").length;
  return {
    headwords,
    resolutions,
    counts: {
      lines: resolutions.length,
      duplicates: kept.length - headwords.length,
      unique: headwords.length,
      pending,
    },
  };
}
