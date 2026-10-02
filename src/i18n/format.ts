/** Fills `{name}` placeholders in he.ts templates. Unknown placeholders are left as-is. */
export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}

/**
 * Like `format`, but values may be non-strings (e.g. an `<En>` element), returning the pieces in
 * order so a Hebrew sentence can embed bidi-isolated English without string concatenation.
 */
export function interpolate<T>(template: string, values: Record<string, T>): Array<string | T> {
  const out: Array<string | T> = [];
  let last = 0;
  for (const m of template.matchAll(/\{(\w+)\}/g)) {
    const name = m[1]!;
    if (!(name in values)) continue;
    if (m.index > last) out.push(template.slice(last, m.index));
    out.push(values[name]!);
    last = m.index + m[0].length;
  }
  if (last < template.length) out.push(template.slice(last));
  return out;
}
