import * as THREE from "three";
import { COLORS } from "../constants";
import {
  buildCoconutHeap,
  buildCrackerStack,
  buildDholCart,
  buildMurtiPallet,
  buildPandalPost,
} from "./FestivalObstacles";

/**
 * Obstacle catalogue.
 *
 * Two families live here: the demon horde (the great demons who shoulder
 * the runner aside, and the imps who caper where traffic used to be) and
 * the festival modules in `FestivalObstacles`). Every kind exposes the same
 * spec — AABB half-extents plus a builder — so the manager can pool, spawn and
 * collide with them without caring which family they came from.
 */

export type ObstacleKind =
  | "demon"
  | "imp"
  | "barricade"
  | "festivalElephant"
  | "dholCart"
  | "crackerStack"
  | "pandalPost"
  | "murtiPallet"
  | "coconutHeap";

export interface ObstacleSpec {
  kind: ObstacleKind;
  /** Half-extents for AABB collision. */
  halfW: number;
  halfH: number;
  halfD: number;
  build: () => THREE.Group;
}

/* ------------------------------------------------------------------ */
/* The demon horde                                                     */
/* ------------------------------------------------------------------ */

/**
 * What holds the road now.
 *
 * The two creatures share one small set of materials, all of them built from
 * colour alone: no textures, so they load instantly and read at any distance.
 * Eyes and the chest ember are emissive rather than lit, which is what keeps
 * them burning at dusk, in rain and at midnight alike.
 */
const demonMats = {
  hide: new THREE.MeshStandardMaterial({ color: COLORS.demonHide, roughness: 0.84 }),
  hideDeep: new THREE.MeshStandardMaterial({ color: COLORS.demonHideDeep, roughness: 0.92 }),
  belly: new THREE.MeshStandardMaterial({ color: COLORS.demonBelly, roughness: 0.76 }),
  horn: new THREE.MeshStandardMaterial({ color: COLORS.demonHorn, roughness: 0.46 }),
  claw: new THREE.MeshStandardMaterial({ color: COLORS.demonClaw, roughness: 0.36 }),
  glow: new THREE.MeshStandardMaterial({
    color: COLORS.demonGlow,
    emissive: COLORS.demonGlow,
    emissiveIntensity: 2,
  }),
  ember: new THREE.MeshStandardMaterial({
    color: COLORS.demonEmber,
    emissive: COLORS.demonEmber,
    emissiveIntensity: 1.4,
  }),
  gold: new THREE.MeshStandardMaterial({ color: COLORS.gold, roughness: 0.34, metalness: 0.75 }),
};

/** Three claws at one knuckle, curling forward out of the dark. */
function addClaws(
  g: THREE.Group,
  x: number,
  y: number,
  z: number,
  spread: number,
  pitch: number,
) {
  for (let c = -1; c <= 1; c += 1) {
    const claw = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.18, 6), demonMats.claw);
    claw.position.set(x + c * spread, y, z);
    claw.rotation.x = pitch;
    g.add(claw);
  }
}

/**
 * The great demon: squared up to the runner, horns swept back, one hand on a
 * club and an ember burning in the chest. He stands about two metres tall and
 * is meant to be dodged sideways, never jumped.
 */
