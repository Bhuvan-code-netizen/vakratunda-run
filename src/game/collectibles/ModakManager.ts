import * as THREE from "three";
import {
  LANES,
  MAGNET_CAPTURE,
  MAGNET_CAPTURE_Z,
  MAGNET_LIFT_SPEED,
  MAGNET_PULL,
  MAGNET_PULL_PACE_GAIN,
  MAGNET_RADIUS,
  MAGNET_REACH_Z,
  MAGNET_TRAIL_Z,
  OBSTACLE_RECYCLE_Z,
  OBSTACLE_SPAWN_Z,
  type LaneIndex,
} from "../constants";
import { buildModak, MODAK_HALF } from "./ModakModel";

/**
 * Modak pool + spawner. Modaks spawn in short arcs of 4–6 along a single lane.
 * Fixed pool, zero per-frame allocation; queued arcs hold their shape and flow
 * in from the spawn line when the pool frees up, so the run never runs dry.
 *
 * ## The Modak Magnet
 *
 * The field is a corridor the runner runs through — `MAGNET_RADIUS` to either
 * side, `MAGNET_REACH_Z` ahead and `MAGNET_TRAIL_Z` behind — rather than a disc
 * around him. That distinction is the whole power-up: a modak two lanes out has
 * 4.8 m of lane to cover, and inside a disc it was only in range for a couple
 * of frames at pace, so the pull never had time to close the gap.
 *
 * Inside the corridor the pull is *lateral first*: a homing speed in m/s that
 * scales with the pace and with how deep in the field the modak is, clamped to
 * the remaining gap so it homes in without overshooting the lane line. The
 * modak is held on that line for the rest of its approach, which is what makes
 * a whole arc curve in toward him instead of one lonely modak.
 *
 * A modak that has already slipped behind him is reeled back, and one whose
 * height trails his (he is mid-jump) is lifted to his hands. Both are why the
 * collection test now almost never misses: inside CAPTURE — deliberately
 * smaller than the collection box — a caught modak is pinned onto the runner,
 * so a single frame at top pace cannot carry it through the box unseen.
 */

export interface ModakPickup {
  group: THREE.Group;
  active: boolean;
}

interface QueuedModak {
  /** Offset behind the spawn line, in metres (0 = the arc's leader). */
  offsetZ: number;
  lane: LaneIndex;
}

/** The magnet's corridor, as handed to `update`. */
export interface MagnetField {
  active: boolean;
  /** The runner's lane line, in world X. */
  x: number;
  /** The runner's height above the road, so the field follows him into the air. */
  y: number;
  /** 0…1, so a fading magnet weakens before it drops. */
  strength: number;
}

/** Queue is a safety valve only; beyond this an arc is trimmed, never grown. */
const MAX_PENDING = 10;
const ARC_SPACING = 2.6;
/** Height of the modak body above its group origin, used for pickup effects. */
export const MODAK_CENTER_Y = 0.55;
/** How fast a released modak settles back into its idle float (lambda, 1/s). */
const FLOAT_DAMP = 5;

export class ModakManager {
  private scene: THREE.Scene;
  private pool: ModakPickup[] = [];
  private active: ModakPickup[] = [];
  private pending: QueuedModak[] = [];

  constructor(scene: THREE.Scene, poolSize = 24) {
    this.scene = scene;
    for (let i = 0; i < poolSize; i++) {
      const group = buildModak();
      group.visible = false;
      scene.add(group);
      this.pool.push({ group, active: false });
    }
  }

  /** Queue a straight run of modaks in one lane. */
  queueArc(count: number, lane: LaneIndex) {
    for (let i = 0; i < count; i++) {
      if (this.pending.length >= MAX_PENDING) break;
      this.pending.push({ offsetZ: -i * ARC_SPACING, lane });
    }
  }

