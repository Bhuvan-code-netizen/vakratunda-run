import * as THREE from "three";
import {
  GRAVITY,
  JUMP_VELOCITY,
  LANES,
  LANE_DAMP,
  PLAYER_HALF_DEPTH,
  PLAYER_HALF_WIDTH,
  PLAYER_TOP,
  SQUASH_DAMP,
  SQUASH_MAX,
  type LaneIndex,
} from "../constants";
import { buildGanesha, type GaneshaRig } from "./GaneshaModel";

export type PlayerAnimState = "run" | "jump" | "fall" | "dead";

/** Rest angles of the ear pivots, so animation can offset instead of reset. */
const EAR_REST = { x: 0.06, y: 0.28, z: 0.16 };

/**
 * Movement signals the controller raises for the effect and audio layers.
 * The controller itself never touches particles — GameApp decides what a
 * footfall or a landing looks like.
 */
export interface PlayerEvents {
  /** A foot hits the road. `side` is -1 (left) or 1 (right). */
  footstep?: (x: number, side: -1 | 1, speed: number) => void;
  /** The runner leaves the ground. */
  takeOff?: (x: number, y: number) => void;
  /** The runner touches down; `impact` is 0..1.6, 1 = a full-power landing. */
  land?: (x: number, y: number, impact: number) => void;
}

/**
 * Owns movement (lanes, jump, gravity) and the animation of the rig.
 * The rig is swappable: the controller only needs the joint handles exposed by
 * `GaneshaRig`, never the meshes themselves.
 */
export class PlayerController {
  readonly root: THREE.Group;
  private rig: GaneshaRig;
  private events: PlayerEvents;

  lane: LaneIndex = 1;
  private targetX = LANES[1];
  private x = LANES[1];

  private y = 0;
  private vy = 0;
  private grounded = true;

  animState: PlayerAnimState = "run";
  private runPhase = 0;
  private lastStepIndex = 0;

  /** Vertical scale, 1 = neutral. Squashed on landing, stretched in the air. */
  private squash = 1;
  /** Smoothed sideways velocity, used to bank and to swing the dhoti. */
  private bank = 0;
  private bankSmooth = 0;
  private haloSpin = 0;
  private modakSpin = 0;
  private prabhaSway = 0;
  /** Rotation of the plate's ray fan and flame corona (opposite directions). */
  private prabhaSpinAngle = 0;
  /** Extra forward lean while sprinting under the Divine Dash. */
  private lean = 0;
  /** Rest heights of the torso and hip pivots, read from the rig itself. */
  private torsoRestY = 0.84;
  private hipsRestY = 0.84;
  /** Scurry clock for Mooshika: his own gait, far quicker than the stride. */
  private mooshikaPhase = 0;
  /** Resting place of the vahana, captured from the rig itself. */
  private mooshikaHome = new THREE.Vector3();

  // Collision box derived from constants (feet origin)
  get halfWidth() { return PLAYER_HALF_WIDTH; }
  get halfDepth() { return PLAYER_HALF_DEPTH; }
  get top() { return this.y + PLAYER_TOP; }
  get bottom() { return this.y; }

  get positionY() { return this.y; }
  get isGrounded() { return this.grounded; }

  constructor(scene: THREE.Scene, events: PlayerEvents = {}) {
    this.events = events;
    this.rig = buildGanesha();
    // Capture the model's own rest heights so animation can offset from them
    // instead of assuming where the model put its pivots.
    this.torsoRestY = this.rig.torso.position.y;
    this.hipsRestY = this.rig.hips.position.y;
    this.mooshikaHome.copy(this.rig.mooshika.position);
    this.root = this.rig.root;
    this.root.position.set(this.x, 0, 0);
    scene.add(this.root);
  }

  /** Request a lane change. Returns false when there is no lane to move into. */
  moveLane(dir: -1 | 1): boolean {
    if (this.animState === "dead") return false;
    const next = Math.min(2, Math.max(0, this.lane + dir)) as LaneIndex;
    if (next === this.lane) return false;
    this.lane = next;
    this.targetX = LANES[next];
    return true;
  }

