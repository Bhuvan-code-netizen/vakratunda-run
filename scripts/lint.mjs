#!/usr/bin/env node
/**
 * Lint the project through ESLint's Node API.
 *
 * The stock `eslint` CLI resolves its formatter through the module loader, and
 * in this runtime every formatter — core or not — dies with
 * "The \"id\" argument must be of type string. Received object", so the findings
 * never reach the terminal. Running the same ESLint through its API skips the
 * formatter entirely: results are printed here and the exit code still means
 * what you expect (1 = errors found, 0 = clean).
 *
 * Same config, same files and the same rules as `eslint .` would use.
 *
 * Usage:
 *   npm run lint              # the whole project
 *   npm run lint -- src       # just one path
 */
import { ESLint } from "eslint";

const targets = process.argv.slice(2).filter((arg) => !arg.startsWith("-"));
const eslint = new ESLint({ cwd: process.cwd() });
const results = await eslint.lintFiles(targets.length > 0 ? targets : ["."]);

let errors = 0;
let warnings = 0;

for (const result of results) {
  if (result.errorCount === 0 && result.warningCount === 0) continue;
  errors += result.errorCount;
  warnings += result.warningCount;
  console.log(`\n${result.filePath.replace(`${process.cwd()}/`, "")}`);
  for (const message of result.messages) {
    const level = message.severity === 2 ? "error" : "warning";
    const rule = message.ruleId ?? "parse-error";
    const text = message.message.split("\n")[0];
    console.log(`  ${message.line}:${message.column}  ${level}  ${rule}  ${text}`);
  }
}

const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;
console.log(
  `\n${plural(results.length, "file")} linted: ${plural(errors, "error")}, ` +
    `${plural(warnings, "warning")}`,
);

process.exit(errors > 0 ? 1 : 0);
