import * as THREE from "three";
import { COLORS, type PowerUpKind } from "../constants";

export interface ActivePowers {
  shield: boolean;
  magnet: boolean;
  dash: boolean;
  multiplier: boolean;
  vighnaharta: boolean;
}

/**
 * The visible body of the divine powers, worn by the runner rather than spawned
 * around him: a bubble that wraps his whole silhouette, a spinning ring that
 * reaches out for the modaks, gold streaks torn off his shoulders, a rotating
 * crown of blessing above his mukut — and, when Vighnaharta burns, a column of
 * light standing on the road with a double corona at its heart.
 *
 * The aura lives in world space and is positioned from the runner each frame,
 * so the squash-and-stretch on his rig never distorts the divine geometry.
 * Everything is built once and toggled by visibility — no allocation per frame.
 */
export class DivineAura {
  private group = new THREE.Group();
  private shield: THREE.Group;
  private magnet: THREE.Group;
  private dash: THREE.Group;
  private multiplier: THREE.Group;
  private vighnaharta: THREE.Group;

  private time = 0;
  /** Activation pops, one per power, so a power visibly "arrives". */
  private pulse: Record<PowerUpKind, number> = {
    shield: 0,
    magnet: 0,
    dash: 0,
    multiplier: 0,
    vighnaharta: 0,
  };
  private wasActive: ActivePowers = {
    shield: false,
    magnet: false,
    dash: false,
    multiplier: false,
    vighnaharta: false,
  };

  constructor(scene: THREE.Scene) {
    this.shield = buildShield();
    this.magnet = buildMagnet();
    this.dash = buildDash();
    this.multiplier = buildMultiplier();
    this.vighnaharta = buildVighnaharta();
    this.group.add(this.shield, this.magnet, this.dash, this.multiplier, this.vighnaharta);
    this.group.visible = false;
    scene.add(this.group);
  }

