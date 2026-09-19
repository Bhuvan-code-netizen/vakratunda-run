import * as THREE from "three";
import { COLORS } from "../constants";

/**
 * Festival procession obstacles.
 *
 * These are the clutter of a Ganesh Chaturthi street: the dhol cart leading the
 * procession, the cracker crate a boy is about to light, the pandal post at the
 * mouth of a lane, a murti waiting on its pallet, and a heap of coconuts meant
 * for the offering. Each one is built from primitives and painted with the
 * street palette, so they read against the dusk light without textures.
 *
 * All builders return a group whose origin sits on the road and whose "front"
 * faces -Z. That way a group can be dropped straight onto a lane marker by the
 * obstacle manager without per-kind fixups.
 */

/* ------------------------------------------------------------------ */
/* Shared materials                                                    */
/* ------------------------------------------------------------------ */

interface FestivalMaterials {
  wood: THREE.MeshStandardMaterial;
  woodDark: THREE.MeshStandardMaterial;
  brass: THREE.MeshStandardMaterial;
  gold: THREE.MeshStandardMaterial;
  marigold: THREE.MeshStandardMaterial;
  marigoldDeep: THREE.MeshStandardMaterial;
  leaf: THREE.MeshStandardMaterial;
  cloth: THREE.MeshStandardMaterial;
  maroon: THREE.MeshStandardMaterial;
  clay: THREE.MeshStandardMaterial;
  ivory: THREE.MeshStandardMaterial;
  vermillion: THREE.MeshStandardMaterial;
  charcoal: THREE.MeshStandardMaterial;
  ember: THREE.MeshStandardMaterial;
  cocoBrown: THREE.MeshStandardMaterial;
  husk: THREE.MeshStandardMaterial;
  cocoMeat: THREE.MeshStandardMaterial;
  jute: THREE.MeshStandardMaterial;
  glow: THREE.MeshStandardMaterial;
}

let cache: FestivalMaterials | null = null;

function mats(): FestivalMaterials {
  if (cache) return cache;
  const std = (
    color: number,
    roughness: number,
    extra: Partial<THREE.MeshStandardMaterialParameters> = {},
  ) => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, ...extra });

  cache = {
    wood: std(COLORS.wood, 0.82),
    woodDark: std(COLORS.woodDark, 0.86),
    brass: std(COLORS.drumBrass, 0.32, { metalness: 0.8, emissive: COLORS.drumBrass, emissiveIntensity: 0.08 }),
    gold: std(COLORS.gold, 0.3, { metalness: 0.75, emissive: COLORS.gold, emissiveIntensity: 0.08 }),
    marigold: std(COLORS.marigold, 0.62),
    marigoldDeep: std(COLORS.marigoldDeep, 0.66),
    leaf: std(COLORS.leafGreen, 0.74),
    cloth: std(COLORS.clothCream, 0.9),
    maroon: std(COLORS.maroon, 0.68),
    clay: std(COLORS.clay, 0.8),
    ivory: std(COLORS.ivory, 0.45),
    vermillion: std(COLORS.vermillion, 0.55, {
      emissive: COLORS.vermillion,
      emissiveIntensity: 0.18,
    }),
    charcoal: std(0x22201f, 0.9),
    ember: new THREE.MeshStandardMaterial({
      color: 0xffd27a,
      emissive: 0xffa72a,
      emissiveIntensity: 2.2,
      roughness: 0.4,
    }),
    cocoBrown: std(0x5a3a22, 0.88),
    husk: std(0x7a5433, 0.94),
    cocoMeat: std(0xf2ead6, 0.6),
    jute: std(0x8a6f45, 0.95),
    glow: new THREE.MeshStandardMaterial({
      color: COLORS.lampGlow,
      emissive: COLORS.lampGlow,
      emissiveIntensity: 1.8,
      roughness: 0.5,
    }),
  };
  return cache;
}

/** A brass drum: body, laced skin heads and a pair of tuning rings. */
function dhol(radius: number, length: number, vertical = false): THREE.Group {
  const m = mats();
  const g = new THREE.Group();

  const body = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 18), m.wood);
  g.add(body);

  for (const end of [-1, 1] as const) {
    const skin = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.03, radius * 1.03, 0.05, 18), m.ivory);
    skin.position.y = end * (length / 2 - 0.02);
    g.add(skin);

    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.05, 0.022, 6, 22), m.brass);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = end * (length / 2 - 0.09);
    g.add(ring);
  }

  // Rope lacing, the giveaway that this is a hand drum and not a barrel.
  const laces = 10;
  for (let i = 0; i < laces; i++) {
    const a = (i / laces) * Math.PI * 2;
    const lace = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, length - 0.16, 5),
      m.cloth,
    );
    lace.position.set(Math.cos(a) * radius * 1.02, 0, Math.sin(a) * radius * 1.02);
    g.add(lace);
  }

  if (vertical) g.rotation.x = Math.PI / 2;
  return g;
}

