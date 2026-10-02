import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { contrastRatio, parseThemeTokens } from "./contrast";

// tokens.css is the single source of truth; a failure here means "fix the token, not the component"
// (docs/DESIGN.md "Tokens").
const css = readFileSync(fileURLToPath(new URL("../app/tokens.css", import.meta.url)), "utf8");
const themes = parseThemeTokens(css);

const TEXT = 4.5; // normal text
const NON_TEXT = 3; // large text, control boundaries, focus ring (WCAG 1.4.3 / 1.4.11)

/** Every foreground/background pair the components actually use, with its minimum ratio. */
const PAIRS: Array<{ fg: string; bg: string; min: number; use: string }> = [
  ...["--bg", "--surface", "--surface-2"].flatMap((bg) => [
    { fg: "--ink", bg, min: TEXT, use: "body text" },
    { fg: "--ink-2", bg, min: TEXT, use: "secondary text" },
    { fg: "--accent", bg, min: TEXT, use: "accent text / links" },
    { fg: "--success", bg, min: TEXT, use: "success feedback text" },
    { fg: "--danger", bg, min: TEXT, use: "danger feedback text" },
    { fg: "--line-strong", bg, min: NON_TEXT, use: "control boundary" },
    { fg: "--accent", bg, min: NON_TEXT, use: "focus ring / selected boundary" },
  ]),
  { fg: "--on-accent", bg: "--accent", min: TEXT, use: "primary button label" },
  { fg: "--on-accent", bg: "--danger", min: TEXT, use: "danger button label" },
  { fg: "--on-accent", bg: "--success", min: TEXT, use: "success badge label" },
  { fg: "--ink", bg: "--accent-soft", min: TEXT, use: "selected chip / accent tint text" },
  { fg: "--accent", bg: "--accent-soft", min: NON_TEXT, use: "selected chip boundary" },
  { fg: "--accent", bg: "--line", min: NON_TEXT, use: "ring/progress fill vs its track" },
  { fg: "--ink", bg: "--success-soft", min: TEXT, use: "correct option text" },
  { fg: "--success", bg: "--success-soft", min: TEXT, use: "correct option label" },
  { fg: "--ink", bg: "--danger-soft", min: TEXT, use: "wrong option text" },
  { fg: "--danger", bg: "--danger-soft", min: TEXT, use: "wrong option label" },
];

describe("contrast helpers", () => {
  it("matches known WCAG values", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
    // Measured values quoted in docs/DESIGN.md.
    expect(contrastRatio("#6F695E", "#F7F4EC")).toBeCloseTo(4.95, 2);
    expect(contrastRatio("#FFFFFF", "#677042")).toBeCloseTo(5.29, 2);
  });
});

describe("design tokens", () => {
  it("defines the same tokens in light and dark", () => {
    expect(Object.keys(themes.dark).sort()).toEqual(Object.keys(themes.light).sort());
  });

  it("keeps the manual/scoped theme blocks identical to the base ones", () => {
    expect(themes.darkManual).toEqual(themes.dark);
    expect(themes.lightManual).toEqual(themes.light);
  });

  for (const mode of ["light", "dark"] as const) {
    describe(mode, () => {
      for (const { fg, bg, min, use } of PAIRS) {
        it(`${fg} on ${bg} ≥ ${min}:1 (${use})`, () => {
          const f = themes[mode][fg];
          const b = themes[mode][bg];
          expect(f, `${fg} missing`).toBeDefined();
          expect(b, `${bg} missing`).toBeDefined();
          const ratio = contrastRatio(f!, b!);
          console.info(
            `[contrast] ${mode.padEnd(5)} ${fg} on ${bg}: ${ratio.toFixed(2)}:1 (min ${min})`,
          );
          expect(ratio).toBeGreaterThanOrEqual(min);
        });
      }
    });
  }
});
