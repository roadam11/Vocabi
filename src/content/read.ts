import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** What a content file holds; each kind has its own schema in ./schema.ts. */
export type ContentKind = "sense" | "lexicon" | "placementItem" | "pseudoword" | "track" | "bands";

export type RawRecord = { kind: ContentKind; file: string; index: number; value: unknown };
export type FileError = { file: string; message: string };
export type RawContent = { records: RawRecord[]; fileErrors: FileError[] };

// docs/CONTENT.md layout, relative to the content root. Array files hold many records; a track
// file holds one. Nothing else under content/ (README, SOURCES, reference/) is read here.
const SOURCES: { kind: ContentKind; dir: string; file?: string; single?: boolean }[] = [
  { kind: "sense", dir: "senses" },
  { kind: "lexicon", dir: "lexicon", file: "distractors.json" },
  { kind: "placementItem", dir: "placement", file: "items.json" },
  { kind: "pseudoword", dir: "placement", file: "pseudo.json" },
  { kind: "track", dir: "tracks", single: true },
  { kind: "bands", dir: "placement", file: "bands.json", single: true },
];

function jsonFiles(root: string, dir: string, file?: string): string[] {
  const abs = join(root, dir);
  if (!existsSync(abs)) return [];
  if (file) return existsSync(join(abs, file)) ? [`${dir}/${file}`] : [];
  return readdirSync(abs)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => `${dir}/${f}`);
}

/**
 * Reads every content JSON file under `root` without validating records. `file` paths are
 * relative to `root` (e.g. "senses/dev.json"). Unreadable JSON or a wrong top-level shape becomes
 * a FileError, so the validator can report it instead of crashing.
 */
export function readContent(root: string): RawContent {
  const records: RawRecord[] = [];
  const fileErrors: FileError[] = [];
  for (const { kind, dir, file: name, single } of SOURCES) {
    for (const file of jsonFiles(root, dir, name)) {
      let value: unknown;
      try {
        value = JSON.parse(readFileSync(join(root, file), "utf8"));
      } catch (e) {
        fileErrors.push({ file, message: `invalid JSON: ${(e as Error).message}` });
        continue;
      }
      if (single) {
        records.push({ kind, file, index: 0, value });
      } else if (Array.isArray(value)) {
        value.forEach((v, index) => records.push({ kind, file, index, value: v }));
      } else {
        fileErrors.push({ file, message: "expected a JSON array of records" });
      }
    }
  }
  return { records, fileErrors };
}
