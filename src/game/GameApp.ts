import * as THREE from "three";
import {
  BASE_SPEED,
  CAMERA_FOV,
  CAMERA_FOV_ATTRACT,
  CAMERA_FOV_DASH_GAIN,
  CAMERA_FOV_SPEED_GAIN,
  CAMERA_FOV_V_GAIN,
  COLORS,
  DASH_DURATION,
  DASH_PACE_GAIN,
  DASH_TRAIL_INTERVAL,
  INTRO_DURATION,
  INTRO_FOV,
  INTRO_SPEED_SCALE,
  LANES,
  MAGNET_DURATION,
  MILESTONE_STEP,
  MODAK_FIRST_SPAWN,
  MODAK_GAP_MAX,
  MODAK_GAP_MIN,
  MODAK_POINTS,
  MULTIPLIER_DURATION,
  MULTIPLIER_FACTOR,
  NEAR_MISS_MIN_INTERVAL,
  NEAR_MISS_POINTS,
  SHIELD_DURATION,
  SHIELD_SMASH_POINTS,
  SPEED_CEILING,
  VIGHNAHARTA_DURATION,
  VIGHNAHARTA_PACE_GAIN,
  VIGHNAHARTA_SMASH_POINTS,
  WIND_SPEED_FLOOR,
  WIND_STREAK_INTERVAL,
  nightForDistance,
  speedForDistance,
  weatherAtDistance,
  type PowerUpKind,
} from "./constants";
import { InputController } from "./core/InputController";
import { ScoreStore } from "./core/ScoreStore";
import { ChainTracker } from "./core/ChainTracker";
import { PlayerController } from "./player/PlayerController";
import { CameraRig } from "./camera/CameraRig";
import { AudioSystem } from "./audio/AudioSystem";
import { WeatherSystem } from "./world/WeatherSystem";
import { WorldEnvironment, type Climate } from "./world/WorldEnvironment";
import { EndlessRoad } from "./world/EndlessRoad";
import { ObstacleManager } from "./obstacles/ObstacleManager";
import { ModakManager } from "./collectibles/ModakManager";
import { MovementEffects } from "./effects/MovementEffects";
import { DivineAura, type ActivePowers } from "./effects/DivineAura";
import { PowerUpManager } from "./powerups/PowerUpManager";
import { POWERUP_COLORS } from "./powerups/PowerUpModel";

/**
 * `intro` is the cinematic opening of a run: the world is already moving, the
 * camera is still on its hero shot and collisions are held back so nobody dies
 * before they have seen the road.
 */
export type GameState = "ready" | "intro" | "running" | "paused" | "gameover";

/** Seconds left on each divine power. 0 means it is not lit. */
export type PowerTimers = Record<PowerUpKind, number>;

export interface GameSnapshot {
  state: GameState;
  score: number;
  best: number;
  distance: number;
  speed: number;
  lane: number;
  posX: number;
  posY: number;
  obstacles: number;
  modaks: number;
  chain: number;
  chainTier: number;
  chainWindow: number;
  /** Kilometres travelled — the endless difficulty scalar. */
  intensity: number;
  /** 0 during the opening hero shot, 1 once the run is in the player's hands. */
  introProgress: number;
  /** Seconds remaining on each divine power. */
  powerUps: PowerTimers;
  /** Grazes survived this run. */
  nearMisses: number;
  /** The most recent graze, for the HUD callout. */
  nearMissFlash: { points: number; flyOver: boolean } | null;
  /** Obstacles demolished on the run. */
  smashes: number;
  /** 0 sunset … 1 deep night. */
  night: number;
  /** 0 dry … 1 monsoon downpour. */
  rain: number;
  /** 0 clear air … 1 thick festival haze. */
  mist: number;
  /** Whether the sound layer is muted right now. */
  muted: boolean;
  fps: number;
  newBest: boolean;
  milestone: number | null;
  /** True while the run is held on the pause screen. */
  paused: boolean;
}

export interface GameCallbacks {
  onSnapshot: (s: GameSnapshot) => void;
  /** UI toggles its debug overlay when the debug key is pressed. */
  onDebugToggle?: () => void;
}

