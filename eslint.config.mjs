import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";
import vocabi from "./eslint-rules/no-physical-direction-classes.mjs";

const injectMsg = "src/engine/ is pure: inject `now` / `rng` instead (CLAUDE.md, docs/ENGINE.md).";

// content/reference/ (wordfreq, CC-BY-SA) is for offline validation only and must never reach the
// app bundle (docs/DECISIONS.md #28). scripts/content/reference-guard.test.ts greps src/ as well.
const referencePath = "/content.reference|top20k/";
const referenceMsg =
  "content/reference/ is for scripts/ and tests only; never import or read it from src/ (docs/DECISIONS.md #28).";
const noReference = [
  { selector: `Literal[value=${referencePath}]`, message: referenceMsg },
  { selector: `TemplateElement[value.raw=${referencePath}]`, message: referenceMsg },
];

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    files: ["**/*.{js,mjs,cjs,jsx,ts,mts,tsx}"],
    plugins: { vocabi },
    rules: { "vocabi/no-physical-direction-classes": "error" },
  },
  {
    // The rule's own source and tests necessarily contain the forbidden class names.
    files: ["eslint-rules/**"],
    rules: { "vocabi/no-physical-direction-classes": "off" },
  },
  {
    files: ["src/**/*.{js,mjs,cjs,jsx,ts,mts,tsx}"],
    rules: { "no-restricted-syntax": ["error", ...noReference] },
  },
  {
    // Repeats noReference: a later block's options replace, not merge, the earlier block's.
    files: ["src/engine/**/*.{ts,tsx,mts}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...noReference,
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: `Date.now() is forbidden. ${injectMsg}`,
        },
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: `new Date() without arguments is forbidden. ${injectMsg}`,
        },
        {
          selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
          message: `Math.random() is forbidden. ${injectMsg}`,
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "test-results/**",
    "playwright-report/**",
    "next-env.d.ts",
  ]),
]);
