import * as THREE from "three";
import {
  LANES,
  OBSTACLE_RECYCLE_Z,
  OBSTACLE_SPAWN_Z,
  POWERUP_FIRST_SPAWN,
  POWERUP_GAP_MAX,
  POWERUP_GAP_MIN,
  VIGHNAHARTA_FIRST_SPAWN,
  VIGHNAHARTA_GAP_MAX,
  VIGHNAHARTA_GAP_MIN,
  type LaneIndex,
  type PowerUpKind,
} from "../constants";
import { buildPowerUp, POWERUP_CENTER_Y, POWERUP_HALF } from "./PowerUpModel";

/**
 * Pool + spawner for the divine power-ups.
 *
 * The four standard relics keep "only one of each loose at a time" so the icons
 * stay special. The Vighnaharta relic is rarer still: its own distance cadence
 * (first near 600 m, then roughly every kilometre) and its own pool entry, so
 * it can never crowd out the routine powers.
 *
 * Cadence is measured in distance, and the pool is fixed: nothing here
 * allocates per frame.
 */

export interface PowerUpInstance {
  kind: PowerUpKind;
  group: THREE.Group;
  active: boolean;
}

const KINDS: PowerUpKind[] = ["shield", "magnet", "dash", "multiplier", "vighnaharta"];
/** Pool entries per relic. The ultimate is rare, two instances are plenty. */
const POOL_SIZE: Record<PowerUpKind, number> = {
  shield: 2,
  magnet: 2,
  dash: 2,
  multiplier: 2,
  vighnaharta: 2,
};

export class PowerUpManager {
  private scene: THREE.Scene;
  private pools = new Map<PowerUpKind, PowerUpInstance[]>();
  private active: PowerUpInstance[] = [];
  private nextSpawnDistance = POWERUP_FIRST_SPAWN;
  private nextVighnahartaDistance = VIGHNAHARTA_FIRST_SPAWN;
  private spin = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    for (const kind of KINDS) {
      const list: PowerUpInstance[] = [];
      for (let i = 0; i < POOL_SIZE[kind]; i++) {
        const group = buildPowerUp(kind);
        group.visible = false;
        scene.add(group);
        list.push({ kind, group, active: false });
      }
      this.pools.set(kind, list);
    }
  }

  /** Free instances of a standard kind that is not already on the road. */
  private pickKind(): PowerUpKind | null {
    const standard: PowerUpKind[] = ["shield", "magnet", "dash", "multiplier"];
    const loose = new Set(
      this.active.filter((i) => i.kind !== "vighnaharta").map((i) => i.kind),
    );
    const free = standard.filter((kind) => !loose.has(kind));
    if (free.length === 0) return null;
    return free[Math.floor(Math.random() * free.length)]!;
  }

  private acquire(kind: PowerUpKind): PowerUpInstance | null {
    const pool = this.pools.get(kind);
    if (!pool) return null;
    for (const inst of pool) if (!inst.active) return inst;
    return null;
  }

  private place(inst: PowerUpInstance, distance: number, gapMin: number, gapMax: number) {
    inst.active = true;
    inst.group.visible = true;
    const lane = Math.floor(Math.random() * 3) as LaneIndex;
    inst.group.position.set(LANES[lane], 0, OBSTACLE_SPAWN_Z);
    this.active.push(inst);
    return distance + gapMin + Math.random() * (gapMax - gapMin);
  }

  /**
   * Spawn on the distance cadence, scroll the loose icons with the road, and
   * recycle anything that has passed the runner.
   */
  update(distance: number, speed: number, dt: number) {
    // The ultimate keeps its own cadence so it can never stall the standard
    // rotation — and a skipped relic never dries the run out.
    if (distance >= this.nextVighnahartaDistance) {
      const inst = this.acquire("vighnaharta");
      this.nextVighnahartaDistance = inst
        ? this.place(inst, distance, VIGHNAHARTA_GAP_MIN, VIGHNAHARTA_GAP_MAX)
        : distance + 240;
    }

    if (distance >= this.nextSpawnDistance) {
      const kind = this.pickKind();
      const inst = kind ? this.acquire(kind) : null;
      // Schedule the next one either way: a skipped pickup must not stall the
      // cadence, or the run could go dry of power-ups entirely.
      this.nextSpawnDistance = inst
        ? this.place(inst, distance, POWERUP_GAP_MIN, POWERUP_GAP_MAX)
        : distance + POWERUP_GAP_MIN;
    }

    const dz = speed * dt;
    this.spin += dt * 1.35;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const inst = this.active[i]!;
      inst.group.position.z += dz;
      inst.group.position.y = Math.sin(this.spin * 2 + inst.group.position.z * 0.12) * 0.08;
      inst.group.rotation.y = this.spin;

      // The marker ring on the road stays flat while the icon turns.
      const base = inst.group.children.find((child) => child.name === "base");
      if (base) base.rotation.z = -this.spin;

      if (inst.group.position.z > OBSTACLE_RECYCLE_Z) {
        inst.group.visible = false;
        inst.active = false;
        this.active.splice(i, 1);
      }
    }
  }

  /**
   * Pickup test against the runner's box. Returns the kind taken (and hands the
   * icon's world position to `onCollect` for the burst), or null.
   */
  collect(
    playerX: number,
    playerBottom: number,
    playerTop: number,
    playerHalfW: number,
    playerHalfD: number,
    onCollect?: (x: number, y: number, kind: PowerUpKind) => void,
  ): PowerUpKind | null {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const inst = this.active[i]!;
      const p = inst.group.position;
      if (
        Math.abs(p.x - playerX) < POWERUP_HALF + playerHalfW &&
        Math.abs(p.z) < POWERUP_HALF + playerHalfD &&
        playerBottom < p.y + POWERUP_CENTER_Y + 0.6 &&
        playerTop > p.y + POWERUP_CENTER_Y - 0.6
      ) {
        const kind = inst.kind;
        onCollect?.(p.x, p.y + POWERUP_CENTER_Y, kind);
        inst.group.visible = false;
        inst.active = false;
        this.active.splice(i, 1);
        return kind;
      }
    }
    return null;
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
    this.nextSpawnDistance = POWERUP_FIRST_SPAWN;
    this.nextVighnahartaDistance = VIGHNAHARTA_FIRST_SPAWN;
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