const ZERO_POWERS = (): PowerTimers => ({
  shield: 0,
  magnet: 0,
  dash: 0,
  multiplier: 0,
  vighnaharta: 0,
});

function durationFor(kind: PowerUpKind): number {
  if (kind === "shield") return SHIELD_DURATION;
  if (kind === "magnet") return MAGNET_DURATION;
  if (kind === "dash") return DASH_DURATION;
  if (kind === "vighnaharta") return VIGHNAHARTA_DURATION;
  return MULTIPLIER_DURATION;
}

/**
 * Top-level game orchestrator. Owns the renderer/scene/loop and wires all
 * systems together. React talks to it only through start()/restart(),
 * onSnapshot, audio controls and onDebugToggle.
 */
export class GameApp {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private cameraRig: CameraRig;
  private environment: WorldEnvironment;
  private rain: WeatherSystem;
  private road: EndlessRoad;
  private player: PlayerController;
  private obstacles: ObstacleManager;
  private modaks: ModakManager;
  private powerUps: PowerUpManager;
  private effects: MovementEffects;
  private aura: DivineAura;
  private audio = new AudioSystem();
  private chain = new ChainTracker();
  private input = new InputController();
  private scoreStore = new ScoreStore();
  private canvas: HTMLCanvasElement;
  private callbacks: GameCallbacks;

  private state: GameState = "ready";
  private speed = BASE_SPEED;
  private score = 0;
  private modaksCollected = 0;
  private newBest = false;
  private nextMilestone = MILESTONE_STEP;
  private milestoneFlash: number | null = null;
  private milestoneFlashTimer = 0;
  private modakNextSpawn = MODAK_FIRST_SPAWN;
  private introTimer = 0;
  private windTimer = 0;
  private dashTrailTimer = 0;
  private powerTimers = ZERO_POWERS();
  private nearMissCooldown = 0;
  private nearMissCount = 0;
  private nearMissFlash: { points: number; flyOver: boolean } | null = null;
  private nearMissFlashTimer = 0;
  private smashes = 0;
  private climate: Climate = { night: 0, mist: 0.15, rain: 0, haze: 0 };
  private rafId = 0;
  private clock = new THREE.Clock();
  private fpsSmoothed = 60;
  private snapshotTimer = 0;
  private disposed = false;

  private readonly powers: ActivePowers = {
    shield: false,
    magnet: false,
    dash: false,
    multiplier: false,
    vighnaharta: false,
  };

  constructor(canvas: HTMLCanvasElement, callbacks: GameCallbacks) {
    this.canvas = canvas;
    this.callbacks = callbacks;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    // The hero shot starts narrow and widens into the gameplay field of view.
    this.camera = new THREE.PerspectiveCamera(INTRO_FOV, 1, 0.1, 500);
    this.cameraRig = new CameraRig(this.camera, INTRO_FOV);

    this.environment = new WorldEnvironment(this.scene, this.renderer);
    this.rain = new WeatherSystem(this.scene);
    this.road = new EndlessRoad(this.scene);
    this.effects = new MovementEffects(this.scene);
    this.aura = new DivineAura(this.scene);
    this.obstacles = new ObstacleManager(this.scene);
    this.modaks = new ModakManager(this.scene);
    this.powerUps = new PowerUpManager(this.scene);

    // The controller raises movement signals; the effect and audio layers
    // decide how they look and sound. Keeping that split means a real character
    // rig can replace this one without touching any of the wiring below.
    this.player = new PlayerController(this.scene, {
      footstep: (x, side, speed) => {
        this.effects.footstep(x, side, speed);
        this.audio.footstep(speed);
        // Wet asphalt throws water instead of dust.
        if (this.climate.rain > 0.25) this.effects.splash(x, side);
      },
      takeOff: (x, y) => {
        this.effects.takeOff(x, y);
        this.audio.jump();
      },
      land: (x, y, impact) => {
        this.effects.land(x, y, impact);
        this.audio.land(impact);
        if (impact > 0.75) this.cameraRig.impulse(0.12 * impact);
      },
    });

    this.player.root.position.set(LANES[1], 0, 0);

    this.input.on((action) => {
      // Browsers only allow audio to start from a genuine gesture, and this is
      // the first one we are guaranteed to see.
      this.audio.unlock();

      if (action === "debug") {
        this.callbacks.onDebugToggle?.();
        return;
      }
      if (action === "audio") {
        this.setMuted(!this.audio.isMuted);
        return;
      }
      // Pausing is the one action that must not skip the hero shot.
      if (action === "pause") {
        this.togglePause();
        return;
      }

      // Any action during the hero shot skips it, then applies to the run.
      if (this.state === "intro") this.endIntro();

      if (action === "left") {
        if (this.state === "running" || this.state === "ready") this.stepLane(-1);
      } else if (action === "right") {
        if (this.state === "running" || this.state === "ready") this.stepLane(1);
      } else if (action === "jump") {
        if (this.state === "running") this.player.jump();
        else if (this.state === "ready") this.start();
        else if (this.state === "gameover") this.restart();
      } else if (action === "restart") {
        if (this.state !== "ready") this.restart();
      }
    });

    this.input.attach(canvas);
    this.handleResize();
    window.addEventListener("resize", this.handleResize);
    // A sandboxed runtime can reclaim the GPU context at any time. Unhandled,
    // that turns the canvas white with no explanation — so surface it.
    canvas.addEventListener("webglcontextlost", this.handleContextLost);
    this.loop();
  }

