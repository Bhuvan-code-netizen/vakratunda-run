/**
 * Run `scripts/smoke.test.ts` in a bare Node process.
 *
 * `npm test` uses tsx, which is the normal way to run this. This runner is the
 * fallback for environments where tsx/ESM loaders are unavailable: it does the
 * same two jobs by hand — transpile TypeScript on the fly, and resolve the
 * project's extensionless relative imports (`../src/game/constants`).
 *
 * Usage:
 *   node scripts/run-smoke.cjs
 */
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..");
const cache = new Map();

function resolveRelative(spec, fromFile) {
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = [
    base,
    base + ".ts",
    base + ".tsx",
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  throw new Error("Cannot resolve '" + spec + "' from " + fromFile);
}

function loadTs(file) {
  const resolved = path.resolve(file);
  if (cache.has(resolved)) return cache.get(resolved).exports;

  const source = fs.readFileSync(resolved, "utf8");
  const { outputText } = ts.transpileModule(source, {
    fileName: resolved,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  });

  const module = { exports: {} };
  cache.set(resolved, module);

  const localRequire = (spec) =>
    spec.startsWith(".") ? loadTs(resolveRelative(spec, resolved)) : require(spec);

  const wrapper = new Function(
    "exports",
    "require",
    "module",
    "__filename",
    "__dirname",
    outputText,
  );
  wrapper(module.exports, localRequire, module, resolved, path.dirname(resolved));

  return module.exports;
}

loadTs(path.join(ROOT, "scripts", "smoke.test.ts"));