/* ------------------------------------------------------------------ */
/* 1. Dhol-tasha cart                                                  */
/* ------------------------------------------------------------------ */

export function buildDholCart(): THREE.Group {
  const m = mats();
  const g = new THREE.Group();

  // Deck and frame
  const deck = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.14, 2.3), m.wood);
  deck.position.y = 0.62;
  g.add(deck);

  const rail = new THREE.Mesh(new THREE.BoxGeometry(2.14, 0.1, 0.1), m.woodDark);
  rail.position.set(0, 0.72, -1.13);
  g.add(rail);
  const railBack = rail.clone();
  railBack.position.z = 1.13;
  g.add(railBack);

  // Wheels: two iron-rimmed cart wheels
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.1, 16);
  wheelGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.TorusGeometry(0.42, 0.035, 6, 20);
  rimGeo.rotateY(Math.PI / 2);
  for (const z of [-0.78, 0.78]) {
    for (const x of [-1.02, 1.02]) {
      const wheel = new THREE.Mesh(wheelGeo, m.woodDark);
      wheel.position.set(x, 0.42, z);
      g.add(wheel);
      const rim = new THREE.Mesh(rimGeo, m.brass);
      rim.position.set(x, 0.42, z);
      g.add(rim);
      // Spokes
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.76, 0.05), m.wood);
        spoke.position.set(x, 0.42, z);
        spoke.rotation.x = a;
        g.add(spoke);
      }
    }
  }

  // Axle
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.24, 8), m.charcoal);
  axle.rotation.z = Math.PI / 2;
  axle.position.y = 0.42;
  g.add(axle);

  // Two big dhols standing on the deck, angled outward
  const left = dhol(0.4, 0.62);
  left.position.set(-0.55, 1.0, 0.12);
  left.rotation.set(0.1, 0, 0.14);
  g.add(left);

  const right = dhol(0.36, 0.56);
  right.position.set(0.58, 0.98, -0.05);
  right.rotation.set(-0.08, 0.4, -0.12);
  g.add(right);

  // A small tasha drum cocked on the front rail
  const tasha = dhol(0.19, 0.24, true);
  tasha.position.set(0.12, 0.86, -1.18);
  tasha.rotation.set(0.4, 0, 0.2);
  g.add(tasha);

  // Marigold garland strung across the back rail
  for (let i = 0; i < 14; i++) {
    const t = i / 13;
    const bead = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 8, 6),
      i % 2 === 0 ? m.marigold : m.marigoldDeep,
    );
    bead.position.set(-1 + t * 2, 0.78 - Math.sin(t * Math.PI) * 0.06, 1.16);
    g.add(bead);
  }

  // Pennant flags on poles at each corner
  for (const x of [-1.0, 1.0]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.5, 6), m.woodDark);
    pole.position.set(x, 1.4, 0.95);
    g.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.3), m.vermillion);
    flag.position.set(x + (x > 0 ? -0.22 : 0.22), 1.95, 0.95);
    flag.material.side = THREE.DoubleSide;
    g.add(flag);
  }

  // Diya lantern on the corner posts
  for (const x of [-1.0, 1.0]) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), m.glow);
    lamp.position.set(x, 0.86, -1.0);
    lamp.scale.set(1, 0.8, 1);
    g.add(lamp);
  }

  return g;
}

/* ------------------------------------------------------------------ */
/* 2. Cracker crate (jumpable)                                         */
/* ------------------------------------------------------------------ */

export function buildCrackerStack(): THREE.Group {
  const m = mats();
  const g = new THREE.Group();

  const boxGeo = new THREE.BoxGeometry(0.62, 0.24, 0.42);

  // Two loose crates at the base, one bridging them, one balanced on top.
  const layout = [
    [-0.42, 0.13, 0.0, 0.0],
    [0.42, 0.13, 0.0, 0.12],
    [0.0, 0.38, -0.03, -0.22],
    [0.05, 0.62, 0.02, 0.34],
  ] as const;
  for (const [x, y, z, rot] of layout) {
    const crate = new THREE.Mesh(boxGeo, m.vermillion);
    crate.position.set(x, y, z);
    crate.rotation.y = rot;
    g.add(crate);

    // Paper band around each crate
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.06, 0.44), m.cloth);
    band.position.set(x, y, z);
    band.rotation.y = rot;
    g.add(band);

    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.01), m.gold);
    mark.position.set(x, y, z - 0.215);
    mark.rotation.y = rot;
    g.add(mark);
  }

  // Rockets leaning on the pile, each with a paper cone nose
  for (const [x, z, tilt] of [
    [-0.7, 0.05, 0.42],
    [0.72, -0.06, -0.5],
    [0.15, 0.28, 0.62],
  ] as const) {
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.72, 6), m.wood);
    stick.position.set(x, 0.36, z);
    stick.rotation.z = tilt;
    g.add(stick);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 8), m.cloth);
    nose.position.set(x - Math.sin(tilt) * 0.34, 0.6, z);
    nose.rotation.z = tilt;
    g.add(nose);
  }

  // Lit fuse, throwing sparks up off the top crate
  const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.26, 6), m.charcoal);
  fuse.position.set(0.05, 0.86, 0.02);
  fuse.rotation.x = 0.28;
  g.add(fuse);
  const spark = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), m.ember);
  spark.position.set(0.05, 0.98, 0.06);
  g.add(spark);

  return g;
}

