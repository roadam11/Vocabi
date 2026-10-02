/**
 * Likely English inflections of a word, for content:check rule 9 (a pseudoword must not be a real
 * word "including common inflections", docs/CONTENT.md). Errs on the side of generating a form
 * that doesn't exist ("runned") over missing one that does: an extra form only makes the
 * pseudoword check stricter. Words already ending in -ed/-ing are reference inflections themselves
 * and are not inflected again (no "abandoneding").
 */
export function inflections(word: string): string[] {
  const w = word.toLowerCase();
  if (!/^[a-z]+$/.test(w) || /(ed|ing)$/.test(w)) return [w];
  const out = new Set([w, `${w}s`, `${w}ly`]);
  const last = w.at(-1)!;
  const stem = w.slice(0, -1);
  if (/(s|x|z|ch|sh|o)$/.test(w)) out.add(`${w}es`);
  if (last === "e") {
    // hope → hoped/hoping, late → later/latest
    for (const s of ["d", "r", "st"]) out.add(w + s);
    out.add(`${stem}ing`);
  } else {
    for (const s of ["ed", "ing", "er", "est"]) out.add(w + s);
  }
  if (last === "y" && !/[aeiou]y$/.test(w)) {
    for (const s of ["ies", "ied", "ier", "iest", "ily"]) out.add(stem + s);
  }
  if (/le$/.test(w)) out.add(`${w.slice(0, -2)}ly`); // simple → simply
  if (/[^aeiou][aeiou][^aeiouwxy]$/.test(w)) {
    // stop → stopped/stopping, big → bigger/biggest
    for (const s of ["ed", "ing", "er", "est"]) out.add(w + last + s);
  }
  return [...out];
}

/**
 * Only the regular -s/-es, -ed, -ing forms of a likely base word, for nearWords (docs/DECISIONS.md
 * #34). Unlike `inflections`, this must not invent words: a junk form within one edit of an
 * accepted answer would turn a genuine typo into "wrong". So it skips words that already look
 * inflected (-s, -ed, -ing, -ly) and doubles a final consonant only in one-syllable words
 * (stop → stopped, but visit → visited). Missing a rare form only means typo tolerance applies.
 */
export function regularInflections(word: string): string[] {
  const w = word.toLowerCase();
  if (!/^[a-z]+$/.test(w) || /(s|ed|ing|ly)$/.test(w)) return [w];
  const stem = w.slice(0, -1);
  const out = new Set([w]);
  if (/[^aeiou]y$/.test(w)) {
    out.add(`${stem}ies`).add(`${stem}ied`).add(`${w}ing`);
  } else if (w.endsWith("e")) {
    out.add(`${w}s`).add(`${w}d`).add(`${stem}ing`);
  } else {
    out.add(/(x|z|ch|sh)$/.test(w) ? `${w}es` : `${w}s`);
    const oneSyllableCvc = /^[^aeiou]*[aeiou][^aeiouwxy]$/.test(w);
    const base = oneSyllableCvc ? w + w.at(-1)! : w;
    out.add(`${base}ed`).add(`${base}ing`);
  }
  return [...out];
}
