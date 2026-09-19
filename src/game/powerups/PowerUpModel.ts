import * as THREE from "three";
import { COLORS, type PowerUpKind } from "../constants";

/**
 * The five divine pickups, built as floating relics.
 *
 * Each one is a bright core wrapped in a cage of gold and a coloured halo, so
 * it stays legible against the dusk street at speed: the blue shield shell, the
 * orange magnet ring, the gold dash bolt, the violet blessing star and — rarest
 * — the white-gold conch and chakra of Vighnaharta, the remover of obstacles.
 * They hover and turn, and they are all emissive — no pickup depends on the key
 * light to be seen.
 */

/** Height of the icon's centre above the road. */
export const POWERUP_CENTER_Y = 1.0;
/** Pickup radius used by the manager. */
export const POWERUP_HALF = 0.7;

export const POWERUP_COLORS: Record<PowerUpKind, number> = {
  shield: COLORS.shieldGlow,
  magnet: COLORS.magnetGlow,
  dash: COLORS.dashGlow,
  multiplier: COLORS.multiplierGlow,
  vighnaharta: COLORS.vighnahartaGlow,
};

export const POWERUP_LABELS: Record<PowerUpKind, string> = {
  shield: "Divine Shield",
  magnet: "Modak Magnet",
  dash: "Divine Dash",
  multiplier: "Blessing Multiplier",
  vighnaharta: "Vighnaharta Power",
};

function glow(color: number, intensity: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.3,
    metalness: 0.35,
  });
}

function halo(color: number, radius: number): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.TorusGeometry(radius, 0.035, 8, 36),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
}

/** A gold ring under the icon, marking the pickup spot on the road. */
function baseRing(color: number): THREE.Mesh {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.5, 0.045, 8, 30),
    glow(COLORS.gold, 0.9),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -POWERUP_CENTER_Y + 0.16;
  ring.name = "base";
  // Keep the marker tint at the edges by ringing it with the power's colour.
  const inner = new THREE.Mesh(
    new THREE.TorusGeometry(0.36, 0.02, 6, 26),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  inner.rotation.x = Math.PI / 2;
  ring.add(inner);
  return ring;
}

function buildShield(): THREE.Group {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.34, 1), glow(COLORS.shieldGlow, 1.3));
  g.add(core);

  const shell = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.5, 0),
    new THREE.MeshBasicMaterial({
      color: COLORS.shieldGlow,
      transparent: true,
      opacity: 0.22,
      wireframe: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  g.add(shell);

  const ring = halo(COLORS.shieldGlow, 0.62);
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  g.add(baseRing(COLORS.shieldGlow));
  return g;
}

function buildMagnet(): THREE.Group {
  const g = new THREE.Group();
  // Horseshoe: an open torus with two capped tips.
  const arc = new THREE.Mesh(
    new THREE.TorusGeometry(0.34, 0.11, 10, 26, Math.PI * 1.35),
    glow(COLORS.magnetGlow, 1.25),
  );
  arc.rotation.z = Math.PI * 0.32;
  g.add(arc);

  for (const side of [-1, 1] as const) {
    const tip = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.1, 4, 10), glow(COLORS.goldBright, 1.1));
    tip.position.set(side * 0.28, 0.1, 0);
    g.add(tip);
  }

  const ring = halo(COLORS.magnetGlow, 0.62);
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  g.add(baseRing(COLORS.magnetGlow));
  return g;
}

function buildDash(): THREE.Group {
  const g = new THREE.Group();
  // A bolt: two offset wedges.
  const upper = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.5, 4), glow(COLORS.dashGlow, 1.5));
  upper.position.set(-0.08, 0.16, 0);
  upper.rotation.z = 0.22;
  g.add(upper);

  const lower = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.5, 4), glow(COLORS.dashGlow, 1.5));
  lower.position.set(0.08, -0.16, 0);
  lower.rotation.z = Math.PI + 0.22;
  g.add(lower);

  const ring = halo(COLORS.dashGlow, 0.62);
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  g.add(baseRing(COLORS.dashGlow));
  return g;
}

function buildMultiplier(): THREE.Group {
  const g = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.33, 0),
    glow(COLORS.multiplierGlow, 1.3),
  );
  g.add(core);

  // Four modak points around the core.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const point = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.22, 8), glow(COLORS.goldBright, 1.2));
    point.position.set(Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42);
    point.rotation.z = -Math.PI / 2;
    point.rotation.y = -a;
    g.add(point);
  }

  const ring = halo(COLORS.multiplierGlow, 0.66);
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  g.add(baseRing(COLORS.multiplierGlow));
  return g;
}

/**
 * The Vighnaharta relic: a conch (shankha) standing over a blazing chakra,
 * sheathed in a double halo. It is drawn slightly larger than the other relics
 * so its rarity registers before its shape does.
 */
function buildVighnaharta(): THREE.Group {
  const g = new THREE.Group();
  const white = glow(COLORS.vighnahartaGlow, 1.6);
  const gold = glow(COLORS.goldBright, 1.1);

  // Conch: a tapered shell with a flared mouth and a spiral ridge.
  const shell = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.46, 12), white);
  shell.position.set(0, 0.24, 0);
  shell.rotation.x = Math.PI;
  g.add(shell);

  const mouth = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.13, 0.14, 12), white);
  mouth.position.set(0, -0.04, 0);
  g.add(mouth);

  const ridge = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.03, 8, 22), gold);
  ridge.position.set(0, 0.16, 0);
  ridge.rotation.x = Math.PI / 2;
  g.add(ridge);

  // Chakra beneath: a ring of flame points around a polished hub.
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), gold);
  hub.position.set(0, -0.3, 0);
  hub.scale.set(1, 0.5, 1);
  g.add(hub);

  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.2, 6), white);
    flame.position.set(Math.cos(a) * 0.26, -0.3, Math.sin(a) * 0.26);
    flame.rotation.z = -Math.PI / 2;
    flame.rotation.y = -a;
    flame.rotateX(Math.PI / 2);
    g.add(flame);
  }

  // Double halo: a tight ring on the conch and a wide ring around everything.
  const ringA = halo(COLORS.vighnahartaGlow, 0.5);
  ringA.rotation.x = Math.PI / 2;
  ringA.position.y = 0.18;
  g.add(ringA);

  const ringB = halo(COLORS.goldBright, 0.72);
  ringB.rotation.x = Math.PI / 2;
  g.add(ringB);

  g.add(baseRing(COLORS.vighnahartaGlow));
  return g;
}

export function buildPowerUp(kind: PowerUpKind): THREE.Group {
  const g =
    kind === "shield"
      ? buildShield()
      : kind === "magnet"
        ? buildMagnet()
        : kind === "dash"
          ? buildDash()
          : kind === "multiplier"
            ? buildMultiplier()
            : buildVighnaharta();

  g.position.y = POWERUP_CENTER_Y;
  g.traverse((obj) => {
    if (obj instanceof THREE.Mesh) obj.castShadow = false;
  });
  return g;
}
