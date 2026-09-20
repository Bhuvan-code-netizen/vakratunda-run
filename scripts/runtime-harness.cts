/**
 * Runtime harness — the systems the smoke tests never touch.
 *
 * The smoke suite is pure logic: tuning curves, the chain, the rig, the
 * obstacle catalogue, the magnet. Everything built *around* WebGL — the road
 * ring, the weather, the particle/effect layer, the divine aura, the
 * obstacles, the power-ups, the camera rig, the player controller, the audio
 * graph — was only ever exercised in a live browser, which is exactly where a
 * `TypeError` like "cannot read properties of undefined" hides: it compiles,
 * it lints, it passes every unit test, and it throws the moment the page mounts.
 *
 * So this builds them all against a real `THREE.Scene`, a stubbed DOM (canvas
 * 2D only — `getContext` is all these systems ask for) and no renderer, steps
 * a few hundred frames through every state, and fires every effect method with
 * plausible arguments. Anything that throws is printed with the originating
 * line, which is what the browser console would have shown.
 *
 * It is deliberately NOT a WebGL test: no renderer is created, so it runs on
 * plain node. It answers "does the game throw when it loads", not "does the
 * picture look right".
 *
 * ## The canvas probe
 *
 * Two systems (the road and the effects layer) build a `canvas` element for
 * their procedural textures. Whether the stub below is visible to *them*
 * depends on the host: a normal node shares one global object, but this
 * browser-backed runtime evaluates each module in its own realm, where a
 * stubbed `globalThis` is not the one the module reads.
 *
 * So the stub is installed first, then probed through a real game constructor.
 * If the probe hits exactly the "no document" symptom, the canvas steps are
 * reported as SKIPPED — never as passed — because an environment that cannot
 * host a check must not look like a check that succeeded. Any *other* failure
 * from the probe is rethrown, so a genuine bug still surfaces as a failure.
 */

type AnyRecord = Record<string, unknown>;

/* ------------------------------------------------------------------ */
/* DOM stub — installed before any system is constructed.              */
/* ------------------------------------------------------------------ */

function fakeContext2D() {
  const noop = () => undefined;
  const gradient = { addColorStop: noop };
  return {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    globalAlpha: 1,
    font: "",
    textAlign: "left",
    fillRect: noop,
    clearRect: noop,
    strokeRect: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    arc: noop,
    ellipse: noop,
    fill: noop,
    stroke: noop,
    save: noop,
    restore: noop,
    translate: noop,
    rotate: noop,
    scale: noop,
    fillText: noop,
    drawImage: noop,
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createPattern: () => null,
  };
}

/**
 * Install a global, trying the strategies in order of politeness. A host can
 * expose a global as a getter-only own property (the emulated node here does
 * for `navigator`), where a plain assignment throws but `defineProperty` is
 * still allowed — and vice versa. Returns whether the value is now readable.
 */
function defineGlobal(name: string, value: unknown): boolean {
  const g = globalThis as AnyRecord;
  try {
    Object.defineProperty(g, name, { value, configurable: true, writable: true });
  } catch {
    try {
      g[name] = value;
    } catch {
      return g[name] !== undefined;
    }
  }
  return g[name] !== undefined;
}

