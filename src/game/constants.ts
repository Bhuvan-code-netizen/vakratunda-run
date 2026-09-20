/**
 * Vakratunda Run — central tuning constants.
 * All gameplay tuning lives here so systems stay data-driven.
 */

/** Lane world X positions. Index 0 = left, 1 = center, 2 = right. */
export const LANES: readonly [number, number, number] = [-2.4, 0, 2.4];
export type LaneIndex = 0 | 1 | 2;

/** Road / world layout */
export const SEGMENT_LENGTH = 30;
export const SEGMENT_COUNT = 10; // 300 m of road in memory
export const ROAD_HALF_WIDTH = 4.2;
// Segments recycle only once they are well behind the gameplay camera, so the
// opening hero shot (which looks back down the road) still has city behind it.
export const RECYCLE_Z = 60;
export const OBSTACLE_RECYCLE_Z = 16;
export const OBSTACLE_SPAWN_Z = -150;

/**
 * Pace (m/s). The world scrolls toward the player and the player stays near
 * z = 0, so pace is a pure function of distance travelled. It is deliberately
 * unbounded: the curve accelerates hard early, bends toward a soft ceiling,
 * then creeps upward forever so a run can never settle into a plateau.
 */
export const BASE_SPEED = 11;
/** Soft asymptote the curve bends toward before creeping past it. */
export const SPEED_CEILING = 30;
/** Metres over which the curve closes most of the gap to the ceiling. */
export const SPEED_APPROACH_DISTANCE = 850;
/** Extra m/s per natural-log unit of distance (in km). Never stops adding. */
export const SPEED_CREEP = 1.6;

/** Pace (m/s) for a given distance travelled. Monotonically increasing. */
export function speedForDistance(distance: number): number {
  const d = Math.max(0, distance);
  const approach = 1 - Math.exp(-d / SPEED_APPROACH_DISTANCE);
  return (
    BASE_SPEED +
    (SPEED_CEILING - BASE_SPEED) * approach +
    SPEED_CREEP * Math.log1p(d / 1000)
  );
}

/**
 * Obstacle cadence is expressed in TIME, not metres, so rising speed tightens
 * the reaction window gradually instead of crowding rows on top of each other.
 */
export const GAP_TIME_START = 3.4;
export const GAP_TIME_MIN = 1.8;
export const GAP_TIME_SHRINK_PER_KM = 0.5;
export const MIN_GAP_DISTANCE = 24;
export const MAX_GAP_DISTANCE = 90;

/** Seconds between obstacle rows at a given distance (shrinks, then floors). */
export function gapTimeForDistance(distance: number): number {
  const km = Math.max(0, distance) / 1000;
  return Math.max(GAP_TIME_MIN, GAP_TIME_START - km * GAP_TIME_SHRINK_PER_KM);
}

/**
 * Chance that a row blocks two lanes. Climbs with distance and caps below 1 so
 * a safe path always exists, no matter how long the run goes on.
 */
export function twoLaneChanceForDistance(distance: number): number {
  return Math.min(0.75, 0.34 + (Math.max(0, distance) / 1000) * 0.1);
}

/** Jump / gravity */
export const GRAVITY = 26;
export const JUMP_VELOCITY = 9.2;

/**
 * Cinematic run introduction (seconds) and the world pace during it. A run
 * opens on a low three-quarter hero shot of the runner, then the camera swings
 * up and around behind him as the city picks up speed.
 */
export const INTRO_DURATION = 2.4;
export const INTRO_SPEED_SCALE = 0.45;
/** Field of view and framing of the opening hero shot. */
export const INTRO_FOV = 46;
export const INTRO_CAM_HEIGHT = 1.45;
export const INTRO_CAM_SIDE = 3.8;
export const INTRO_CAM_DEPTH = 2.6;

