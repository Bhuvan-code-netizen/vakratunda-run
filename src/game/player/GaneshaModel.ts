import * as THREE from "three";
import { COLORS } from "../constants";

/**
 * The runner: an original, hand-built Ganesha assembled from primitives.
 *
 * The sculpture follows the iconography that has to read at gameplay distance:
 * a broad domed elephant cranium with paired forehead bosses, huge fanned ears
 * with thick rolled rims, small hooded eyes set wide, a long trunk that falls
 * from between the brows and curls forward holding a modak, one full tusk and
 * one snapped short (Ekadanta), a heavy belly (Lambodara) wreathed by the
 * serpent, four arms carrying his relics, a Brahminical sacred thread worn
 * over the left shoulder, a tiered mukut under a spinning prabhavali, and a
 * domed, worked-gold plate of light on his back bearing the swastika medallion
 * — its ray fan and flame corona turning slowly behind him.
 *
 * The dhoti is wrapped onto the body rather than hung off it: the cloth over
 * the hips is a tight wrap, and the cloth over each thigh is parented to that
 * leg, so the garment travels with the stride instead of standing still while
 * the legs swing through it.
 *
 * Every moving part hangs off its own pivot, so the animation layer only ever
 * works with joint angles. World orientation follows the game convention: the
 * runner faces -Z (away from the camera) with his feet planted at y = 0. Swap
 * `buildGanesha()` for a GLTF loader later without touching the controller —
 * it only needs these handles.
 */

export interface GaneshaRig {
  /** Gameplay transform (lane position, jump height, bank, squash). */
  root: THREE.Group;
  /** Waist pivot: carries the dhoti and both legs. */
  hips: THREE.Group;
  /** Upper-body pivot: bobs, leans and rolls while running. */
  torso: THREE.Group;
  head: THREE.Group;
  /** Trunk base joint. */
  trunk: THREE.Group;
  /** Nine chained joints from base to tip, for secondary whip motion. */
  trunkSegments: THREE.Group[];
  /** Resting bend per joint, so animation can offset instead of overwrite. */
  trunkBends: number[];
  /** Resting lateral lean per joint (the asymmetric curl). */
  trunkSideBends: number[];
  /** Resting angles of the trunk root itself. */
  trunkRestX: number;
  trunkRestZ: number;
  /** The sacred modak nestled in the curl of the trunk tip. */
  modak: THREE.Group;
  earL: THREE.Group;
  earR: THREE.Group;
  crown: THREE.Group;
  halo: THREE.Group;
  /** The plate of light on his back. */
  prabha: THREE.Group;
  /** The ray fan on the plate — spun by the controller so the light churns. */
  prabhaSpin: THREE.Group;
  /** The flame corona ring, turned against the ray fan. */
  prabhaCorona: THREE.Group;
  /** The plate's self-lit gold, exposed so the controller can pulse it. */
  plateGlow: THREE.MeshStandardMaterial;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftElbow: THREE.Group;
  rightElbow: THREE.Group;
  /** Second pair of arms, held up with his broken tusk and a lotus. */
  leftUpperArm: THREE.Group;
  rightUpperArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftKnee: THREE.Group;
  rightKnee: THREE.Group;
  /** The wrap over the hips only — the thigh cloth is carried by the legs. */
  dhoti: THREE.Group;
}

interface GaneshaMaterials {
  skin: THREE.MeshStandardMaterial;
  skinLight: THREE.MeshStandardMaterial;
  skinDeep: THREE.MeshStandardMaterial;
  skinRim: THREE.MeshStandardMaterial;
  gold: THREE.MeshStandardMaterial;
  goldLit: THREE.MeshStandardMaterial;
  /** Bright, self-lit gold for the face of the plate on his back. */
  plateGold: THREE.MeshStandardMaterial;
  /** Deep burnished bronze for the plate's engraving and rim lip. */
  plateBronze: THREE.MeshStandardMaterial;
  ivory: THREE.MeshStandardMaterial;
  cloth: THREE.MeshStandardMaterial;
  clothShade: THREE.MeshStandardMaterial;
  vermillion: THREE.MeshStandardMaterial;
  jade: THREE.MeshStandardMaterial;
  eyeWhite: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  halo: THREE.MeshBasicMaterial;
}

/** Radii down the trunk, base to tip. */
const TRUNK_RADII = [0.125, 0.113, 0.102, 0.092, 0.082, 0.072, 0.062, 0.052, 0.042];
/**
 * Resting curve of the trunk, in radians per joint. It leaves the brow angled
 * forward, falls almost vertically, then curls back up so the tip presents the
 * modak at the height of his waist instead of dangling past his knees.
 */
const TRUNK_BENDS = [0.26, 0.16, 0.04, -0.04, -0.04, 0.06, 0.26, 0.5, 0.72];
/**
 * A gentle lateral drift so the trunk reads as a curve, never a pipe — the
 * "vakratunda" of his name, drifting off centre and swinging back at the tip.
 */
const TRUNK_SIDE_BENDS = [0.06, 0.06, 0.05, 0.04, 0.03, 0.02, 0.0, -0.02, -0.04];
const TRUNK_SEGMENT = 0.115;

/* ------------------------------------------------------------------ */
/* Shared geometry and materials: one character per app, built twice   */
/* under StrictMode, so caching keeps the meshes and GPU buffers flat. */
/* ------------------------------------------------------------------ */

const geoCache = new Map<string, THREE.BufferGeometry>();

function cached<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  const hit = geoCache.get(key);
  if (hit) return hit as T;
  const built = make();
  geoCache.set(key, built);
  return built;
}

const sphereGeo = (r: number) => cached(`s${r}`, () => new THREE.SphereGeometry(r, 20, 16));
const capsuleGeo = (r: number, len: number) =>
  cached(`c${r}_${len}`, () => new THREE.CapsuleGeometry(r, len, 6, 16));
const cylGeo = (top: number, bottom: number, h: number, seg = 16) =>
  cached(`cy${top}_${bottom}_${h}_${seg}`, () => new THREE.CylinderGeometry(top, bottom, h, seg));
