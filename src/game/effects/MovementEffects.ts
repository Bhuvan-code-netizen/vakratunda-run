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
  /** The shape half of the layer: rings, blooms and columns of light. */
  private moments: MomentFX;
  private origin = new THREE.Vector3();
  private windVelocity = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.sparks = new ParticleSystem(scene, 260, { additive: true, size: 0.32 });
    this.dust = new ParticleSystem(scene, 220, {
      additive: false,
      size: 0.95,
      opacity: 0.7,
    });
    this.moments = new MomentFX(scene);
  }

  /** Integrate and keep both systems pinned to the scrolling road. */
  update(dt: number, scroll: number) {
    this.sparks.update(dt);
    this.dust.update(dt);
    this.moments.update(dt);
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
    // The shape half of the graze, so an escape registers in the corner of the eye.
    this.grazeFlare(x, y, z, flyOver);
  }

  /**
   * The flare that marks a graze: a ring snapped off the obstacle and a bloom
   * on it. Gold and flat for a leap over the top, warm white and upright for a
   * squeeze past the side, so the two escapes never read alike.
   */
  grazeFlare(x: number, y: number, z: number, flyOver: boolean) {
    const color = flyOver ? COLORS.goldBright : COLORS.spark;
    this.moments.ring(x, y, z, {
      color,
      from: flyOver ? 0.45 : 0.3,
      to: flyOver ? 2.9 : 1.9,
      life: flyOver ? 0.42 : 0.32,
      peak: flyOver ? 0.9 : 0.65,
      flat: flyOver,
      rise: flyOver ? 0.5 : 0,
    });
    this.moments.flash(x, y, z, { color, size: flyOver ? 2.3 : 1.5, life: 0.2, peak: 0.6 });
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
    this.tierBurst(x, y);
  }

  /** The tier bloom: two counter-rotating gold rings with a burst at the heart. */
  tierBurst(x: number, y: number) {
    this.moments.ring(x, y + 0.9, 0, {
      color: COLORS.goldBright,
      from: 0.5,
      to: 3.2,
      life: 0.7,
      peak: 0.9,
      spin: 0.9,
    });
    this.moments.ring(x, y + 0.9, 0, {
      color: COLORS.haloGlow,
      from: 0.3,
      to: 2.2,
      life: 0.5,
      peak: 0.7,
      spin: -1.4,
    });
    this.moments.flash(x, y + 1.1, 0, { color: COLORS.goldBright, size: 3, life: 0.3, peak: 0.7 });
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
    // A ring in the power own colour, so the pickup is legible at a glance.
    this.moments.ring(x, y + 1.0, 0, {
      color,
      from: 0.6,
      to: 2.7,
      life: 0.55,
      peak: 0.7,
      spin: 1.2,
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
    this.moments.ring(x, y + 0.5, z, {
      color: COLORS.shieldGlow,
      from: 0.5,
      to: 3.6,
      life: 0.5,
      peak: 0.75,
      flat: true,
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
    this.crashBlast(x, y, 0.3, COLORS.vermillion);
  }

  /**
   * The end of a run: a hard shockwave off the road, a red bloom and a column
   * of dust punched up, so a crash lands as an event rather than a stop.
   */
  crashBlast(x: number, y: number, z: number, color: number) {
    this.moments.ring(x, y + 0.3, z, { color, from: 0.5, to: 5.4, life: 0.55, peak: 0.85, flat: true });
    this.moments.ring(x, y + 0.6, z, { color: COLORS.spark, from: 0.4, to: 3.4, life: 0.42, peak: 0.7 });
    this.moments.flash(x, y + 0.8, z, { color, size: 4.2, life: 0.34, peak: 0.8 });
    this.moments.column(x, y, z, { color: COLORS.dust, height: 3.2, life: 0.6, peak: 0.4 });
  }

  /**
   * Vighnaharta arrives: the remover of obstacles. Three rings tear outward in
   * sequence, a column of light opens on the road, and the whole street goes
   * white-gold for a beat before the horde starts coming apart.
   */
  ultimateBlast(x: number, y: number) {
    const color = COLORS.vighnahartaGlow;
    this.moments.ring(x, y + 0.8, 0, { color, from: 0.6, to: 6.5, life: 0.85, peak: 1, flat: true });
    this.moments.ring(x, y + 1, 0, {
      color: COLORS.goldBright,
      from: 0.4,
      to: 5,
      life: 0.7,
      peak: 0.9,
      spin: 1.6,
    });
    this.moments.ring(x, y + 1, 0, { color, from: 0.3, to: 3.6, life: 0.55, peak: 0.85, spin: -2.2 });
    this.moments.flash(x, y + 1.2, 0, { color, size: 7, life: 0.5, peak: 0.95 });
    this.moments.column(x, y, 0, { color, height: 5.5, life: 0.8, peak: 0.6 });
    this.sparks.emit({
      origin: this.origin.set(x, y + 0.4, 0),
      count: 40,
      speed: 6,
      shape: "up",
      radius: 0.9,
      life: 0.8,
      color,
      gravity: -1.2,
      drag: 0.9,
    });
  }

  /** A distance milestone: a gold bloom that opens and rises overhead. */
  milestoneBloom(x: number, y: number) {
    this.moments.ring(x, y + 1.6, 0, {
      color: COLORS.goldBright,
      from: 0.5,
      to: 3.4,
      life: 0.9,
      peak: 0.8,
      rise: 1.4,
      flat: true,
    });
    this.moments.flash(x, y + 2, 0, { color: COLORS.haloGlow, size: 3.6, life: 0.4, peak: 0.65 });
  }

  dispose() {
    this.sparks.dispose();
    this.dust.dispose();
    this.moments.dispose();
  }
}

/* ------------------------------------------------------------------ */
/* Moment effects: the set pieces that punctuate a run                 */
/* ------------------------------------------------------------------ */

interface RingOptions {
  color: number;
  from?: number;
  to?: number;
  life?: number;
  peak?: number;
  /** Lie the ring flat on the road instead of standing it up. */
  flat?: boolean;
  rise?: number;
  spin?: number;
}

interface FlashOptions {
  color: number;
  size: number;
  life?: number;
  peak?: number;
}

interface ColumnOptions {
  color: number;
  height: number;
  life?: number;
  peak?: number;
}

/** One expanding ring, pooled. */
interface RingFx {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  active: boolean;
  age: number;
  life: number;
  from: number;
  to: number;
  peak: number;
  rise: number;
  spin: number;
}

/** One camera-facing bloom, pooled. */
interface FlashFx {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  active: boolean;
  age: number;
  life: number;
  from: number;
  to: number;
  peak: number;
}

/** One column of light, pooled. */
interface ColumnFx {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  active: boolean;
  age: number;
  life: number;
  height: number;
  peak: number;
}

/**
 * The shape half of the effect layer.
 *
 * A moment reads as a shape, not as grit, so this is meshes rather than
 * particles: expanding shockwave rings, a soft radial bloom that always faces
 * the camera, and a column of light. Everything is built once here and
 * afterwards only repositioned and rescaled, so a run allocates nothing
 * mid-frame and the live effect count stays bounded.
 *
 * Additive and depth-write free throughout, which is what lets it glow at
 * dusk, in rain and at midnight alike.
 */
class MomentFX {
  private group = new THREE.Group();
  private rings: RingFx[] = [];
  private flashes: FlashFx[] = [];
  private columns: ColumnFx[] = [];

  constructor(scene: THREE.Scene) {
    scene.add(this.group);

    const ringGeo = new THREE.TorusGeometry(1, 0.05, 8, 44);
    for (let i = 0; i < 16; i++) {
      const mesh = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      mesh.visible = false;
      this.group.add(mesh);
      this.rings.push({ mesh, active: false, age: 0, life: 1, from: 1, to: 3, peak: 1, rise: 0, spin: 0 });
    }

    const disc = softDiscTexture();
    for (let i = 0; i < 6; i++) {
      const material = new THREE.SpriteMaterial({
        map: disc,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.visible = false;
      this.group.add(sprite);
      this.flashes.push({ sprite, material, active: false, age: 0, life: 0.25, from: 1, to: 2, peak: 1 });
    }

    const columnGeo = new THREE.CylinderGeometry(0.85, 1.15, 1, 16, 1, true);
    for (let i = 0; i < 4; i++) {
      const mesh = new THREE.Mesh(
        columnGeo,
        new THREE.MeshBasicMaterial({
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      mesh.visible = false;
      this.group.add(mesh);
      this.columns.push({ mesh, active: false, age: 0, life: 0.7, height: 3, peak: 0.7 });
    }
  }
  /** Fire one expanding ring. Silently drops the call when the pool is dry. */
  ring(x: number, y: number, z: number, opts: RingOptions): void {
    const fx = this.rings.find((r) => !r.active);
    if (!fx) return;
    fx.active = true;
    fx.age = 0;
    fx.life = opts.life ?? 0.4;
    fx.from = opts.from ?? 0.4;
    fx.to = opts.to ?? 2.4;
    fx.peak = opts.peak ?? 0.8;
    fx.rise = opts.rise ?? 0;
    fx.spin = opts.spin ?? 0;
    fx.mesh.material.color.setHex(opts.color);
    fx.mesh.material.opacity = fx.peak;
    fx.mesh.position.set(x, y, z);
    fx.mesh.rotation.set(opts.flat ? -Math.PI / 2 : 0, 0, 0);
    fx.mesh.scale.setScalar(fx.from);
    fx.mesh.visible = true;
  }

  /** Fire one bloom facing the camera. */
  flash(x: number, y: number, z: number, opts: FlashOptions): void {
    const fx = this.flashes.find((f) => !f.active);
    if (!fx) return;
    fx.active = true;
    fx.age = 0;
    fx.life = opts.life ?? 0.22;
    fx.from = opts.size * 0.5;
    fx.to = opts.size;
    fx.peak = opts.peak ?? 0.85;
    fx.material.color.setHex(opts.color);
    fx.material.opacity = fx.peak;
    fx.sprite.position.set(x, y, z);
    fx.sprite.scale.setScalar(fx.from);
    fx.sprite.visible = true;
  }

  /** Fire one column of light standing on the road. */
  column(x: number, y: number, z: number, opts: ColumnOptions): void {
    const fx = this.columns.find((c) => !c.active);
    if (!fx) return;
    fx.active = true;
    fx.age = 0;
    fx.life = opts.life ?? 0.6;
    fx.height = opts.height;
    fx.peak = opts.peak ?? 0.7;
    fx.mesh.material.color.setHex(opts.color);
    fx.mesh.material.opacity = fx.peak;
    fx.mesh.position.set(x, y + opts.height / 2, z);
    fx.mesh.scale.set(1, opts.height, 1);
    fx.mesh.visible = true;
  }

  /** Integrate every live moment effect. */
  update(dt: number): void {
    for (const fx of this.rings) {
      if (!fx.active) continue;
      fx.age += dt;
      const t = fx.age / fx.life;
      if (t >= 1) {
        fx.active = false;
        fx.mesh.visible = false;
        fx.mesh.material.opacity = 0;
        continue;
      }
      // Fast out, slow settle: a ring snaps open like a shockwave.
      const eased = 1 - Math.pow(1 - t, 3);
      fx.mesh.scale.setScalar(fx.from + (fx.to - fx.from) * eased);
      fx.mesh.material.opacity = fx.peak * (1 - t) * (1 - t);
      if (fx.rise !== 0) fx.mesh.position.y += fx.rise * dt;
      if (fx.spin !== 0) fx.mesh.rotation.z += fx.spin * dt;
    }

    for (const fx of this.flashes) {
      if (!fx.active) continue;
      fx.age += dt;
      const t = fx.age / fx.life;
      if (t >= 1) {
        fx.active = false;
        fx.sprite.visible = false;
        fx.material.opacity = 0;
        continue;
      }
      const eased = 1 - Math.pow(1 - t, 2);
      fx.sprite.scale.setScalar(fx.from + (fx.to - fx.from) * eased);
      fx.material.opacity = fx.peak * (1 - t) * (1 - t);
    }

    for (const fx of this.columns) {
      if (!fx.active) continue;
      fx.age += dt;
      const t = fx.age / fx.life;
      if (t >= 1) {
        fx.active = false;
        fx.mesh.visible = false;
        fx.mesh.material.opacity = 0;
        continue;
      }
      const eased = 1 - Math.pow(1 - t, 2);
      fx.mesh.scale.set(1 + eased * 0.5, fx.height * (0.7 + eased * 0.5), 1 + eased * 0.5);
      fx.mesh.material.opacity = fx.peak * (1 - t);
    }
  }

  /** Free every pooled resource. */
  dispose(): void {
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const mat = obj.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat.dispose();
      } else if (obj instanceof THREE.Sprite) {
        obj.material.map?.dispose();
        obj.material.dispose();
      }
    });
    this.group.clear();
    this.rings = [];
    this.flashes = [];
    this.columns = [];
  }
}

/**
 * The soft round bloom the flashes are drawn with. Generated rather than
 * loaded, so the moment effects stay asset-free like the rest of the game.
 */
function softDiscTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.Texture();
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.3, "rgba(255,255,255,0.5)");
  grad.addColorStop(0.7, "rgba(255,255,255,0.12)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}
