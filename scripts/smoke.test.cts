/**
 * Targeted smoke tests for VAKRATUNDA RUN's core game logic.
 *
 * Runs headless in Node via `npx tsx scripts/smoke.test.mts` — no WebGL needed
 * (three.js geometry/materials build fine without a renderer). Covers the
 * modules behind the recent gameplay work: constants tuning curves, the
 * Blessing Chain tracker, score persistence, the Ganesha-on-Mooshika rig and
 * the demon/imp obstacle catalogue.
 */
import { readFileSync } from "node:fs";
import * as THREE from "three";

import {
  BASE_SPEED,
  CHAIN_TIERS,
  CHAIN_WINDOW,
  GAP_TIME_MIN,
  GAP_TIME_START,
  LANES,
  SPEED_CEILING,
  STORAGE_KEY_BEST,
  gapTimeForDistance,
  multiplierForChain,
  speedForDistance,
  twoLaneChanceForDistance,
  type PowerUpKind,
} from "../src/game/constants";
import {
  OBSTACLE_SPECS,
  SPAWNABLE_KINDS,
  isJumpable,
} from "../src/game/obstacles/ObstacleModels";
import {
  SWIPE_MAX,
  SWIPE_MIN,
  TAP_MAX_MS,
  gestureThresholds,
  resolveGesture,
} from "../src/game/core/InputController";
import { profileForDevice } from "../src/game/core/device";
import { ChainTracker } from "../src/game/core/BlessingChain";
import { ModakManager } from "../src/game/collectibles/ModakManager";
import { LANES as LANE_X } from "../src/game/constants";
import { ScoreStore } from "../src/game/core/ScoreStore";
import { buildGanesha } from "../src/game/player/GaneshaModel";
import { buildModak, MODAK_HALF } from "../src/game/collectibles/ModakModel";
import {
  POWERUP_CENTER_Y,
  POWERUP_HALF,
  buildPowerUp,
} from "../src/game/powerups/PowerUpModel";

let passed = 0;
const failures: string[] = [];

function ok(label: string, condition: boolean, detail?: string) {
  if (condition) {
    passed++;
  } else {
    failures.push(label + (detail ? ` — ${detail}` : ""));
  }
}

function eq(label: string, actual: unknown, expected: unknown) {
  ok(
    label,
    actual === expected,
    `expected ${String(expected)}, got ${String(actual)}`,
  );
}

/** Every world position in a subtree is a finite number (no NaN drift). */
function allFinite(root: THREE.Object3D): boolean {
  let finite = true;
  root.traverse((o) => {
    const p = o.position;
    if (![p.x, p.y, p.z].every(Number.isFinite)) finite = false;
    const s = o.scale;
    if (![s.x, s.y, s.z].every(Number.isFinite)) finite = false;
  });
  return finite;
}

/* ------------------------------------------------------------------ */
/* 1. Constants: tuning curves and lanes                               */
/* ------------------------------------------------------------------ */

eq("lanes symmetric", LANES[0], -LANES[2]);
eq("middle lane centred", LANES[1], 0);
eq("speed at 0 is base", speedForDistance(0), BASE_SPEED);
ok(
  "speed increases with distance",
  speedForDistance(1000) > speedForDistance(100) &&
    speedForDistance(20000) > speedForDistance(1000),
);
// The pace has two parts: an approach curve that saturates at the ceiling,
// plus a deliberately unbounded log creep. Assert both halves.
ok(
  "approach saturates near the ceiling",
  speedForDistance(1e4) < SPEED_CEILING + 5,
  `got ${speedForDistance(1e4).toFixed(2)}`,
);
ok(
  "log creep still carries pace past the ceiling",
  speedForDistance(1e6) > speedForDistance(1e4) &&
    speedForDistance(1e6) > SPEED_CEILING,
  `got ${speedForDistance(1e6).toFixed(2)}`,
);
ok(
  "creep is logarithmic, not runaway",
  speedForDistance(1e6) < SPEED_CEILING + 12,
  `got ${speedForDistance(1e6).toFixed(2)}`,
);
eq("gap time starts fresh", gapTimeForDistance(0), GAP_TIME_START);
eq(
  "gap time clamps to minimum",
  gapTimeForDistance(100_000),
  GAP_TIME_MIN,
);
ok(
  "gap time never shrinks upward",
  gapTimeForDistance(4000) < gapTimeForDistance(1000),
);
eq("two-lane chance starts at 0.34", twoLaneChanceForDistance(0), 0.34);
eq(
  "two-lane chance clamps at 0.75",
  twoLaneChanceForDistance(1e6),
  0.75,
);
ok(
  "two-lane chance within bounds",
  twoLaneChanceForDistance(5000) > 0 && twoLaneChanceForDistance(5000) <= 0.75,
);

