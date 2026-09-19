import * as THREE from "three";
import {
  FIRST_SPAWN_DISTANCE,
  gapTimeForDistance,
  LANES,
  MAX_GAP_DISTANCE,
  MIN_GAP_DISTANCE,
  NEAR_MISS_CLEARANCE,
  NEAR_MISS_FLY_OVER,
  NEAR_MISS_WINDOW,
  OBSTACLE_RECYCLE_Z,
  OBSTACLE_SPAWN_Z,
  twoLaneChanceForDistance,
  type LaneIndex,
} from "../constants";
import { OBSTACLE_SPECS, type ObstacleKind } from "./ObstacleModels";

/**
 * Obstacle pool + spawner. Fixed-size pool per kind, recycled when they pass
 * behind the player. No per-frame allocation, and the run can never run out of
 * obstacles: cadence is time-based and rows are re-kinded if a pool is busy.
 *
 * The manager also owns the two judgement calls the run makes about the traffic
 * around the runner: what counts as a near miss, and what happens when the
 * Divine Shield ploughs through something.
 */

export interface ObstacleInstance {
  kind: ObstacleKind;
  group: THREE.Group;
  lane: LaneIndex;
  active: boolean;
  /** A near miss has already been scored for this instance. */
  grazed: boolean;
  /** Offset into the prowl idle, so no two demons animate in step. */
  phase: number;
}

/** A graze this frame: one point of contact for the HUD and the score. */
export interface NearMissEvent {
  kind: ObstacleKind;
  x: number;
  y: number;
  z: number;
  /** True when the runner cleared it with his feet rather than his shoulder. */
  flyOver: boolean;
  /** Lateral clearance in metres (0 = he brushed it). */
  clearance: number;
}

/** How many of each kind may be in flight at once. */
const POOL_SIZES: Record<ObstacleKind, number> = {
  demon: 5,
  imp: 5,
  barricade: 5,
  festivalElephant: 3,
  dholCart: 3,
  crackerStack: 4,
  pandalPost: 3,
  murtiPallet: 3,
  coconutHeap: 4,
};

/**
 * The procession arrives as the run goes on. The horde carries the first
 * kilometre; the festival modules unlock into the mix from there, so a long run
 * keeps introducing obstacles the player has not met before.
 */
const SPAWN_TABLE: Array<{ kind: ObstacleKind; weight: number; from: number }> = [
  { kind: "demon", weight: 3, from: 0 },
  { kind: "imp", weight: 3, from: 60 },
  { kind: "barricade", weight: 2.5, from: 130 },
  { kind: "crackerStack", weight: 2, from: 220 },
  { kind: "coconutHeap", weight: 2, from: 300 },
  { kind: "festivalElephant", weight: 1.7, from: 420 },
  { kind: "dholCart", weight: 1.6, from: 540 },
  { kind: "murtiPallet", weight: 1.5, from: 660 },
  { kind: "pandalPost", weight: 1.5, from: 780 },
];