const torusGeo = (r: number, tube: number, radial = 8, tubular = 26) =>
  cached(`t${r}_${tube}`, () => new THREE.TorusGeometry(r, tube, radial, tubular));
const boxGeo = (w: number, h: number, d: number) =>
  cached(`b${w}_${h}_${d}`, () => new THREE.BoxGeometry(w, h, d));
const coneGeo = (r: number, h: number, seg = 12) =>
  cached(`co${r}_${h}_${seg}`, () => new THREE.ConeGeometry(r, h, seg));
const circleGeo = (r: number) => cached(`ci${r}`, () => new THREE.CircleGeometry(r, 48));
const planeGeo = (w: number, h: number) =>
  cached(`p${w}_${h}`, () => new THREE.PlaneGeometry(w, h));

let mats: GaneshaMaterials | null = null;

function materials(): GaneshaMaterials {
  if (mats) return mats;
  // Physical materials give the skin a soft warm rim and a whisper of sheen —
  // the difference between "painted plastic" and "lit clay" under the dusk key.
  const physical = (
    color: number,
    roughness: number,
    extra: THREE.MeshPhysicalMaterialParameters = {},
  ) =>
    new THREE.MeshPhysicalMaterial({
      color,
      roughness,
      metalness: 0,
      envMapIntensity: 0.9,
      ...extra,
    });

  const standard = (
    color: number,
    roughness: number,
    extra: Partial<THREE.MeshStandardMaterialParameters> = {},
  ) =>
    new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness: 0,
      envMapIntensity: 0.85,
      ...extra,
    });

  mats = {
    skin: physical(COLORS.skin, 0.52, {
      sheen: 0.7,
      sheenRoughness: 0.75,
      sheenColor: new THREE.Color(COLORS.skinWarm),
      clearcoat: 0.12,
      clearcoatRoughness: 0.6,
    }),
    skinLight: physical(COLORS.skinWarm, 0.56, {
      sheen: 0.6,
      sheenRoughness: 0.8,
      sheenColor: new THREE.Color(0xffd3a8),
    }),
    skinDeep: physical(COLORS.skinDeep, 0.66, { sheen: 0.4, sheenColor: new THREE.Color(COLORS.skinShade) }),
    skinRim: physical(COLORS.skinShade, 0.6),
    // Gold reads as metal only with a little self-light; emissive keeps it
    // lustrous even where the dusk key light does not reach.
    gold: standard(COLORS.gold, 0.24, {
      metalness: 0.85,
      emissive: COLORS.gold,
      emissiveIntensity: 0.1,
    }),
    goldLit: standard(COLORS.goldBright, 0.18, {
      metalness: 0.6,
      emissive: COLORS.goldBright,
      emissiveIntensity: 0.45,
    }),
    // The back plate is solid, self-lit metal: it is the one surface on the
    // character that should read as its own light source, with no transparency
    // to sort against his head and crown. The emissive is held just below the
    // accents so the dome's shading gradient stays visible.
    plateGold: standard(COLORS.gold, 0.3, {
      metalness: 0.82,
      emissive: COLORS.goldBright,
      emissiveIntensity: 0.5,
      side: THREE.DoubleSide,
    }),
    // Burnished bronze for the engraved ridges and the rim lip: the contrast
    // between deep and bright metal is what makes the plate read as worked.
    plateBronze: standard(0x7a5c20, 0.34, {
      metalness: 0.9,
      emissive: 0x4a3410,
      emissiveIntensity: 0.22,
      side: THREE.DoubleSide,
    }),
    ivory: standard(COLORS.ivory, 0.38, { metalness: 0.05 }),
    cloth: standard(COLORS.clothCream, 0.88),
    clothShade: standard(COLORS.clothShade, 0.9),
    vermillion: standard(COLORS.vermillion, 0.5, {
      emissive: COLORS.vermillion,
      emissiveIntensity: 0.16,
    }),
    jade: standard(COLORS.jade, 0.4, { emissive: COLORS.jade, emissiveIntensity: 0.18 }),
    eyeWhite: standard(0xf6f1e6, 0.26),
    dark: standard(COLORS.eye, 0.4),
    halo: new THREE.MeshBasicMaterial({
      color: COLORS.haloGlow,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  };
  return mats;
}

/** A tapered, curved tusk built along a spline (ivory pair, one broken). */
function tuskMesh(points: THREE.Vector3[], radius: number, mat: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  const curve = new THREE.CatmullRomCurve3(points);
  group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 14, radius, 8, false), mat));
  // Tapered point on the far end, so the tusk does not read as a cut pipe.
  const tipDir = points[points.length - 1].clone().sub(points[points.length - 2]).normalize();
  const point = new THREE.Mesh(coneGeo(radius * 0.95, radius * 2.4, 10), mat);
  point.position.copy(points[points.length - 1]!).addScaledVector(tipDir, radius * 0.7);
  point.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tipDir);
  group.add(point);
  return group;
}

/**
 * A leg, wearing its own share of the dhoti.
 *
 * The thigh cloth is a child of the hip pivot, so it is stitched to the leg:
 * it swings with the stride, tucks with the knee and never leaves a gap or
 * lets the leg travel through the fabric.
 */
