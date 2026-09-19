// One-shot patcher for the pause feature. Exact-string replacements, no regex,
// so anything unexpected is reported instead of silently mangled.
const fs = require("fs");
const NL = String.fromCharCode(10);
const j = (...lines) => lines.join(NL);

function patch(file, pairs) {
  let src = fs.readFileSync(file, "utf8");
  const report = [];
  let ok = true;
  for (const pair of pairs) {
    const oldText = pair[0];
    const newText = pair[1];
    const first = src.indexOf(oldText);
    if (first === -1) {
      report.push("  MISS " + JSON.stringify(oldText.slice(0, 70)));
      ok = false;
      continue;
    }
    if (src.indexOf(oldText, first + 1) !== -1) {
      report.push("  DUP  " + JSON.stringify(oldText.slice(0, 70)));
      ok = false;
      continue;
    }
    src = src.slice(0, first) + newText + src.slice(first + oldText.length);
    report.push("  ok   " + JSON.stringify(oldText.slice(0, 70)));
  }
  if (ok) fs.writeFileSync(file, src);
  console.log(file + (ok ? " [written]" : " [UNCHANGED]"));
  console.log(report.join(NL));
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

patch("src/game/GameApp.ts", [
  [
    'export type GameState = "ready" | "intro" | "running" | "gameover";',
    'export type GameState = "ready" | "intro" | "running" | "paused" | "gameover";',
  ],
  [
    j("  newBest: boolean;", "  milestone: number | null;", "}"),
    j(
      "  newBest: boolean;",
      "  milestone: number | null;",
      "  /** True while the run is held on the pause screen. */",
      "  paused: boolean;",
      "}"
    ),
  ],
  [
    j('      if (action === "audio") {', "        this.setMuted(!this.audio.isMuted);", "        return;", "      }"),
    j(
      '      if (action === "audio") {',
      "        this.setMuted(!this.audio.isMuted);",
      "        return;",
      "      }",
      "      // Pausing is the one action that must not skip the hero shot.",
      '      if (action === "pause") {',
      "        this.togglePause();",
      "        return;",
      "      }"
    ),
  ],
  [
    j("  start() {", '    if (this.state === "intro" || this.state === "running") return;'),
    j(
      "  start() {",
      '    if (this.state === "intro" || this.state === "running" || this.state === "paused")',
      "      return;"
    ),
  ],
  [
    j("  get muted(): boolean {", "    return this.audio.isMuted;", "  }"),
    j(
      "  get muted(): boolean {",
      "    return this.audio.isMuted;",
      "  }",
      "",
      "  /**",
      "   * Hold the run exactly where it stands — pace, traffic, power timers and",
      "   * the clock — or let it go again. Only a live run can be held.",
      "   */",
      "  togglePause() {",
      '    if (this.state === "running") {',
      '      this.state = "paused";',
      "      this.emitSnapshot();",
      '    } else if (this.state === "paused") {',
      '      this.state = "running";',
      "      this.emitSnapshot();",
      "    }",
      "  }"
    ),
  ],
  [
    '    } else if (this.state === "ready") {',
    j(
      '    } else if (this.state === "paused") {',
      "      // Held: the world is frozen exactly as it was. Pace, traffic, timers,",
      "      // collisions and the camera all wait. The frame is still rendered so",
      "      // the frozen run stays on screen behind the pause overlay.",
      '    } else if (this.state === "ready") {'
    ),
  ],
  [
    j("      milestone: this.milestoneFlash,", "    });"),
    j("      milestone: this.milestoneFlash,", '      paused: this.state === "paused",', "    });"),
  ],
]);

patch("src/pages/Play.tsx", [
  [
    j("  Infinity as InfinityIcon,", '} from "lucide-react";'),
    j(
      "  Infinity as InfinityIcon,",
      "  Pause as PauseIcon,",
      "  Play as PlayIcon,",
      '} from "lucide-react";'
    ),
  ],
  [
    j("  newBest: false,", "  milestone: null,", "};"),
    j("  newBest: false,", "  milestone: null,", "  paused: false,", "};"),
  ],
  [
    j("  const handleStart = useCallback(() => gameRef.current?.start(), []);", "  const handleRestart = useCallback(() => gameRef.current?.restart(), []);"),
    j(
      "  const handleStart = useCallback(() => gameRef.current?.start(), []);",
      "  const handleRestart = useCallback(() => gameRef.current?.restart(), []);",
      "  /** Hold the run, or let it go again. Also reachable with P or Escape. */",
      "  const handleTogglePause = useCallback(() => gameRef.current?.togglePause(), []);"
    ),
  ],
  [
    "  const ultimateLit = snap.powerUps.vighnaharta > 0;",
    j('  const ultimateLit = snap.powerUps.vighnaharta > 0;', '  const paused = snap.state === "paused";'),
  ],
  [
    j(
      '            <div className="pointer-events-auto flex items-center gap-2">',
      "              <button",
      '                type="button"',
      "                onClick={handleToggleSound}"
    ),
    j(
      '            <div className="pointer-events-auto flex items-center gap-2">',
      '              {(snap.state === "running" || paused) && (',
      "                <button",
      '                  type="button"',
      "                  onClick={handleTogglePause}",
      '                  aria-label={paused ? "Resume the run" : "Pause the run"}',
      '                  className="flex cursor-pointer items-center gap-1.5 rounded-full border border-amber-200/20 bg-black/40 px-3 py-1 text-[10px] tracking-widest text-amber-200/70 backdrop-blur-sm transition-colors hover:bg-black/60"',
      "                >",
      '                  {paused ? <PlayIcon className="size-3" /> : <PauseIcon className="size-3" />}',
      '                  {paused ? "RESUME" : "PAUSE"}',
      "                </button>",
      "              )}",
      "              <button",
      '                type="button"',
      "                onClick={handleToggleSound}"
    ),
  ],
  [
    j("            <span>M — SOUND</span>", "          </div>"),
    j("            <span>M — SOUND</span>", "            <span>P · ESC — PAUSE</span>", "          </div>"),
  ],
  [
    "            The backtick key toggles this panel. The M key toggles sound.",
    j(
      "            The backtick key toggles this panel. The M key toggles sound. The P",
      "            or Escape key holds the run."
    ),
  ],
  [
    "      {/* ---- Ready overlay ---- */}",
    j(
      "      {/* ---- Pause overlay ---- */}",
      "      {paused && (",
      '        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0b0712]/80 px-6 text-center backdrop-blur-sm">',
      '          <div className="mb-3 text-[11px] tracking-[0.5em] text-amber-300/70">',
      "            THE ROAD WAITS",
      "          </div>",
      '          <h2 className="bg-gradient-to-b from-amber-50 via-amber-200 to-amber-600 bg-clip-text font-[Cinzel,Georgia,serif] text-4xl font-bold tracking-[0.14em] text-transparent sm:text-6xl">',
      "            PAUSED",
      "          </h2>",
      '          <p className="mt-4 max-w-sm font-[Rajdhani,system-ui,sans-serif] text-sm leading-6 text-white/60">',
      "            Take a breath. The festival lamps are still lit and the road will",
      "            hold exactly where you left it.",
      "          </p>",
      "          <Button",
      '            type="button"',
      "            onClick={handleTogglePause}",
      '            size="lg"',
      '            className="mt-8 cursor-pointer rounded-full border border-amber-300/40 bg-gradient-to-b from-amber-400 to-amber-700 px-10 text-base font-bold tracking-[0.2em] text-amber-950 shadow-[0_0_40px_rgba(212,160,23,0.35)] transition-transform hover:scale-[1.03]"',
      "          >",
      '            <PlayIcon className="mr-2 size-4" /> RESUME THE RUN',
      "          </Button>",
      '          <div className="mt-5 text-[10px] tracking-[0.3em] text-white/40">',
      "            OR PRESS P · ESC",
      "          </div>",
      "        </div>",
      "      )}",
      "",
      "      {/* ---- Ready overlay ---- */}"
    ),
  ],
]);

console.log("DONE");