export class ObstacleManager {
  private scene: THREE.Scene;
  private pools = new Map<ObstacleKind, ObstacleInstance[]>();
  private active: ObstacleInstance[] = [];
  private lastSpawnDistance = 0;
  /** Gap to the next row, in metres. Set in time terms so difficulty scales. */
  private nextGap: number;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    for (const kind of Object.keys(POOL_SIZES) as ObstacleKind[]) {
      this.pools.set(kind, this.warmPool(kind, POOL_SIZES[kind]));
    }
    // First row appears at FIRST_SPAWN_DISTANCE; later rows use the pace curve
    this.nextGap = FIRST_SPAWN_DISTANCE;
  }

  private warmPool(kind: ObstacleKind, count: number): ObstacleInstance[] {
    const spec = OBSTACLE_SPECS[kind];
    const list: ObstacleInstance[] = [];
    for (let i = 0; i < count; i++) {
      const group = spec.build();
      group.visible = false;
      this.scene.add(group);
      list.push({
        kind,
        group,
        lane: 1,
        active: false,
        grazed: false,
        phase: Math.random() * Math.PI * 2,
      });
    }
    return list;
  }

  private acquire(kind: ObstacleKind): ObstacleInstance | null {
    const pool = this.pools.get(kind);
    if (!pool) return null;
    for (const inst of pool) if (!inst.active) return inst;
    return null; // pool exhausted — skip spawn (never grow unbounded)
  }

  /**
   * Preferred kind if free, otherwise any other free instance. The row keeps its
   * shape (and the procession keeps arriving) even when one pool is saturated.
   */
  private acquireAny(preferred: ObstacleKind): ObstacleInstance | null {
    const first = this.acquire(preferred);
    if (first) return first;
    for (const [kind, pool] of this.pools) {
      if (kind === preferred) continue;
      for (const inst of pool) if (!inst.active) return inst;
    }
    return null;
  }

  /** Weighted pick from everything unlocked at this distance. */
  private pickKind(distance: number): ObstacleKind {
    let total = 0;
    const open: Array<{ kind: ObstacleKind; weight: number }> = [];
    for (const entry of SPAWN_TABLE) {
      if (distance < entry.from) continue;
      open.push(entry);
      total += entry.weight;
    }
    if (open.length === 0) return "demon";
    let roll = Math.random() * total;
    for (const entry of open) {
      roll -= entry.weight;
      if (roll <= 0) return entry.kind;
    }
    return open[open.length - 1]!.kind;
  }

  /**
   * Gap to the next row. Measured in seconds (shrinking with distance) and
   * converted at the current speed, so the reaction window tightens gradually
   * forever instead of the road crowding up as speed climbs.
   */
  private computeGap(distance: number, speed: number): number {
    const jitter = 0.88 + Math.random() * 0.24;
    const target = speed * gapTimeForDistance(distance) * jitter;
    return Math.min(MAX_GAP_DISTANCE, Math.max(MIN_GAP_DISTANCE, target));
  }

  /** Called every frame with the run's total distance and current speed. */
  update(distance: number, speed: number, dt: number) {
    // Spawn logic
    if (distance - this.lastSpawnDistance >= this.nextGap) {
      this.lastSpawnDistance = distance;
      this.nextGap = this.computeGap(distance, speed);
      this.spawnRow(distance);
    }

    // Move + recycle
    const dz = speed * dt;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const inst = this.active[i]!;
      inst.group.position.z += dz;
      // The horde is alive: every demon breathes and shifts his weight as the
      // road comes at him, so a lane never reads as a parked prop.
      if (inst.kind === "demon" || inst.kind === "imp") {
        inst.phase += dt * (inst.kind === "imp" ? 3.6 : 2.1);
        const breath = Math.sin(inst.phase);
        inst.group.position.y = Math.abs(breath) * (inst.kind === "imp" ? 0.05 : 0.07);
        inst.group.rotation.y = breath * (inst.kind === "imp" ? 0.15 : 0.08);
        inst.group.rotation.z = Math.cos(inst.phase * 0.5) * 0.03;
      }
      if (inst.group.position.z > OBSTACLE_RECYCLE_Z) {
        inst.group.visible = false;
        inst.active = false;
        inst.grazed = false;
        this.active.splice(i, 1);
      }
    }
  }

  /**
   * Spawn a 1–2 lane row. Two-lane rows become more common as the run goes on,
   * but all three lanes are never blocked — a safe path exists forever.
   */
  private spawnRow(distance: number) {
    const lanes: LaneIndex[] = [0, 1, 2];
    for (let i = lanes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [lanes[i], lanes[j]] = [lanes[j]!, lanes[i]!];
    }
    const count = Math.random() < twoLaneChanceForDistance(distance) ? 2 : 1;
    const chosen = lanes.slice(0, count);

    for (const lane of chosen) {
      const kind = this.pickKind(distance);
      const inst = this.acquireAny(kind);
      if (!inst) continue;
      inst.active = true;
      inst.grazed = false;
      inst.lane = lane;
      inst.group.visible = true;
      inst.group.position.set(LANES[lane], 0, OBSTACLE_SPAWN_Z);
      inst.group.rotation.set(0, 0, 0);
      this.active.push(inst);
    }
  }

  /**
   * AABB overlap test. Player box is centered at (playerX, z=0) with the
   * given half extents; obstacles live on lane X with z from their group.
   */
  checkCollision(
    playerX: number,
    playerBottom: number,
    playerTop: number,
    playerHalfW: number,
    playerHalfD: number,
  ): ObstacleInstance | null {
    for (const inst of this.active) {
      if (!inst.active || !inst.group.visible) continue;
      const p = inst.group.position;
      const spec = OBSTACLE_SPECS[inst.kind];
      if (
        Math.abs(p.x - playerX) < spec.halfW + playerHalfW &&
        Math.abs(p.z) < spec.halfD + playerHalfD
      ) {
        // Vertical check: player bottom below obstacle top => hit.
        // Jumping clears obstacles whose top is below the player's feet.
        const obstacleTop = spec.halfH * 2;
        if (playerBottom < obstacleTop && playerTop > 0) return inst;
      }
    }
    return null;
  }

  /**
   * A graze: the runner got past an obstacle without touching it, but only just
   * — either through a gap narrower than NEAR_MISS_CLEARANCE, or by jumping with
   * his feet skimming the top of it. Each obstacle can only score one graze.
   */
  checkNearMiss(
    playerX: number,
    playerBottom: number,
    playerTop: number,
    playerHalfW: number,
    playerHalfD: number,
  ): NearMissEvent | null {
    let best: NearMissEvent | null = null;
    for (const inst of this.active) {
      if (!inst.active || !inst.group.visible || inst.grazed) continue;
      const p = inst.group.position;
      const spec = OBSTACLE_SPECS[inst.kind];
      const halfD = spec.halfD + playerHalfD;
      // Only judge obstacles at the runner's own line on the road.
      if (Math.abs(p.z) > halfD + NEAR_MISS_WINDOW) continue;

      const lateralGap = Math.abs(p.x - playerX) - (spec.halfW + playerHalfW);
      if (lateralGap < 0) continue; // overlapping sideways: that is a collision

      const obstacleTop = spec.halfH * 2;
      let flyOver = false;
      let qualifies = false;
      let clearance = lateralGap;

      if (playerBottom > obstacleTop) {
        // Above it: only a graze if his feet barely cleared the top.
        clearance = playerBottom - obstacleTop;
        flyOver = clearance <= NEAR_MISS_FLY_OVER;
        qualifies = flyOver;
      } else if (playerBottom < obstacleTop && playerTop > 0) {
        qualifies = lateralGap <= NEAR_MISS_CLEARANCE;
      }

      if (!qualifies) continue;

      inst.grazed = true;
      const event: NearMissEvent = {
        kind: inst.kind,
        x: p.x,
        y: Math.min(obstacleTop, playerBottom + 0.4),
        z: p.z,
        flyOver,
        clearance,
      };
      // Prefer the tightest of any grazes resolved in the same frame.
      if (!best || event.clearance < best.clearance) best = event;
    }
    return best;
  }

  /**
   * Drive straight through an obstacle (Divine Shield). The instance is freed
   * immediately, and the caller gets its centre for the debris burst.
   */
  smash(inst: ObstacleInstance): void {
    inst.group.visible = false;
    inst.active = false;
    inst.grazed = false;
    const index = this.active.indexOf(inst);
    if (index >= 0) this.active.splice(index, 1);
  }

  get activeCount(): number {
    return this.active.length;
  }

  reset() {
    for (const inst of this.active) {
      inst.group.visible = false;
      inst.active = false;
      inst.grazed = false;
    }
    this.active = [];
    this.lastSpawnDistance = 0;
    this.nextGap = FIRST_SPAWN_DISTANCE;
  }

  dispose() {
    for (const pool of this.pools.values()) {
      for (const inst of pool) {
        this.scene.remove(inst.group);
        inst.group.traverse((obj) => {
          if (obj instanceof THREE.Mesh) obj.geometry.dispose();
        });
      }
    }
    this.pools.clear();
    this.active = [];
  }
}
