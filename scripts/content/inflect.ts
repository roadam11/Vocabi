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
