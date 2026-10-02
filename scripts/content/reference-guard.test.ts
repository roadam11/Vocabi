import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Second guard behind the ESLint ban (docs/DECISIONS.md #28): no file under src/ may mention the
// reference word list, whatever syntax it uses (e.g. path.join("content", "reference")).
const SRC = resolve(import.meta.dirname, "../../src");
const MENTION = /content["'`\s,+/\\]*reference|top20k/;

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)],
  );
}

describe("reference list stays out of src/", () => {
  it("the pattern catches the obvious spellings", () => {
    for (const s of ['"content/reference"', 'join("content", "reference")', "top20k-en.txt"]) {
      expect(s).toMatch(MENTION);
    }
  });

  it("no src/ file mentions content/reference or top20k", () => {
    const offenders = files(SRC).filter((f) => MENTION.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