function leg(side: -1 | 1, m: GaneshaMaterials) {
  const hip = new THREE.Group();
  hip.position.set(side * 0.19, 0, 0);

  const thigh = new THREE.Mesh(capsuleGeo(0.135, 0.3), m.skin);
  thigh.position.y = -0.22;
  hip.add(thigh);

  // Dhoti on the thigh: wrapped onto the leg, tucked at the hip and stopping
  // just above the knee, the way a cloth is kachha-tied for running.
  const cloth = new THREE.Mesh(cylGeo(0.166, 0.148, 0.44, 14), m.cloth);
  cloth.position.y = -0.2;
  hip.add(cloth);

  // A second, shorter layer over the top of the thigh, so the wrap has a fold.
  const overfold = new THREE.Mesh(cylGeo(0.176, 0.168, 0.2, 14), m.clothShade);
  overfold.position.y = -0.08;
  hip.add(overfold);

  // Gold border where the cloth ends above the knee.
  const clothHem = new THREE.Mesh(torusGeo(0.15, 0.021), m.gold);
  clothHem.rotation.x = Math.PI / 2;
  clothHem.position.y = -0.41;
  hip.add(clothHem);

  // A crease falling down the outside of the thigh.
  const fold = new THREE.Mesh(capsuleGeo(0.036, 0.28), m.clothShade);
  fold.position.set(side * 0.13, -0.26, -0.04);
  fold.rotation.z = side * -0.05;
  hip.add(fold);

  const knee = new THREE.Group();
  knee.position.y = -0.44;
  hip.add(knee);

  const kneeCap = new THREE.Mesh(sphereGeo(0.105), m.skin);
  knee.add(kneeCap);

  const shin = new THREE.Mesh(capsuleGeo(0.1, 0.28), m.skin);
  shin.position.y = -0.2;
  knee.add(shin);

  const anklet = new THREE.Mesh(torusGeo(0.105, 0.03), m.gold);
  anklet.rotation.x = Math.PI / 2;
  anklet.position.y = -0.33;
  knee.add(anklet);

  const foot = new THREE.Mesh(boxGeo(0.24, 0.12, 0.42), m.skin);
  foot.position.set(0, -0.365, -0.07);
  knee.add(foot);

  // Middle toe ring
  const toeRing = new THREE.Mesh(torusGeo(0.058, 0.017), m.gold);
  toeRing.position.set(0, -0.38, -0.22);
  knee.add(toeRing);

  return { hip, knee };
}

function arm(side: -1 | 1, m: GaneshaMaterials) {
  const shoulder = new THREE.Group();

  const deltoid = new THREE.Mesh(sphereGeo(0.12), m.skin);
  deltoid.position.set(side * 0.02, 0.01, 0);
  shoulder.add(deltoid);

  const upper = new THREE.Mesh(capsuleGeo(0.087, 0.19), m.skin);
  upper.position.set(side * 0.03, -0.15, 0);
  shoulder.add(upper);

  const armlet = new THREE.Mesh(torusGeo(0.096, 0.025), m.gold);
  armlet.rotation.x = Math.PI / 2;
  armlet.position.set(side * 0.04, -0.07, 0);
  shoulder.add(armlet);

  const elbow = new THREE.Group();
  elbow.position.set(side * 0.05, -0.28, 0);
  shoulder.add(elbow);

  const joint = new THREE.Mesh(sphereGeo(0.082), m.skin);
  elbow.add(joint);

  const fore = new THREE.Mesh(capsuleGeo(0.077, 0.19), m.skin);
  fore.position.y = -0.14;
  elbow.add(fore);

  const bangle = new THREE.Mesh(torusGeo(0.086, 0.025), m.gold);
  bangle.rotation.x = Math.PI / 2;
  bangle.position.y = -0.26;
  elbow.add(bangle);

  const hand = new THREE.Mesh(sphereGeo(0.092), m.skin);
  hand.position.set(0, -0.33, -0.01);
  hand.scale.set(1, 1.08, 1.15);
  elbow.add(hand);

  return { shoulder, elbow };
}

/** The upper pair of arms: raised, bent inward, holding his relics. */
function upperArm(side: -1 | 1, m: GaneshaMaterials) {
  const shoulder = new THREE.Group();

  const upper = new THREE.Mesh(capsuleGeo(0.082, 0.16), m.skin);
  upper.position.set(side * 0.02, -0.06, 0.02);
  upper.rotation.z = side * 0.5;
  shoulder.add(upper);

  const armlet = new THREE.Mesh(torusGeo(0.09, 0.023), m.gold);
  armlet.position.set(side * 0.06, -0.11, 0.02);
  armlet.rotation.z = side * 0.5;
  shoulder.add(armlet);

  const elbow = new THREE.Group();
  elbow.position.set(side * 0.12, -0.19, 0.03);
  shoulder.add(elbow);

  const joint = new THREE.Mesh(sphereGeo(0.074), m.skin);
  elbow.add(joint);

  // Forearm rises from this elbow: the classic "relic held up" pose
  const fore = new THREE.Mesh(capsuleGeo(0.07, 0.14), m.skin);
  fore.position.set(0, 0.07, -0.01);
  elbow.add(fore);

  const bangle = new THREE.Mesh(torusGeo(0.08, 0.023), m.gold);
  bangle.position.set(0, 0.12, -0.01);
  elbow.add(bangle);

  const hand = new THREE.Mesh(sphereGeo(0.086), m.skin);
  hand.position.set(0, 0.18, -0.02);
  elbow.add(hand);

  // Relic socket: whatever this hand carries sits here.
  const grip = new THREE.Group();
  grip.position.set(0, 0.2, -0.02);
  elbow.add(grip);

  return { shoulder, elbow, grip };
}

/** A lotus held aloft: layered petals around a gold seed pod. */
function buildLotus(m: GaneshaMaterials): THREE.Group {
  const lotus = new THREE.Group();
  const petalMat = new THREE.MeshStandardMaterial({
    color: COLORS.powderPink,
    roughness: 0.45,
    emissive: COLORS.powderPink,
    emissiveIntensity: 0.22,
  });

  for (let ring = 0; ring < 2; ring++) {
    const count = ring === 0 ? 6 : 4;
    const tilt = ring === 0 ? 0.75 : 0.35;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + ring * 0.4;
      const petal = new THREE.Mesh(sphereGeo(0.055), petalMat);
      petal.scale.set(0.7, 0.28, 1.5);
      petal.position.set(Math.cos(a) * 0.045, 0, Math.sin(a) * 0.045);
      petal.rotation.set(tilt * Math.cos(a), -a, -tilt * Math.sin(a));
      lotus.add(petal);
    }
  }

  const pod = new THREE.Mesh(sphereGeo(0.04), m.goldLit);
  pod.position.y = 0.03;
  lotus.add(pod);
  return lotus;
}

