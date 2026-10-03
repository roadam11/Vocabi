import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Sense } from "../../src/content/schema";
import { readBandInputs } from "./bands";
import { type Fixture, failing, passing } from "./fixtures";
import { ERROR_CODES, formatDiagnostic, lemmaSlug, runCheck, WARNING_CODES } from "./validate";

const CONTENT = resolve(import.meta.dirname, "../../content");
const reference = readFileSync(join(CONTENT, "reference", "top20k-en.txt"), "utf8")
  .split("\n")
  .filter((l) => l && !l.startsWith("#"));

/** Writes a fixture's content tree to a fresh temp dir and runs the real reader + validator. */
function check(fixture: Fixture) {
  const root = mkdtempSync(join(tmpdir(), "vocabi-fixture-"));
  for (const [path, value] of Object.entries(fixture.files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), typeof value === "string" ? value : JSON.stringify(value));
  }
  return runCheck(root, { reference: fixture.reference ?? reference, bands: fixture.bands });
}

describe("content:check failing fixtures: the named rule fires, and nothing else", () => {
  it.each(failing.map((f) => [f.code, f.name, f] as const))("%s — %s", (code, _name, fixture) => {
    const diagnostics = check(fixture);
    expect(diagnostics.map((d) => d.code)).toEqual(
      diagnostics.length > 0 ? diagnostics.map(() => code) : [code],
    );
    const severity = code.startsWith("W_") ? "warning" : "error";
    expect(diagnostics.every((d) => d.severity === severity)).toBe(true);
  });

  it("covers every rule code at least once", () => {
    const covered = new Set(failing.map((f) => f.code));
    expect([...ERROR_CODES, ...WARNING_CODES].filter((c) => !covered.has(c))).toEqual([]);
  });
});

describe("content:check passing fixtures", () => {
  it.each(passing.map((f) => [f.name, f] as const))("%s", (_name, fixture) => {
    expect(check(fixture)).toEqual([]);
  });

  it("the exact-limit fixtures sit exactly at the limit", () => {
    const first = (name: string) =>
      (passing.find((f) => f.name.startsWith(name))!.files["senses/a.json"] as Sense[])[0]!;
    const he = first("he.primary of exactly 40").he.primary;
    expect([...new Intl.Segmenter("he", { granularity: "grapheme" }).segment(he)].length).toBe(40);
    expect([...he].length).toBeGreaterThan(40);
    expect([...first("example.en of exactly 120").example.en].length).toBe(120);
  });

  // Rule 9 over the real 50 pseudowords (each against ~60k reference forms) takes a few seconds.
  it(
    "the repo's content/ (20 devOnly senses, real placement bank) is clean",
    { timeout: 30_000 },
    () => {
      expect(
        runCheck(CONTENT, { reference, bands: readBandInputs(join(CONTENT, "reference")) }),
      ).toEqual([]);
    },
  );
});

describe("content:check output", () => {
  it("formats as file › id › RULE_CODE › message", () => {
    const [d] = check(failing.find((f) => f.code === "CLOZE_BLANK_COUNT")!);
    expect(formatDiagnostic(d!)).toBe(
      'content/senses/a.json › abandon.v.01 › CLOZE_BLANK_COUNT › cloze.en has 2 "___" blanks; exactly 1 required',
    );
  });

  it("names records that fail the schema by id, or by index without one", () => {
    const [d] = check({ name: "no id", files: { "senses/a.json": [{ lemma: "x" }] } });
    expect(d).toMatchObject({ code: "SCHEMA", id: "#0", file: "senses/a.json" });
  });

  it("lists errors before warnings", () => {
    const fixture: Fixture = {
      name: "mixed",
      files: {
        "senses/a.json": [
          {
            ...(
              failing.find((f) => f.code === "W_CLOZE_INFLECTION")!.files[
                "senses/a.json"
              ] as object[]
            )[0],
          },
        ],
        "senses/b.json": [{ lemma: "x" }],
      },
    };
    expect(check(fixture).map((d) => d.severity)).toEqual(["error", "warning"]);
  });
});

describe("lemmaSlug", () => {
  it.each([
    ["abandon", "abandon"],
    ["get along with", "get-along-with"],
    ["well-known", "well-known"],
    ["Don’t", "don-t"],
  ])("%s → %s", (lemma, slug) => {
    expect(lemmaSlug(lemma)).toBe(slug);
  });
});