function installDom(): boolean {
  const g = globalThis as AnyRecord;
  // A real browser (or jsdom) already has one: leave it alone.
  if (g.document !== undefined) return true;

  const canvas = () => ({
    width: 0,
    height: 0,
    style: {} as AnyRecord,
    getContext: (kind: string) => (kind === "2d" ? fakeContext2D() : null),
    toDataURL: () => "",
  });

  const listeners = {
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };

  const documentOk = defineGlobal("document", {
    ...listeners,
    createElement: (tag: string) => (tag === "canvas" ? canvas() : { style: {} as AnyRecord }),
    body: { appendChild: () => undefined },
    documentElement: {},
    hidden: false,
  });
  defineGlobal("window", {
    ...listeners,
    devicePixelRatio: 1,
    innerWidth: 1280,
    innerHeight: 720,
    matchMedia: () => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
  defineGlobal("navigator", { hardwareConcurrency: 8, maxTouchPoints: 0 });

  return documentOk;
}

installDom();

import * as THREE from "three";
import { COLORS, LANES } from "../src/game/constants";
import { EndlessRoad } from "../src/game/world/EndlessRoad";
import { WeatherSystem } from "../src/game/world/WeatherSystem";
import { WorldEnvironment } from "../src/game/world/WorldEnvironment";
import { PlayerController } from "../src/game/player/PlayerController";
import { ObstacleManager } from "../src/game/obstacles/ObstacleManager";
import { PowerUpManager } from "../src/game/powerups/PowerUpManager";
import { CameraRig } from "../src/game/camera/CameraRig";
import { MovementEffects } from "../src/game/effects/MovementEffects";
import { DivineAura } from "../src/game/effects/DivineAura";
import { AudioSystem } from "../src/game/audio/AudioSystem";

/* ------------------------------------------------------------------ */
/* Min test reporter                                                    */
/* ------------------------------------------------------------------ */

let passed = 0;
const failures: string[] = [];
const skipped: string[] = [];

function ok(label: string, condition: boolean, detail = "") {
  if (condition) passed++;
  else failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

/**
 * Run a labelled step that should not throw. The error is captured rather than
 * rethrown, so one broken system does not hide the state of the others.
 */
function step(label: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (err) {
    const e = err as Error;
    const where = (e.stack ?? "").split("\n").slice(1, 3).join("\n      ");
    failures.push(`${label} threw: ${e.message}\n      ${where}`);
  }
}

/**
 * Can the *game modules* see a canvas? Probed with a real constructor, because
 * the answer depends on the host's module realm, not on this file's globals.
 * Only the exact "no document" symptom counts as "cannot run here"; anything
 * else is a genuine bug and is allowed to surface as a failure.
 */
function canvasUsable(): boolean {
  try {
    const scene = new THREE.Scene();
    const road = new EndlessRoad(scene);
    road.dispose();
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/createElement|document is not defined/.test(message)) return false;
    throw err;
  }
}

const canvasOk = canvasUsable();

/** Steps that need a canvas: skipped, loudly, when the host refuses a stub. */
function canvasStep(label: string, fn: () => void) {
  if (!canvasOk) {
    skipped.push(`${label} (this host gives each module its own realm, so the stubbed document is invisible to it)`);
    return;
  }
  step(label, fn);
}

/* ------------------------------------------------------------------ */
/* 1. Road, weather, environment                                        */
/* ------------------------------------------------------------------ */

canvasStep("endless road builds and scrolls", () => {
  const scene = new THREE.Scene();
  const road = new EndlessRoad(scene);
  for (let i = 0; i < 200; i++) road.update(0.5, true);
  ok("road distance advances", road.distance > 0);
  road.reset();
  ok("road reset clears distance", road.distance === 0);
  road.dispose();
});

step("weather responds to intensity", () => {
  const scene = new THREE.Scene();
  const rain = new WeatherSystem(scene, 128);
  for (let i = 0; i < 60; i++) rain.update(1 / 60, 0.4, 0, 0.5);
  rain.setIntensity(1);
  for (let i = 0; i < 60; i++) rain.update(1 / 60, 0.4, 1.2, 0.8);
  rain.setIntensity(0);
  rain.dispose();
});

step("environment cross-fades day and weather", () => {
  const scene = new THREE.Scene();
  const env = new WorldEnvironment(scene);
  const mixes = [
    { night: 0, mist: 0, rain: 0 },
    { night: 0.5, mist: 0.4, rain: 1 },
    { night: 1, mist: 1, rain: 0.5, haze: 0.4 },
  ];
  for (const mix of mixes) env.update(0, mix);
  env.dispose();
});

/* ------------------------------------------------------------------ */
/* 2. Player controller across every animation state                    */
/* ------------------------------------------------------------------ */

step("player controller runs, jumps, lands and dies", () => {
  const scene = new THREE.Scene();
  const player = new PlayerController(scene, {
    footstep: () => undefined,
    takeOff: () => undefined,
    land: () => undefined,
  });

  for (let i = 0; i < 120; i++) player.update(1 / 60, 22);

  ok("starts grounded", player.isGrounded);
  ok("starts in the centre lane", player.lane === 1);

  ok("centre lane can move left", player.moveLane(-1) === true);
  ok("lane follows the change", player.lane === 0);
  ok("cannot leave the left lane", player.moveLane(-1) === false);
  for (let i = 0; i < 30; i++) player.update(1 / 60, 22);
  ok("lane position settles on LANES[0]", Math.abs(player.positionX - LANES[0]) < 0.05);

  ok("jump leaves the ground", player.jump() === true);
  for (let i = 0; i < 90; i++) player.update(1 / 60, 24);
  ok("lands again", player.isGrounded);
  ok("cannot double-jump", player.jump() && !player.jump());
  for (let i = 0; i < 120; i++) player.update(1 / 60, 24);
  ok("grounded before the mid-air test", player.isGrounded);

  // A lane change must stay responsive while he is in the air.
  player.jump();
  for (let i = 0; i < 6; i++) player.update(1 / 60, 24);
  ok("lane change works mid-jump", player.moveLane(1) === true);
  for (let i = 0; i < 120; i++) player.update(1 / 60, 24);

  player.die();
  ok("die locks the lane", player.moveLane(1) === false);
  for (let i = 0; i < 120; i++) player.update(1 / 60, 0);

  player.reset();
  ok("reset restores the centre lane", player.lane === 1);
  ok("reset restores the ground", player.isGrounded);
  ok("reset restores the pose", player.positionX === LANES[1]);

  // The collision box must stay finite at every step of the jump arc.
  player.jump();
  let finite = true;
  for (let i = 0; i < 120; i++) {
    player.update(1 / 60, 26);
    if (!Number.isFinite(player.bottom) || !Number.isFinite(player.top)) finite = false;
  }
  ok("collision box stays finite through a jump", finite);
});

/* ------------------------------------------------------------------ */
/* 3. Obstacles and power-ups                                           */
/* ------------------------------------------------------------------ */

step("obstacle manager spawns, collides, grazes and smashes", () => {
  const scene = new THREE.Scene();
  const obstacles = new ObstacleManager(scene);

  let peak = 0;
  for (let i = 0; i < 900; i++) {
    obstacles.update(i * 0.6, 18, 1 / 60);
    obstacles.checkCollision(0, 0, 2.2, 0.45, 0.4);
    obstacles.checkNearMiss(0, 0, 2.2, 0.45, 0.4);
    peak = Math.max(peak, obstacles.activeCount);
  }
  ok("obstacles actually spawn", peak > 0, `peak ${peak}`);

  const hit = obstacles.checkCollision(0, 0, 2.2, 0.9, 0.9);
  if (hit) obstacles.smash(hit);
  ok("the road survives a smash", obstacles.activeCount >= 0);

  obstacles.reset();
  ok("obstacle reset empties the road", obstacles.activeCount === 0);
  obstacles.dispose();
});

step("power-up manager spawns and collects", () => {
  const scene = new THREE.Scene();
  const powerUps = new PowerUpManager(scene);

  let peak = 0;
  let taken = 0;
  for (let i = 0; i < 6000; i++) {
    const distance = i * 1.2;
    powerUps.update(distance, 20, 1 / 60);
    peak = Math.max(peak, powerUps.activeCount);
    // Sweep the runner across all three lanes so it takes whatever appears.
    const lane = LANES[i % 3]!;
    const kind = powerUps.collect(lane, 0, 2.4, 0.45, 0.4);
    if (kind) taken++;
  }
  ok("power-ups spawn during a long run", peak > 0, `peak ${peak}`);
  ok("a swept runner takes at least one relic", taken > 0, `taken ${taken}`);
  powerUps.reset();
  ok("power-up reset empties the road", powerUps.activeCount === 0);
  powerUps.dispose();
});

/* ------------------------------------------------------------------ */
/* 4. Camera rig                                                        */
/* ------------------------------------------------------------------ */

step("camera rig follows, kicks and returns", () => {
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 500);
  const rig = new CameraRig(camera, 46);
  let finite = true;

  rig.beginIntro();
  for (let i = 0; i < 240; i++) {
    rig.update(1 / 60, Math.sin(i * 0.1) * 2.4, Math.abs(Math.cos(i * 0.1)) * 1.5, 62);
    if (!Number.isFinite(camera.position.x + camera.position.y + camera.position.z)) {
      finite = false;
    }
  }
  ok("hero shot hands over", rig.introProgress > 0.99, `got ${rig.introProgress}`);

  rig.finishIntro();
  rig.impulse(1.4);
  for (let i = 0; i < 120; i++) rig.update(1 / 60, 0, 0, 62);
  ok("camera positions stay finite", finite);
  ok("camera field of view stays finite", Number.isFinite(camera.fov));
});

/* ------------------------------------------------------------------ */
/* 5. The effect layer: every public emitter, with real arguments       */
/* ------------------------------------------------------------------ */

canvasStep("movement effects emit without throwing", () => {
  const scene = new THREE.Scene();
  const fx = new MovementEffects(scene);

  fx.laneChange(LANES[0]!, -1);
  fx.laneChange(LANES[2]!, 1);
  fx.takeOff(0, 0.2);
  fx.footstep(0, -1, 24);
  fx.footstep(0.2, 1, 30);
  fx.land(0, 0, 1.4);
  fx.land(0, 0, 0.2);
  fx.windStreak(0, 1.2, 28);
  fx.nearMiss(1.2, 0.6, 0.1, false);
  fx.nearMiss(1.2, 0.6, 0.1, true);
  fx.grazeFlare(1.2, 0.6, 0.1, true);
  fx.pickup(0, 0.9, 0.2);
  fx.tierUp(0, 1.2);
  fx.tierBurst(0, 1.2);
  fx.powerUp(0, 1.2, COLORS.shieldGlow);
  fx.powerUp(0, 1.2, COLORS.goldBright);
  fx.powerUpExpire(0, 1.2, COLORS.magnetGlow);
  fx.smash(0, 0.4, 0.1, COLORS.demonAsh);
  fx.smash(0, 0.4, 0.1, COLORS.marigold);
  fx.shieldHit(0, 1.2, 0);
  fx.splash(0, -1);
  fx.dashTrail(0, 1.2, 30);
  fx.magnetPull(0, 1.2, 2.4);
  fx.crash(0, 1.2);
  fx.crashBlast(0, 1.2, 0.1, COLORS.demonEmber);
  fx.ultimateBlast(0, 1.2);
  fx.milestoneBloom(0, 1.2);

  // Then integrate the pools for a few seconds, so the particle update path —
  // the part that actually runs every frame — is covered too.
  for (let i = 0; i < 400; i++) fx.update(1 / 60, 0.5);
  fx.dispose();
});

step("divine aura lights every power", () => {
  const scene = new THREE.Scene();
  const aura = new DivineAura(scene);
  const off = {
    shield: false,
    magnet: false,
    dash: false,
    multiplier: false,
    vighnaharta: false,
  };
  const on = {
    ...off,
    shield: true,
    magnet: true,
    dash: true,
    multiplier: true,
    vighnaharta: true,
  };

  for (let i = 0; i < 60; i++) aura.update(1 / 60, 0, 0, off, 18);
  for (let i = 0; i < 240; i++) aura.update(1 / 60, 1.2, 0.8, on, 34);

  // Drop them one at a time: the expiry path is where a stale handle would bite.
  const kinds = ["shield", "magnet", "dash", "multiplier", "vighnaharta"] as const;
  for (const kind of kinds) {
    const next = { ...on, [kind]: false };
    for (let i = 0; i < 30; i++) aura.update(1 / 60, 0, 0, next, 20);
  }
  aura.dispose();
});

step("audio system survives without a Web Audio context", () => {
  const audio = new AudioSystem();
  // No AudioContext in node: unlock must decline quietly, and every event must
  // be a no-op rather than a crash.
  audio.unlock();
  ok("audio reports not running", audio.isRunning === false);
  audio.footstep(20);
  audio.laneChange(1);
  audio.jump();
  audio.land(1);
  audio.pickup(1, 4);
  audio.tierUp(2);
  audio.graze(true);
  audio.powerUp("magnet");
  audio.powerUp("vighnaharta");
  audio.vighnahartaExpire();
  audio.powerUpExpire();
  audio.smash();
  audio.vighnahartaSmash();
  audio.crash();
  audio.milestone();
  audio.setMuted(true);
  ok("mute is remembered", audio.isMuted === true);
  audio.setMenuDuck(0);
  audio.setMenuDuck(1);
  audio.update(1 / 60, { speed: 20, rain: 0.4, night: 0.5, running: true });
  audio.update(1 / 60, { speed: 20, rain: 0.4, night: 0.5, running: false, intro: true });
  audio.dispose();
});

/* ------------------------------------------------------------------ */

for (const s of skipped) console.log(`  SKIP: ${s}`);
console.log(`\nRUNTIME: ${passed} passed, ${failures.length} failed, ${skipped.length} skipped`);
if (failures.length > 0) {
  for (const f of failures) console.log(`  FAIL: ${f}`);
  process.exit(1);
}