  /** Place the aura on the runner and animate whichever powers are lit. */
  update(dt: number, x: number, y: number, powers: ActivePowers, speed: number) {
    this.time += dt;
    this.group.position.set(x, y, 0);

    // Pop on activation
    const kinds: PowerUpKind[] = ["shield", "magnet", "dash", "multiplier", "vighnaharta"];
    for (const kind of kinds) {
      if (powers[kind] && !this.wasActive[kind]) this.pulse[kind] = 1;
      this.pulse[kind] = Math.max(0, this.pulse[kind] - dt * 2.4);
    }
    this.wasActive = { ...powers };

    const anything =
      powers.shield || powers.magnet || powers.dash || powers.multiplier || powers.vighnaharta;
    this.group.visible = anything;
    if (!anything) return;

    const t = this.time;

    // --- Divine Shield: breathing bubble, spinning lattice, hit pop ---
    this.shield.visible = powers.shield;
    if (powers.shield) {
      const breathe = 1 + Math.sin(t * 2.6) * 0.025;
      const pop = 1 + this.pulse.shield * 0.18;
      this.shield.scale.setScalar(breathe * pop);
      this.shield.rotation.y = t * 0.35;
      this.shield.position.y = 1.05 + Math.sin(t * 1.7) * 0.03;
      const shell = this.shield.children[0] as THREE.Mesh;
      const lattice = this.shield.children[1] as THREE.Mesh;
      (shell.material as THREE.MeshPhysicalMaterial).opacity =
        0.13 + this.pulse.shield * 0.22 + Math.sin(t * 3.1) * 0.02;
      (lattice.material as THREE.MeshBasicMaterial).opacity = 0.22 + this.pulse.shield * 0.4;
    }

    // --- Modak Magnet: a ring thrown wide, turning against the run ---
    this.magnet.visible = powers.magnet;
    if (powers.magnet) {
      const reach = 1.35 + this.pulse.magnet * 0.35;
      this.magnet.scale.setScalar(reach);
      this.magnet.position.y = 0.55;
      this.magnet.rotation.y = -t * 2.2;
      this.magnet.rotation.x = Math.PI / 2 + Math.sin(t * 1.3) * 0.06;
      const ring = this.magnet.children[0] as THREE.Mesh;
      (ring.material as THREE.MeshStandardMaterial).emissiveIntensity =
        1.1 + Math.sin(t * 5) * 0.35;
    }

    // --- Divine Dash: streaks raked off his shoulders, brighter with pace ---
    this.dash.visible = powers.dash;
    if (powers.dash) {
      const pace = Math.min(1.4, speed / 34);
      this.dash.position.y = 0.9;
      for (let i = 0; i < this.dash.children.length; i++) {
        const streak = this.dash.children[i] as THREE.Mesh;
        const material = streak.material as THREE.MeshBasicMaterial;
        const flicker = 0.45 + 0.35 * Math.abs(Math.sin(t * 11 + i * 1.7));
        material.opacity = Math.min(1, flicker * (0.5 + pace * 0.6) + this.pulse.dash * 0.4);
        const stretch = 1 + pace * 0.5 + this.pulse.dash * 0.8;
        streak.scale.set(1, 1, stretch);
      }
      this.dash.rotation.y = Math.sin(t * 1.4) * 0.05;
    }

    // --- Blessing Multiplier: a crown of modaks turning above him ---
    this.multiplier.visible = powers.multiplier;
    if (powers.multiplier) {
      this.multiplier.position.y = 2.35;
      this.multiplier.rotation.y = t * 1.1;
      const halo = this.multiplier.children[0] as THREE.Mesh;
      (halo.material as THREE.MeshBasicMaterial).opacity =
        0.35 + this.pulse.multiplier * 0.45 + Math.sin(t * 2.2) * 0.06;
      for (let i = 1; i < this.multiplier.children.length; i++) {
        const gem = this.multiplier.children[i] as THREE.Mesh;
        gem.position.y = Math.sin(t * 2.4 + i) * 0.05;
        gem.rotation.y = t * 2.4;
      }
    }

    // --- Vighnaharta: a column of light on the road, double corona at heart ---
    this.vighnaharta.visible = powers.vighnaharta;
    if (powers.vighnaharta) {
      const arrive = this.pulse.vighnaharta;
      // The column blooms outward when it lands, then holds a slow breath.
      const bloom = 1 + arrive * 0.5 + Math.sin(t * 2.2) * 0.03;
      this.vighnaharta.scale.set(bloom, 1, bloom);
      this.vighnaharta.position.y = 0;

      // Column: a tall soft wall of light with a brighter core inside it.
      const wall = this.vighnaharta.children[0] as THREE.Mesh;
      const core = this.vighnaharta.children[1] as THREE.Mesh;
      (wall.material as THREE.MeshBasicMaterial).opacity =
        0.16 + arrive * 0.3 + Math.sin(t * 3.4) * 0.02;
      (core.material as THREE.MeshBasicMaterial).opacity =
        0.3 + arrive * 0.4 + Math.sin(t * 5.2) * 0.05;
      wall.rotation.y = t * 0.4;
      core.rotation.y = -t * 0.9;

      // Double corona at the heart of the column, counter-rotating.
      const coronaIn = this.vighnaharta.children[2] as THREE.Mesh;
      const coronaOut = this.vighnaharta.children[3] as THREE.Mesh;
      coronaIn.rotation.y = t * 1.6;
      coronaOut.rotation.y = -t * 0.9;
      (coronaIn.material as THREE.MeshBasicMaterial).opacity = 0.55 + arrive * 0.4;
      (coronaOut.material as THREE.MeshBasicMaterial).opacity = 0.3 + arrive * 0.3;

      // Rays around the base, scything with the run.
      const rays = this.vighnaharta.children[4] as THREE.Group;
      rays.rotation.y = t * 0.7;
    }
  }

  dispose() {
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const mat = obj.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat.dispose();
      }
    });
  }
}

/* ------------------------------------------------------------------ */
/* Builders                                                            */
/* ------------------------------------------------------------------ */

function addBasic(
  color: number,
  opacity: number,
  geometry: THREE.BufferGeometry,
): THREE.Mesh {
  return new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
}

/** A translucent dome around the runner, with a faceted lattice inside it. */
function buildShield(): THREE.Group {
  const g = new THREE.Group();

  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(1.05, 26, 18),
    new THREE.MeshPhysicalMaterial({
      color: COLORS.shieldGlow,
      emissive: COLORS.shieldGlow,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.15,
      roughness: 0.1,
      metalness: 0,
      transmission: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  shell.scale.set(1, 1.25, 1);
  g.add(shell);

  // Faceted lattice: reads as a woven divine shell rather than a soap bubble.
  const lattice = addBasic(COLORS.shieldGlow, 0.24, new THREE.IcosahedronGeometry(1.12, 1));
  lattice.scale.set(1, 1.25, 1);
  g.add(lattice);

  // A bright equator ring, so the bubble has a horizon when seen from behind.
  const ring = addBasic(COLORS.shieldGlow, 0.5, new THREE.TorusGeometry(1.08, 0.02, 6, 40));
  ring.rotation.x = Math.PI / 2;
  g.add(ring);

  return g;
}

/** A wide spinning ring that reaches out past the runner's shoulders. */
function buildMagnet(): THREE.Group {
  const g = new THREE.Group();

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.0, 0.045, 8, 44),
    new THREE.MeshStandardMaterial({
      color: COLORS.magnetGlow,
      emissive: COLORS.magnetGlow,
      emissiveIntensity: 1.2,
      roughness: 0.4,
      metalness: 0.3,
    }),
  );
  g.add(ring);

  // Inward hooks, so the ring reads as pulling rather than merely spinning.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const hook = addBasic(COLORS.magnetGlow, 0.5, new THREE.ConeGeometry(0.07, 0.22, 6));
    hook.position.set(Math.cos(a) * 1.16, 0, Math.sin(a) * 1.16);
    hook.rotation.z = Math.PI / 2;
    hook.rotation.y = -a;
    g.add(hook);
  }

  return g;
}