function buildDemon(): THREE.Group {
  const g = new THREE.Group();
  const m = demonMats;

  // Bowed legs and splayed feet, planted either side of the lane
  for (const side of [-1, 1] as const) {
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.23, 0.72, 10), m.hide);
    thigh.position.set(side * 0.36, 0.62, 0.02);
    thigh.rotation.z = side * 0.1;
    g.add(thigh);

    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 0.44, 10), m.hideDeep);
    shin.position.set(side * 0.42, 0.22, -0.02);
    g.add(shin);

    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.52), m.hideDeep);
    foot.position.set(side * 0.42, 0.07, 0.02);
    g.add(foot);
    addClaws(g, side * 0.42, 0.08, 0.3, 0.1, -1.48);
  }

  // Barrel torso over a heavier gut
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.44, 16, 14), m.hide);
  torso.position.set(0, 1.16, -0.02);
  torso.scale.set(1.06, 1.12, 0.84);
  g.add(torso);

  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 12), m.belly);
  belly.position.set(0, 1.0, 0.16);
  belly.scale.set(1, 0.92, 0.62);
  g.add(belly);

  // The ember in the chest: the one bright thing facing the runner
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), m.ember);
  core.position.set(0, 1.24, 0.28);
  core.scale.set(1, 1.1, 0.55);
  g.add(core);

  const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 12), m.hideDeep);
  shoulders.position.set(0, 1.44, -0.02);
  shoulders.scale.set(1.22, 0.56, 0.72);
  g.add(shoulders);

  // Arms: heavy, hanging, clawed
  for (const side of [-1, 1] as const) {
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 0.52, 10), m.hide);
    upper.position.set(side * 0.52, 1.34, 0);
    upper.rotation.z = side * -0.42;
    g.add(upper);

    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.48, 10), m.hideDeep);
    fore.position.set(side * 0.68, 1.04, 0.06);
    fore.rotation.z = side * -0.18;
    fore.rotation.x = 0.22;
    g.add(fore);

    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), m.hide);
    hand.position.set(side * 0.72, 0.84, 0.1);
    g.add(hand);
    addClaws(g, side * 0.72, 0.76, 0.2, 0.06, 2.3);
  }

  // Skull, jaw and the horns
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 12), m.hide);
  head.position.set(0, 1.78, 0.02);
  head.scale.set(1, 0.94, 1.06);
  g.add(head);

  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.17, 0.36), m.hideDeep);
  jaw.position.set(0, 1.6, 0.14);
  g.add(jaw);

  for (const side of [-1, 1] as const) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.56, 10), m.horn);
    horn.position.set(side * 0.22, 2.0, -0.06);
    horn.rotation.z = side * 0.5;
    horn.rotation.x = -0.42;
    g.add(horn);

    const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 8), m.claw);
    tusk.position.set(side * 0.14, 1.58, 0.24);
    tusk.rotation.x = -2.7;
    g.add(tusk);

    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.062, 10, 8), m.glow);
    eye.position.set(side * 0.12, 1.82, 0.26);
    g.add(eye);
  }

  // A gold torc at the collar and the club over one shoulder
  const torc = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 8, 20), m.gold);
  torc.position.set(0, 1.52, 0);
  torc.rotation.x = Math.PI / 2;
  g.add(torc);

  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.92, 8), m.gold);
  shaft.position.set(-0.74, 1.34, 0.12);
  shaft.rotation.z = 0.26;
  g.add(shaft);

  const clubHead = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), m.horn);
  clubHead.position.set(-0.86, 1.76, 0.14);
  clubHead.scale.set(0.92, 1.1, 0.92);
  g.add(clubHead);

  return g;
}

function buildBarricade(): THREE.Group {
  const g = new THREE.Group();
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x5a5560, roughness: 0.6, metalness: 0.4 });

  // Two A-frame legs
  const legGeo = new THREE.BoxGeometry(0.07, 0.9, 0.07);
  for (const x of [-0.85, 0.85]) {
    for (const dz of [-0.3, 0.3]) {
      const leg = new THREE.Mesh(legGeo, frameMat);
      leg.position.set(x, 0.45, dz);
      leg.rotation.x = dz > 0 ? -0.22 : 0.22;
      g.add(leg);
    }
  }

  // Striped plank
  const plank = new THREE.Mesh(
    new THREE.BoxGeometry(1.9, 0.3, 0.06),
    new THREE.MeshStandardMaterial({ color: COLORS.barricadeOrange, roughness: 0.6 }),
  );
  plank.position.y = 0.78;
  g.add(plank);

  const stripeMat = new THREE.MeshStandardMaterial({ color: 0xe8e2d6, roughness: 0.6 });
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, 0.065), stripeMat);
    s.position.set(-0.66 + i * 0.44, 0.78, 0.001);
    g.add(s);
  }

  // Blinker light on top
  const blinker = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xffb84d, emissive: 0xff9a2a, emissiveIntensity: 1.6 }),
  );
  blinker.position.set(0, 1.0, 0);
  g.add(blinker);

  return g;
}

