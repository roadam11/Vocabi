/**
 * `pnpm content:near-words` — rewrites every sense's `nearWords` (docs/DECISIONS.md #34) from the
 * top-20k reference list, so content:check rule 12 passes. Run it after adding or editing senses.
 *
 * Options: --dir <content root> (default ./content), --reference <word list>
 * (default <content root>/reference/top20k-en.txt).
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { format, resolveConfig } from "prettier";
import { computeNearWords, type NearWordsInput, referenceForms } from "./near";

const { values } = parseArgs({
  options: { dir: { type: "string" }, reference: { type: "string" } },
});
const root = resolve(values.dir ?? "content");
const reference = readFileSync(
  resolve(values.reference ?? join(root, "reference", "top20k-en.txt")),
  "utf8",
)
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"));
const forms = referenceForms(reference);

type Record = NearWordsInput & { nearWords?: string[]; [key: string]: unknown };

/** Same key order, with nearWords right after answers; omitted when empty. */
function withNearWords(r: Record): Record {
  const near = computeNearWords(r, forms);
  const out = {} as Record;
  for (const [k, v] of Object.entries(r)) {
    if (k === "nearWords") continue;
    out[k] = v;
    if (k === "answers" && near.length > 0) out.nearWords = near;
  }
  return out;
}

const dir = join(root, "senses");
let changed = 0;
for (const name of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
  const path = join(dir, name);
  const before = readFileSync(path, "utf8");
  const records = (JSON.parse(before) as Record[]).map(withNearWords);
  const after = await format(JSON.stringify(records, null, 2), {
    ...(await resolveConfig(path)),
    filepath: path,
  });
  if (after !== before) {
    writeFileSync(path, after);
    changed++;
    console.log(`updated senses/${name}`);
  }
}
console.log(`content:near-words: ${changed} file(s) updated`);