/* ------------------------------------------------------------------ */
/* 3. Pandal post (full height, blocks a lane)                         */
/* ------------------------------------------------------------------ */

export function buildPandalPost(): THREE.Group {
  const m = mats();
  const g = new THREE.Group();

  // Teak post with a carved base
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.44, 0.22, 10), m.woodDark);
  base.position.y = 0.11;
  g.add(base);

  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.22, 2.5, 12), m.wood);
  post.position.y = 1.35;
  g.add(post);

  // Gold bands, alternating with red cloth wraps
  for (let i = 0; i < 5; i++) {
    const y = 0.42 + i * 0.52;
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.215, 0.036, 6, 20), m.gold);
    band.rotation.x = Math.PI / 2;
    band.position.y = y;
    g.add(band);

    const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.225, 0.225, 0.2, 12), m.maroon);
    wrap.position.y = y - 0.26;
    g.add(wrap);
  }

  // Banana leaves fanned at the collar
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), m.leaf);
    leaf.scale.set(0.22, 0.06, 1.0);
    leaf.position.set(Math.cos(a) * 0.34, 1.45, Math.sin(a) * 0.34);
    leaf.rotation.set(0, -a, 0.55);
    g.add(leaf);
  }

  // Marigold garland spiralling the post
  for (let i = 0; i < 26; i++) {
    const t = i / 25;
    const a = t * Math.PI * 3.2;
    const bead = new THREE.Mesh(
      new THREE.SphereGeometry(0.062, 8, 6),
      i % 2 === 0 ? m.marigold : m.marigoldDeep,
    );
    bead.position.set(Math.cos(a) * 0.24, 0.5 + t * 1.7, Math.sin(a) * 0.24);
    g.add(bead);
  }

  // Cross beam at the top with a hanging diya lantern
  const beam = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.14, 0.16), m.woodDark);
  beam.position.set(0, 2.62, 0);
  g.add(beam);

  const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.34, 5), m.brass);
  chain.position.set(0.28, 2.4, 0);
  g.add(chain);

  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.24, 8), m.glow);
  lantern.position.set(0.28, 2.2, 0);
  g.add(lantern);

  const lanternCap = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.12, 8), m.brass);
  lanternCap.position.set(0.28, 2.36, 0);
  g.add(lanternCap);

  // A little clay diya on the base
  const diya = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.06, 0.06, 10), m.clay);
  diya.position.set(-0.3, 0.25, 0.2);
  g.add(diya);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.09, 6), m.ember);
  flame.position.set(-0.3, 0.32, 0.2);
  g.add(flame);

  return g;
}

/* ------------------------------------------------------------------ */
/* 4. Murti on a pallet                                                */
/* ------------------------------------------------------------------ */