function buildFestivalElephant(): THREE.Group {
  const g = new THREE.Group();

  const ivory = new THREE.MeshStandardMaterial({ color: COLORS.ivory, roughness: 0.5, metalness: 0.05 });
  const skin = new THREE.MeshStandardMaterial({ color: 0x3a2b24, roughness: 0.85, metalness: 0 });
  const matBar = new THREE.MeshStandardMaterial({ color: COLORS.gold, roughness: 0.35, metalness: 0.7 });
  const matTassel = new THREE.MeshStandardMaterial({ color: COLORS.vermillion, roughness: 0.6, emissive: COLORS.vermillion, emissiveIntensity: 0.3 });
  const matTrim = new THREE.MeshStandardMaterial({ color: COLORS.clothShade, roughness: 0.85 });
  const lantern = new THREE.MeshStandardMaterial({ color: COLORS.lampGlow, emissive: COLORS.lampGlow, emissiveIntensity: 1.4 });
  const matDarker = new THREE.MeshStandardMaterial({ color: 0x2c2118, roughness: 0.88, metalness: 0 });
  const canopyMat = new THREE.MeshStandardMaterial({ color: COLORS.barricadeOrange, roughness: 0.55, metalness: 0.1 });

  // Body
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.2, 2.4), skin);
  body.position.y = 1.0;
  g.add(body);

  // Rounded back
  const hump = new THREE.Mesh(new THREE.SphereGeometry(0.85, 14, 12), skin);
  hump.position.set(0, 1.55, -0.1);
  hump.scale.set(1.05, 0.75, 1);
  g.add(hump);

  // Head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.7, 14, 12), skin);
  head.position.set(0, 1.6, 1.25);
  head.scale.set(1.02, 0.92, 0.85);
  g.add(head);

  // Trunk: two-segment curved tube curling downward
  const trunkSeg1 = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.55, 10), skin);
  trunkSeg1.position.set(0, 1.35, 1.55);
  trunkSeg1.rotation.x = 0.4;
  trunkSeg1.rotation.z = 0.12;
  g.add(trunkSeg1);

  const trunkEnd = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.07, 0.5, 8), skin);
  trunkEnd.position.set(0, 0.95, 1.82);
  trunkEnd.rotation.x = 0.8;
  trunkEnd.rotation.z = 0.06;
  g.add(trunkEnd);

  // Tusks (ivory, resting on chest)
  for (const side of [-1, 1] as const) {
    const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.35, 8), ivory);
    tusk.position.set(side * 0.28, 1.15, 1.35);
    tusk.rotation.x = 0.5;
    tusk.rotation.z = side * 0.55;
    g.add(tusk);
  }

  // Ears: large rounded paddles on each side
  const earGeo = new THREE.SphereGeometry(0.42, 12, 10);
  earGeo.scale(0.35, 0.9, 0.85);
  for (const side of [-1, 1] as const) {
    const ear = new THREE.Mesh(earGeo, skin);
    ear.position.set(side * 0.62, 1.62, 1.15);
    ear.rotation.y = side * 0.32;
    ear.rotation.z = side * -0.15;
    g.add(ear);
  }

  // Eyes
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x0b0a0c, roughness: 0.4 });
  for (const side of [-1, 1] as const) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), eyeMat);
    eye.position.set(side * 0.18, 1.55, 1.68);
    g.add(eye);
  }

  // Legs: four thick columns with loose toe-ball feet
  const legMat = new THREE.MeshStandardMaterial({ color: 0x2a211a, roughness: 0.9 });
  const footMat = new THREE.MeshStandardMaterial({ color: 0x3a2b24, roughness: 0.95 });
  for (const [x, z] of [
    [-0.55, -1.1],
    [-0.55, 0.9],
    [0.55, -1.1],
    [0.55, 0.9],
  ] as const) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 1.15, 10), legMat);
    leg.position.set(x, 0.5, z);
    g.add(leg);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), footMat);
    foot.position.set(x, 0.04, z + 0.04);
    foot.scale.set(1.4, 0.45, 1.6);
    g.add(foot);
  }

  // Howdah (sitting platform for the rider)
  const howdah = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.22, 0.9), matBar);
  howdah.position.set(0, 1.78, -0.18);
  g.add(howdah);

  // Canopy on top (tiered silk umbrella)
  const canopyPole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.35, 8), matTrim);
  canopyPole.position.set(0, 1.94, -0.15);
  g.add(canopyPole);

  const canopy = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.35, 14, 1, false, 0, Math.PI * 2), canopyMat);
  canopy.position.set(0, 2.02, -0.15);
  canopy.rotation.x = Math.PI;
  g.add(canopy);

  const canopyCap = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), matBar);
  canopyCap.position.set(0, 2.17, -0.15);
  canopyCap.scale.set(1, 0.6, 1);
  g.add(canopyCap);

  // Marigold tassels hanging from the canopy edge
  for (const angle of [0.25, 1.0, 2.1, 3.0, 4.2, 5.3, 6.1]) {
    const tassel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.035, 0.16, 6), matTassel);
    tassel.position.set(Math.cos(angle) * 0.52, 1.9, Math.sin(angle) * 0.52 - 0.15);
    tassel.rotation.z = Math.cos(angle) * -0.15;
    tassel.rotation.x = Math.sin(angle) * 0.25;
    g.add(tassel);
  }

  // Brass bells on the howdah
  for (let i = 0; i < 6; i++) {
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), matBar);
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    bell.position.set(Math.cos(a) * 0.4 + 0.02, 1.85, Math.sin(a) * 0.4 - 0.15);
    g.add(bell);
  }

  // Lanterns hanging from the howdah posts
  for (const side of [-1, 1] as const) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.18, 6), matTrim);
    post.position.set(side * 0.28, 1.72, -0.18);
    g.add(post);

    const lanternBall = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), lantern);
    lanternBall.position.set(side * 0.28, 1.62, -0.18);
    g.add(lanternBall);
  }

  // Gold trim rings around the body
  for (const [y, r] of [
    [0.6, 0.88],
    [1.35, 1.02],
  ] as const) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.045, 8, 28), matBar);
    ring.position.set(0, y, 0);
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
  }

  // Festive cloth draped over the flank, so the mass reads from behind
  const blanket = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.9, 1.2), matDarker);
  blanket.position.set(0, 0.95, -0.7);
  g.add(blanket);

  return g;
}