export function buildGanesha(): GaneshaRig {
  const m = materials();

  const root = new THREE.Group();

  const hips = new THREE.Group();
  hips.position.y = 0.84;
  root.add(hips);

  const torso = new THREE.Group();
  torso.position.y = 0.84;
  root.add(torso);

  /* ---------------- legs & dhoti ---------------- */

  const left = leg(-1, m);
  const right = leg(1, m);
  hips.add(left.hip, right.hip);

  // The cloth over the hips and the small of the back. It hugs the pelvis and
  // stops where the thighs begin — below that the garment is carried by the
  // legs themselves, so nothing hangs off the body like a shell.
  const dhoti = new THREE.Group();
  hips.add(dhoti);

  const hipWrap = new THREE.Mesh(cylGeo(0.35, 0.335, 0.34, 18), m.cloth);
  hipWrap.position.y = -0.08;
  dhoti.add(hipWrap);

  // A gathered layer over the left hip, tucked into the waistband.
  const hipFold = new THREE.Mesh(cylGeo(0.365, 0.35, 0.16, 18), m.clothShade);
  hipFold.position.set(-0.02, -0.02, 0.01);
  hipFold.rotation.z = 0.06;
  dhoti.add(hipFold);

  // The front pleat, falling a short way over the thigh.
  const frontPleat = new THREE.Mesh(capsuleGeo(0.055, 0.24), m.clothShade);
  frontPleat.position.set(0, -0.19, -0.3);
  frontPleat.rotation.x = 0.08;
  dhoti.add(frontPleat);

  const waistband = new THREE.Mesh(torusGeo(0.352, 0.045), m.gold);
  waistband.rotation.x = Math.PI / 2;
  waistband.position.y = 0.05;
  dhoti.add(waistband);

  /* ---------------- torso ---------------- */

  const pelvis = new THREE.Mesh(sphereGeo(0.31), m.skin);
  pelvis.position.y = -0.06;
  pelvis.scale.set(1.1, 0.72, 0.96);
  torso.add(pelvis);

  // Lambodara: the pot belly is the character's silhouette. It is big, low and
  // pushed forward, and it is what makes him read as Ganesha from behind.
  const belly = new THREE.Mesh(sphereGeo(0.43), m.skin);
  belly.position.set(0, 0.28, -0.03);
  belly.scale.set(1.04, 0.98, 0.96);
  torso.add(belly);

  const navel = new THREE.Mesh(sphereGeo(0.038), m.goldLit);
  navel.position.set(0, 0.2, -0.41);
  torso.add(navel);

  const chest = new THREE.Mesh(sphereGeo(0.31), m.skinLight);
  chest.position.set(0, 0.57, 0);
  chest.scale.set(1.16, 0.92, 0.86);
  torso.add(chest);

  // Sash across the belly (uttariya): a cloth band ringed around him, gathered
  // into a knot at his right hip.
  const sash = new THREE.Mesh(torusGeo(0.46, 0.058), m.clothShade);
  sash.position.set(0, 0.29, 0);
  sash.rotation.set(Math.PI / 2, 0, 0.42);
  torso.add(sash);

  const sashKnot = new THREE.Mesh(sphereGeo(0.08), m.gold);
  sashKnot.position.set(0.44, 0.45, -0.16);
  sashKnot.scale.set(1, 0.8, 0.8);
  torso.add(sashKnot);

  const sashTail = new THREE.Mesh(capsuleGeo(0.052, 0.22), m.clothShade);
  sashTail.position.set(0.47, 0.3, -0.1);
  sashTail.rotation.z = -0.25;
  torso.add(sashTail);

  // Vasuki: the serpent worn as a belt around the belly, head reared at the
  // front. Classic iconography, and it gives the mid-body an outline.
  const serpent = new THREE.Mesh(torusGeo(0.45, 0.032), m.jade);
  serpent.position.set(0, 0.24, -0.02);
  serpent.rotation.set(Math.PI / 2 - 0.12, 0, 0.16);
  torso.add(serpent);

  const hoodCoil = new THREE.Mesh(torusGeo(0.16, 0.03), m.jade);
  hoodCoil.position.set(0.12, 0.34, -0.44);
  hoodCoil.rotation.set(Math.PI / 2 - 0.3, 0, 0.3);
  torso.add(hoodCoil);

  const hood = new THREE.Mesh(sphereGeo(0.09), m.jade);
  hood.position.set(0.1, 0.46, -0.42);
  hood.scale.set(1, 1.4, 0.45);
  torso.add(hood);

  const hoodHead = new THREE.Mesh(sphereGeo(0.055), m.cloth);
  hoodHead.position.set(0.1, 0.58, -0.4);
  hoodHead.scale.set(1, 1.1, 0.8);
  torso.add(hoodHead);

  for (const side of [-1, 1] as const) {
    const eyelet = new THREE.Mesh(sphereGeo(0.012), m.vermillion);
    eyelet.position.set(0.1 + side * 0.028, 0.6, -0.43);
    torso.add(eyelet);
  }

  // Scarf falling off the left shoulder
  const scarf = new THREE.Mesh(capsuleGeo(0.085, 0.34), m.clothShade);
  scarf.position.set(-0.31, 0.3, 0.16);
  scarf.rotation.set(0.25, 0, 0.24);
  torso.add(scarf);

  // A choker at the throat, a band over the collarbones, and a beaded mala
  // strung down the chest onto the belly. Each band is tilted so its front
  // hangs low, the way a real necklace sits.
  const choker = new THREE.Mesh(torusGeo(0.18, 0.032), m.gold);
  choker.position.set(0, 0.78, 0);
  choker.rotation.x = Math.PI / 2 - 0.1;
  torso.add(choker);

  const collarboneBand = new THREE.Mesh(torusGeo(0.3, 0.03), m.gold);
  collarboneBand.position.set(0, 0.68, 0);
  collarboneBand.rotation.x = Math.PI / 2 - 0.22;
  torso.add(collarboneBand);

  const strandTop = new THREE.Vector3(0, 0.76, -0.22);
  const strandBottom = new THREE.Vector3(0, 0.4, -0.42);
  const strandBeads = 11;
  for (let i = 0; i < strandBeads; i++) {
    const t = i / (strandBeads - 1);
    const bead = new THREE.Mesh(sphereGeo(0.033), i % 2 === 0 ? m.gold : m.goldLit);
    bead.position.lerpVectors(strandTop, strandBottom, t);
    torso.add(bead);
  }

  const pendant = new THREE.Mesh(sphereGeo(0.06), m.jade);
  pendant.position.set(0, 0.37, -0.43);
  pendant.scale.set(1, 1.3, 0.6);
  torso.add(pendant);
  const pendantRing = new THREE.Mesh(torusGeo(0.038, 0.013), m.gold);
  pendantRing.position.set(0, 0.43, -0.43);
  torso.add(pendantRing);

  // Yajnopavita: the sacred thread of a Brahmin. One thin continuous strand —
  // it rests on the left shoulder, crosses the chest and belly on the diagonal
  // and passes under the right arm, following the curves of the body instead
  // of circling him like a hoop. The path sits a hair proud of the skin so a
  // thread this fine still reads against the clay.
  const threadCurve = new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(-0.26, 0.79, 0.0),
      new THREE.Vector3(-0.26, 0.63, -0.235),
      new THREE.Vector3(-0.09, 0.45, -0.385),
      new THREE.Vector3(0.15, 0.28, -0.415),
      new THREE.Vector3(0.345, 0.07, -0.17),
      new THREE.Vector3(0.335, 0.13, 0.205),
      new THREE.Vector3(0.1, 0.44, 0.385),
      new THREE.Vector3(-0.13, 0.68, 0.275),
    ],
    true,
  );
  const thread = new THREE.Mesh(
    new THREE.TubeGeometry(threadCurve, 80, 0.011, 5, true),
    m.cloth,
  );
  torso.add(thread);

  // The small knot where the strands of a janeu are tied, at the right hip.
  const threadKnot = new THREE.Mesh(sphereGeo(0.02), m.goldLit);
  threadKnot.position.set(0.345, 0.07, -0.17);
  torso.add(threadKnot);

  /* ---------------- prabha: the plate of light on his back ---------------- */

  // A golden plate mounted between his shoulder blades, worked like temple
  // metal: a domed face (so light rolls across it as he runs), engraved
  // ridges and lotus petals, a beaded rim and forged rays. Every part is
  // solid, opaque geometry — the glow is carried by emissive gold and by the
  // surfaces catching the dusk environment map, never by transparent discs,
  // so its edges always resolve cleanly against his head and crown.
  const prabha = new THREE.Group();
  prabha.position.set(0, 0.5, 0.52);
  prabha.rotation.x = 0.16;
  torso.add(prabha);

  const PRABHA_R = 0.62;
  const PRABHA_DOME = 0.075;
  // Height of the dome surface at a given radius (rim at 0, apex at centre).
  const domeZ = (r: number) => PRABHA_DOME * (1 - r / PRABHA_R);

  // The face: a gently domed disc, apex toward the viewer.
  const face = new THREE.Mesh(coneGeo(PRABHA_R, PRABHA_DOME, 48), m.plateGold);
  face.rotation.x = Math.PI / 2;
  face.position.z = PRABHA_DOME / 2;
  prabha.add(face);

  // A shallow dish behind the face, tapering away from the viewer, so the
  // plate has real thickness instead of reading as a decal.
  const dish = new THREE.Mesh(cylGeo(PRABHA_R, 0.48, 0.12, 40), m.gold);
  dish.rotation.x = Math.PI / 2;
  dish.position.z = -0.06;
  prabha.add(dish);

  // Two-tone rim: a deep bronze lip with a bright gold wire on its edge.
  const rimLip = new THREE.Mesh(torusGeo(PRABHA_R + 0.012, 0.03, 10, 60), m.plateBronze);
  rimLip.position.z = 0.002;
  prabha.add(rimLip);

  const rimWire = new THREE.Mesh(torusGeo(PRABHA_R + 0.032, 0.013, 8, 60), m.goldLit);
  rimWire.position.z = 0.002;
  prabha.add(rimWire);

  // Concentric engraving: ridges sunk into the face, alternating metals.
  for (const [r, tube, mat] of [
    [0.47, 0.018, m.plateBronze],
    [0.33, 0.014, m.goldLit],
    [0.2, 0.012, m.plateBronze],
  ] as const) {
    const ridge = new THREE.Mesh(torusGeo(r, tube, 8, 48), mat);
    ridge.position.z = domeZ(r);
    prabha.add(ridge);
  }

  // Lotus petals engraved radially across the mid band, alternating bright and
  // deep gold — real geometry, so every petal catches the light differently.
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const petal = new THREE.Mesh(sphereGeo(0.05), i % 2 === 0 ? m.goldLit : m.plateBronze);
    petal.scale.set(0.55, 1.5, 0.22);
    const r = 0.385;
    petal.position.set(Math.cos(a) * r, Math.sin(a) * r, domeZ(r) + 0.008);
    petal.rotation.z = a - Math.PI / 2;
    prabha.add(petal);
  }

  // Beaded rim: the temple-prabhavali edge, a ring of gold beads threaded on
  // the bright wire.
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    const bead = new THREE.Mesh(sphereGeo(0.023), i % 2 === 0 ? m.gold : m.goldLit);
    bead.position.set(
      Math.cos(a) * (PRABHA_R + 0.032),
      Math.sin(a) * (PRABHA_R + 0.032),
      0.012,
    );
    prabha.add(bead);
  }

  // Swastika medallion: the ancient mark of auspiciousness seated at the heart
  // of the plate, in place of the plain boss. A burnished bronze roundel
  // carries the glyph raised in bright gold. One arm is built — a straight
  // stroke from the hub ending in a clockwise hook — and rotated four times,
  // so the mark has perfect fourfold symmetry, with the four traditional
  // vermillion dots set in the quadrants.
  const swZ = domeZ(0.185) + 0.014;

  const swRoundel = new THREE.Mesh(cylGeo(0.185, 0.185, 0.05, 36), m.plateBronze);
  swRoundel.rotation.x = Math.PI / 2;
  swRoundel.position.z = swZ;
  prabha.add(swRoundel);

  const swBezel = new THREE.Mesh(torusGeo(0.185, 0.014, 8, 40), m.goldLit);
  swBezel.position.z = swZ;
  prabha.add(swBezel);

  const swastika = new THREE.Group();
  swastika.position.z = swZ + 0.035; // proud of the roundel's face
  prabha.add(swastika);

  const SW_ARM = 0.135; // hub centre to the arm tip
  const SW_HOOK = 0.068; // how far the hook reaches sideways
  const SW_R = 0.017; // stroke radius

  const swArm = new THREE.Group();
  // The main stroke, from just off the hub out along +y.
  const swBar = new THREE.Mesh(capsuleGeo(SW_R, 0.086), m.goldLit);
  swBar.position.y = 0.082;
  swArm.add(swBar);
  // The hook: a perpendicular stroke at the tip, turning clockwise (+x).
  const swHook = new THREE.Mesh(capsuleGeo(SW_R, SW_HOOK - SW_R), m.goldLit);
  swHook.rotation.z = Math.PI / 2;
  swHook.position.set(SW_HOOK / 2, SW_ARM, 0);
  swArm.add(swHook);

  // Four copies at exact 90° increments — perfect symmetry by construction.
  for (let i = 0; i < 4; i++) {
    const armCopy = swArm.clone();
    armCopy.rotation.z = (i / 4) * Math.PI * 2;
    swastika.add(armCopy);
  }

  // The hub the strokes grow from.
  const swHub = new THREE.Mesh(cylGeo(0.03, 0.03, 0.024, 20), m.goldLit);
  swHub.rotation.x = Math.PI / 2;
  swastika.add(swHub);

  // The four traditional dots, in the quadrants between the arms.
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i / 4) * Math.PI * 2;
    const dot = new THREE.Mesh(sphereGeo(0.019), m.vermillion);
    dot.position.set(Math.cos(a) * 0.108, Math.sin(a) * 0.108, 0);
    swastika.add(dot);
  }

  // Rays: solid tapered wedges fanned around the rim, alternating long and
  // short, flattened so they read as forged blades rather than paper planes.
  // They live in their own group so the controller can turn them — the light
  // behind him rotates.
  const prabhaSpin = new THREE.Group();
  prabha.add(prabhaSpin);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const len = i % 2 === 0 ? 0.22 : 0.13;
    const ray = new THREE.Mesh(coneGeo(0.028, len, 4), m.goldLit);
    ray.scale.z = 0.4;
    const r = PRABHA_R + 0.04 + len * 0.42;
    ray.position.set(Math.cos(a) * r, Math.sin(a) * r, 0.01);
    ray.rotation.z = a - Math.PI / 2;
    prabhaSpin.add(ray);
  }

  // Flame corona: a ring of small flames between the petal band and the rim.
  // It turns against the ray fan, so the light visibly churns as he runs.
  const prabhaCorona = new THREE.Group();
  prabha.add(prabhaCorona);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + 0.12;
    const flame = new THREE.Mesh(coneGeo(0.024, 0.1, 6), m.goldLit);
    flame.scale.z = 0.5;
    const r = 0.545;
    flame.position.set(Math.cos(a) * r, Math.sin(a) * r, domeZ(r) + 0.01);
    flame.rotation.z = a - Math.PI / 2;
    prabhaCorona.add(flame);
  }

  /* ---------------- arms ---------------- */

  const armL = arm(-1, m);
  const armR = arm(1, m);
  armL.shoulder.position.set(-0.31, 0.66, 0);
  armR.shoulder.position.set(0.31, 0.66, 0);
  torso.add(armL.shoulder, armR.shoulder);

  const upperL = upperArm(-1, m);
  const upperR = upperArm(1, m);
  upperL.shoulder.position.set(-0.37, 0.78, 0.06);
  upperR.shoulder.position.set(0.37, 0.78, 0.06);
  torso.add(upperL.shoulder, upperR.shoulder);

  // Broken tusk (Ekadanta's own, held in the right upper hand)
  const brokenTusk = tuskMesh(
    [
      new THREE.Vector3(0, -0.17, 0),
      new THREE.Vector3(0.015, -0.04, 0.012),
      new THREE.Vector3(0.032, 0.11, 0.035),
    ],
    0.05,
    m.ivory,
  );
  brokenTusk.rotation.set(-0.3, 0, -0.32);
  upperR.grip.add(brokenTusk);

  // A lotus offered in the left upper hand
  const lotus = buildLotus(m);
  lotus.position.y = 0.05;
  upperL.grip.add(lotus);

  /* ---------------- head ---------------- */

  const head = new THREE.Group();
  head.position.set(0, 0.78, 0.01);
  torso.add(head);

  const neck = new THREE.Mesh(cylGeo(0.12, 0.15, 0.16, 16), m.skin);
  neck.position.y = -0.05;
  head.add(neck);

  // Broad cranium: wide across the temples, domed on top.
  const skull = new THREE.Mesh(sphereGeo(0.285), m.skin);
  skull.position.set(0, 0.115, -0.005);
  skull.scale.set(1.12, 0.96, 1.04);
  head.add(skull);

  // Paired forehead bosses — the unmistakable elephant brow domes.
  for (const side of [-1, 1] as const) {
    const boss = new THREE.Mesh(sphereGeo(0.155), m.skin);
    boss.position.set(side * 0.115, 0.245, -0.12);
    boss.scale.set(1.0, 0.84, 1.06);
    head.add(boss);
  }

  // Brow ridge over the eyes, and the cheeks that carry the jaw.
  const brow = new THREE.Mesh(sphereGeo(0.09), m.skinLight);
  brow.position.set(0, 0.1, -0.275);
  brow.scale.set(2.0, 0.42, 0.45);
  head.add(brow);

  for (const side of [-1, 1] as const) {
    const cheek = new THREE.Mesh(sphereGeo(0.145), m.skin);
    cheek.position.set(side * 0.175, 0.015, -0.155);
    cheek.scale.set(1, 1.05, 0.95);
    head.add(cheek);
  }

  const muzzle = new THREE.Mesh(sphereGeo(0.12), m.skin);
  muzzle.position.set(0, -0.03, -0.235);
  muzzle.scale.set(1.3, 0.72, 0.62);
  head.add(muzzle);

  // Eyes, pushed clear of the skull surface so the gaze reads at a distance.
  for (const side of [-1, 1] as const) {
    const white = new THREE.Mesh(sphereGeo(0.057), m.eyeWhite);
    white.position.set(side * 0.155, 0.075, -0.245);
    white.scale.set(1.18, 0.84, 0.76);
    head.add(white);

    const pupil = new THREE.Mesh(sphereGeo(0.028), m.dark);
    pupil.position.set(side * 0.155, 0.075, -0.286);
    head.add(pupil);

    // Heavy upper lid, and the bag beneath it: small eyes, hooded, wide-set.
    const lid = new THREE.Mesh(sphereGeo(0.063), m.skin);
    lid.position.set(side * 0.155, 0.113, -0.238);
    lid.scale.set(1.3, 0.55, 0.95);
    head.add(lid);

    const lowerLid = new THREE.Mesh(sphereGeo(0.055), m.skinRim);
    lowerLid.position.set(side * 0.155, 0.037, -0.24);
    lowerLid.scale.set(1.2, 0.48, 0.9);
    head.add(lowerLid);

    const lash = new THREE.Mesh(boxGeo(0.1, 0.016, 0.02), m.dark);
    lash.position.set(side * 0.155, 0.098, -0.29);
    lash.rotation.z = side * 0.18;
    head.add(lash);
  }

  // Vermillion tilak between the brows, with a gold caste mark above it.
  const tilak = new THREE.Mesh(boxGeo(0.042, 0.16, 0.03), m.vermillion);
  tilak.position.set(0, 0.235, -0.3);
  tilak.rotation.x = -0.2;
  head.add(tilak);

  const casteMark = new THREE.Mesh(boxGeo(0.15, 0.022, 0.022), m.goldLit);
  casteMark.position.set(0, 0.315, -0.285);
  casteMark.rotation.x = -0.32;
  head.add(casteMark);

  /* ---------------- ears ---------------- */

  // Elephant ears are the character's signature: broad fans, nearly as wide
  // front-to-back as they are tall, with a thick rolled outer rim.
  const earGeoOuter = cached("earOuter", () => {
    const g = new THREE.SphereGeometry(0.37, 20, 16);
    g.scale(0.17, 1, 0.8);
    return g;
  });
  const earGeoInner = cached("earInner", () => {
    const g = new THREE.SphereGeometry(0.34, 18, 14);
    g.scale(0.13, 0.86, 0.66);
    return g;
  });
  const earGeoRim = cached("earRim", () => {
    const g = new THREE.TorusGeometry(0.33, 0.036, 8, 30);
    g.rotateY(Math.PI / 2);
    g.scale(1, 1, 0.82);
    return g;
  });

  function buildEar(side: -1 | 1): THREE.Group {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.3, 0.11, 0.02);
    pivot.rotation.set(0.06, side * -0.28, side * 0.16);

    const outer = new THREE.Mesh(earGeoOuter, m.skin);
    outer.position.set(side * 0.055, 0, 0);
    pivot.add(outer);

    const inner = new THREE.Mesh(earGeoInner, m.skinDeep);
    inner.position.set(side * 0.045, 0, -0.05);
    pivot.add(inner);

    const rim = new THREE.Mesh(earGeoRim, m.skinRim);
    rim.position.set(side * 0.085, 0, 0);
    pivot.add(rim);

    // Kundala: a gold hoop with a bead, hanging from the lobe.
    const hoop = new THREE.Mesh(torusGeo(0.062, 0.019), m.gold);
    hoop.position.set(side * 0.085, -0.33, 0.02);
    hoop.rotation.y = Math.PI / 2;
    pivot.add(hoop);

    const pear = new THREE.Mesh(sphereGeo(0.036), m.goldLit);
    pear.position.set(side * 0.085, -0.41, 0.02);
    pivot.add(pear);

    head.add(pivot);
    return pivot;
  }

  const earL = buildEar(-1);
  const earR = buildEar(1);

  /* ---------------- tusks ---------------- */

  // His left tusk is intact and curls forward; the right is snapped short.
  const tuskL = tuskMesh(
    [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(-0.03, -0.08, -0.05),
      new THREE.Vector3(-0.07, -0.18, -0.07),
      new THREE.Vector3(-0.1, -0.28, -0.03),
    ],
    0.045,
    m.ivory,
  );
  tuskL.position.set(-0.155, -0.015, -0.24);
  head.add(tuskL);

  const tuskR = tuskMesh(
    [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.012, -0.06, -0.035),
      new THREE.Vector3(0.025, -0.12, -0.04),
    ],
    0.045,
    m.ivory,
  );
  tuskR.position.set(0.155, -0.015, -0.24);
  head.add(tuskR);

  /* ---------------- trunk ---------------- */

  const TRUNK_REST_X = 0.06;
  const TRUNK_REST_Z = 0.16;

  const trunk = new THREE.Group();
  trunk.position.set(0, 0.02, -0.235);
  trunk.rotation.set(TRUNK_REST_X, 0, TRUNK_REST_Z);
  head.add(trunk);

  const trunkSegments: THREE.Group[] = [];
  let cursor: THREE.Group = trunk;
  for (let i = 0; i < TRUNK_RADII.length; i++) {
    const seg = new THREE.Group();
    if (i > 0) seg.position.y = -TRUNK_SEGMENT;
    seg.rotation.set(TRUNK_BENDS[i], 0, TRUNK_SIDE_BENDS[i]);
    cursor.add(seg);

    const joint = new THREE.Mesh(sphereGeo(TRUNK_RADII[i]), m.skin);
    seg.add(joint);

    // Tube to the next joint, so bends read as a smooth curve, not a hinge.
    if (i < TRUNK_RADII.length - 1) {
      const link = new THREE.Mesh(
        cylGeo(TRUNK_RADII[i]!, TRUNK_RADII[i + 1]!, TRUNK_SEGMENT, 16),
        m.skin,
      );
      link.position.y = -TRUNK_SEGMENT / 2;
      seg.add(link);
    }

    // Creases: shallow rings down the trunk read as wrinkles at arm's length.
    if (i < TRUNK_RADII.length - 1) {
      const crease = new THREE.Mesh(torusGeo(TRUNK_RADII[i]! + 0.006, 0.012), m.skinRim);
      crease.rotation.x = Math.PI / 2;
      crease.position.y = -TRUNK_SEGMENT * 0.62;
      seg.add(crease);
    }

    // Gold ring just below the tip
    if (i === TRUNK_RADII.length - 2) {
      const ring = new THREE.Mesh(torusGeo(TRUNK_RADII[i]! + 0.008, 0.015), m.gold);
      ring.rotation.x = Math.PI / 2;
      seg.add(ring);
    }

    trunkSegments.push(seg);
    cursor = seg;
  }

  // The modak in the curl of the trunk tip, with two small tendrils closed
  // around it — the pose he is named for.
  const modak = new THREE.Group();
  modak.position.y = -TRUNK_SEGMENT * 0.62;
  cursor.add(modak);

  const modakBody = new THREE.Mesh(sphereGeo(0.088), m.goldLit);
  modakBody.scale.set(1, 0.85, 1);
  modak.add(modakBody);

  const modakTip = new THREE.Mesh(coneGeo(0.032, 0.075, 10), m.goldLit);
  modakTip.position.y = 0.1;
  modak.add(modakTip);

  // Pleated ridge around the modak's shoulders, so it reads as a steamed
  // sweet and not a plain bead.
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const pleat = new THREE.Mesh(sphereGeo(0.026), m.gold);
    pleat.position.set(Math.cos(a) * 0.072, 0.012, Math.sin(a) * 0.072);
    pleat.scale.set(1, 1.5, 0.7);
    pleat.rotation.y = -a;
    modak.add(pleat);
  }

  for (const side of [-1, 1] as const) {
    const tendril = new THREE.Mesh(capsuleGeo(0.024, 0.075), m.skin);
    tendril.position.set(side * 0.075, 0.03, -0.03);
    tendril.rotation.set(0.5, 0, side * 0.55);
    modak.add(tendril);
  }

  /* ---------------- mukut (crown) ---------------- */

  const crown = new THREE.Group();
  crown.position.set(0, 0.3, -0.02);
  head.add(crown);

  const crownRim = new THREE.Mesh(torusGeo(0.245, 0.038), m.gold);
  crownRim.rotation.x = Math.PI / 2;
  crown.add(crownRim);

  // Lotus petal band around the rim
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const petal = new THREE.Mesh(coneGeo(0.045, 0.1, 8), m.gold);
    petal.position.set(Math.sin(a) * 0.235, 0.045, Math.cos(a) * 0.235);
    petal.rotation.set(Math.cos(a) * 0.28, -a, -Math.sin(a) * 0.28);
    crown.add(petal);
  }

  const tier1 = new THREE.Mesh(cylGeo(0.185, 0.245, 0.11, 20), m.gold);
  tier1.position.y = 0.075;
  crown.add(tier1);
  const tier2 = new THREE.Mesh(cylGeo(0.125, 0.185, 0.1, 20), m.gold);
  tier2.position.y = 0.175;
  crown.add(tier2);
  const dome = new THREE.Mesh(sphereGeo(0.125), m.gold);
  dome.position.y = 0.245;
  dome.scale.set(1, 0.8, 1);
  crown.add(dome);
  const finial = new THREE.Mesh(coneGeo(0.048, 0.1, 10), m.goldLit);
  finial.position.y = 0.305;
  crown.add(finial);

  // Chandra: the crescent moon on his crest, with a jewel set inside it.
  const crescent = new THREE.Mesh(
    new THREE.TorusGeometry(0.082, 0.02, 8, 26, Math.PI * 1.15),
    m.goldLit,
  );
  crescent.position.set(0, 0.4, -0.02);
  crescent.rotation.z = Math.PI * 0.42;
  crown.add(crescent);

  const moonJewel = new THREE.Mesh(sphereGeo(0.026), m.vermillion);
  moonJewel.position.set(0, 0.4, -0.02);
  crown.add(moonJewel);

  // Jewels set into the crown band
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const jewel = new THREE.Mesh(sphereGeo(0.028), i % 2 === 0 ? m.vermillion : m.jade);
    jewel.position.set(Math.sin(a) * 0.25, 0.005, Math.cos(a) * 0.25);
    crown.add(jewel);
  }

  /* ---------------- prabhavali (halo) ---------------- */

  const halo = new THREE.Group();
  halo.position.set(0, 0.16, 0.3);
  head.add(halo);

  const haloDisc = new THREE.Mesh(circleGeo(0.44), m.halo);
  halo.add(haloDisc);

  const haloRim = new THREE.Mesh(torusGeo(0.45, 0.022), m.gold);
  halo.add(haloRim);

  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    const bead = new THREE.Mesh(sphereGeo(0.024), m.goldLit);
    bead.position.set(Math.cos(a) * 0.45, Math.sin(a) * 0.45, 0);
    halo.add(bead);
  }

  // Flame petals flicking off the rim, so the halo is never a flat disc.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.26;
    const flame = new THREE.Mesh(coneGeo(0.03, 0.11, 6), m.halo);
    flame.position.set(Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0);
    flame.rotation.z = a - Math.PI / 2;
    halo.add(flame);
  }

  /* ---------------- finalise ---------------- */

  // The dusk key light casts the runner's shadow across the road — without
  // this the character floats above the asphalt.
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = obj.material !== m.halo;
    }
  });

  // The halo and the back plate are light, not objects: they never cut a
  // shadow, or the runner would drag a dark ring around with him.
  for (const group of [halo, prabha]) {
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) obj.castShadow = false;
    });
  }

  return {
    root,
    hips,
    torso,
    head,
    trunk,
    trunkSegments,
    trunkBends: [...TRUNK_BENDS],
    trunkSideBends: [...TRUNK_SIDE_BENDS],
    trunkRestX: TRUNK_REST_X,
    trunkRestZ: TRUNK_REST_Z,
    modak,
    earL,
    earR,
    crown,
    halo,
    prabha,
    prabhaSpin,
    prabhaCorona,
    plateGlow: m.plateGold,
    leftArm: armL.shoulder,
    rightArm: armR.shoulder,
    leftElbow: armL.elbow,
    rightElbow: armR.elbow,
    leftUpperArm: upperL.shoulder,
    rightUpperArm: upperR.shoulder,
    leftLeg: left.hip,
    rightLeg: right.hip,
    leftKnee: left.knee,
    rightKnee: right.knee,
    dhoti,
  };
}
