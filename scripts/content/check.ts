/**
 * `pnpm content:check` — every rule in docs/CONTENT.md "Validator rules". Prints
 * `file › id › RULE_CODE › message`, errors then warnings; exits 1 on any error.
 *
 * Options: --dir <content root> (default ./content), --reference <word list>
 * (default <content root>/reference/top20k-en.txt).
 */
import { readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { formatDiagnostic, runCheck } from "./validate";

const { values } = parseArgs({
  options: { dir: { type: "string" }, reference: { type: "string" } },
});
const root = resolve(values.dir ?? "content");
const referencePath = resolve(values.reference ?? join(root, "reference", "top20k-en.txt"));

function readReference(path: string): string[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

const diagnostics = runCheck(root, { reference: readReference(referencePath) });
const errors = diagnostics.filter((d) => d.severity === "error");
const warnings = diagnostics.filter((d) => d.severity === "warning");
const prefix = `${relative(process.cwd(), root) || "."}/`;

if (errors.length > 0) {
  console.log(`Errors (${errors.length}):`);
  for (const d of errors) console.log(`  ${formatDiagnostic(d, prefix)}`);
}
if (warnings.length > 0) {
  console.log(`Warnings (${warnings.length}):`);
  for (const d of warnings) console.log(`  ${formatDiagnostic(d, prefix)}`);
}
console.log(
  `content:check: ${errors.length} error(s), ${warnings.length} warning(s) in ${prefix}` +
    (errors.length > 0 ? " — FAILED" : " — OK"),
);
process.exitCode = errors.length > 0 ? 1 : 0;