/** Specs + factories for the obstacle types. */
export const OBSTACLE_SPECS: Record<ObstacleKind, ObstacleSpec> = {
  car: { kind: "car", halfW: 0.85, halfH: 0.75, halfD: 1.8, build: buildCar },
  rickshaw: { kind: "rickshaw", halfW: 0.65, halfH: 0.75, halfD: 1.2, build: buildRickshaw },
  barricade: { kind: "barricade", halfW: 0.95, halfH: 0.45, halfD: 0.15, build: buildBarricade },
  festivalElephant: {
    kind: "festivalElephant",
    halfW: 0.95,
    halfH: 1.1,
    halfD: 1.4,
    build: buildFestivalElephant,
  },
  dholCart: { kind: "dholCart", halfW: 1.1, halfH: 0.95, halfD: 1.2, build: buildDholCart },
  crackerStack: { kind: "crackerStack", halfW: 0.85, halfH: 0.42, halfD: 0.45, build: buildCrackerStack },
  pandalPost: { kind: "pandalPost", halfW: 0.5, halfH: 1.35, halfD: 0.5, build: buildPandalPost },
  murtiPallet: { kind: "murtiPallet", halfW: 1.0, halfH: 0.88, halfD: 0.75, build: buildMurtiPallet },
  coconutHeap: { kind: "coconutHeap", halfW: 0.8, halfH: 0.4, halfD: 0.42, build: buildCoconutHeap },
};

export const SPAWNABLE_KINDS: ObstacleKind[] = [
  "car",
  "rickshaw",
  "barricade",
  "festivalElephant",
  "dholCart",
  "crackerStack",
  "pandalPost",
  "murtiPallet",
  "coconutHeap",
];

/** Low, jumpable kinds: everything else has to be answered with a lane change. */
export function isJumpable(kind: ObstacleKind): boolean {
  return kind === "barricade" || kind === "crackerStack" || kind === "coconutHeap";
}
