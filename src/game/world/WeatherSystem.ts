import * as THREE from "three";
import { COLORS } from "../constants";

/** Half-width of the box of rain that follows the runner, in metres. */
const RAIN_HALF_WIDTH = 16;
/** Height the streaks are recycled into. */
const RAIN_TOP = 20;
const RAIN_BOTTOM = -0.4;
const RAIN_Z_BEHIND = 34;
const RAIN_Z_AHEAD = -30;

/**
 * Monsoon rain as a single LineSegments cloud that travels with the runner.
 *
 * Each streak is one short segment tilted along the fall direction, so the rain
 * leans with the world scroll instead of falling straight down. Intensities are
 * handled by drawing range: the buffer is fixed, and `setIntensity` decides how
 * much of it is alive, which makes weather transitions free — a downpour fades
 * in by revealing streaks rather than allocating them.
 */
export class WeatherSystem {
  private points: THREE.LineSegments;
  private positions: Float32Array;
  private speeds: Float32Array;
  private length: Float32Array;
  private capacity: number;

  private head = 0;
  private activeCount = 0;
  private intensity = 0;
  private time = 0;

  private readonly color = new THREE.Color();

  constructor(scene: THREE.Scene, capacity = 900) {
    this.capacity = capacity;
    this.positions = new Float32Array(capacity * 6);
    this.speeds = new Float32Array(capacity);
    this.length = new Float32Array(capacity);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));

    const material = new THREE.LineBasicMaterial({
      color: COLORS.rain,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });

    this.points = new THREE.LineSegments(geometry, material);
    this.points.frustumCulled = false;
    this.points.visible = false;
    scene.add(this.points);

    // Start every streak dormant, stacked above the road.
    this.activeCount = capacity;
    for (let i = 0; i < capacity; i++) this.respawn(i, 0, true);
    geometry.setDrawRange(0, 0);
  }

  /** Park a streak back at the top of the box, somewhere ahead of the runner. */
  private respawn(i: number, playerX: number, anywhere = false) {
    const i6 = i * 6;
    const x = playerX + (Math.random() - 0.5) * RAIN_HALF_WIDTH * 2;
    const y = anywhere
      ? RAIN_BOTTOM + Math.random() * (RAIN_TOP - RAIN_BOTTOM)
      : RAIN_TOP - Math.random() * 3;
    const z = RAIN_Z_AHEAD + Math.random() * (RAIN_Z_BEHIND - RAIN_Z_AHEAD);

    this.positions[i6] = x;
    this.positions[i6 + 1] = y;
    this.positions[i6 + 2] = z;

    const len = 0.6 + Math.random() * 0.7;
    this.length[i] = len;
    this.speeds[i] = 17 + Math.random() * 9;
    this.positions[i6 + 3] = x + 0.12 * len;
    this.positions[i6 + 4] = y - len;
    this.positions[i6 + 5] = z + 0.34 * len;
  }

  /**
   * How hard it is raining, 0…1. Reveals streaks in a shuffled order (the
   * buffer is pre-seeded randomly, so any prefix of it looks like rain) and
   * lifts the opacity with the intensity.
   */
  setIntensity(rain: number) {
    const r = Math.min(1, Math.max(0, rain));
    if (Math.abs(r - this.intensity) < 0.004) return;
    this.intensity = r;
    const drawn = Math.round(this.capacity * r);
    this.points.geometry.setDrawRange(0, drawn * 2);
    this.points.visible = drawn > 0;
  }

  /** Fall speed and lean scale with the pace, so rain drives past at speed. */
  update(dt: number, advance: number, playerX: number, night: number) {
    if (!this.points.visible) return;

    const drawn = Math.round(this.capacity * this.intensity);
    const lean = 0.34;
    // Faster than the runner, so streaks visibly reach past him.
    const drive = advance * 1.35;

    for (let i = 0; i < drawn; i++) {
      const i6 = i * 6;
      const fall = this.speeds[i]! * dt;

      this.positions[i6 + 1]! -= fall;
      this.positions[i6 + 4]! -= fall;
      this.positions[i6 + 2]! += drive;
      this.positions[i6 + 5]! += drive;

      // Recycle: below the road, or driven out of the box around the runner.
      const y = this.positions[i6 + 1]!;
      const z = this.positions[i6 + 2]!;
      const dx = this.positions[i6]! - playerX;
      if (y < RAIN_BOTTOM || z > RAIN_Z_BEHIND || Math.abs(dx) > RAIN_HALF_WIDTH) {
        this.respawn(i, playerX);
        continue;
      }
      // Keep the segment trailing its head along the fall direction.
      const len = this.length[i]!;
      this.positions[i6 + 3] = this.positions[i6]! + 0.12 * len;
      this.positions[i6 + 4] = y - len;
      this.positions[i6 + 5] = z + lean * len;
    }

    this.points.geometry.attributes.position!.needsUpdate = true;

    // Night rain is cooler and dimmer, and the whole sheet shivers slightly.
    this.time += dt;
    const material = this.points.material as THREE.LineBasicMaterial;
    this.color.setHex(COLORS.rain).lerp(new THREE.Color(0x6d86b8), night);
    material.color.copy(this.color);
    material.opacity = (0.2 + this.intensity * 0.34) * (1 - night * 0.25);
  }

  dispose() {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
