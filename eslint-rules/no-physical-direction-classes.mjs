/**
 * Forbids physical-direction Tailwind classes; the UI is RTL and uses logical properties only
 * (CLAUDE.md non-negotiables, docs/DESIGN.md "RTL rules").
 *
 * Every string literal / template-literal chunk is split on whitespace. Each token is normalized
 * (variant prefixes like `md:hover:` removed, leading `!`/`-` and trailing `!` stripped) and only
 * matched from its start, so `ms-2`, `start-0`, `text-end`, `rounded-lg`, `border-s` or
 * `email-x` are never flagged.
 */

/** @type {Array<{ re: RegExp, fix: (m: RegExpMatchArray) => string }>} */
const RULES = [
  { re: /^(ml|mr|pl|pr)-/, fix: (m) => ({ ml: "ms-", mr: "me-", pl: "ps-", pr: "pe-" })[m[1]] },
  { re: /^(left|right)-/, fix: (m) => (m[1] === "left" ? "start-" : "end-") },
  { re: /^text-(left|right)$/, fix: (m) => (m[1] === "left" ? "text-start" : "text-end") },
  {
    re: /^rounded-(tl|tr|bl|br|l|r)(?=-|$)/,
    fix: (m) => `rounded-${{ l: "s", r: "e", tl: "ss", tr: "se", bl: "es", br: "ee" }[m[1]]}`,
  },
  { re: /^border-(l|r)(?=-|$)/, fix: (m) => (m[1] === "l" ? "border-s" : "border-e") },
  { re: /^float-(left|right)$/, fix: (m) => (m[1] === "left" ? "float-start" : "float-end") },
  { re: /^clear-(left|right)$/, fix: (m) => (m[1] === "left" ? "clear-start" : "clear-end") },
  {
    re: /^scroll-(ml|mr|pl|pr)-/,
    fix: (m) => `scroll-${{ ml: "ms", mr: "me", pl: "ps", pr: "pe" }[m[1]]}-`,
  },
];

/** @param {string} token */
export function findPhysicalClass(token) {
  const base = token
    .slice(token.lastIndexOf(":") + 1)
    .replace(/^!/, "")
    .replace(/^-/, "")
    .replace(/!$/, "");
  for (const { re, fix } of RULES) {
    const m = base.match(re);
    if (m) return { physical: m[0], logical: fix(m) };
  }
  return null;
}

/** @type {import("eslint").Rule.RuleModule} */
export const noPhysicalDirectionClasses = {
  meta: {
    type: "problem",
    docs: { description: "Disallow physical-direction Tailwind classes; use logical ones (RTL)." },
    schema: [],
    messages: {
      physical:
        "Physical-direction class '{{token}}' is forbidden in RTL UI; use '{{logical}}…' instead of '{{physical}}…'.",
    },
  },
  create(context) {
    /** @param {import("estree").Node} node @param {string} text */
    function check(node, text) {
      for (const token of text.split(/\s+/)) {
        if (!token) continue;
        const hit = findPhysicalClass(token);
        if (hit) context.report({ node, messageId: "physical", data: { token, ...hit } });
      }
    }
    return {
      Literal(node) {
        if (typeof node.value !== "string") return;
        const parent = node.parent;
        const isModuleSource =
          parent?.type === "ImportDeclaration" ||
          parent?.type === "ExportAllDeclaration" ||
          parent?.type === "ExportNamedDeclaration";
        if (isModuleSource) return;
        check(node, node.value);
      },
      TemplateElement(node) {
        check(node, node.value.cooked ?? node.value.raw);
      },
    };
  },
};

const plugin = {
  meta: { name: "vocabi" },
  rules: { "no-physical-direction-classes": noPhysicalDirectionClasses },
};

export default plugin;