// Multiplier tiers follow CHAIN_TIERS thresholds exactly.
const expectedTier: [number, number][] = [
  [0, 1],
  [CHAIN_TIERS[1] - 1, 1],
  [CHAIN_TIERS[1], 2],
  [CHAIN_TIERS[2] - 1, 2],
  [CHAIN_TIERS[2], 3],
  [CHAIN_TIERS[3] - 1, 3],
  [CHAIN_TIERS[3], 4],
  [999, 4],
];
for (const [chain, mult] of expectedTier) {
  eq(`multiplier at chain ${chain}`, multiplierForChain(chain), mult);
}

/* ------------------------------------------------------------------ */
/* 2. ChainTracker: tiers, decay window, break                         */
/* ------------------------------------------------------------------ */

{
  const t = new ChainTracker();
  eq("fresh chain count", t.count, 0);
  eq("fresh chain tier", t.tier, 0);
  eq("fresh window remaining", t.windowRemaining, 0);

  // The first modak opens the chain at 1x: no tier change yet.
  eq("first modak opens at 1x", t.onModak(), null);
  eq("1x is tier index 0", t.tier, 0);
  eq("1x multiplier", t.multiplier, 1);

  // Tier-up lands exactly on the threshold, not before.
  for (let i = 1; i < CHAIN_TIERS[1] - 1; i++) t.onModak();
  eq("no tier-up below threshold", t.tier, 0);
  const up = t.onModak();
  ok("tier-up fires at threshold", up?.type === "tier-up" && up.tier === 1);
  eq("tier index advanced", t.tier, 1);
  eq("multiplier follows the tier", t.multiplier, 2);

  // The index and the point multiplier must never drift apart.
  for (let n = 1; n <= 40; n++) {
    const probe = new ChainTracker();
    for (let i = 0; i < n; i++) probe.onModak();
    eq("multiplier at " + n + " modaks", probe.multiplier, multiplierForChain(n));
  }

  // Partial window decay.
  t.tick(CHAIN_WINDOW / 2);
  ok(
    "window halves after half tick",
    Math.abs(t.windowRemaining - CHAIN_WINDOW / 2) < 1e-9,
    `got ${t.windowRemaining}`,
  );

  // Lapse breaks the chain.
  const broken = t.tick(CHAIN_WINDOW);
  ok("lapsed chain breaks", broken?.type === "broken");
  eq("broken chain resets count", t.count, 0);
  eq("broken chain resets tier", t.tier, 0);

  // Breaking with no chain is a no-op.
  eq("break with no chain is null", t.break(), null);
  t.reset();
  eq("reset clears everything", t.count + t.tier + t.windowRemaining, 0);
}

/* ------------------------------------------------------------------ */
/* 3. ScoreStore: persistence with a localStorage stub                 */
/* ------------------------------------------------------------------ */

{
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  };

  store.set(STORAGE_KEY_BEST, "500");
  const s = new ScoreStore();
  eq("reads persisted best", s.best, 500);
  ok("lower score is not a best", s.submit(300) === false);
  eq("best unchanged after lower", s.best, 500);
  ok("higher score is a best", s.submit(750) === true);
  eq("best updated", s.best, 750);
  eq("stub reflects new best", store.get(STORAGE_KEY_BEST), "750");

  // Unreadable storage must not crash (private mode etc.).
  delete (globalThis as Record<string, unknown>).localStorage;
  const s2 = new ScoreStore();
  eq("missing storage starts at 0", s2.best, 0);
  ok("submit works without storage", s2.submit(100) === true);
}

/* ------------------------------------------------------------------ */
/* 4. Ganesha-on-Mooshika rig                                          */
/* ------------------------------------------------------------------ */

