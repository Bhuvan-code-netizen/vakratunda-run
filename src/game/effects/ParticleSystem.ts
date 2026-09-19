import * as THREE from "three";
import { COLORS } from "../constants";
import { getParticleTexture } from "../world/textures";

/**
 * Pooled GPU particle system. One Points object, fixed capacity, typed-array
 * state — emits never allocate and recycling wraps around automatically.
 *
 * Particles live in world space and are scrolled with the road, so dust and
 * sparks stay where they were made while the city rushes past.
 */

export type BurstShape = "sphere" | "ring" | "up";

export interface BurstOptions {
  origin: THREE.Vector3;
  count: number;
  /** Velocity added to every particle in the burst. */
  velocity?: THREE.Vector3;
  /** Random speed per particle, in m/s (distributed by `shape`). */
  speed?: number;
  shape?: BurstShape;
  /** Spawn radius around the origin (disc-, ring- or column-shaped). */
  radius?: number;
  life?: number;
  lifeJitter?: number;
  color?: number;
  gravity?: number;
  drag?: number;
  /** Extra upward velocity, useful for dust that should hang and settle. */
  lift?: number;
}

interface SystemOptions {
  /** Additive gold sparks vs. soft-lit dust. */
  additive?: boolean;
  size?: number;
  opacity?: number;
}

export class ParticleSystem {
  private scene: THREE.Scene;
  private capacity: number;
  private points: THREE.Points;
  private geometry: THREE.BufferGeometry;
  private material: THREE.PointsMaterial;

  private positions: Float32Array;
  private colors: Float32Array;
  private velocities: Float32Array;
  private ages: Float32Array;
  private lives: Float32Array;
  private gravities: Float32Array;
  private drags: Float32Array;
  private alive: Uint8Array;
  private cursor = 0;
  private liveCount = 0;

  constructor(scene: THREE.Scene, capacity: number, options: SystemOptions = {}) {
    this.scene = scene;
    this.capacity = capacity;

    this.positions = new Float32Array(capacity * 3);
    this.colors = new Float32Array(capacity * 4); // rgba: alpha drives the fade
    this.velocities = new Float32Array(capacity * 3);
    this.ages = new Float32Array(capacity);
    this.lives = new Float32Array(capacity);
    this.gravities = new Float32Array(capacity);
    this.drags = new Float32Array(capacity);
    this.alive = new Uint8Array(capacity);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute("color", new THREE.BufferAttribute(this.colors, 4));

    this.material = new THREE.PointsMaterial({
      map: getParticleTexture(),
      size: options.size ?? 0.3,
      sizeAttenuation: true,
      transparent: true,
      vertexColors: true,
      depthWrite: false,
      opacity: options.opacity ?? 1,
      blending: options.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false; // particles move every frame
    scene.add(this.points);
  }

  /** Spawn a burst. Oldest particles are overwritten once capacity is reached. */
  emit(o: BurstOptions) {
    const {
      origin,
      count,
      velocity,
      speed = 0,
      shape = "sphere",
      radius = 0,
      life = 0.5,
      lifeJitter = 0.35,
      color = COLORS.spark,
      gravity = 0,
      drag = 0.9,
      lift = 0,
    } = o;

    const r = ((color >> 16) & 0xff) / 255;
    const g = ((color >> 8) & 0xff) / 255;
    const b = (color & 0xff) / 255;

    for (let k = 0; k < count; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.capacity;
      if (!this.alive[i]) this.liveCount++;
      this.alive[i] = 1;

      const i3 = i * 3;
      const angle = Math.random() * Math.PI * 2;

      let ox = 0;
      let oz = 0;
      if (radius > 0) {
        if (shape === "ring") {
          ox = Math.cos(angle) * radius;
          oz = Math.sin(angle) * radius;
        } else {
          const rr = Math.sqrt(Math.random()) * radius;
          ox = Math.cos(angle) * rr;
          oz = Math.sin(angle) * rr;
        }
      }

      this.positions[i3] = origin.x + ox;
      this.positions[i3 + 1] = origin.y + (shape === "up" ? Math.random() * radius : 0);
      this.positions[i3 + 2] = origin.z + oz;

      let vx = velocity ? velocity.x : 0;
      let vy = velocity ? velocity.y : 0;
      let vz = velocity ? velocity.z : 0;

      if (speed > 0) {
        if (shape === "ring") {
          vx += Math.cos(angle) * speed;
          vz += Math.sin(angle) * speed;
          vy += (Math.random() - 0.5) * speed * 0.25;
        } else if (shape === "up") {
          vy += speed * (0.6 + Math.random() * 0.6);
          vx += (Math.random() - 0.5) * speed * 0.7;
          vz += (Math.random() - 0.5) * speed * 0.7;
        } else {
          const theta = Math.acos(2 * Math.random() - 1);
          const phi = angle;
          const s = speed * (0.45 + Math.random() * 0.75);
          vx += Math.sin(theta) * Math.cos(phi) * s;
          vy += Math.cos(theta) * s;
          vz += Math.sin(theta) * Math.sin(phi) * s;
        }
      }
      vy += lift;

      this.velocities[i3] = vx;
      this.velocities[i3 + 1] = vy;
      this.velocities[i3 + 2] = vz;

      this.ages[i] = 0;
      this.lives[i] = Math.max(0.05, life * (1 + (Math.random() - 0.5) * lifeJitter));
      this.gravities[i] = gravity;
      this.drags[i] = drag;

      const i4 = i * 4;
      this.colors[i4] = r;
      this.colors[i4 + 1] = g;
      this.colors[i4 + 2] = b;
      this.colors[i4 + 3] = 1;
    }

    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.attributes.position.needsUpdate = true;
  }

  update(dt: number) {
    if (this.liveCount === 0) return;

    for (let i = 0; i < this.capacity; i++) {
      if (!this.alive[i]) continue;
      const i3 = i * 3;
      const life = this.lives[i];
      this.ages[i] += dt;

      const t = this.ages[i] / life;
      if (t >= 1) {
        this.alive[i] = 0;
        this.liveCount--;
        this.colors[i * 4 + 3] = 0;
        continue;
      }

      const damp = Math.max(0, 1 - this.drags[i] * dt);
      this.velocities[i3] *= damp;
      this.velocities[i3 + 1] = this.velocities[i3 + 1] * damp - this.gravities[i] * dt;
      this.velocities[i3 + 2] *= damp;

      this.positions[i3] += this.velocities[i3] * dt;
      this.positions[i3 + 1] += this.velocities[i3 + 1] * dt;
      this.positions[i3 + 2] += this.velocities[i3 + 2] * dt;

      // Quick fade in, long soft fade out.
      this.colors[i * 4 + 3] = t < 0.12 ? t / 0.12 : 1 - (t - 0.12) / 0.88;
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
  }

  /** Keep emitted particles pinned to the road as the world scrolls. */
  scrollZ(dz: number) {
    if (this.liveCount === 0 || dz === 0) return;
    for (let i = 0; i < this.capacity; i++) {
      if (!this.alive[i]) continue;
      this.positions[i * 3 + 2] += dz;
    }
    this.geometry.attributes.position.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.points);
    this.geometry.dispose();
    this.material.dispose();
  }
}
