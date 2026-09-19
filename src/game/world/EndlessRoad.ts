import * as THREE from "three";
import { COLORS, RECYCLE_Z, ROAD_HALF_WIDTH, SEGMENT_COUNT, SEGMENT_LENGTH } from "../constants";
import { getFacadeTextures, getRoadTexture, getToranTexture } from "./textures";

/**
 * Endless road via object pooling: a fixed ring of segments, each containing
 * road surface, sidewalks, buildings, lamps and a toran banner. Segments
 * leapfrog from behind the camera to the far spawn end — zero per-frame
 * allocation after warmup, and the ring never runs out of road.
 */

interface RoadSegment {
  group: THREE.Group;
  worldZ: number;
  buildings: THREE.Mesh[];
}

// Deterministic pseudo-random for stable variety without allocations
const pick = (seed: number, len: number) => Math.abs(Math.sin(seed * 127.1) * 43758.5) % len;

export class EndlessRoad {
  private scene: THREE.Scene;
  private segments: RoadSegment[] = [];
  private sharedRoadMat: THREE.MeshStandardMaterial;
  private sharedSidewalkMat: THREE.MeshStandardMaterial;

  /** Run distance in metres — only advances while the player is running. */
  distance = 0;
  /** Total decorative scroll, including the idle scene. Drives segment variety. */
  private scroll = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    const roadTex = getRoadTexture();
    this.sharedRoadMat = new THREE.MeshStandardMaterial({
      map: roadTex,
      roughness: 0.92,
      metalness: 0.05,
    });
    this.sharedSidewalkMat = new THREE.MeshStandardMaterial({
      color: COLORS.sidewalk,
      roughness: 0.95,
    });

    for (let i = 0; i < SEGMENT_COUNT; i++) {
      const seg = this.buildSegment();
      seg.worldZ = -i * SEGMENT_LENGTH;
      seg.group.position.z = seg.worldZ;
      this.decorate(seg);
      this.segments.push(seg);
      scene.add(seg.group);
    }
  }

  /**
   * Advance the world; recycle segments that pass behind the camera.
   * `countRunDistance` is false for decorative motion (the ready screen), so
   * idle time never consumes the run's distance or fair-start buffer.
   */
  update(playerAdvance: number, countRunDistance = true) {
    this.scroll += playerAdvance;
    if (countRunDistance) this.distance += playerAdvance;
    for (const seg of this.segments) {
      seg.worldZ += playerAdvance;
      if (seg.worldZ > RECYCLE_Z) {
        seg.worldZ -= SEGMENT_COUNT * SEGMENT_LENGTH;
        this.decorate(seg); // re-roll building variety
      }
      seg.group.position.z = seg.worldZ;
    }
  }

  /** Return the ring to its initial layout for a fresh run. */
  reset() {
    this.distance = 0;
    this.scroll = 0;
    this.segments.forEach((seg, i) => {
      seg.worldZ = -i * SEGMENT_LENGTH;
      seg.group.position.z = seg.worldZ;
      this.decorate(seg);
    });
  }

  private buildSegment(): RoadSegment {
    const group = new THREE.Group();

    // Road surface
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD_HALF_WIDTH * 2, SEGMENT_LENGTH),
      this.sharedRoadMat,
    );
    road.rotation.x = -Math.PI / 2;
    road.receiveShadow = true;
    group.add(road);

    // Sidewalks (slightly raised)
    for (const side of [-1, 1]) {
      const walk = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, 0.18, SEGMENT_LENGTH),
        this.sharedSidewalkMat,
      );
      walk.position.set(side * (ROAD_HALF_WIDTH + 1.2), 0.09, 0);
      walk.receiveShadow = true;
      group.add(walk);
    }

    // Buildings: one window-lit shell per side
    const { map, emissive } = getFacadeTextures();
    const buildings: THREE.Mesh[] = [];
    for (const side of [-1, 1]) {
      const mat = new THREE.MeshStandardMaterial({
        map,
        emissiveMap: emissive,
        emissive: 0xffffff,
        emissiveIntensity: 0.9,
        roughness: 0.9,
      });
      const b = new THREE.Mesh(new THREE.BoxGeometry(9, 14, SEGMENT_LENGTH), mat);
      b.position.set(side * (ROAD_HALF_WIDTH + 6.5), 7, 0);
      group.add(b);
      buildings.push(b);
    }

    // Street lamps: pole + emissive head + warm point light, alternate sides
    const lampPole = new THREE.CylinderGeometry(0.06, 0.08, 5, 8);
    const lampMat = new THREE.MeshStandardMaterial({ color: 0x222028, roughness: 0.6, metalness: 0.5 });
    const headMat = new THREE.MeshStandardMaterial({
      color: COLORS.lampGlow,
      emissive: COLORS.lampGlow,
      emissiveIntensity: 1.6,
    });
    for (let i = 0; i < 2; i++) {
      const side = (i % 2 === 0 ? -1 : 1) as -1 | 1;
      const z = -SEGMENT_LENGTH / 2 + (SEGMENT_LENGTH / 2) * i;
      const pole = new THREE.Mesh(lampPole, lampMat);
      pole.position.set(side * (ROAD_HALF_WIDTH + 0.9), 2.5, z);
      group.add(pole);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), headMat);
      head.position.set(side * (ROAD_HALF_WIDTH + 0.5), 5, z);
      group.add(head);
      const light = new THREE.PointLight(COLORS.lampGlow, 14, 18, 2);
      light.position.set(side * (ROAD_HALF_WIDTH + 0.5), 4.8, z);
      group.add(light);
    }

    // Toran banner across the road
    const toranMat = new THREE.MeshBasicMaterial({
      map: getToranTexture(),
      transparent: true,
      side: THREE.DoubleSide,
      alphaTest: 0.4,
    });
    const toran = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF_WIDTH * 2, 1.3), toranMat);
    toran.position.set(0, 4.6, -SEGMENT_LENGTH / 2);
    group.add(toran);

    return { group, worldZ: 0, buildings };
  }

  /** Re-roll building heights for variety on recycle. */
  private decorate(seg: RoadSegment) {
    const seed = this.scroll + seg.worldZ;
    seg.buildings.forEach((b, i) => {
      const h = 8 + pick(seed + i * 3.7, 12);
      b.scale.y = h / 14;
      b.position.y = h / 2;
    });
  }

  dispose() {
    for (const seg of this.segments) {
      this.scene.remove(seg.group);
      seg.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) obj.geometry.dispose();
      });
    }
    this.segments = [];
  }
}