export function buildMurtiPallet(): THREE.Group {
  const m = mats();
  const g = new THREE.Group();

  // Wooden pallet: slats over two bearers
  for (const z of [-0.62, 0.62]) {
    const bearer = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.14, 0.16), m.woodDark);
    bearer.position.set(0, 0.1, z);
    g.add(bearer);
  }
  for (let i = 0; i < 7; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.08, 0.16), m.wood);
    slat.position.set(0, 0.21, -0.66 + i * 0.22);
    g.add(slat);
  }

  // Mattress the murti rests on
  const mattress = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.16, 1.1), m.cloth);
  mattress.position.y = 0.33;
  g.add(mattress);

  // Seated murti: pedestal, body, elephant head, trunk down, crown
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.46, 0.16, 12), m.clay);
  pedestal.position.y = 0.49;
  g.add(pedestal);

  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 12), m.clay);
  torso.position.y = 0.82;
  torso.scale.set(1, 0.95, 0.86);
  g.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 12), m.clay);
  head.position.set(0, 1.22, -0.04);
  head.scale.set(1.06, 0.98, 1);
  g.add(head);

  for (const side of [-1, 1] as const) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), m.clay);
    ear.scale.set(1, 1.05, 0.28);
    ear.position.set(side * 0.26, 1.2, 0.02);
    ear.rotation.y = side * -0.3;
    g.add(ear);
  }

  // Trunk falling down the chest
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.05, 0.5, 10), m.clay);
  trunk.position.set(0.03, 0.94, -0.3);
  trunk.rotation.set(0.28, 0, 0.14);
  g.add(trunk);

  const crown = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.34, 12), m.gold);
  crown.position.set(0, 1.5, -0.04);
  g.add(crown);

  // Arms folded onto the lap, holding a small modak
  for (const side of [-1, 1] as const) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.3, 4, 10), m.clay);
    arm.position.set(side * 0.28, 0.78, -0.16);
    arm.rotation.set(0.5, 0, side * 0.5);
    g.add(arm);
  }
  const modak = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), m.gold);
  modak.position.set(0, 0.68, -0.3);
  g.add(modak);

  // Vermillion mark and a gold choker
  const tilak = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.12, 0.03), m.vermillion);
  tilak.position.set(0, 1.3, -0.22);
  g.add(tilak);

  const choker = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.026, 6, 20), m.gold);
  choker.rotation.x = Math.PI / 2 - 0.15;
  choker.position.y = 1.05;
  g.add(choker);

  // Garlands draped over the murti
  for (let i = 0; i < 18; i++) {
    const t = i / 17;
    const a = -Math.PI * 0.5 + t * Math.PI * 2;
    const bead = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 8, 6),
      i % 2 === 0 ? m.marigold : m.marigoldDeep,
    );
    bead.position.set(Math.cos(a) * 0.38, 0.72 + Math.sin(a) * 0.2, Math.sin(a) * 0.24 - 0.06);
    g.add(bead);
  }

  // Ropes trailing off the corners, as if it is being carried
  for (const [x, z] of [
    [-0.9, -0.66],
    [0.9, -0.66],
    [-0.9, 0.66],
    [0.9, 0.66],
  ] as const) {
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 6), m.jute);
    rope.position.set(x, 0.32, z);
    rope.rotation.set(z > 0 ? -0.5 : 0.5, 0, x > 0 ? -0.2 : 0.2);
    g.add(rope);
  }

  return g;
}

/* ------------------------------------------------------------------ */
/* 5. Coconut heap (jumpable)                                          */
/* ------------------------------------------------------------------ */

export function buildCoconutHeap(): THREE.Group {
  const m = mats();
  const g = new THREE.Group();

  // Jute sack the pile is tipped out of
  const sack = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.56, 0.34, 12), m.jute);
  sack.position.y = 0.17;
  g.add(sack);
  const sackTop = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 6, 16), m.jute);
  sackTop.rotation.x = Math.PI / 2;
  sackTop.position.y = 0.34;
  g.add(sackTop);

  // Coconuts stacked in a rough pile, with one split open at the front
  const cocoGeo = new THREE.SphereGeometry(0.16, 12, 10);
  const rows: Array<[number, number, number]> = [
    [-0.5, 0.3, -0.1],
    [-0.22, 0.3, -0.28],
    [0.06, 0.3, -0.14],
    [0.34, 0.3, -0.3],
    [0.58, 0.3, -0.06],
    [-0.34, 0.44, 0.12],
    [-0.04, 0.44, 0.24],
    [0.28, 0.44, 0.1],
    [-0.18, 0.58, -0.02],
    [0.14, 0.58, 0.02],
    [0.0, 0.72, 0.0],
  ];
  rows.forEach(([x, y, z], i) => {
    const coco = new THREE.Mesh(cocoGeo, i % 3 === 0 ? m.husk : m.cocoBrown);
    coco.position.set(x, y, z);
    coco.scale.set(1, 0.92, 1.05);
    g.add(coco);
  });

  const split = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), m.cocoMeat);
  split.position.set(-0.62, 0.2, 0.26);
  split.scale.set(1, 0.8, 1);
  g.add(split);
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), m.cocoBrown);
  shell.position.set(-0.6, 0.16, 0.3);
  shell.scale.set(1, 0.45, 1);
  g.add(shell);

  // A marigold garland draped over the top of the pile
  for (let i = 0; i < 11; i++) {
    const t = i / 10;
    const bead = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 8, 6),
      i % 2 === 0 ? m.marigold : m.marigoldDeep,
    );
    bead.position.set(-0.28 + t * 0.56, 0.8 - Math.sin(t * Math.PI) * 0.06, -0.12);
    g.add(bead);
  }

  return g;
}
