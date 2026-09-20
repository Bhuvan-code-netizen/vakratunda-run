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
 * script drives it through its API: compile the tests and the modules they
 * touch to CommonJS in a cache directory, import the entry, then clean up.
 * Same tests, same assertions, no native binaries and no child processes.
 *
 * Usage: npm test
 */
import { existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const configPath = join(root, "tsconfig.smoke.json");
const outDir = join(root, "node_modules/.cache/smoke");
const entry = join(outDir, "scripts/smoke.test.cjs");

if (!existsSync(configPath)) {
  console.error(`smoke config missing: ${configPath}`);
  process.exit(1);
}

const read = ts.readConfigFile(configPath, ts.sys.readFile);
if (read.error) {
  console.error(ts.formatDiagnosticsWithColorAndContext([read.error], host()));
  process.exit(1);
}

const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, root);
const program = ts.createProgram(parsed.fileNames, parsed.options);
const emitted = program.emit();
const diagnostics = ts
  .getPreEmitDiagnostics(program)
  .concat(emitted.diagnostics ?? []);

if (diagnostics.length > 0) {
  // Warnings from a relaxed test build should not be fatal, but they must not
  // hide a real problem either — so print them and carry on to the tests.
  console.error(
    ts.formatDiagnosticsWithColorAndContext(diagnostics.slice(0, 20), host()),
  );
}

if (!existsSync(entry)) {
  console.error("\nsmoke build failed: the compiler never emitted the test entry.");
  process.exit(1);
}

function host() {
  return {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => root,
    getNewLine: () => "\n",
  };
}

// The compiled bundle is a build artefact, not something to keep around, and
// the tests may exit the process themselves.
process.on("exit", () => rmSync(outDir, { recursive: true, force: true }));

await import(pathToFileURL(entry).href);