/** Gameplay camera: base field of view, plus the punch added at full pace. */
export const CAMERA_FOV = 62;
export const CAMERA_FOV_SPEED_GAIN = 4;
/** Menu (attract) camera field of view. */
export const CAMERA_FOV_ATTRACT = 54;
/** Extra field of view while the Divine Dash is running. */
export const CAMERA_FOV_DASH_GAIN = 9;
/** Extra field of view while Vighnaharta Mode burns. */
export const CAMERA_FOV_V_GAIN = 6;
/** Exponential damping lambdas (1/s) for camera follow and FOV easing. */
export const CAMERA_DAMP = 6;
export const CAMERA_FOV_DAMP = 3.2;

/** Lane switching responsiveness (exponential damping lambda, 1/s) */
export const LANE_DAMP = 12;

/**
 * Squash and stretch: how fast the runner snaps back to shape (lambda, 1/s),
 * and how far a full-impact landing may deform him.
 */
export const SQUASH_DAMP = 14;
export const SQUASH_MAX = 0.18;

/** Above this pace the runner trails wind streaks behind him. */
export const WIND_SPEED_FLOOR = 18;
/** Wind streak cadence, in seconds. */
export const WIND_STREAK_INTERVAL = 0.09;
/** Divine Dash trail cadence, in seconds. */
export const DASH_TRAIL_INTERVAL = 0.045;

/** Player collision half-extents (feet-origin character) */
export const PLAYER_HALF_WIDTH = 0.45;
export const PLAYER_HALF_DEPTH = 0.4;
/** Silhouette height of the runner (feet to the tip of his mukut). */
export const PLAYER_TOP = 2.2;

/** First obstacle row appears after this much distance (m) — a fair start. */
export const FIRST_SPAWN_DISTANCE = 45;

/** Modaks (score collectibles) */
export const MODAK_POINTS = 25; // base points per modak, before multiplier
export const CHAIN_WINDOW = 10; // seconds of grace before the chain breaks
/** Chain counts required to reach multiplier tiers 1x..4x */
export const CHAIN_TIERS: readonly [number, number, number, number] = [0, 5, 10, 20];
/** Modak cadence: first arc after MODAK_FIRST_SPAWN m, then every 30–70 m. */
export const MODAK_FIRST_SPAWN = 20;
export const MODAK_GAP_MIN = 30;
export const MODAK_GAP_MAX = 70;

/** Blessing Chain multiplier for a given chain count. */
export function multiplierForChain(chain: number): number {
  if (chain >= CHAIN_TIERS[3]) return 4;
  if (chain >= CHAIN_TIERS[2]) return 3;
  if (chain >= CHAIN_TIERS[1]) return 2;
  return 1;
}

/* ------------------------------------------------------------------ */
/* Near-miss system                                                    */
/* ------------------------------------------------------------------ */

/** Widest lateral gap that still counts as a graze, in metres. */
export const NEAR_MISS_CLEARANCE = 0.66;
/** How close (in Z) an obstacle must be to the runner to register. */
export const NEAR_MISS_WINDOW = 1.1;
/** Passing over an obstacle within this much clearance is a graze too. */
export const NEAR_MISS_FLY_OVER = 0.42;
/** Minimum seconds between two grazes, so one squeeze cannot double-count. */
export const NEAR_MISS_MIN_INTERVAL = 0.22;
/** Base score for a graze — doubled (and tripled at pace) while dashing. */
export const NEAR_MISS_POINTS = 20;

/* ------------------------------------------------------------------ */
/* Power-ups                                                           */
/* ------------------------------------------------------------------ */

export type PowerUpKind = "shield" | "magnet" | "dash" | "multiplier" | "vighnaharta";