  private handleContextLost = (e: Event) => {
    e.preventDefault(); // we are not restoring in place; reload is the path
    console.error("[Vakratunda] WebGL context lost");
    window.dispatchEvent(
      new ErrorEvent("error", {
        error: new Error(
          "The GPU context was reclaimed by the browser runtime. Reload to restart the renderer.",
        ),
      }),
    );
  };

  /** Mute or unmute the sound layer (also toggled with the M key). */
  setMuted(muted: boolean) {
    this.audio.unlock();
    this.audio.setMuted(muted);
    this.emitSnapshot();
  }

  get muted(): boolean {
    return this.audio.isMuted;
  }

  /**
   * Hold the run exactly where it stands — pace, traffic, power timers and
   * the clock — or let it go again. Only a live run can be held.
   */
  togglePause() {
    if (this.state === "running") {
      this.state = "paused";
      this.emitSnapshot();
    } else if (this.state === "paused") {
      this.state = "running";
      this.emitSnapshot();
    }
  }

  start() {
    if (this.state === "intro" || this.state === "running" || this.state === "paused")
      return;
    if (this.state === "gameover") {
      this.restart();
      return;
    }
    this.audio.unlock();
    this.state = "intro";
    this.introTimer = 0;
    this.speed = speedForDistance(this.road.distance);
    this.cameraRig.beginIntro();
    this.emitSnapshot();
  }

  /** Hand control to the player (hero shot skipped, or finished on its own). */
  private endIntro() {
    if (this.state !== "intro") return;
    this.state = "running";
    this.introTimer = INTRO_DURATION;
    this.cameraRig.finishIntro();
    this.audio.setMenuDuck(1);
    this.emitSnapshot();
  }

  /** A lane change that also throws the sideways gust. */
  private stepLane(dir: -1 | 1) {
    if (this.player.moveLane(dir)) {
      this.effects.laneChange(this.player.root.position.x, dir);
      this.audio.laneChange(dir);
    }
  }

  /** Light a divine power, refreshing it if it is already burning. */
  private activatePower(kind: PowerUpKind, x: number, y: number) {
    this.powerTimers[kind] = durationFor(kind);
    this.powers[kind] = true;
    this.effects.powerUp(x, y, POWERUP_COLORS[kind]);
    // Vighnaharta gets the full set piece: the street turns over for it.
    if (kind === "vighnaharta") this.effects.ultimateBlast(x, y);
    this.audio.powerUp(kind);
    // The ultimate lands hard: a bigger camera kick than the other relics.
    this.cameraRig.impulse(kind === "dash" ? 0.28 : kind === "vighnaharta" ? 0.34 : 0.1);
  }