  /** Called every frame: activate queued spawns, scroll, bob, pull, recycle. */
  update(speed: number, dt: number, magnet?: MagnetField) {
    const dz = speed * dt;

    // Activate queued spawns (retry next frame if the pool is exhausted).
    // Offsets are relative to the spawn line, so a delayed arc still arrives
    // as a properly spaced run instead of clumping at a stale position.
    while (this.pending.length > 0) {
      const inst = this.pool.find((m) => !m.active);
      if (!inst) break;
      const p = this.pending.shift()!;
      inst.active = true;
      inst.group.visible = true;
      inst.group.position.set(LANES[p.lane], 0, OBSTACLE_SPAWN_Z + p.offsetZ);
      this.active.push(inst);
    }

    // Scroll, spin and recycle
    const bobPhase = (performance.now() / 1000) * 3.4;
    const pulling = magnet?.active === true && magnet.strength > 0;

    for (let i = this.active.length - 1; i >= 0; i--) {
      const inst = this.active[i]!;
      const p = inst.group.position;
      p.z += dz;
      inst.group.rotation.y += dt * 1.6;

      // Where the idle float wants the modak to sit this frame.
      const bobY = Math.sin(bobPhase + p.z * 0.4) * 0.08;
      // Height the field is trying to lift it to; null when nothing is pulling.
      let liftTo: number | null = null;

      if (pulling) {
        const field = magnet!;
        const dx = field.x - p.x;
        const lateral = Math.abs(dx);
        /** Positive while the modak is still ahead of the runner. */
        const ahead = -p.z;
        const inField =
          lateral < MAGNET_RADIUS &&
          ahead < MAGNET_REACH_Z &&
          ahead > -MAGNET_TRAIL_Z;

        if (inField) {
          // Proximity ramps the pull: a far modak drifts in, a near one snaps.
          const proximity = 1 - Math.min(1, lateral / MAGNET_RADIUS);
          const pull =
            (MAGNET_PULL + speed * MAGNET_PULL_PACE_GAIN) *
            (0.45 + 0.55 * proximity) *
            field.strength;

          // Lateral leg, clamped to the remaining gap so the modak settles on
          // his lane line instead of oscillating around it.
          p.x += Math.sign(dx) * Math.min(lateral, pull * dt);

          // A modak that has already slipped behind him is reeled back in. One
          // still ahead simply rides the road's scroll, now held on his line.
          if (ahead < 0) p.z = Math.max(0, p.z - pull * dt);

          // Lift towards his hands, following him when he is in the air.
          liftTo = MODAK_CENTER_Y + Math.max(0, field.y);

          // Capture: pin a caught modak onto him so the collection box cannot
          // miss it. Both thresholds sit inside the box, so this never looks
          // like a teleport — it only removes the chance of skipping past.
          if (lateral < MAGNET_CAPTURE && Math.abs(p.z) < MAGNET_CAPTURE_Z) {
            p.x = field.x;
            p.z = 0;
          }
        }
      }

      if (liftTo === null) {
        // Idle float, eased rather than assigned, so a modak released by a
        // dying magnet never pops between the two states.
        p.y += (bobY - p.y) * (1 - Math.exp(-FLOAT_DAMP * dt));
      } else {
        p.y = Math.min(p.y + MAGNET_LIFT_SPEED * dt, liftTo);
      }

      if (p.z > OBSTACLE_RECYCLE_Z) {
        inst.group.visible = false;
        inst.active = false;
        this.active.splice(i, 1);
      }
    }
  }

  /**
   * Collection test against the player box. Recycles touched modaks, hands each
   * pickup's world position to `onCollect` (for the sparkle burst) and returns
   * how many were collected.
   */
  collect(
    playerX: number,
    playerBottom: number,
    playerTop: number,
    playerHalfW: number,
    playerHalfD: number,
    onCollect?: (x: number, y: number, z: number) => void,
  ): number {
    let collected = 0;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const inst = this.active[i]!;
      const p = inst.group.position;
      if (
        Math.abs(p.x - playerX) < MODAK_HALF + playerHalfW &&
        Math.abs(p.z) < MODAK_HALF + playerHalfD &&
        playerBottom < p.y + 1.0 &&
        playerTop > p.y
      ) {
        onCollect?.(p.x, p.y + MODAK_CENTER_Y, p.z);
        inst.group.visible = false;
        inst.active = false;
        this.active.splice(i, 1);
        collected++;
      }
    }
    return collected;
  }

  get activeCount(): number {
    return this.active.length;
  }

  reset() {
    for (const inst of this.active) {
      inst.group.visible = false;
      inst.active = false;
    }
    this.active = [];
    this.pending = [];
  }

  dispose() {
    for (const inst of this.pool) {
      this.scene.remove(inst.group);
      inst.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) obj.geometry.dispose();
      });
    }
    this.pool = [];
    this.active = [];
    this.pending = [];
  }
}
