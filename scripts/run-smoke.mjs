#!/usr/bin/env node
/**
 * Run the smoke tests.
 *
 * The tests exercise the real game modules, which are TypeScript, so something
 * has to transpile them first. `tsx` is the obvious tool and works on a normal
 * machine — but the browser-backed dev runtime installs an emulated `node` that
 * cannot load tsx's loader (`Cannot locate module '--require'`) and hangs on
 * `npm`, which left `npm test` with no output at all.
 *
 * The TypeScript compiler itself is pure JavaScript and runs on both, so this
 * script drives it through its API: compile the entries and every module they
 * touch to CommonJS in a cache directory, import them, then clean up. No native
 * binaries and no child processes.
 *
 * Two entries run, in this order:
 *   1. `smoke.test.cts`      — pure logic, no DOM.
 *   2. `runtime-harness.cts` — builds every WebGL-adjacent system against a
 *      stubbed canvas and steps it, so a runtime `TypeError` that no unit test
 *      could see shows up here instead of only in the browser console.
 *
 * The harness is passed as an explicit root file rather than being left to the
 * `include` list. This runtime's filesystem bridge has been unreliable, and a
 * silently-dropped include entry would make the harness vanish without a word,
 * which is worse than no harness at all. It is also asserted to be emitted, for
 * the same reason.
 *
 * The integrity check exists because this runtime can start serving a *bundled
 * chunk* for a source path it has already transformed (a dashboard chunk once
 * appeared in place of `src/game/core/ChainTracker.ts`). Compiling that yields
 * nonsense errors that look like the game's fault, so the runner refuses to run
 * and says exactly which files are poisoned instead.
 *
 * Usage: npm test
 */
import { existsSync, rmSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const configPath = join(root, "tsconfig.smoke.json");
const outDir = join(root, "node_modules/.cache/smoke");
const entry = join(outDir, "scripts/smoke.test.cjs");
// The harness runs second: it installs DOM stubs, so it must not shape the
// environment the pure-logic suite sees.
const harnessSource = join(root, "scripts/runtime-harness.cts");
const harness = join(outDir, "scripts/runtime-harness.cjs");

/** Markers of a bundled/minified module rather than a hand-written source. */
const BUNDLE_MARKERS = ['jsxDEV(', 'from"./index-', "from './index-", 'fileName:"/'];

function diagnosticHost() {
  return {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => root,
    getNewLine: () => "\n",
  };
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!existsSync(configPath)) fail(`smoke config missing: ${configPath}`);

const read = ts.readConfigFile(configPath, ts.sys.readFile);
if (read.error) {
  console.error(ts.formatDiagnosticsWithColorAndContext([read.error], diagnosticHost()));
  process.exit(1);
}

const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, root);

// Explicit roots: the config's `include` plus the two entries, de-duplicated.
const rootNames = [...new Set([...parsed.fileNames, entrySource(), harnessSource])];
function entrySource() {
  return join(root, "scripts/smoke.test.cts");
}

const poisoned = [];
for (const fileName of rootNames) {
  const text = ts.sys.readFile(fileName);
  if (text === undefined) {
    poisoned.push(`${relative(root, fileName)} (unreadable)`);
    continue;
  }
  if (BUNDLE_MARKERS.some((marker) => text.includes(marker))) {
    poisoned.push(relative(root, fileName));
  }
}
if (poisoned.length > 0) {
  fail(
    `\nsmoke build aborted: the runtime is serving bundled output for these sources\n` +
      poisoned.map((file) => `  - ${file}`).join("\n") +
      `\nRe-saving the file (or deleting and recreating it) clears the stale entry.\n`,
  );
}

const program = ts.createProgram(rootNames, parsed.options);
const emitted = program.emit();
const diagnostics = ts
  .getPreEmitDiagnostics(program)
  .concat(emitted.diagnostics ?? []);

if (diagnostics.length > 0) {
  // Warnings from a relaxed test build should not be fatal, but they must not
  // hide a real problem either — so print them and carry on to the tests.
  console.error(
    ts.formatDiagnosticsWithColorAndContext(diagnostics.slice(0, 20), diagnosticHost()),
  );
}

if (!existsSync(entry)) fail("\nsmoke build failed: the compiler never emitted the test entry.");
if (!existsSync(harness)) {
  fail("\nsmoke build failed: the compiler never emitted the runtime harness.");
}

// The compiled bundle is a build artefact, not something to keep around, and
// the tests may exit the process themselves.
process.on("exit", () => rmSync(outDir, { recursive: true, force: true }));

await import(pathToFileURL(entry).href);
await import(pathToFileURL(harness).href);