  /** Age the power timers and report which ones just went out. */
  private tickPowers(dt: number, x: number, y: number) {
    const kinds: PowerUpKind[] = ["shield", "magnet", "dash", "multiplier", "vighnaharta"];
    for (const kind of kinds) {
      const left = this.powerTimers[kind];
      if (left <= 0) {
        this.powers[kind] = false;
        continue;
      }
      const next = left - dt;
      this.powerTimers[kind] = next > 0 ? next : 0;
      this.powers[kind] = next > 0;
      if (next <= 0) {
        this.effects.powerUpExpire(x, y, POWERUP_COLORS[kind]);
        if (kind === "vighnaharta") this.audio.vighnahartaExpire();
        else this.audio.powerUpExpire();
      }
    }
  }

  /** Reset everything and show the ready screen. */
  restart() {
    this.speed = BASE_SPEED;
    this.score = 0;
    this.modaksCollected = 0;
    this.newBest = false;
    this.nextMilestone = MILESTONE_STEP;
    this.milestoneFlash = null;
    this.milestoneFlashTimer = 0;
    this.modakNextSpawn = MODAK_FIRST_SPAWN;
    this.introTimer = 0;
    this.windTimer = 0;
    this.dashTrailTimer = 0;
    this.powerTimers = ZERO_POWERS();
    this.powers.shield = false;
    this.powers.magnet = false;
    this.powers.dash = false;
    this.powers.multiplier = false;
    this.powers.vighnaharta = false;
    this.nearMissCooldown = 0;
    this.nearMissCount = 0;
    this.nearMissFlash = null;
    this.nearMissFlashTimer = 0;
    this.smashes = 0;
    this.climate = { night: 0, mist: 0.15, rain: 0, haze: 0 };
    this.rain.setIntensity(0);
    this.chain.reset();
    this.player.reset();
    this.obstacles.reset();
    this.modaks.reset();
    this.powerUps.reset();
    this.road.reset();
    this.cameraRig.finishIntro();
    this.audio.setMenuDuck(0.45);
    this.state = "ready";
    this.emitSnapshot();
  }

