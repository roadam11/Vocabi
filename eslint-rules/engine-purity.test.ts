import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// Lints inline code through the real eslint.config.mjs so the src/engine/ scoping is tested too.
const eslint = new ESLint({ cwd: process.cwd() });

async function messages(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).filter((m) => m.ruleId === "no-restricted-syntax");
}

describe("engine purity lint (src/engine/**)", () => {
  const engineFile = "src/engine/__lint_probe__.ts";

  it.each([
    ["Date.now()", "export const t = Date.now();"],
    ["new Date()", "export const d = new Date();"],
    ["new Date (no parens)", "export const d = new Date;"],
    ["Math.random()", "export const r = Math.random();"],
  ])("flags %s", async (_name, code) => {
    const found = await messages(code, engineFile);
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toMatch(/inject `now` \/ `rng`/);
  });

  it("allows new Date(x) with an argument and injected now/rng", async () => {
    const code = [
      "export function f(now: number, rng: () => number) {",
      "  return [new Date(now), new Date(2026, 0, 1), rng()];",
      "}",
    ].join("\n");
    expect(await messages(code, engineFile)).toHaveLength(0);
  });

  it("does not apply outside src/engine/", async () => {
    const code = "export const t = [Date.now(), new Date(), Math.random()];";
    expect(await messages(code, "src/store/__lint_probe__.ts")).toHaveLength(0);
  });
});