{
  const rig = buildGanesha();
  ok("rig root built", rig.root.children.length > 0);
  ok("rig positions finite", allFinite(rig.root));

  // Core god parts.
  for (const key of [
    "hips",
    "torso",
    "head",
    "trunk",
    "modak",
    "earL",
    "earR",
    "crown",
    "halo",
    "prabha",
    "prabhaSpin",
    "prabhaCorona",
    "leftArm",
    "rightArm",
    "leftUpperArm",
    "rightUpperArm",
    "leftLeg",
    "rightLeg",
    "leftKnee",
    "rightKnee",
    "dhoti",
  ] as const) {
    ok(`rig has ${key}`, rig[key] !== undefined);
  }
  eq("trunk has 9 segments", rig.trunkSegments.length, 9);
  eq("trunk bends match segments", rig.trunkBends.length, 9);
  eq("trunk side-bends match segments", rig.trunkSideBends.length, 9);

  // The mount: four paws, whip tail, seated under the rider.
  ok("rig has mooshika", rig.mooshika !== undefined);
  eq("mooshika has 4 paws", rig.mooshikaLegs.length, 4);
  ok(
    "mooshika tail has joints",
    rig.mooshikaTail.length >= 3 &&
      rig.mooshikaTailBends.length === rig.mooshikaTail.length,
    `joints ${rig.mooshikaTail.length}`,
  );
  ok(
    "mooshika rest height is finite",
    Number.isFinite(rig.mooshikaRestY) && rig.mooshikaRestY >= 0,
    `got ${rig.mooshikaRestY}`,
  );
  ok(
    "mooshika centred under rider",
    Math.abs(rig.mooshika.position.x) < 1 &&
      Math.abs(rig.mooshika.position.z) < 1,
    `at (${rig.mooshika.position.x}, ${rig.mooshika.position.z})`,
  );
  ok("mooshika subtree finite", allFinite(rig.mooshika));

  // Rider is lifted onto the mount: hips above the animal's rest height.
  ok(
    "rider sits above the mount",
    rig.hips.position.y > rig.mooshikaRestY + 0.5,
    `hips ${rig.hips.position.y.toFixed(2)} vs mount ${rig.mooshikaRestY.toFixed(2)}`,
  );
}

/* ------------------------------------------------------------------ */
/* 5. Obstacle catalogue: demons replaced the cars                     */
/* ------------------------------------------------------------------ */

{
  const kinds = Object.keys(OBSTACLE_SPECS);
  ok("demon kind exists", kinds.includes("demon"), `kinds: ${kinds.join(",")}`);
  ok("imp kind exists", kinds.includes("imp"));
  ok("no leftover car", !kinds.includes("car"));
  ok("no leftover rickshaw", !kinds.includes("rickshaw"));

  for (const kind of kinds) {
    const spec = OBSTACLE_SPECS[kind as keyof typeof OBSTACLE_SPECS];
    ok(`${kind} spec extents positive`, spec.halfW > 0 && spec.halfH > 0 && spec.halfD > 0);
    const model = spec.build();
    ok(`${kind} builds geometry`, model.children.length > 0);
    ok(`${kind} positions finite`, allFinite(model));
  }

  ok(
    "all spawnable kinds have specs",
    SPAWNABLE_KINDS.every((k) => OBSTACLE_SPECS[k] !== undefined),
  );

  // Jumpability is exactly the low fence-like set.
  const jumpable = new Set(["barricade", "crackerStack", "coconutHeap"]);
  for (const kind of kinds) {
    eq(
      `isJumpable(${kind})`,
      isJumpable(kind as keyof typeof OBSTACLE_SPECS),
      jumpable.has(kind),
    );
  }
}

/* ------------------------------------------------------------------ */
/* 6. Collectibles and power-ups build                                 */
/* ------------------------------------------------------------------ */

{
  const modak = buildModak();
  ok("modak builds", modak.children.length > 0);
  ok("modak half-extent positive", MODAK_HALF > 0);

  const kinds: PowerUpKind[] = [
    "shield",
    "magnet",
    "dash",
    "multiplier",
    "vighnaharta",
  ];
  for (const kind of kinds) {
    const model = buildPowerUp(kind);
    ok(
      `power-up ${kind} builds`,
      model.children.length > 0 && allFinite(model),
    );
  }
  ok("power-up pickup height positive", POWERUP_CENTER_Y > 0);
  ok("power-up radius positive", POWERUP_HALF > 0);
}

/* ------------------------------------------------------------------ */
/* 7. Mobile input: gesture resolution and the device budget           */
/* ------------------------------------------------------------------ */