/** First power-up appears after this much distance (m). */
export const POWERUP_FIRST_SPAWN = 150;
export const POWERUP_GAP_MIN = 340;
export const POWERUP_GAP_MAX = 620;
/** Seconds each power-up stays active. */
export const SHIELD_DURATION = 8;
export const MAGNET_DURATION = 9;
export const DASH_DURATION = 4.5;
export const MULTIPLIER_DURATION = 11;
/** Pace gain (fraction of the pace curve) while the Divine Dash is burning. */
export const DASH_PACE_GAIN = 0.34;
/** Modak score factor while the Blessing Multiplier is lit. */
export const MULTIPLIER_FACTOR = 2;
/**
 * Modak Magnet tuning.
 *
 * The field is a corridor, not a disc. `MAGNET_RADIUS` is its half-width and
 * `MAGNET_REACH_Z` / `MAGNET_TRAIL_Z` its reach ahead of and behind the
 * runner. The width is what actually catches modaks — the far lane is 4.8 m
 * out — but the *depth* is what makes it work: a disc centred on the runner
 * only holds a modak in the field for a couple of frames at pace, so the
 * lateral pull never had time to close a lane gap and almost everything it
 * should have caught escaped.
 *
 * The pull itself is a homing speed (m/s) that scales with the pace and with
 * how deep in the field the modak is, and it is clamped to the remaining gap,
 * so a modak can never overshoot the runner's lane line and oscillate.
 *
 * CAPTURE is the safety net, kept *inside* the collection box (MODAK_HALF +
 * PLAYER_HALF_WIDTH = 0.95 m wide, MODAK_HALF + PLAYER_HALF_DEPTH = 0.9 m
 * deep): a modak that reaches it is pinned onto the runner, so a frame at top
 * pace can never carry it past the collection test unseen.
 */
export const MAGNET_RADIUS = 6.5;
export const MAGNET_REACH_Z = 22;
export const MAGNET_TRAIL_Z = 6;
export const MAGNET_PULL = 17;
export const MAGNET_PULL_PACE_GAIN = 0.22;
export const MAGNET_CAPTURE = 0.85;
export const MAGNET_CAPTURE_Z = 0.8;
export const MAGNET_LIFT_SPEED = 4.5;
/** Score for driving straight through an obstacle behind the shield. */
export const SHIELD_SMASH_POINTS = 40;

/**
 * Vighnaharta Mode — the rare ultimate. "Remover of obstacles": for a few
 * seconds the runner is the aspect of Ganesha that nothing may stand against.
 * Whatever touches him is demolished for points, the pace surges, and a column
 * of light marks him on the road. It is deliberately rarer and shorter than
 * the other powers: a reward for a long run, not a routine one.
 */
export const VIGHNAHARTA_DURATION = 6.5;
export const VIGHNAHARTA_FIRST_SPAWN = 600;
export const VIGHNAHARTA_GAP_MIN = 900;
export const VIGHNAHARTA_GAP_MAX = 1500;
export const VIGHNAHARTA_PACE_GAIN = 0.22;
export const VIGHNAHARTA_SMASH_POINTS = 60;

/* ------------------------------------------------------------------ */
/* Atmosphere: time of day and weather                                 */
/* ------------------------------------------------------------------ */

/** Metres from the first sunset frame to deep night. */
export const NIGHT_CYCLE_LENGTH = 2600;
/** Metres each weather phase lasts before easing into the next. */
export const WEATHER_PHASE_LENGTH = 780;

export interface WeatherState {
  /** 0 = dry, 1 = full monsoon downpour. */
  rain: number;
  /** 0 = clear air, 1 = dense festival haze. */
  mist: number;
}

/**
 * Weather phases the run cycles through: still dusk, downpour, thick mist,
 * then a light drizzle before returning to still air. Phases cross-fade over
 * their last quarter, so the air always changes gradually.
 */
const WEATHER_PHASES: readonly WeatherState[] = [
  { rain: 0, mist: 0 },
  { rain: 1, mist: 0.3 },
  { rain: 0, mist: 0.85 },
  { rain: 0.45, mist: 0.45 },
];

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);

