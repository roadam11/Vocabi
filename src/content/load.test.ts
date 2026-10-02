import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadContent, selectLoadable } from "./load";
import { Sense } from "./schema";

const base = {
  id: "abandon.v.01",
  lemma: "abandon",
  pos: "v",
  senseEn: "to leave something and not come back",
  he: { primary: "לנטוש", alternates: [] },
  knowledge: "rec",
  layers: ["recognition"],
  example: { en: "The crew had to abandon the ship.", he: "הצוות נאלץ לנטוש את הספינה." },
  answers: ["abandon"],
  freqBand: "B4",
  tracks: ["amirnet"],
  verification: { status: "verified", reviewedBy: "roie", reviewedAt: "2026-10-02" },
};
const sense = (id: string, over: object = {}) => ({ ...base, id, ...over });

function contentDir(senses: object[], order: string[]) {
  const root = mkdtempSync(join(tmpdir(), "vocabi-content-"));
  mkdirSync(join(root, "senses"));
  mkdirSync(join(root, "tracks"));
  writeFileSync(join(root, "senses", "a.json"), JSON.stringify(senses));
  writeFileSync(join(root, "tracks", "amirnet.json"), JSON.stringify({ id: "amirnet", order }));
  return root;
}

describe("selectLoadable", () => {
  const records = [
    { id: "v", verification: { status: "verified" } },
    { id: "d", verification: { status: "draft" } },
    { id: "r", verification: { status: "rejected" } },
    { id: "dev", verification: { status: "verified" }, devOnly: true },
    { id: "devDraft", verification: { status: "draft" }, devOnly: true },
  ];
  const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

  it("loads only verified records, never devOnly ones outside development", () => {
    expect(ids(selectLoadable(records, { includeDevOnly: false }))).toEqual(["v"]);
  });

  it("adds verified devOnly fixtures when asked", () => {
    expect(ids(selectLoadable(records, { includeDevOnly: true }))).toEqual(["v", "dev"]);
  });
});

describe("loadContent", () => {
  const root = contentDir(
    [
      sense("abandon.v.01"),
      sense("abandon.v.02", { verification: { status: "draft" } }),
      sense("abandon.v.03", { devOnly: true }),
    ],
    ["abandon.v.03", "abandon.v.02", "abandon.v.01"],
  );

  it("returns typed verified senses and a track order limited to loaded senses", () => {
    const prod = loadContent({ root, includeDevOnly: false });
    expect(prod.senses.map((s) => s.id)).toEqual(["abandon.v.01"]);
    expect(prod.tracks).toEqual([{ id: "amirnet", order: ["abandon.v.01"] }]);
    expect(prod.lexicon).toEqual([]);
    expect(prod.pseudowords).toEqual([]);
  });

  it("includes devOnly fixtures in development", () => {
    const dev = loadContent({ root, includeDevOnly: true });
    expect(dev.senses.map((s) => s.id)).toEqual(["abandon.v.01", "abandon.v.03"]);
    expect(dev.tracks[0]?.order).toEqual(["abandon.v.03", "abandon.v.01"]);
  });

  it("defaults to excluding devOnly outside NODE_ENV=development (tests, production)", () => {
    expect(loadContent({ root }).senses.map((s) => s.id)).toEqual(["abandon.v.01"]);
  });

  it("throws on schema-invalid content instead of loading it", () => {
    const bad = contentDir([sense("abandon.v.01", { pos: "verb" })], []);
    expect(() => loadContent({ root: bad })).toThrow(/content:check/);
  });

  it("loads the repo's own content", () => {
    expect(() => loadContent({ includeDevOnly: true })).not.toThrow();
  });
});

describe("Sense schema", () => {
  it("accepts the base record", () => {
    expect(Sense.safeParse(base).success).toBe(true);
  });

  it.each([
    ["unknown key", { lemmma: "x" }],
    ["production without prod", { layers: ["recognition", "production"] }],
    ["prod without production", { knowledge: "prod" }],
    ["missing recognition", { layers: ["context"] }],
    ["duplicate layer", { layers: ["recognition", "recognition"] }],
    ["verified without reviewer", { verification: { status: "verified" } }],
    ["bad band", { freqBand: "B6" }],
    [
      "bad date",
      { verification: { status: "verified", reviewedBy: "roie", reviewedAt: "10/10/2026" } },
    ],
  ])("rejects %s", (_name, over) => {
    expect(Sense.safeParse({ ...base, ...over }).success).toBe(false);
  });
});