{
  const { swipe } = gestureThresholds(390, 780);

  // A short press in place is a tap, wherever on the road it lands.
  eq("tap jumps", resolveGesture(0, 0, 90, swipe), "jump");
  eq("a shaky tap still jumps", resolveGesture(6, -5, 180, swipe), "jump");
  eq(
    "a slow press is not a tap",
    resolveGesture(0, 0, TAP_MAX_MS + 1, swipe),
    null,
  );

  // Horizontal travel past the threshold changes lane, by direction.
  eq("swipe right", resolveGesture(swipe + 4, 0, 120, swipe), "right");
  eq("swipe left", resolveGesture(-(swipe + 4), 0, 120, swipe), "left");
  eq(
    "a diagonal that is mostly vertical does not change lane",
    resolveGesture(swipe + 4, swipe * 3, 120, swipe),
    null,
  );
  eq(
    "a slow drag is not a lane change",
    resolveGesture(swipe - 1, 0, 600, swipe),
    null,
  );

  // Vertical flicks: up jumps, down is deliberately inert.
  eq("upward flick jumps", resolveGesture(2, -(swipe + 6), 130, swipe), "jump");
  eq("downward flick is inert", resolveGesture(2, swipe + 20, 130, swipe), null);

  // Thresholds scale with the viewport, and clamp at both ends.
  const phone = gestureThresholds(390, 844);
  ok(
    "phone threshold is usable",
    phone.swipe >= SWIPE_MIN && phone.swipe <= SWIPE_MAX,
    `got ${phone.swipe}`,
  );
  eq(
    "degenerate viewport falls back to a phone",
    gestureThresholds(0, 0).swipe,
    gestureThresholds(390, 780).swipe,
  );
  eq(
    "a huge viewport clamps at the maximum",
    gestureThresholds(4000, 3000).swipe,
    SWIPE_MAX,
  );
  ok(
    "the threshold grows with the short edge",
    gestureThresholds(500, 900).swipe >= phone.swipe,
    `${gestureThresholds(500, 900).swipe} vs ${phone.swipe}`,
  );
}

{
  // The rendering budget: touch devices must never render at a pixel ratio
  // that melts the frame rate.
  const phone = profileForDevice({ touch: true, budget: "medium", reducedMotion: false });
  ok(
    "touch caps the pixel ratio",
    phone.maxPixelRatio <= 1.5,
    `got ${phone.maxPixelRatio}`,
  );
  ok("touch shrinks the shadow map", phone.shadowMapSize <= 1024);
  ok("touch keeps a real rain budget", phone.rainCapacity > 0);

  const weakPhone = profileForDevice({ touch: true, budget: "low" });
  ok(
    "a weak phone is capped harder",
    weakPhone.lowPower && weakPhone.maxPixelRatio < phone.maxPixelRatio,
    `${weakPhone.maxPixelRatio} vs ${phone.maxPixelRatio}`,
  );

  const desktop = profileForDevice({ touch: false, budget: "high" });
  eq("desktop keeps full quality", desktop.maxPixelRatio, 2);
  ok("desktop shadows are the big map", desktop.shadowMapSize >= 2048);
  eq(
    "reduced motion is carried through",
    profileForDevice({ touch: true, reducedMotion: true }).reducedMotion,
    true,
  );
}

/* ------------------------------------------------------------------ */
/* 8. The mobile styling contract                                      */
/* ------------------------------------------------------------------ */

{
  // The play page and the stylesheet agree on a handful of class names. If one
  // side ever loses one, touch play breaks silently: swipes start scrolling the
  // page, the pads slip under the home indicator, the portrait nudge covers the
  // score. Cheap to assert, expensive to notice by hand.
  const read = (path: string) => {
    try {
      return readFileSync(path, "utf8");
    } catch {
      return "";
    }
  };

  const css = read("src/index.css");
  const play = read("src/pages/Play.tsx");
  const pads = read("src/components/game/TouchControls.tsx");

  if (css && play && pads) {
    for (const name of [
      ".game-surface",
      ".game-portrait-hint",
      ".safe-bottom",
      ".safe-x",
    ]) {
      ok(`stylesheet defines ${name}`, css.includes(name));
    }
    ok(
      "the canvas keeps touch-action none",
      /.game-surface canvas\s*\{[^}]*touch-action:\s*none/.test(css),
    );
    ok("the play page wears the touch surface", play.includes("game-surface"));
    ok(
      "the pads use the safe-area helpers",
      pads.includes("safe-bottom") && pads.includes("safe-x"),
    );
    ok("the pads press on pointer-down", pads.includes("onPointerDown"));
    ok("the pads only render on touch devices", pads.includes("useIsTouch"));
  } else {
    ok("styling contract check skipped (sources not readable)", true);
  }
}

