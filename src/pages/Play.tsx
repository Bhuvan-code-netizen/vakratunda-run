import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import {
  ArrowLeft,
  CloudFog,
  CloudRain,
  Gauge,
  Magnet,
  Moon,
  RotateCcw,
  Shield,
  Sparkles,
  SunDim,
  Trophy,
  Volume2,
  VolumeX,
  Zap,
  Infinity as InfinityIcon,
  Pause as PauseIcon,
  Play as PlayIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { uiSound } from "@/game/audio/UISound";
import { GameApp, type GameSnapshot } from "@/game/GameApp";
import {
  CHAIN_WINDOW,
  DASH_DURATION,
  MAGNET_DURATION,
  MULTIPLIER_DURATION,
  SHIELD_DURATION,
  VIGHNAHARTA_DURATION,
  type PowerUpKind,
} from "@/game/constants";

const EMPTY: GameSnapshot = {
  state: "ready",
  score: 0,
  best: 0,
  distance: 0,
  speed: 0,
  lane: 1,
  posX: 0,
  posY: 0,
  obstacles: 0,
  modaks: 0,
  chain: 0,
  chainTier: 0,
  chainWindow: 0,
  intensity: 0,
  introProgress: 1,
  powerUps: { shield: 0, magnet: 0, dash: 0, multiplier: 0, vighnaharta: 0 },
  nearMisses: 0,
  nearMissFlash: null,
  smashes: 0,
  night: 0,
  rain: 0,
  mist: 0,
  muted: false,
  fps: 0,
  newBest: false,
  milestone: null,
  paused: false,
};

const LANES_LABEL = ["Left", "Center", "Right"];
const TIER_LABEL = ["", "x2", "x3", "x4"];

/** Presentation for each divine power: how long it lasts and how it glows. */
const POWER_META: Record<
  PowerUpKind,
  {
    short: string;
    duration: number;
    icon: typeof Shield;
    text: string;
    bar: string;
    ring: string;
  }
> = {
  shield: {
    short: "SHIELD",
    duration: SHIELD_DURATION,
    icon: Shield,
    text: "text-sky-200",
    bar: "from-sky-400 to-sky-200",
    ring: "border-sky-300/40 bg-sky-400/10",
  },
  magnet: {
    short: "MAGNET",
    duration: MAGNET_DURATION,
    icon: Magnet,
    text: "text-orange-200",
    bar: "from-orange-500 to-orange-300",
    ring: "border-orange-300/40 bg-orange-400/10",
  },
  dash: {
    short: "DASH",
    duration: DASH_DURATION,
    icon: Zap,
    text: "text-amber-200",
    bar: "from-amber-400 to-amber-200",
    ring: "border-amber-300/40 bg-amber-400/10",
  },
  multiplier: {
    short: "BLESSING",
    duration: MULTIPLIER_DURATION,
    icon: Sparkles,
    text: "text-violet-200",
    bar: "from-violet-400 to-violet-200",
    ring: "border-violet-300/40 bg-violet-400/10",
  },
  vighnaharta: {
    short: "VIGHNAHARTA",
    duration: VIGHNAHARTA_DURATION,
    icon: InfinityIcon,
    text: "text-yellow-100",
    bar: "from-yellow-200 to-amber-100",
    ring: "border-yellow-200/50 bg-yellow-200/10",
  },
};

const POWER_ORDER: PowerUpKind[] = ["shield", "dash", "magnet", "multiplier", "vighnaharta"];

/** Sky phase for a night value of 0…1. */
function nightLabel(night: number): string {
  if (night < 0.22) return "DUSK";
  if (night < 0.6) return "GLOAMING";
  return "NIGHT";
}

/** Air phase for the current rain and mist. */
function weatherLabel(rain: number, mist: number): string {
  if (rain > 0.55) return "MONSOON";
  if (rain > 0.18) return "DRIZZLE";
  if (mist > 0.55) return "HAZE";
  return "CLEAR";
}

export default function Play() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<GameApp | null>(null);
  const [snap, setSnap] = useState<GameSnapshot>(EMPTY);
  const [debugOpen, setDebugOpen] = useState(false);
  /** Any crash that would otherwise leave a silent white page. */
  const [mountError, setMountError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Any uncaught exception — a failed WebGL context, a module that never
    // evaluated, a throw inside an animation frame — paints itself onto the
    // page instead of leaving a blank screen with no explanation.
    const reportError = (label: string, detail: unknown) => {
      const message =
        detail instanceof Error
          ? `${detail.message}${
              detail.stack
                ? `\n${detail.stack.split("\n").slice(1, 6).join("\n")}`
                : ""
            }`
          : String(detail);
      console.error(`[Vakratunda] ${label}:`, detail);
      setMountError(`${label}\n\n${message}`);
    };
    const onError = (e: ErrorEvent) =>
      reportError(
        e.filename
          ? `Runtime error (${e.filename.split("/").pop() ?? "unknown file"})`
          : "Runtime error",
        e.error ?? e.message,
      );
    const onRejection = (e: PromiseRejectionEvent) =>
      reportError("Unhandled promise rejection", e.reason);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    // Create the canvas here so every mount (incl. StrictMode remounts)
    // gets a fresh WebGL context.
    const canvas = document.createElement("canvas");
    canvas.className = "block h-full w-full";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    container.appendChild(canvas);

    try {
      const app = new GameApp(canvas, {
        onSnapshot: setSnap,
        onDebugToggle: () => setDebugOpen((d) => !d),
      });
      gameRef.current = app;
    } catch (err) {
      canvas.remove();
      reportError("Engine failed to start", err);
    }

    return () => {
      gameRef.current?.dispose();
      canvas.remove();
      gameRef.current = null;
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  const handleStart = useCallback(() => gameRef.current?.start(), []);
  const handleRestart = useCallback(() => gameRef.current?.restart(), []);
  /** Hold the run, or let it go again. Also reachable with P or Escape. */
  const handleTogglePause = useCallback(() => gameRef.current?.togglePause(), []);
  const handleToggleSound = useCallback(() => {
    const app = gameRef.current;
    if (!app) return;
    const muted = !app.muted;
    app.setMuted(muted);
    uiSound.setMuted(muted);
  }, []);

  const inIntro = snap.state === "intro";
  const p = snap.introProgress;
  // The wordmark holds the screen, then steps back as the run takes over.
  const introTitle = inIntro ? Math.min(1, Math.max(0, Math.min(p / 0.26, (1 - p) / 0.3))) : 0;
  const introHint = inIntro ? Math.max(0, (p - 0.5) / 0.3) : 0;
  const SoundIcon = snap.muted ? VolumeX : Volume2;

  const aired = POWER_ORDER.filter((kind) => snap.powerUps[kind] > 0);
  const climate = `${nightLabel(snap.night)} · ${weatherLabel(snap.rain, snap.mist)}`;
  const ClimateIcon =
    snap.rain > 0.18 ? CloudRain : snap.mist > 0.55 ? CloudFog : snap.night > 0.5 ? Moon : SunDim;
  const ultimateLit = snap.powerUps.vighnaharta > 0;
  const paused = snap.state === "paused";

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#0b0712]">
      <div ref={containerRef} className="absolute inset-0" />

      {/* ---- Crash report: never leave the preview white and silent ---- */}
      {mountError && (
        <div className="absolute inset-0 z-50 overflow-auto bg-[#0b0712]/95 p-6">
          <div className="mx-auto max-w-xl">
            <h2 className="text-sm font-semibold tracking-[0.3em] text-red-300">
              RUNTIME ERROR
            </h2>
            <pre className="mt-3 whitespace-pre-wrap break-words rounded-lg border border-red-400/30 bg-black/60 p-4 text-xs leading-5 text-red-100/90">
              {mountError}
            </pre>
            <p className="mt-3 text-[11px] leading-5 text-white/50">
              If this mentions WebGL, the browser runtime needs a reload. A
              stale dev-server module can also cause this — the button below
              fetches everything fresh.
            </p>
            <Button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 cursor-pointer"
            >
              <RotateCcw className="mr-2 size-4" /> Reload
            </Button>
          </div>
        </div>
      )}

      {/* ---- Vighnaharta banner: the street holds its breath ---- */}
      {snap.state === "running" && ultimateLit && (
        <div className="pointer-events-none absolute inset-x-0 top-48 flex justify-center sm:top-20">
          <div className="animate-pulse rounded-full border border-yellow-200/60 bg-black/45 px-4 py-1.5 text-[10px] tracking-[0.2em] text-yellow-100 backdrop-blur-sm sm:px-5 sm:tracking-[0.45em]">
            VIGHNAHARTA · REMOVER OF OBSTACLES
          </div>
        </div>
      )}

      {/* ---- Top HUD: score / best ---- */}
      {!inIntro && (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3 sm:p-6">
          <div>
            <div className="text-[10px] font-semibold tracking-[0.35em] text-amber-200/60">
              SCORE
            </div>
            <div className="font-[Cinzel,Georgia,serif] text-2xl font-bold text-amber-100 tabular-nums drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] sm:text-4xl">
              {snap.score.toLocaleString()}
            </div>
            <div className="mt-0.5 font-[Rajdhani,system-ui,sans-serif] text-[11px] text-amber-200/50 sm:text-xs">
              {snap.modaks} modaks gathered
            </div>
            {/* Climate readout: the run's own sky and air */}
            {snap.state === "running" && (
              <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/35 px-2.5 py-0.5 text-[10px] tracking-[0.28em] text-white/50 backdrop-blur-sm">
                <ClimateIcon className="size-3" />
                {climate}
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="text-right">
              <div className="flex items-center justify-end gap-1.5 text-[10px] font-semibold tracking-[0.35em] text-amber-200/60">
                <Trophy className="size-3" /> BEST
              </div>
              <div className="text-lg font-semibold text-amber-200/90 tabular-nums sm:text-2xl">
                {snap.best.toLocaleString()}
              </div>
            </div>
            <div className="pointer-events-auto flex items-center gap-2">
              {(snap.state === "running" || paused) && (
                <button
                  type="button"
                  onClick={handleTogglePause}
                  aria-label={paused ? "Resume the run" : "Pause the run"}
                  className="flex cursor-pointer items-center gap-1.5 rounded-full border border-amber-200/20 bg-black/40 px-2.5 py-1 text-[10px] tracking-widest text-amber-200/70 sm:px-3 backdrop-blur-sm transition-colors hover:bg-black/60"
                >
                  {paused ? <PlayIcon className="size-3" /> : <PauseIcon className="size-3" />}
                  <span className="hidden sm:inline">{paused ? "RESUME" : "PAUSE"}</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleToggleSound}
                aria-label={snap.muted ? "Unmute" : "Mute"}
                className="flex cursor-pointer items-center gap-1.5 rounded-full border border-amber-200/20 bg-black/40 px-2.5 py-1 text-[10px] tracking-widest text-amber-200/70 sm:px-3 backdrop-blur-sm transition-colors hover:bg-black/60"
              >
                <SoundIcon className="size-3" />
                <span className="hidden sm:inline">{snap.muted ? "OFF" : "ON"}</span>
              </button>
              <button
                type="button"
                onClick={() => setDebugOpen((d) => !d)}
                aria-label="Toggle the debug panel"
                className="flex cursor-pointer items-center gap-1.5 rounded-full border border-amber-200/20 bg-black/40 px-2.5 py-1 text-[10px] tracking-widest text-amber-200/70 sm:px-3 backdrop-blur-sm transition-colors hover:bg-black/60"
              >
                <Gauge className="size-3" />
                <span className="hidden sm:inline">DEBUG</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Divine powers in flight ---- */}
      {snap.state === "running" && aired.length > 0 && (
        <div className="pointer-events-none absolute bottom-16 left-1/2 flex -translate-x-1/2 flex-wrap justify-center gap-2 sm:bottom-auto sm:top-6">
          {aired.map((kind) => {
            const meta = POWER_META[kind];
            const Icon = meta.icon;
            const left = snap.powerUps[kind];
            return (
              <div
                key={kind}
                className={`flex w-28 flex-col gap-1 rounded-lg border px-2.5 py-1.5 backdrop-blur-sm sm:w-32 ${meta.ring}`}
              >
                <div
                  className={`flex items-center justify-between text-[10px] tracking-[0.2em] ${meta.text}`}
                >
                  <span className="flex items-center gap-1">
                    <Icon className="size-3" />
                    {meta.short}
                  </span>
                  <span className="tabular-nums">{left.toFixed(1)}</span>
                </div>
                <div className="h-0.5 overflow-hidden rounded-full bg-white/15">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${meta.bar} transition-[width] duration-100`}
                    style={{ width: `${Math.min(100, (left / meta.duration) * 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ---- Blessing Chain meter ---- */}
      {snap.state === "running" && snap.chain > 0 && (
        <div className="pointer-events-none absolute right-3 top-28 w-32 text-right sm:right-6 sm:w-36">
          <div className="text-[10px] tracking-[0.3em] text-amber-300/80">BLESSING CHAIN</div>
          <div className="font-[Cinzel,Georgia,serif] text-2xl font-bold text-amber-200 tabular-nums">
            {snap.chain}
            {snap.chainTier > 0 && (
              <span className="ml-2 text-base text-amber-400">{TIER_LABEL[snap.chainTier]}</span>
            )}
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300 transition-[width] duration-100"
              style={{
                width: `${Math.min(100, (snap.chainWindow / CHAIN_WINDOW) * 100)}%`,
              }}
            />
          </div>
          {snap.nearMisses > 0 && (
            <div className="mt-1.5 text-[10px] tracking-[0.25em] text-white/40">
              {snap.nearMisses} GRAZES
            </div>
          )}
        </div>
      )}

      {/* ---- Milestone banner ---- */}
      {snap.state === "running" && snap.milestone !== null && (
        <div className="pointer-events-none absolute left-1/2 top-56 -translate-x-1/2 whitespace-nowrap rounded-full border border-amber-300/40 bg-black/50 px-4 py-1.5 text-xs tracking-[0.35em] text-amber-200 backdrop-blur-sm sm:top-32 sm:px-5">
          {snap.milestone.toLocaleString()} METRES
        </div>
      )}

      {/* ---- Graze callout ---- */}
      {snap.state === "running" && snap.nearMissFlash && (
        <div
          className={`pointer-events-none absolute left-1/2 top-1/2 mt-24 -translate-x-1/2 text-center ${
            snap.nearMissFlash.flyOver ? "text-amber-200" : "text-white/85"
          }`}
        >
          <div className="font-[Cinzel,Georgia,serif] text-sm font-bold tracking-[0.4em] drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
            {snap.nearMissFlash.flyOver ? "CLEAN LEAP" : "GRAZE"}
          </div>
          <div className="text-[11px] tracking-[0.3em] text-amber-300/80 tabular-nums">
            +{snap.nearMissFlash.points}
          </div>
        </div>
      )}

      {/* ---- Cinematic run introduction ---- */}
      {inIntro && (
        <div className="pointer-events-none absolute inset-0">
          {/* Letterbox bars retract as control is handed over */}
          <div
            className="absolute inset-x-0 top-0 bg-black"
            style={{ height: `${11 * (1 - p)}vh` }}
          />
          <div
            className="absolute inset-x-0 bottom-0 bg-black"
            style={{ height: `${11 * (1 - p)}vh` }}
          />
          {/* Vignette that lifts with the title */}
          <div
            className="absolute inset-0"
            style={{
              opacity: 0.9 * (1 - p),
              background:
                "radial-gradient(ellipse at 50% 55%, rgba(0,0,0,0) 25%, rgba(6,4,10,0.85) 100%)",
            }}
          />

          <div
            className="absolute inset-x-0 top-1/2 -translate-y-1/2 px-6 text-center"
            style={{ opacity: introTitle }}
          >
            <div className="text-[11px] tracking-[0.55em] text-amber-300/70">
              GANAPATI BAPPA MORIYA
            </div>
            <h1 className="mt-3 bg-gradient-to-b from-amber-50 via-amber-200 to-amber-600 bg-clip-text font-[Cinzel,Georgia,serif] text-2xl font-bold tracking-[0.1em] text-transparent sm:text-6xl sm:tracking-[0.16em]">
              VAKRATUNDA RUN
            </h1>
            <div
              className="mx-auto mt-4 h-px bg-gradient-to-r from-transparent via-amber-300/70 to-transparent"
              style={{ width: `${40 + 45 * p}%` }}
            />
            <p className="mt-4 font-[Rajdhani,system-ui,sans-serif] text-[9px] tracking-[0.2em] text-white/45 sm:text-sm sm:tracking-[0.4em]">
              THE ROAD CLEARS BENEATH THE FESTIVAL LIGHTS
            </p>
          </div>

          <div
            className="absolute inset-x-0 bottom-[13vh] text-center text-[10px] tracking-[0.35em] text-white/45"
            style={{ opacity: introHint }}
          >
            ANY KEY TAKES THE REINS
          </div>
        </div>
      )}

      {/* ---- Back to menu ---- */}
      <Link
        to="/"
        className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full border border-amber-200/20 bg-black/40 px-3 py-1.5 text-xs tracking-wider text-amber-200/80 backdrop-blur-sm transition-colors hover:bg-black/60 sm:bottom-6 sm:left-6"
      >
        <ArrowLeft className="size-3.5" /> Menu
      </Link>

      {/* ---- Control hints (desktop) ---- */}
      {!inIntro && (
        <>
          <div className="pointer-events-none absolute bottom-4 left-1/2 hidden -translate-x-1/2 gap-3 text-[10px] tracking-[0.25em] text-white/35 sm:flex sm:bottom-6 lg:gap-5">
            <span>A · D — LANES</span>
            <span>SPACE — JUMP</span>
            <span>R — RESTART</span>
            <span>M — SOUND</span>
            <span>P · ESC — PAUSE</span>
          </div>
          <div className="pointer-events-none absolute bottom-3 right-3 text-right text-[10px] leading-4 tracking-[0.25em] text-white/35 sm:hidden">
            SWIPE — LANES
            <br />
            TAP — JUMP
          </div>
        </>
      )}

      {/* ---- Debug panel ---- */}
      {debugOpen && (
        <div className="absolute right-3 top-32 max-h-[55vh] w-48 overflow-y-auto rounded-lg border border-amber-200/20 bg-black/70 p-3 text-[11px] leading-5 text-amber-100/90 backdrop-blur-md sm:right-6 sm:top-44 sm:w-52 sm:max-h-[70vh]">
          <div className="mb-2 text-[10px] font-semibold tracking-[0.3em] text-amber-200/60">
            DEBUG
          </div>
          <dl className="grid grid-cols-2 gap-x-2">
            <dt className="text-white/40">FPS</dt>
            <dd className="text-right tabular-nums">{snap.fps}</dd>
            <dt className="text-white/40">State</dt>
            <dd className="text-right capitalize">{snap.state}</dd>
            <dt className="text-white/40">Intro</dt>
            <dd className="text-right tabular-nums">{(snap.introProgress * 100).toFixed(0)}%</dd>
            <dt className="text-white/40">Speed</dt>
            <dd className="text-right tabular-nums">{snap.speed.toFixed(1)} m/s</dd>
            <dt className="text-white/40">Lane</dt>
            <dd className="text-right">{LANES_LABEL[snap.lane]}</dd>
            <dt className="text-white/40">Pos X</dt>
            <dd className="text-right tabular-nums">{snap.posX.toFixed(2)}</dd>
            <dt className="text-white/40">Pos Y</dt>
            <dd className="text-right tabular-nums">{snap.posY.toFixed(2)}</dd>
            <dt className="text-white/40">Distance</dt>
            <dd className="text-right tabular-nums">{snap.distance.toFixed(0)} m</dd>
            <dt className="text-white/40">Intensity</dt>
            <dd className="text-right tabular-nums">{snap.intensity.toFixed(2)} km</dd>
            <dt className="text-white/40">Obstacles</dt>
            <dd className="text-right tabular-nums">{snap.obstacles}</dd>
            <dt className="text-white/40">Chain</dt>
            <dd className="text-right tabular-nums">{snap.chain}</dd>
            <dt className="text-white/40">Grazes</dt>
            <dd className="text-right tabular-nums">{snap.nearMisses}</dd>
            <dt className="text-white/40">Smashes</dt>
            <dd className="text-right tabular-nums">{snap.smashes}</dd>
            <dt className="text-white/40">Night</dt>
            <dd className="text-right tabular-nums">{snap.night.toFixed(2)}</dd>
            <dt className="text-white/40">Rain</dt>
            <dd className="text-right tabular-nums">{snap.rain.toFixed(2)}</dd>
            <dt className="text-white/40">Mist</dt>
            <dd className="text-right tabular-nums">{snap.mist.toFixed(2)}</dd>
            <dt className="text-white/40">Score</dt>
            <dd className="text-right tabular-nums">{snap.score.toLocaleString()}</dd>
          </dl>
          <div className="mt-2 border-t border-white/10 pt-1.5 text-[10px] text-white/35">
            The backtick key toggles this panel. The M key toggles sound. The P
            or Escape key holds the run.
          </div>
        </div>
      )}

      {/* ---- Pause overlay ---- */}
      {paused && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0b0712]/80 px-6 text-center backdrop-blur-sm">
          <div className="mb-3 text-[11px] tracking-[0.5em] text-amber-300/70">
            THE ROAD WAITS
          </div>
          <h2 className="bg-gradient-to-b from-amber-50 via-amber-200 to-amber-600 bg-clip-text font-[Cinzel,Georgia,serif] text-3xl font-bold tracking-[0.12em] text-transparent sm:text-6xl">
            PAUSED
          </h2>
          <p className="mt-4 max-w-sm font-[Rajdhani,system-ui,sans-serif] text-sm leading-6 text-white/60">
            Take a breath. The festival lamps are still lit and the road will
            hold exactly where you left it.
          </p>
          <Button
            type="button"
            onClick={handleTogglePause}
            size="lg"
            className="mt-8 cursor-pointer rounded-full border border-amber-300/40 bg-gradient-to-b from-amber-400 to-amber-700 px-10 text-base font-bold tracking-[0.2em] text-amber-950 shadow-[0_0_40px_rgba(212,160,23,0.35)] transition-transform hover:scale-[1.03]"
          >
            <PlayIcon className="mr-2 size-4" /> RESUME THE RUN
          </Button>
          <div className="mt-5 text-[10px] tracking-[0.3em] text-white/40">
            OR PRESS P · ESC
          </div>
        </div>
      )}

      {/* ---- Ready overlay ---- */}
      {snap.state === "ready" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-[#0b0712]/70 via-[#0b0712]/40 to-[#0b0712]/80 px-6 text-center">
          <div className="mb-3 text-[11px] tracking-[0.5em] text-amber-300/70">
            GANAPATI BAPPA MORIYA
          </div>
          <h1 className="bg-gradient-to-b from-amber-100 via-amber-300 to-amber-600 bg-clip-text font-[Cinzel,Georgia,serif] text-3xl font-bold tracking-[0.08em] text-transparent sm:text-7xl sm:tracking-[0.12em]">
            VAKRATUNDA
            <br />
            RUN
          </h1>
          <p className="mt-4 max-w-md font-[Rajdhani,system-ui,sans-serif] text-sm leading-6 text-white/60">
            The city is lit for the festival and the road is yours alone. Gather
            the sacred modaks to raise your blessing, graze the traffic for extra
            merit, and let the pace find its rhythm. Rarely, the conch will
            appear — Vighnaharta, the remover of obstacles.
          </p>
          <Button
            type="button"
            onClick={handleStart}
            size="lg"
            className="mt-8 cursor-pointer rounded-full border border-amber-300/40 bg-gradient-to-b from-amber-400 to-amber-700 px-10 text-base font-bold tracking-[0.2em] text-amber-950 shadow-[0_0_40px_rgba(212,160,23,0.35)] transition-transform hover:scale-[1.03]"
          >
            <Zap className="mr-2 size-4" /> BEGIN THE RUN
          </Button>
          <div className="mt-5 text-[10px] tracking-[0.3em] text-white/40">
            OR PRESS SPACE
          </div>
          <button
            type="button"
            onClick={handleToggleSound}
            className="mt-6 flex cursor-pointer items-center gap-1.5 rounded-full border border-white/15 bg-black/40 px-3 py-1.5 text-[10px] tracking-[0.25em] text-white/50 backdrop-blur-sm transition-colors hover:bg-black/60"
          >
            <SoundIcon className="size-3" /> SOUND {snap.muted ? "OFF" : "ON"}
          </button>
        </div>
      )}

      {/* ---- Game over overlay ---- */}
      {snap.state === "gameover" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0b0712]/75 px-6 text-center backdrop-blur-[2px]">
          {snap.newBest && (
            <div className="mb-4 animate-pulse rounded-full border border-amber-300/50 bg-amber-400/10 px-4 py-1 text-[10px] tracking-[0.4em] text-amber-200">
              A NEW PERSONAL BEST
            </div>
          )}
          <h2 className="font-[Cinzel,Georgia,serif] text-2xl font-bold tracking-[0.18em] text-amber-100/90 sm:text-4xl sm:tracking-[0.25em]">
            THE RUN ENDS
          </h2>
          <div className="mt-6 flex items-end gap-10">
            <div>
              <div className="text-[10px] tracking-[0.35em] text-white/45">SCORE</div>
              <div className="text-4xl font-bold text-amber-100 tabular-nums sm:text-5xl">
                {snap.score.toLocaleString()}
              </div>
            </div>
            <div className="pb-1">
              <div className="text-[10px] tracking-[0.35em] text-white/45">BEST</div>
              <div className="text-2xl font-semibold text-amber-300/90 tabular-nums">
                {snap.best.toLocaleString()}
              </div>
            </div>
          </div>
          <div className="mt-3 font-[Rajdhani,system-ui,sans-serif] text-xs text-white/50">
            {snap.distance.toFixed(0)} metres, {snap.modaks} modaks gathered,{" "}
            {snap.nearMisses} grazes.
          </div>
          <div className="mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[10px] tracking-[0.25em] text-white/35">
            <span>{climate}</span>
            {snap.smashes > 0 && <span>{snap.smashes} DEMOLITIONS</span>}
          </div>
          <Button
            type="button"
            onClick={handleRestart}
            size="lg"
            className="mt-8 cursor-pointer rounded-full border border-amber-300/40 bg-gradient-to-b from-amber-400 to-amber-700 px-10 text-base font-bold tracking-[0.2em] text-amber-950 shadow-[0_0_40px_rgba(212,160,23,0.35)] transition-transform hover:scale-[1.03]"
          >
            <RotateCcw className="mr-2 size-4" /> RUN AGAIN
          </Button>
          <div className="mt-4 text-[10px] tracking-[0.3em] text-white/40">OR PRESS R</div>
        </div>
      )}
    </div>
  );
}
