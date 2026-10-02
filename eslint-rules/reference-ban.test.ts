import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// Lints inline code through the real eslint.config.mjs: src/ must never touch content/reference/
// (docs/DECISIONS.md #28), including src/engine/, whose no-restricted-syntax block repeats the ban.
const eslint = new ESLint({ cwd: process.cwd() });

async function banned(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).filter((m) => /content\/reference/.test(m.message));
}

describe("content/reference ban (src/**)", () => {
  it.each([
    ["static import", 'import words from "../../content/reference/top20k-en.txt";'],
    ["fs path string", 'export const p = "content/reference/top20k-en.txt";'],
    ["windows separator", 'export const p = "content\\\\reference\\\\x.txt";'],
    ["template literal", "export const p = `${process.cwd()}/content/reference/x`;"],
    ["file name alone", 'export const p = "top20k-en.txt";'],
  ])("flags %s", async (_name, code) => {
    expect(await banned(code, "src/content/__lint_probe__.ts")).toHaveLength(1);
    expect(await banned(code, "src/engine/__lint_probe__.ts")).toHaveLength(1);
  });

  it("allows other content paths and does not apply to scripts/", async () => {
    expect(
      await banned('export const p = "content/senses";', "src/content/__lint_probe__.ts"),
    ).toHaveLength(0);
    const ref = 'export const p = "content/reference/top20k-en.txt";';
    expect(await banned(ref, "scripts/content/__lint_probe__.ts")).toHaveLength(0);
  });
});