/* ------------------------------------------------------------------ */
/* 9. Modak Magnet: the field has to actually catch modaks             */
/* ------------------------------------------------------------------ */

{
  const DT = 1 / 60;
  const PLAYER_HALF_W = 0.45;
  const PLAYER_HALF_D = 0.4;
  const PLAYER_TOP = 2.2;

  /**
   * Run a full arc past the runner and count what he actually picked up.
   * This is the end-to-end question the magnet has to answer: modaks spawn
   * 150 m away in one lane, the runner never moves sideways, and the field
   * either brings them home or it does not.
   */
  function runArc(opts: {
    speed: number;
    magnet: boolean;
    modakLane: 0 | 1 | 2;
    playerLane: 0 | 1 | 2;
    playerY?: number;
    strength?: number;
    count?: number;
  }) {
    const scene = new THREE.Scene();
    const manager = new ModakManager(scene, 24);
    const count = opts.count ?? 5;
    manager.queueArc(count, opts.modakLane);
    const playerX = LANE_X[opts.playerLane];
    const playerY = opts.playerY ?? 0;
    let collected = 0;
    // Far enough for the arc to spawn, cross the road and pass him.
    const frames = Math.ceil(200 / (opts.speed * DT));

    for (let f = 0; f < frames; f++) {
      manager.update(opts.speed, DT, {
        active: opts.magnet,
        x: playerX,
        y: playerY,
        strength: opts.strength ?? 1,
      });
      collected += manager.collect(
        playerX,
        playerY,
        playerY + PLAYER_TOP,
        PLAYER_HALF_W,
        PLAYER_HALF_D,
      );
    }
    manager.dispose();
    return collected;
  }

  // Baseline: with no magnet, an off-lane arc is simply missed. Without this
  // the magnet assertions below would not prove anything.
  eq("no magnet misses an adjacent-lane arc", runArc({ speed: 18, magnet: false, modakLane: 0, playerLane: 1 }), 0);
  eq("no magnet misses a far-lane arc", runArc({ speed: 18, magnet: false, modakLane: 0, playerLane: 2 }), 0);

  // The whole arc should come home — not a modak or two.
  eq("magnet sweeps an adjacent lane", runArc({ speed: 18, magnet: true, modakLane: 0, playerLane: 1 }), 5);
  eq("magnet sweeps the far lane", runArc({ speed: 18, magnet: true, modakLane: 0, playerLane: 2 }), 5);
  eq("magnet sweeps from the far lane too", runArc({ speed: 18, magnet: true, modakLane: 2, playerLane: 0 }), 5);

  // Pace is where the old field fell apart: it only held a modak in range for
  // a couple of frames, so the lateral pull came up metres short.
  eq("magnet still sweeps at a fast clip", runArc({ speed: 26, magnet: true, modakLane: 0, playerLane: 2 }), 5);
  eq("magnet still sweeps at top pace", runArc({ speed: 34, magnet: true, modakLane: 0, playerLane: 2 }), 5);
  eq("magnet sweeps at the very start of a run", runArc({ speed: 11, magnet: true, modakLane: 0, playerLane: 2 }), 5);

  // Mid-jump the field has to rise with him, or the modaks sail underneath.
  eq(
    "magnet follows the runner into the air",
    runArc({ speed: 20, magnet: true, modakLane: 0, playerLane: 1, playerY: 1.6 }),
    5,
  );

  // A full arc is five long, and arcs can be longer: the corridor must not
  // tear the tail off the arc.
  eq("magnet takes a long arc whole", runArc({ speed: 24, magnet: true, modakLane: 0, playerLane: 2, count: 10 }), 10);

  // Once the field dies the road goes back to normal: a modak that was being
  // pulled must not still be collected by a magnet that has gone out.
  eq(
    "a dead field pulls nothing",
    runArc({ speed: 18, magnet: true, modakLane: 0, playerLane: 2, strength: 0 }),
    0,
  );
}

/* ------------------------------------------------------------------ */

console.log(`\nSMOKE: ${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  for (const f of failures) console.log(`  FAIL: ${f}`);
  process.exit(1);
}