/** Gold streaks raked off the runner's shoulders while dashing. */
function buildDash(): THREE.Group {
  const g = new THREE.Group();

  const layout: Array<[number, number, number]> = [
    [0, 0.1, 0],
    [-0.36, 0.55, 0.12],
    [0.36, 0.5, -0.12],
    [-0.18, 1.0, -0.1],
    [0.18, 1.15, 0.1],
  ];
  layout.forEach(([x, y, z], i) => {
    // Long, thin cones pointing forward, streaked backward by scale.
    const streak = addBasic(COLORS.dashGlow, 0.6 - i * 0.06, new THREE.ConeGeometry(0.055, 2.6, 6));
    streak.position.set(x, y, z + 1.1);
    streak.rotation.x = Math.PI / 2;
    g.add(streak);
  });

  return g;
}

/** A crown of blessing: a soft halo with modaks turning around it. */
function buildMultiplier(): THREE.Group {
  const g = new THREE.Group();

  const halo = addBasic(COLORS.multiplierGlow, 0.4, new THREE.TorusGeometry(0.62, 0.03, 6, 40));
  halo.rotation.x = Math.PI / 2;
  g.add(halo);

  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const gem = addBasic(COLORS.goldBright, 0.85, new THREE.OctahedronGeometry(0.075, 0));
    gem.position.set(Math.cos(a) * 0.62, 0, Math.sin(a) * 0.62);
    g.add(gem);
  }

  return g;
}

/**
 * Vighnaharta: a standing column of white-gold light with a double corona and
 * a scything ray fan at its base. Built once; every animated part sits at a
 * fixed child index so `update` can address them without a search.
 *
 *   0 outer wall   1 inner core   2 corona (inner)
 *   3 corona (outer)              4 ray fan (group)
 */
function buildVighnaharta(): THREE.Group {
  const g = new THREE.Group();

  // The outer wall: a tall open cylinder, taller than the mukut so the light
  // visibly tops the runner.
  const wall = addBasic(
    COLORS.vighnahartaGlow,
    0.16,
    new THREE.CylinderGeometry(1.05, 1.15, 3.1, 28, 1, true),
  );
  wall.position.y = 1.55;
  g.add(wall);

  // The core: a narrower, brighter sheet just inside the wall.
  const core = addBasic(
    0xfff6dd,
    0.3,
    new THREE.CylinderGeometry(0.72, 0.8, 3.0, 22, 1, true),
  );
  core.position.y = 1.5;
  g.add(core);

  // Inner corona: a ring at chest height, tight and bright.
  const coronaIn = addBasic(COLORS.goldBright, 0.55, new THREE.TorusGeometry(0.85, 0.035, 8, 44));
  coronaIn.rotation.x = Math.PI / 2;
  coronaIn.position.y = 1.1;
  g.add(coronaIn);

  // Outer corona: a wider, dimmer ring just below it.
  const coronaOut = addBasic(COLORS.vighnahartaGlow, 0.3, new THREE.TorusGeometry(1.25, 0.02, 6, 48));
  coronaOut.rotation.x = Math.PI / 2;
  coronaOut.position.y = 0.95;
  g.add(coronaOut);

  // Ray fan at the base: thin blades lying on the road, scything outward.
  const rays = new THREE.Group();
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const blade = addBasic(COLORS.vighnahartaGlow, 0.5, new THREE.PlaneGeometry(0.08, 2.1));
    blade.position.set(Math.cos(a) * 1.15, 0.05, Math.sin(a) * 1.15);
    blade.rotation.x = -Math.PI / 2;
    blade.rotation.z = -a;
    rays.add(blade);
  }
  g.add(rays);

  return g;
}
