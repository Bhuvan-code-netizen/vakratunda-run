import * as THREE from "three";
import {
  LANES,
  MAGNET_CAPTURE,
  MAGNET_LIFT_SPEED,
  MAGNET_PULL,
  MAGNET_RADIUS,
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
 * While the Modak Magnet is lit, loose modaks inside `MAGNET_RADIUS` home in
 * toward the runner at a real velocity (`MAGNET_PULL` m/s, scaled by the field
 * strength and how deep the modak is in the field). A homing velocity — not a
 * positional lerp — means a modak always reaches him before the road scrolls
 * it past, even at top pace. Inside `MAGNET_CAPTURE` of him, the modak snaps
 * to his lane line so the collection test can never miss it.
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

/** The magnet's reach, as handed to `update`. */
export interface MagnetField {
  active: boolean;
  x: number;
  /** 0…1, so a fading magnet weakens before it drops. */
  strength: number;
}

/** Queue is a safety valve only; beyond this an arc is trimmed, never grown. */
const MAX_PENDING = 10;
const ARC_SPACING = 2.6;
/** Height of the modak body above its group origin, used for pickup effects. */
export const MODAK_CENTER_Y = 0.55;

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
      p.y = Math.sin(bobPhase + p.z * 0.4) * 0.08;
      inst.group.rotation.y += dt * 1.6;

      if (pulling) {
        const dx = magnet!.x - p.x;
        const dzToPlayer = -p.z;
        const dist = Math.hypot(dx, dzToPlayer);
        if (dist < MAGNET_RADIUS) {
          // Depth in the field: 1 at his feet, easing to 0 at the reach.
          const depth = 1 - dist / MAGNET_RADIUS;
          const pull = MAGNET_PULL * (0.35 + 0.65 * depth) * magnet!.strength;

          // Homing velocity in the road plane, applied against the scroll:
          // the X leg closes the lane gap; the Z leg eats the modak's own
          // forward drift plus its distance behind him, so it always arrives.
          const nx = dx / (dist || 1e-6);
          const nz = dzToPlayer / (dist || 1e-6);
          p.x += nx * pull * dt;
          p.z += nz * pull * dt;

          // Lift toward his hands once the lane gap is mostly closed.
          if (Math.abs(dx) < 1.2) {
            p.y = Math.min(p.y + MAGNET_LIFT_SPEED * dt, MODAK_CENTER_Y);
          }

          // Capture: inside this ring, snap onto his lane line so the
          // collection box cannot miss the modak however fast he runs.
          if (dist < MAGNET_CAPTURE) {
            p.x = magnet!.x;
            p.z = Math.max(p.z, dz - 0.35);
          }
        }
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