  private handleResize = () => {
    if (this.disposed) return;
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  /** Queue a modak arc in a random lane. */
  private spawnModakArcs() {
    if (Math.random() < 0.55) {
      const lane = Math.floor(Math.random() * 3) as 0 | 1 | 2;
      this.modaks.queueArc(4 + Math.floor(Math.random() * 3), lane);
    }
  }

  /**
   * Field of view for the current pace: wider the faster he runs, wider again
   * while the Divine Dash burns, and wider still under Vighnaharta.
   */
  private playFov(): number {
    const norm = THREE.MathUtils.clamp(
      (this.speed - BASE_SPEED) / (SPEED_CEILING - BASE_SPEED),
      0,
      1.5,
    );
    const dash = this.powers.dash ? CAMERA_FOV_DASH_GAIN : 0;
    const v = this.powers.vighnaharta ? CAMERA_FOV_V_GAIN : 0;
    return CAMERA_FOV + CAMERA_FOV_SPEED_GAIN * norm + dash + v;
  }

  /** Grit and air torn past the runner once the pace is up. */
  private runWindStreaks(dt: number, speed: number) {
    if (speed < WIND_SPEED_FLOOR) return;
    this.windTimer -= dt;
    if (this.windTimer > 0) return;
    this.windTimer = WIND_STREAK_INTERVAL;
    this.effects.windStreak(this.player.root.position.x, this.player.positionY, speed);
  }

  /** Gold sparks raked off the runner while the Divine Dash is burning. */
  private runDashTrail(dt: number) {
    if (!this.powers.dash) return;
    this.dashTrailTimer -= dt;
    if (this.dashTrailTimer > 0) return;
    this.dashTrailTimer = DASH_TRAIL_INTERVAL;
    this.effects.dashTrail(this.player.root.position.x, this.player.positionY, this.speed);
  }

  private loop = () => {
    if (this.disposed) return;
    this.rafId = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.fpsSmoothed += (1 / Math.max(dt, 1e-4) - this.fpsSmoothed) * 0.05;

    let fovTarget = CAMERA_FOV_ATTRACT;

    if (this.state === "intro") {
      this.stepRun(dt);
      this.introTimer += dt;
      if (this.introTimer >= INTRO_DURATION) this.endIntro();
    } else if (this.state === "running") {
      this.stepRun(dt);
    } else if (this.state === "paused") {
      // Held: the world is frozen exactly as it was. Pace, traffic, timers,
      // collisions and the camera all wait. The frame is still rendered so
      // the frozen run stays on screen behind the pause overlay.
    } else if (this.state === "ready") {
      // Decorative idle scroll for the ready scene. It is explicitly NOT run
      // distance: idling can never consume the fair-start buffer, milestones
      // or the modak cadence.
      const advance = BASE_SPEED * 0.35 * dt;
      this.player.update(dt, BASE_SPEED * 0.35);
      this.road.update(advance, false);
      this.effects.update(dt, advance);
      this.setClimate(0, 0);
      this.rain.update(dt, advance, this.player.root.position.x, 0);
      this.environment.update(0, this.climate);
      this.aura.update(dt, this.player.root.position.x, 0, this.powers, BASE_SPEED * 0.35);
    } else {
      // gameover: world halts, death topple animation plays
      this.player.update(dt, 0);
      this.effects.update(dt, 0);
      this.aura.update(dt, this.player.root.position.x, this.player.positionY, this.powers, 0);
    }

    // The hero shot eases the field of view out of its title framing.
    if (this.state !== "ready") {
      fovTarget = INTRO_FOV + (this.playFov() - INTRO_FOV) * this.cameraRig.introProgress;
    }

    this.audio.update(dt, {
      speed: this.speed,
      rain: this.climate.rain,
      night: this.climate.night,
      running: this.state === "running" || this.state === "intro",
      intro: this.state === "intro",
    });

    this.cameraRig.update(dt, this.player.root.position.x, this.player.positionY, fovTarget);
    this.renderer.render(this.scene, this.camera);

    // Throttled snapshot for the React HUD (~10 Hz)
    this.snapshotTimer += dt;
    if (this.snapshotTimer >= 0.1) {
      this.snapshotTimer = 0;
      this.emitSnapshot();
    }
  };

  /** Derive time of day and weather from the run's progress, then apply them. */
  private setClimate(distance: number, haze: number) {
    const weather = weatherAtDistance(distance);
    const night = nightForDistance(distance);
    this.climate = { night, mist: weather.mist, rain: weather.rain, haze };
    return this.climate;
  }

  /**
   * One frame of the live run: pace curve, world scroll, spawning, pickups,
   * powers, grazes, chains, milestones and collisions. The introduction runs
   * through the same path, just slowed and with collisions held back.
   */
  private stepRun(dt: number) {
    // Pace starts gentle while the camera is still on its hero shot, then
    // climbs into the endless difficulty curve. The Divine Dash adds on top,
    // and Vighnaharta adds its own surge above that.
    const introScale = 1 - (1 - this.cameraRig.introProgress) * (1 - INTRO_SPEED_SCALE);
    const dashScale = this.powers.dash ? 1 + DASH_PACE_GAIN : 1;
    const vScale = this.powers.vighnaharta ? 1 + VIGHNAHARTA_PACE_GAIN : 1;
    this.speed = speedForDistance(this.road.distance) * introScale * dashScale * vScale;
    const advance = this.speed * dt;

    this.player.setPace(this.speed);
    this.player.update(dt, this.speed);
    this.road.update(advance, true);
    this.obstacles.update(this.road.distance, this.speed, dt);
    this.powerUps.update(this.road.distance, this.speed, dt);

    // Weather and time of day change with distance; the opening haze clears as
    // control is handed over.
    const climate = this.setClimate(this.road.distance, 1 - this.cameraRig.introProgress);
    this.rain.setIntensity(climate.rain);
    this.rain.update(dt, advance, this.player.root.position.x, climate.night);
    this.environment.update(0, climate);

    // The Modak Magnet widens the runner's reach, so the arcs curve to him.
    this.modaks.update(this.speed, dt, {
      active: this.powers.magnet,
      x: this.player.root.position.x,
      strength: THREE.MathUtils.clamp(this.powerTimers.magnet / 1.5, 0, 1),
    });
    this.runWindStreaks(dt, this.speed);
    this.runDashTrail(dt);

    // Modak spawning on its own distance cadence — and never during the hero
    // shot, so nothing appears out of frame while the camera is still moving.
    if (this.state === "running" && this.road.distance >= this.modakNextSpawn) {
      this.spawnModakArcs();
      this.modakNextSpawn =
        this.road.distance + MODAK_GAP_MIN + Math.random() * (MODAK_GAP_MAX - MODAK_GAP_MIN);
    }

    // Collection -> sparkle, chain and score. The Blessing Multiplier doubles
    // the value of every modak while it burns.
    const worth =
      this.chain.tier * MODAK_POINTS * (this.powers.multiplier ? MULTIPLIER_FACTOR : 1);
    this.modaks.collect(
      this.player.root.position.x,
      this.player.bottom,
      this.player.top,
      this.player.halfWidth,
      this.player.halfDepth,
      (x, y, z) => {
        this.effects.pickup(x, y, z);
        this.modaksCollected++;
        const event = this.chain.onModak();
        this.score += worth;
        this.audio.pickup(this.chain.tier, this.chain.count);
        if (event?.type === "tier-up") {
          this.effects.tierUp(this.player.root.position.x, this.player.positionY);
          this.audio.tierUp(this.chain.tier);
        }
      },
    );

    // Chain grace window
    this.chain.tick(dt);

    // Divine powers age every frame; the aura and HUD read from the same timers.
    this.tickPowers(dt, this.player.root.position.x, this.player.positionY);
    this.aura.update(
      dt,
      this.player.root.position.x,
      this.player.positionY,
      this.powers,
      this.speed,
    );

    // Distance milestones
    if (this.road.distance >= this.nextMilestone) {
      this.milestoneFlash = this.nextMilestone;
      this.milestoneFlashTimer = 2.2;
      this.nextMilestone += MILESTONE_STEP;
      this.effects.milestoneBloom(this.player.root.position.x, this.player.positionY);
      this.audio.milestone();
    }
    if (this.milestoneFlashTimer > 0) {
      this.milestoneFlashTimer -= dt;
      if (this.milestoneFlashTimer <= 0) this.milestoneFlash = null;
    }
    if (this.nearMissFlashTimer > 0) {
      this.nearMissFlashTimer -= dt;
      if (this.nearMissFlashTimer <= 0) this.nearMissFlash = null;
    }

    this.effects.update(dt, advance);

    this.score += advance * 1.2;

    // Nothing can kill the runner before the hero shot is over.
    if (this.state !== "running") return;

    // Grazes: squeezing past traffic without touching it is worth points, and
    // more of them while the Divine Dash is running.
    if (this.nearMissCooldown > 0) this.nearMissCooldown -= dt;
    const graze = this.obstacles.checkNearMiss(
      this.player.root.position.x,
      this.player.bottom,
      this.player.top,
      this.player.halfWidth,
      this.player.halfDepth,
    );
    if (graze && this.nearMissCooldown <= 0) {
      this.nearMissCooldown = NEAR_MISS_MIN_INTERVAL;
      const points =
        NEAR_MISS_POINTS * (1 + this.chain.tier) * (this.powers.dash ? 2 : 1);
      this.score += points;
      this.nearMissCount++;
      this.nearMissFlash = { points, flyOver: graze.flyOver };
      this.nearMissFlashTimer = 1.1;
      this.effects.nearMiss(graze.x, graze.y, graze.z, graze.flyOver);
      this.audio.graze(graze.flyOver);
      this.cameraRig.impulse(graze.flyOver ? 0.05 : 0.09);
    }

    // Power-up pickup
    const taken = this.powerUps.collect(
      this.player.root.position.x,
      this.player.bottom,
      this.player.top,
      this.player.halfWidth,
      this.player.halfDepth,
    );
    if (taken) {
      this.activatePower(taken, this.player.root.position.x, this.player.positionY);
    }

    // Collision test (player AABB vs obstacle AABBs). Vighnaharta demolishes
    // everything it touches; the Divine Shield does the same, humbler.
    const hit = this.obstacles.checkCollision(
      this.player.root.position.x,
      this.player.bottom,
      this.player.top,
      this.player.halfWidth,
      this.player.halfDepth,
    );
    if (hit) {
      if (this.powers.vighnaharta) {
        const z = hit.group.position.z;
        const x = hit.group.position.x;
        this.obstacles.smash(hit);
        this.smashes++;
        this.score += VIGHNAHARTA_SMASH_POINTS;
        this.effects.smash(x, 0.4, z, COLORS.goldBright);
        this.effects.shieldHit(this.player.root.position.x, this.player.positionY, 0);
        this.audio.vighnahartaSmash();
        this.cameraRig.impulse(0.24);
      } else if (this.powers.shield) {
        // A demon of the horde bursts into brimstone; the festival props
        // and the barricades come apart as stone.
        const horde = hit.kind === "demon" || hit.kind === "imp";
        const debris = horde
          ? COLORS.demonAsh
          : hit.kind === "barricade"
            ? COLORS.stone
            : COLORS.marigold;
        const z = hit.group.position.z;
        const x = hit.group.position.x;
        this.obstacles.smash(hit);
        this.smashes++;
        this.score += SHIELD_SMASH_POINTS;
        this.effects.smash(x, 0.4, z, debris);
        this.effects.shieldHit(this.player.root.position.x, this.player.positionY, 0);
        this.audio.smash();
        this.cameraRig.impulse(0.2);
      } else {
        this.state = "gameover";
        this.player.die();
        this.chain.break();
        this.powerTimers = ZERO_POWERS();
        this.powers.shield = false;
        this.powers.magnet = false;
        this.powers.dash = false;
        this.powers.multiplier = false;
        this.powers.vighnaharta = false;
        this.effects.crash(this.player.root.position.x, this.player.positionY);
        this.audio.crash();
        this.audio.setMenuDuck(0.45);
        this.cameraRig.impulse(0.5);
        this.newBest = this.scoreStore.submit(Math.floor(this.score));
        this.emitSnapshot();
      }
    }
  }

  private emitSnapshot() {
    this.callbacks.onSnapshot({
      state: this.state,
      score: Math.floor(this.score),
      best: this.scoreStore.best,
      distance: this.road.distance,
      speed: this.speed,
      lane: this.player.lane,
      posX: this.player.root.position.x,
      posY: this.player.positionY,
      obstacles: this.obstacles.activeCount,
      modaks: this.modaksCollected,
      chain: this.chain.count,
      chainTier: this.chain.tier,
      chainWindow: this.chain.windowRemaining,
      intensity: this.road.distance / 1000,
      introProgress: this.cameraRig.introProgress,
      powerUps: { ...this.powerTimers },
      nearMisses: this.nearMissCount,
      nearMissFlash: this.nearMissFlash,
      smashes: this.smashes,
      night: this.climate.night,
      rain: this.climate.rain,
      mist: this.climate.mist,
      muted: this.audio.isMuted,
      fps: Math.round(this.fpsSmoothed),
      newBest: this.newBest,
      milestone: this.milestoneFlash,
      paused: this.state === "paused",
    });
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    window.removeEventListener("resize", this.handleResize);
    this.canvas.removeEventListener("webglcontextlost", this.handleContextLost);
    this.input.detach();
    this.obstacles.dispose();
    this.modaks.dispose();
    this.powerUps.dispose();
    this.road.dispose();
    this.effects.dispose();
    this.aura.dispose();
    this.rain.dispose();
    this.environment.dispose();
    this.audio.dispose();
    this.renderer.dispose();
  }
}
