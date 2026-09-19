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
  /** The flame

[FILE_TOO_LARGE]: The combined read_files output exceeded the 100,000 character hard limit. This file was truncated after 2,570 characters. Read it separately or use code_search for the relevant section.