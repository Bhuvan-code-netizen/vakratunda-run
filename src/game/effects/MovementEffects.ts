import * as THREE from "three";
import { COLORS, WIND_SPEED_FLOOR } from "../constants";
import { ParticleSystem } from "./ParticleSystem";

/**
 * Movement and impact effects: lane-change gusts, take-off, footfalls, landing,
 * grazes, pickups, power-ups, smashed obstacles, crashes, monsoon spray and
 * high-speed wind streaks.
 *
 * Every emitter writes into the pooled particle systems, so nothing here
 * allocates per frame and the particle count stays fixed forever.
 */
export class MovementEffects {
  private sparks: ParticleSystem;
  private dust: ParticleSystem;
  private origin = new THREE.Vector3();
  private windVelocity = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.sparks = new ParticleSystem(scene, 260, { additive: true, size: 0.32 });
    this.dust = new ParticleSystem(scene, 220, {
      additive: false,
      size: 0.95,
      opacity: 0.7,
    });
  }

  /** Integrate and keep both systems pinned to the scrolling road. */
  update(dt: number, scroll: number) {
    this.sparks.update(dt);
    this.dust.update(dt);
    this.sparks.scrollZ(scroll);
    this.dust.scrollZ(scroll);
  }

  /** Fast sideways gust when the runner cuts between lanes. */
  laneChange(x: number, dir: -1 | 1) {
    this.origin.set(x - dir * 0.4, 0.12, 0.15);
    this.dust.emit({
      origin: this.origin,
      count: 8,
      speed: 1.7,
      shape: "ring",
      radius: 0.3,
      life: 0.44,
      color: COLORS.dust,
      gravity: 1.1,
      drag: 1.7,
      lift: 0.6,
    });
    this.origin.set(x, 0.5, 0);
    this.sparks.emit({
      origin: this.origin,
      count: 7,
      speed: 2.6,
      shape: "sphere",
      radius: 0.36,
      life: 0.3,
      color: COLORS.spark,
      gravity: -1.4,
      drag: 2.6,
    });
  }

  /** Take-off: a dust ring kicks outward and gold sparks flick upward. */
  takeOff(x: number, y: number) {
    this.origin.set(x, y + 0.06, 0);
    this.dust.emit({
      origin: this.origin,
      count: 14,
      speed: 2.8,
      shape: "ring",
      radius: 0.36,
      life: 0.5,
      color: COLORS.dust,
      gravity: 1.3,
      drag: 1.6,
      lift: 0.6,
    });
    this.sparks.emit({
      origin: this.origin,
      count: 9,
      speed: 2.4,
      shape: "up",
      radius: 0.3,
      life: 0.36,
      color: COLORS.spark,
      gravity: -3.4,
      drag: 0.8,
    });
  }

  /** A small puff under each footfall; scales with pace. */
  footstep(x: number, side: -1 | 1, speed: number) {
    const power = Math.min(1, speed / 26);
    this.origin.set(x + side * 0.17, 0.05, 0.1);
    this.dust.emit({
      origin: this.origin,
      count: 3,
      speed: 0.5 + power * 0.8,
      shape: "ring",
      radius: 0.16,
      life: 0.34,
      color: COLORS.dust,
      gravity: 1.2,
      drag: 2.4,
      lift: 0.35,
    });
  }

  /** Landing: a wide puff, sized by how hard the runner came down. */
  land(x: number, y: number, impact: number) {
    const power = Math.max(0.35, Math.min(1, impact));
    this.origin.set(x, y + 0.05, 0);
    this.dust.emit({
      origin: this.origin,
      count: Math.round(10 + power * 10),
      speed: 1.8 + power * 2.4,
      shape: "ring",
      radius: 0.4 + power * 0.2,
      life: 0.52,
      color: COLORS.dust,
      gravity: 1.5,
      drag: 1.5,
      lift: 0.45,
    });
    this.sparks.emit({
      origin: this.origin,
      count: Math.round(4 + power * 5),
      speed: 1.6 + power * 1.4,
      shape: "ring",
      radius: 0.45,
      life: 0.26,
      color: COLORS.spark,
      gravity: 2.2,
      drag: 3.2,
    });
  }

  /**
   * High-speed wind: grit torn off the road streams past the runner's shoulder,
   * so the pace is felt even when the road ahead is empty.
   */
  windStreak(x: number, y: number, speed: number) {
    const power = Math.min(1, Math.max(0, (speed - WIND_SPEED_FLOOR) / 14));
    this.origin.set(
      x + (Math.random() - 0.5) * 0.7,
      y + 0.2 + Math.random() * 1.1,
      1.2 + Math.random() * 1.6,
    );
    this.windVelocity.set(
      (Math.random() - 0.5) * 0.5,
      0.2 + Math.random() * 0.5,
      2.5 + power * 6,
    );
    this.dust.emit({
      origin: this.origin,
      count: 1,
      velocity: this.windVelocity,
      shape: "sphere",
      life: 0.42,
      color: COLORS.dust,
      gravity: 0.4,
      drag: 0.35,
    });
  }

  /**
   * A graze. Air is torn off the obstacle and dragged past the runner, with a
   * hot spark for lane grazes and a white-hot one for a jump clearance, so the
   * two kinds of escape feel different.
   */
  nearMiss(x: number, y: number, z: number, flyOver: boolean) {
    this.origin.set(x, y, z);
    this.dust.emit({
      origin: this.origin,
      count: flyOver ? 10 : 13,
      speed: flyOver ? 3.4 : 2.6,
      shape: flyOver ? "up" : "ring",
      radius: flyOver ? 0.3 : 0.42,
      life: 0.4,
      color: COLORS.clothShade,
      gravity: 0.6,
      drag: 1.4,
      lift: 0.4,
    });
    this.sparks.emit({
      origin: this.origin,
      count: flyOver ? 12 : 8,
      speed: flyOver ? 4.2 : 3.2,
      shape: "sphere",
      radius: 0.28,
      life: flyOver ? 0.34 : 0.28,
      color: flyOver ? COLORS.goldBright : COLORS.spark,
      gravity: flyOver ? -1.2 : 2.4,
      drag: 2.2,
    });
  }

  /** Modak collected: a warm sparkle at the point of pickup. */
  pickup(x: number, y: number, z: number) {
    this.origin.set(x, y, z);
    this.sparks.emit({
      origin: this.origin,
      count: 10,
      speed: 2.1,
      shape: "sphere",
      radius: 0.22,
      life: 0.42,
      color: COLORS.goldBright,
      gravity: -0.6,
      drag: 1.5,
    });
  }

  /** Blessing chain tier reached: a gold ring blooms around the runner. */
  tierUp(x: number, y: number) {
    this.origin.set(x, y + 0.9, 0);
    this.sparks.emit({
      origin: this.origin,
      count: 18,
      speed: 3.1,
      shape: "ring",
      radius: 0.85,
      life: 0.55,
      color: COLORS.goldBright,
      gravity: -1.1,
      drag: 1.3,
    });
  }

  /**
   * A power-up taken: a coloured ring blooms out of the runner and a column of
   * sparks climbs off his shoulders, tinted to the power so the pickup is
   * legible in the corner of the eye.
   */
  powerUp(x: number, y: number, color: number) {
    this.origin.set(x, y + 1.0, 0);
    this.sparks.emit({
      origin: this.origin,
      count: 24,
      speed: 3.6,
      shape: "ring",
      radius: 0.7,
      life: 0.6,
      color,
      gravity: -0.4,
      drag: 1.2,
    });
    this.origin.set(x, y + 0.1, 0);
    this.dust.emit({
      origin: this.origin,
      count: 12,
      speed: 2.4,
      shape: "up",
      radius: 0.5,
      life: 0.5,
      color,
      gravity: -0.6,
      drag: 1.0,
    });
  }

  /** A power-up running out: a short, dim fading bloom under the runner. */
  powerUpExpire(x: number, y: number, color: number) {
    this.origin.set(x, y + 0.6, 0);
    this.sparks.emit({
      origin: this.origin,
      count: 10,
      speed: 1.4,
      shape: "ring",
      radius: 0.4,
      life: 0.45,
      color,
      gravity: 1.6,
      drag: 2.2,
    });
  }

  /**
   * The Divine Shield ploughing through an obstacle: debris tinted with the
   * thing that was hit, a blue shockwave off the bubble, and enough sparks that
   * the player knows a save just happened rather than a death.
   */
  smash(x: number, y: number, z: number, color: number) {
    this.origin.set(x, y + 0.5, z);
    this.dust.emit({
      origin: this.origin,
      count: 26,
      speed: 4.2,
      shape: "sphere",
      radius: 0.6,
      life: 0.7,
      color,
      gravity: 2.4,
      drag: 1.1,
      lift: 1.2,
    });
    this.sparks.emit({
      origin: this.origin,
      count: 18,
      speed: 5.0,
      shape: "sphere",
      radius: 0.5,
      life: 0.42,
      color: COLORS.shieldGlow,
      gravity: 3.0,
      drag: 1.0,
    });
  }

  /** The bubble taking a hit and holding. */
  shieldHit(x: number, y: number, z: number) {
    this.origin.set(x, y + 0.9, z);
    this.sparks.emit({
      origin: this.origin,
      count: 20,
      speed: 3.8,
      shape: "ring",
      radius: 0.75,
      life: 0.4,
      color: COLORS.shieldGlow,
      gravity: 0.8,
      drag: 2.0,
    });
  }

  /** Rainwater thrown off the road by a footfall, brighter than road dust. */
  splash(x: number, side: -1 | 1) {
    this.origin.set(x + side * 0.18, 0.04, 0.12);
    this.dust.emit({
      origin: this.origin,
      count: 5,
      speed: 1.5,
      shape: "ring",
      radius: 0.18,
      life: 0.3,
      color: COLORS.rain,
      gravity: 3.2,
      drag: 1.6,
      lift: 0.8,
    });
  }

  /** Gold trail torn off the runner while the Divine Dash is burning. */
  dashTrail(x: number, y: number, speed: number) {
    const jitter = (Math.random() - 0.5) * 0.5;
    this.origin.set(x + jitter, y + 0.35 + Math.random() * 1.4, 0.6);
    this.windVelocity.set(jitter * 0.4, 0.3, 4 + speed * 0.35);
    this.sparks.emit({
      origin: this.origin,
      count: 2,
      velocity: this.windVelocity,
      shape: "sphere",
      life: 0.34,
      color: COLORS.dashGlow,
      gravity: 0.2,
      drag: 0.6,
    });
  }

  /** Modaks pulled in by the magnet: a warm trail from the pickup to the runner. */
  magnetPull(x: number, y: number, z: number) {
    this.origin.set(x, y, z);
    this.sparks.emit({
      origin: this.origin,
      count: 4,
      speed: 0.7,
      shape: "sphere",
      radius: 0.14,
      life: 0.3,
      color: COLORS.magnetGlow,
      gravity: 0,
      drag: 1.4,
    });
  }

  /** Collision: a heavy dust burst with gold sparks thrown off. */
  crash(x: number, y: number) {
    this.origin.set(x, y + 0.55, 0.3);
    this.dust.emit({
      origin: this.origin,
      count: 22,
      speed: 3.4,
      shape: "sphere",
      radius: 0.55,
      life: 0.72,
      color: COLORS.dust,
      gravity: 1.8,
      drag: 1.2,
      lift: 1.4,
    });
    this.sparks.emit({
      origin: this.origin,
      count: 20,
      speed: 4.2,
      shape: "sphere",
      radius: 0.5,
      life: 0.5,
      color: COLORS.spark,
      gravity: 3.4,
      drag: 1.1,
    });
  }

  dispose() {
    this.sparks.dispose();
    this.dust.dispose();
  }
}
