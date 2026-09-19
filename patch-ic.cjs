// Patch InputController only — small fragment set to fit the transport.
const fs = require("fs");
const NL = String.fromCharCode(10);
const j = (...lines) => lines.join(NL);
function same(a, b) {
  if (!b) return a;
  return b;
}
function patch(file, pairs) {
  let src = fs.readFileSync(file, "utf8");
  const msgs = [];
  let ok = true;
  for (const [oldText, newText] of pairs) {
    const i = src.indexOf(oldText);
    if (i === -1) { msgs.push("MISS " + JSON.stringify(oldText.slice(0, 55))); ok = false; continue; }
    if (src.indexOf(oldText, i + 1) !== -1) { msgs.push("DUP " + JSON.stringify(oldText.slice(0, 55))); ok = false; continue; }
    src = src.slice(0, i) + newText + src.slice(i + oldText.length);
    msgs.push("ok " + JSON.stringify(oldText.slice(0, 55)));
  }
  if (ok) fs.writeFileSync(file, src);
  console.log(file + (ok ? " [written]" : " [STALL]"));
  console.log(msgs.join(NL));
}
patch("src/game/core/InputController.ts", [
  [
    'export type InputAction = "left" | "right" | "jump" | "restart" | "audio" | "debug";',
    j(
      "export type InputAction =",
      '  | "left"',
      '  | "right"',
      '  | "jump"',
      '  | "restart"',
      '  | "pause"',
      '  | "audio"',
      '  | "debug";'
    ),
  ],
  [
    j('  KeyR: "restart",', '  KeyM: "audio",'),
    j('  KeyR: "restart",', '  KeyP: "pause",', '  Escape: "pause",', '  KeyM: "audio",'),
  ],
]);
console.log("ic-done");
