import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { noPhysicalDirectionClasses } from "./no-physical-direction-classes.mjs";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

const jsx = (cls: string) => `const a = <div className="${cls}" />;`;
const bad = (cls: string, physical: string, logical: string) => ({
  code: jsx(cls),
  errors: [{ messageId: "physical" as const, data: { token: cls, physical, logical } }],
});

ruleTester.run("no-physical-direction-classes", noPhysicalDirectionClasses, {
  valid: [
    // logical replacements
    jsx("ms-2 me-4 ps-3 pe-1 -ms-2 md:me-3"),
    jsx("start-0 end-0 md:start-4 -end-2"),
    jsx("text-start text-end text-center text-lg"),
    jsx(
      "rounded rounded-lg rounded-full rounded-s rounded-e rounded-s-lg rounded-ss rounded-se-xl rounded-es rounded-ee-2xl rounded-t-lg rounded-b",
    ),
    jsx("border border-2 border-s border-e-2 border-line border-t border-b-4 border-x"),
    jsx("float-start float-end float-none clear-start clear-end clear-both"),
    jsx("scroll-ms-2 scroll-me-4 scroll-ps-1 scroll-pe-3 scroll-mt-4 scroll-smooth"),
    // look-alikes that are not physical classes
    jsx("email-x html-foo palette-2 mlx-2 xml-2 lefty rightmost text-leftish"),
    `import x from "./left-panel";`,
    `const s = \`ms-\${n} pe-2\`;`,
  ],
  invalid: [
    bad("ml-2", "ml-", "ms-"),
    bad("mr-4", "mr-", "me-"),
    bad("pl-3", "pl-", "ps-"),
    bad("pr-1", "pr-", "pe-"),
    bad("md:ml-2", "ml-", "ms-"),
    bad("-mr-1", "mr-", "me-"),
    bad("hover:pl-4", "pl-", "ps-"),
    bad("ml-2!", "ml-", "ms-"),
    bad("!left-0", "left-", "start-"),
    bad("right-4", "right-", "end-"),
    bad("text-left", "text-left", "text-start"),
    bad("text-right", "text-right", "text-end"),
    bad("rounded-l", "rounded-l", "rounded-s"),
    bad("rounded-r-lg", "rounded-r", "rounded-e"),
    bad("rounded-tl", "rounded-tl", "rounded-ss"),
    bad("rounded-tr-xl", "rounded-tr", "rounded-se"),
    bad("rounded-bl-md", "rounded-bl", "rounded-es"),
    bad("rounded-br", "rounded-br", "rounded-ee"),
    bad("border-l", "border-l", "border-s"),
    bad("border-r-2", "border-r", "border-e"),
    bad("float-left", "float-left", "float-start"),
    bad("float-right", "float-right", "float-end"),
    bad("clear-left", "clear-left", "clear-start"),
    bad("clear-right", "clear-right", "clear-end"),
    bad("scroll-ml-2", "scroll-ml-", "scroll-ms-"),
    bad("scroll-mr-4", "scroll-mr-", "scroll-me-"),
    bad("scroll-pl-1", "scroll-pl-", "scroll-ps-"),
    bad("scroll-pr-3", "scroll-pr-", "scroll-pe-"),
    {
      // one report per offending token; cn()/clsx() args and template literals are checked too
      code: `cn("flex ml-2", \`pr-\${n} \`, "text-right");`,
      errors: [{ messageId: "physical" }, { messageId: "physical" }, { messageId: "physical" }],
    },
  ],
});