  jump(): boolean {
    if (this.animState === "dead" || !this.grounded) return false;
    this.vy = JUMP_VELOCITY;
    this.grounded = false;
    // Stretch off the ground; the spring below pulls him back to shape.
    this.squash = 1 + SQUASH_MAX * 0.6;
    this.events.takeOff?.(this.x, this.y);
    return true;
  }

  die() {
    this.animState = "dead";
  }

  /** Called by GameApp each frame with the current pace in m/s. */
  setPace(speed: number) {
    this.lean = THREE.MathUtils.clamp((speed - 20) / 24, 0, 1);
  }

  /** Full reset for restart: pose, lane, physics, animation. */
  reset() {
    this.lane = 1;
    this.targetX = LANES[1];
    this.x = LANES[1];
    this.y = 0;
    this.vy = 0;
    this.grounded = true;
    this.animState = "run";
    this.runPhase = 0;
    this.lastStepIndex = 0;
    this.mooshikaPhase = 0;
    this.squash = 1;
    this.bank = 0;
    this.bankSmooth = 0;
    this.lean = 0;
    this.root.position.set(this.x, 0, 0);
    this.root.rotation.set(0, 0, 0);
    this.root.scale.set(1, 1, 1);

    const r = this.rig;
    r.hips.position.set(0, this.hipsRestY, 0);
    r.torso.position.y = this.torsoRestY;
    r.torso.rotation.set(0, 0, 0);
    r.head.rotation.set(0, 0, 0);
    r.trunk.position.set(0, 0.02, -0.235);
    r.trunk.rotation.set(r.trunkRestX, 0, r.trunkRestZ);
    r.dhoti.rotation.set(0, 0, 0);
    r.mooshika.position.copy(this.mooshikaHome);
    r.mooshika.rotation.set(0, 0, 0);
    r.mooshikaHead.rotation.set(0, 0, 0);
    r.mooshikaLegs.forEach((paw) => paw.rotation.set(0, 0, 0));
    r.mooshikaTail.forEach((joint, i) => {
      joint.rotation.set(r.mooshikaTailBends[i]!, 0, 0);
    });
    r.leftLeg.rotation.set(0, 0, 0);
    r.rightLeg.rotation.set(0, 0, 0);
    r.leftKnee.rotation.set(0, 0, 0);
    r.rightKnee.rotation.set(0, 0, 0);
    r.leftArm.rotation.set(0, 0, 0);
    r.rightArm.rotation.set(0, 0, 0);
    r.leftElbow.rotation.set(0, 0, 0);
    r.rightElbow.rotation.set(0, 0, 0);
    r.leftUpperArm.rotation.set(0, 0, 0);
    r.rightUpperArm.rotation.set(0, 0, 0);
    r.earL.rotation.set(EAR_REST.x, EAR_REST.y, -EAR_REST.z);
    r.earR.rotation.set(EAR_REST.x, -EAR_REST.y, EAR_REST.z);
    r.trunkSegments.forEach((seg, i) => {
      seg.rotation.set(r.trunkBends[i]!, 0, r.trunkSideBends[i]!);
    });
  }

  update(dt: number, runSpeed: number) {
    const r = this.rig;

    // --- Horizontal: exponential damping toward the target lane ---
    const k = 1 - Math.exp(-LANE_DAMP * dt);
    const prevX = this.x;
    this.x += (this.targetX - this.x) * k;
    this.root.position.x = this.x;

    // Bank into the lane change, and let the cloth lag behind it
    const vx = (this.x - prevX) / Math.max(dt, 1e-6);
    this.bank += (vx - this.bank) * (1 - Math.exp(-14 * dt));
    this.bankSmooth += (this.bank - this.bankSmooth) * (1 - Math.exp(-9 * dt));
    this.root.rotation.z = THREE.MathUtils.clamp(-this.bankSmooth * 0.035, -0.3, 0.3);

    // --- Vertical: jump + gravity ---
    if (!this.grounded) {
      this.vy -= GRAVITY * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        const impact = THREE.MathUtils.clamp(Math.abs(this.vy) / JUMP_VELOCITY, 0, 1.6);
        this.y = 0;
        this.vy = 0;
        this.grounded = true;
        this.squash = 1 - SQUASH_MAX * (0.45 + impact * 0.55);
        this.events.land?.(this.x, this.y, impact);
      }
    }
    this.root.position.y = this.y;

