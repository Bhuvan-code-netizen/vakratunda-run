import * as THREE from "three";
import { COLORS } from "../constants";

/**
 * Sacred modak collectible: a saffron dumpling with a pleated tip, floating
 * over a gold offering ring. Placeholder-friendly: swap `buildModak()` for a
 * sculpted mesh later without touching the manager.
 */

let sharedGeos: {
  body: THREE.SphereGeometry;
  tip: THREE.ConeGeometry;
  ring: THREE.TorusGeometry;
} | null = null;

let sharedMats: {
  body: THREE.MeshStandardMaterial;
  ring: THREE.MeshStandardMaterial;
} | null = null;

function ensureShared() {
  if (sharedGeos && sharedMats) return;
  const body = new THREE.SphereGeometry(0.3, 14, 12);
  body.scale(1, 0.82, 1);
  const tip = new THREE.ConeGeometry(0.09, 0.22, 8);
  const ring = new THREE.TorusGeometry(0.42, 0.035, 8, 28);
  ring.rotateX(Math.PI / 2);

  const bodyMat = new THREE.MeshStandardMaterial({
    color: COLORS.modak,
    roughness: 0.55,
    emissive: COLORS.modak,
    emissiveIntensity: 0.22,
  });
  const ringMat = new THREE.MeshStandardMaterial({
    color: COLORS.gold,
    roughness: 0.3,
    metalness: 0.8,
    emissive: COLORS.gold,
    emissiveIntensity: 0.35,
  });

  sharedGeos = { body, tip, ring };
  sharedMats = { body: bodyMat, ring: ringMat };
}

export function buildModak(): THREE.Group {
  ensureShared();
  const g = sharedGeos!;
  const m = sharedMats!;

  const group = new THREE.Group();

  const body = new THREE.Mesh(g.body, m.body);
  body.position.y = 0.55;
  group.add(body);

  const tip = new THREE.Mesh(g.tip, m.body);
  tip.position.y = 0.82;
  group.add(tip);

  const ring = new THREE.Mesh(g.ring, m.ring);
  ring.position.y = 0.12;
  group.add(ring);

  return group;
}

/** Collection radius (half-extent) used by the manager's overlap test. */
export const MODAK_HALF = 0.5;