/** Smooth 0→1 ramp. */
export function smooth01(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

/** Weather for a distance travelled. Continuous, never jumps. */
export function weatherAtDistance(distance: number): WeatherState {
  const p = Math.max(0, distance) / WEATHER_PHASE_LENGTH;
  const index = Math.floor(p);
  const frac = p - index;
  const here = WEATHER_PHASES[index % WEATHER_PHASES.length];
  const next = WEATHER_PHASES[(index + 1) % WEATHER_PHASES.length];
  const blend = smooth01((frac - 0.72) / 0.28);
  return {
    rain: here.rain + (next.rain - here.rain) * blend,
    mist: here.mist + (next.mist - here.mist) * blend,
  };
}

/** How far into the night the run has travelled: 0 sunset, 1 deep night. */
export function nightForDistance(distance: number): number {
  return smooth01(Math.max(0, distance) / NIGHT_CYCLE_LENGTH);
}

/** Distance milestones (m) that flash a banner in the HUD. */
export const MILESTONE_STEP = 500;

/** Persistence */
export const STORAGE_KEY_BEST = "vakratunda-run/best-score";

/** Shared cinematic palette (warm dusk + festival gold) */
export const COLORS = {
  skyTop: 0x100b1c,
  skyMid: 0x462033,
  skyHorizon: 0x8a3f26,
  fog: 0x6e3327,
  ground: 0x17121a,
  sunLight: 0xffb070,
  hemiSky: 0x9a5a45,
  hemiGround: 0x1a1218,
  skin: 0xd98e5f,
  skinShade: 0xb9704a,
  skinDeep: 0x8d5232,
  skinWarm: 0xe8a878,
  gold: 0xd4af37,
  goldBright: 0xf0d375,
  ivory: 0xf5efe0,
  clothCream: 0xf0e4cc,
  clothShade: 0xd9c9a8,
  vermillion: 0xb8342a,
  maroon: 0x6d1f2a,
  jewel: 0x1d6b58,
  jade: 0x2f7c63,
  haloGlow: 0xffdd93,
  eye: 0x140f16,
  dust: 0x9c8a76,
  spark: 0xffd489,
  stone: 0x3a3644,
  sidewalk: 0x4a4450,
  /* The demon horde that holds the road instead of traffic */
  demonHide: 0x54243a,
  demonHideDeep: 0x2e1220,
  demonBelly: 0x8a4148,
  demonHorn: 0xd8c9ad,
  demonClaw: 0xefe4cd,
  demonGlow: 0xff5a24,
  demonEmber: 0xff8f45,
  demonAsh: 0x6b3a5e,
  barricadeOrange: 0xd4622a,
  lampGlow: 0xffc070,
  modak: 0xf0a832,
  /* Festival street furniture */
  marigold: 0xf5a623,
  marigoldDeep: 0xe07a1c,
  leafGreen: 0x2f6b3a,
  clay: 0xa9542f,
  wood: 0x6b4a2c,
  woodDark: 0x45301d,
  drumBrass: 0xc99a3f,
  drumSkin: 0xe8d7b4,
  powderPink: 0xe0508a,
  powderGreen: 0x4fbf6a,
  powderYellow: 0xf2c43c,
  crackerRed: 0xc02b22,
  canopyBlue: 0x2f6f9e,
  /* Weather + night */
  rain: 0xa8c6e8,
  wetRoad: 0x2b2f3a,
  nightTop: 0x050611,
  nightMid: 0x141a33,
  nightHorizon: 0x2a2a4a,
  nightFog: 0x141827,
  nightSun: 0x8fa6ff,
  rainFog: 0x2c313c,
  /* Divine power-ups */
  shieldGlow: 0x8fd0ff,
  magnetGlow: 0xff7a5c,
  dashGlow: 0xffd76b,
  multiplierGlow: 0xc9a0ff,
  vighnahartaGlow: 0xffe9a8,
} as const;
