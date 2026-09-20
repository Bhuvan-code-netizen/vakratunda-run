const esbuild = require("esbuild");
esbuild.buildSync({
  entryPoints: ["scripts/smoke.test.mts"],
  outfile: "/tmp/smoke.bundle.mjs",
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node18",
  logLevel: "info",
});
console.log("bundled");