    // --- Squash/stretch spring back to neutral ---
    this.squash += (1 - this.squash) * (1 - Math.exp(-SQUASH_DAMP * dt));
    const sxz = 1 + (1 - this.squash) * 0.5;
    this.root.scale.set(sxz, this.squash, sxz);

    // --- Animation state ---
    if (this.animState !== "dead") {
      this.animState = !this.grounded ? (this.vy > 0 ? "jump" : "fall") : "run";
    }

    this.updateAnimation(dt, runSpeed);
    this.animateRigAlways(dt, r);
  }

  /** Secondary motion that runs in every state: trunk, ears, halo, plate. */
  private animateRigAlways(dt: number, r: GaneshaRig) {
    const p = this.runPhase;
    const dead = this.animState === "dead";

    // Trunk: a slow wave that lags further down the chain, so the tip whips.
    // Speed pushes the whole trunk back, and the air time lifts it.
    const lift = dead
      ? 0.3
      : this.animState === "jump"
        ? -0.26
        : this.animState === "fall"
          ? -0.12
          : Math.sin(p * 0.5) * 0.08 - this.lean * 0.14;
    r.trunk.rotation.x = r.trunkRestX + lift;
    r.trunk.rotation.z = r.trunkRestZ + Math.sin(p * 0.5 + 0.7) * 0.05;

    const sway = this.animState === "run" ? 1 : 0.35;
    for (let i = 0; i < r.trunkSegments.length; i++) {
      const lag = Math.sin(p * 0.5 - i * 0.45);
      const bend = r.trunkBends[i]! + lag * 0.05 * sway - this.lean * 0.05 * (i / 8);
      r.trunkSegments[i]!.rotation.x = bend;
      r.trunkSegments[i]!.rotation.z =
        r.trunkSideBends[i]! + Math.sin(p - i * 0.4) * 0.05 * sway;
    }

    // Ears: fan wider the faster he runs, and flare hard off a jump
    const flareBase = this.animState === "run" ? 0.07 + this.lean * 0.1 : 0.24;
    const flap = flareBase + Math.abs(Math.sin(p * 0.5)) * 0.05;
    r.earL.rotation.z = -(EAR_REST.z + flap);
    r.earR.rotation.z = EAR_REST.z + flap;
    r.earL.rotation.x = EAR_REST.x - flap * 0.35;
    r.earR.rotation.x = EAR_REST.x - flap * 0.35;

    // Prabhavali: a slow spin so the beads catch the light
    this.haloSpin += dt * 0.45;
    r.halo.rotation.z = this.haloSpin;
    r.halo.rotation.y = Math.sin(this.haloSpin * 0.6) * 0.06;

    // The plate of light: its engraved face sways a whisper with the stride,
    // while the ray fan and flame corona turn behind him — the rays one way,
    // the flames the other, so the light visibly churns. The plate's gold
    // breathes with the spin, brightening as each long ray passes the top.
    this.prabhaSway += dt * 0.5;
    const prabhaTilt = Math.sin(this.prabhaSway) * 0.05 + this.bankSmooth * 0.012;
    r.prabha.rotation.y = prabhaTilt;
    r.prabha.rotation.x = 0.16 + Math.sin(this.prabhaSway * 0.6) * 0.018;

    this.prabhaSpinAngle += dt * 0.35;
    r.prabhaSpin.rotation.z = this.prabhaSpinAngle;
    r.prabhaCorona.rotation.z = -this.prabhaSpinAngle * 0.7;
    r.plateGlow.emissiveIntensity = 0.5 + Math.sin(this.prabhaSpinAngle * 2.4) * 0.14;

    // The modak in the curl of the trunk turns slowly in his grip
    this.modakSpin += dt * 1.1;
    r.modak.rotation.y = this.modakSpin;
    r.modak.rotation.z = Math.sin(this.modakSpin * 0.8) * 0.12;

    // Dhoti trails the lane change
    r.dhoti.rotation.z = this.bankSmooth * 0.05;
    r.dhoti.rotation.x = this.animState === "run" ? 0.06 + this.lean * 0.05 : 0.12;

    this.animateMooshika(dt, r);
  }

  /**
   * Mooshika: the vahana scurrying ahead of the stride.
   *
   * His gait is deliberately not the running stride. A mouse steps in short,
   * quick bursts on diagonal pairs — front-left with back-right — so he is
   * driven from his own clock at roughly twice the cadence of the run. Off the
   * ground he tucks his paws and streams his tail; when the run ends he skids
   * flat. Nothing here reads or writes the score: he is company, not score.
   */
  private animateMooshika(dt: number, r: GaneshaRig) {
    const run = this.animState === "run";
    const air = this.animState === "jump" || this.animState === "fall";
    const dead = this.animState === "dead";

    // Short quick steps, tightening further as the pace climbs.
    this.mooshikaPhase += dt * (run ? 6.2 + this.lean * 4 : 1.6) * Math.PI * 2;
    const p = this.mooshikaPhase;

    // Paws in diagonal pairs. Small amplitude at high frequency is what
    // separates a scurry from a gallop.
    for (let i = 0; i < r.mooshikaLegs.length; i++) {
      const paw = r.mooshikaLegs[i]!;
      const phase = i === 0 || i === 3 ? 0 : Math.PI;
      paw.rotation.x = air
        ? -0.5 + (i % 2) * 0.14
        : dead
          ? 0.95 + i * 0.05
          : Math.sin(p + phase) * 0.6;
    }

    // Body: a fast bob, a pitch that answers the jump, and a roll that follows
    // the lane change with the god.
    r.mooshika.position.y =
      this.mooshikaHome.y + (run ? Math.abs(Math.sin(p)) * 0.01 : 0) - (dead ? 0.015 : 0);
    r.mooshika.rotation.x =
      (air ? (this.animState === "jump" ? -0.3 : -0.16) : Math.sin(p * 2) * 0.02) -
      this.lean * 0.06;
    r.mooshika.rotation.y = THREE.MathUtils.clamp(-this.bankSmooth * 0.02, -0.35, 0.35);
    r.mooshika.rotation.z = Math.sin(p) * 0.05 - this.bankSmooth * 0.02;

    // Head: nose forward and up, wobbling a little. He looks down the road,
    // not at the camera — the eyes of the god already carry the shot.
    r.mooshikaHead.rotation.x = -0.1 + Math.sin(p + 0.7) * 0.05 - (air ? 0.18 : 0);
    r.mooshikaHead.rotation.y = Math.sin(p * 0.5 + 1.1) * 0.1;

    // Tail: every joint lags the one before it, so the whip travels outward.
    const sway = run ? 1 : 0.4;
    for (let i = 0; i < r.mooshikaTail.length; i++) {
      const joint = r.mooshikaTail[i]!;
      joint.rotation.x =
        r.mooshikaTailBends[i]! +
        Math.sin(p * 0.9 - i * 0.55) * 0.05 * sway +
        (air ? -0.12 : 0) -
        this.lean * 0.04;
      joint.rotation.y = Math.sin(p * 0.8 - i * 0.5) * 0.09 * sway;
    }
  }

  private updateAnimation(dt: number, runSpeed: number) {
    const r = this.rig;
    const pace = THREE.MathUtils.clamp(runSpeed / 30, 0, 1.4);

    if (this.animState === "run") {
      const stride = 2.4 + pace * 2.6;
      this.runPhase += dt * stride * Math.PI * 2;
      const p = this.runPhase;
      const s = Math.sin(p);
      const c = Math.cos(p);

      // Legs: hips swing, knees flex through the recovery phase
      r.leftLeg.rotation.x = s * 0.8;
      r.rightLeg.rotation.x = -s * 0.8;
      r.leftKnee.rotation.x = -(0.16 + Math.max(0, -Math.sin(p - 0.7)) * 1.15);
      r.rightKnee.rotation.x = -(0.16 + Math.max(0, Math.sin(p + 0.7)) * 1.15);

      // Hips carry the weight shift, so the whole body has a cadence
      r.hips.position.x = s * 0.04;
      r.hips.rotation.y = s * 0.12;
      r.hips.rotation.z = -s * 0.05;

      // Lower arms counter-swing, elbows held bent like a real runner
      r.leftArm.rotation.x = -s * 0.62;
      r.rightArm.rotation.x = s * 0.62;
      r.leftArm.rotation.z = -0.06 - this.lean * 0.08;
      r.rightArm.rotation.z = 0.06 + this.lean * 0.08;
      r.leftElbow.rotation.x = 0.95 + Math.max(0, -s) * 0.3;
      r.rightElbow.rotation.x = 0.95 + Math.max(0, s) * 0.3;

      // Upper pair holds his relics with a gentle sway
      r.leftUpperArm.rotation.x = Math.sin(p * 0.5) * 0.07 - this.lean * 0.1;
      r.rightUpperArm.rotation.x = -Math.sin(p * 0.5) * 0.07 - this.lean * 0.1;
      r.leftUpperArm.rotation.z = Math.sin(p * 0.5 + 1) * 0.05;
      r.rightUpperArm.rotation.z = -Math.sin(p * 0.5 + 1) * 0.05;

      // Torso: double-bob around its own rest height, forward lean,
      // hip/shoulder counter-rotation. Offsetting from the rig's rest keeps
      // the upper body welded to the legs no matter where the model places
      // its pivots.
      r.torso.position.y = this.torsoRestY + Math.abs(c) * 0.06;
      r.torso.rotation.x = -0.1 - pace * 0.07 - this.lean * 0.14;
      r.torso.rotation.y = -s * 0.09;
      r.torso.rotation.z = s * 0.05;

      // Head stays level and looks down the road
      r.head.rotation.x = 0.08 + pace * 0.05 + this.lean * 0.08;
      r.head.rotation.y = s * 0.06;
      r.crown.rotation.z = Math.sin(p * 0.5) * 0.02;
      r.crown.rotation.x = -Math.abs(c) * 0.015;

      // Footfalls, one per half stride, alternating feet
      const stepIndex = Math.floor(p / Math.PI);
      if (stepIndex !== this.lastStepIndex) {
        this.lastStepIndex = stepIndex;
        this.events.footstep?.(this.x, stepIndex % 2 === 0 ? 1 : -1, runSpeed);
      }
      return;
    }

    if (this.animState === "jump" || this.animState === "fall") {
      const rising = this.animState === "jump";
      // Tuck on the way up, reach for the ground on the way down
      r.leftLeg.rotation.x = rising ? 0.85 : 0.4;
      r.rightLeg.rotation.x = rising ? -0.35 : -0.15;
      r.leftKnee.rotation.x = rising ? -1.35 : -0.55;
      r.rightKnee.rotation.x = rising ? -0.5 : -0.25;

      r.hips.position.x = 0;
      r.hips.rotation.set(0, 0, 0);

      r.leftArm.rotation.x = rising ? -1.25 : -0.7;
      r.rightArm.rotation.x = rising ? -1.05 : -0.5;
      r.leftArm.rotation.z = -0.1;
      r.rightArm.rotation.z = 0.1;
      r.leftElbow.rotation.x = rising ? 1.2 : 0.7;
      r.rightElbow.rotation.x = rising ? 1.0 : 0.6;

      r.leftUpperArm.rotation.x = rising ? -0.25 : -0.1;
      r.rightUpperArm.rotation.x = rising ? -0.25 : -0.1;
      r.leftUpperArm.rotation.z = 0;
      r.rightUpperArm.rotation.z = 0;

      r.torso.position.y = this.torsoRestY;
      r.torso.rotation.x = rising ? -0.04 : 0.06;
      r.torso.rotation.y = 0;
      r.torso.rotation.z = 0;
      r.head.rotation.x = rising ? -0.1 : 0.2;
      r.head.rotation.y = 0;
      return;
    }

    // dead: topple forward over the finish line
    r.root.rotation.x = Math.max(-Math.PI * 0.42, r.root.rotation.x - dt * 3.2);
    r.hips.position.x = 0;
    r.hips.rotation.set(0, 0, 0);
    r.leftArm.rotation.x = -0.5;
    r.rightArm.rotation.x = -0.5;
    r.leftElbow.rotation.x = 0.4;
    r.rightElbow.rotation.x = 0.4;
    r.leftKnee.rotation.x = -0.3;
    r.rightKnee.rotation.x = -0.3;
    r.torso.rotation.x = -0.15;
    r.head.rotation.x = 0.25;
  }

  /** Feet-origin world position of the runner, for effects and the camera. */
  get positionX() { return this.x; }
}
