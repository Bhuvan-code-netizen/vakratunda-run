import * as THREE from "three";
import {
  CAMERA_DAMP,
  CAMERA_FOV,
  CAMERA_FOV_DAMP,
  INTRO_CAM_DEPTH,
  INTRO_CAM_HEIGHT,
  INTRO_CAM_SIDE,
  INTRO_DURATION,
} from "../constants";

/** Gameplay camera offset behind and above the runner. */
const CAM_HEIGHT = 5.2;
const CAM_DISTANCE = 8.5;
/** Height the camera looks at when it has a clear road ahead. */
const LOOK_HEIGHT = 1.6;

/**
 * The gameplay camera.
 *
 * It follows the runner with critically-damped smoothing and shifts subtly with
 * lane changes, rising a fraction of any jump height. Lane and jump moves are
 * telegraphed to the player but never fight the controls.
 *
 * Starting a run hands the rig a short cinematic introduction: a low
 * three-quarter hero shot of the runner that swings up and around behind him
 * before the gameplay pose takes over, so the first frames of a run read as a
 * title shot rather than a jump cut.
 */
export class CameraRig {
  private camera: THREE.PerspectiveCamera;

  private laneX = 0;
  private lead = 0;
  private followY = 0;
  private lookX = 0;
  private lookY = LOOK_HEIGHT;
  private fov: number;

  private introElapsed = INTRO_DURATION;
  private introActive = false;
  /** Positional settle used for hard landings and crashes. */
  private kick = 0;

  private readonly pos = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly playPos = new THREE.Vector3(0, CAM_HEIGHT, CAM_DISTANCE);
  private readonly playLook = new THREE.Vector3(0, LOOK_HEIGHT, -10);
  private readonly heroPos = new THREE.Vector3();
  private readonly heroLook = new THREE.Vector3();

  constructor(camera: THREE.PerspectiveCamera, fov = CAMERA_FOV) {
    this.camera = camera;
    this.fov = fov;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
    this.camera.position.set(0, CAM_HEIGHT, CAM_DISTANCE);
    this.camera.lookAt(0, LOOK_HEIGHT, -10);
  }

  /** Take the camera to the opening hero shot. */
  beginIntro() {
    this.introElapsed = 0;
    this.introActive = true;
  }

  /** Cut straight to the gameplay pose — used when the player skips ahead. */
  finishIntro() {
    this.introElapsed = INTRO_DURATION;
    this.introActive = false;
  }

  /** 0 while the hero shot plays, 1 once the gameplay camera has taken over. */
  get introProgress(): number {
    if (!this.introActive) return 1;
    return Math.min(1, this.introElapsed / INTRO_DURATION);
  }

  get isIntro(): boolean {
    return this.introActive;
  }

  /** A short positional dip-and-settle, used on hard landings and crashes. */
  impulse(strength: number) {
    this.kick = Math.min(1.1, this.kick + strength);
  }

  update(dt: number, playerX: number, playerY: number, fovTarget: number) {
    const k = 1 - Math.exp(-CAMERA_DAMP * dt);

    // --- Gameplay pose: damped follow, lane lead-in, jump rise ---
    this.laneX += (playerX * 0.35 - this.laneX) * k;
    this.followY += (playerY * 0.45 - this.followY) * k;
    this.lead += (playerX * 0.12 - this.lead) * k;
    this.lookX += (playerX * 0.5 - this.lookX) * k;
    this.lookY += (LOOK_HEIGHT + this.followY * 0.5 - this.lookY) * k;

    this.playPos.set(this.laneX, CAM_HEIGHT + this.followY, CAM_DISTANCE);
    this.playLook.set(this.lead * 2 + this.lookX, this.lookY, -10);

    if (this.introActive) {
      // --- Hero shot: swing the rig around the runner ---
      this.introElapsed += dt;
      const t = this.introProgress;
      if (t >= 1) this.introActive = false;
      const e = smootherstep(t);

      // Bow the path outward so the camera arcs around him instead of cutting
      // straight through the model.
      const bulge = Math.sin(Math.PI * e) * 1.15;
      this.heroPos.set(
        playerX + INTRO_CAM_SIDE * (1 - e) + bulge,
        INTRO_CAM_HEIGHT + e * (CAM_HEIGHT - INTRO_CAM_HEIGHT),
        -INTRO_CAM_DEPTH + e * (CAM_DISTANCE + INTRO_CAM_DEPTH),
      );
      this.heroLook.set(playerX * (1 - e), 1.05 + e * 0.55, -e * 6);

      this.pos.lerpVectors(this.heroPos, this.playPos, e);
      this.look.lerpVectors(this.heroLook, this.playLook, e);
    } else {
      this.pos.copy(this.playPos);
      this.look.copy(this.playLook);
    }

    this.camera.position.copy(this.pos);

    // --- Impact settle ---
    if (this.kick > 0.001) {
      this.kick *= Math.exp(-7 * dt);
      this.camera.position.y -= this.kick * 0.5;
      this.camera.position.z -= this.kick * 1.2;
      this.look.y -= this.kick * 0.3;
    } else {
      this.kick = 0;
    }

    this.camera.lookAt(this.look);

    // --- Field of view eases toward the state's target ---
    this.fov += (fovTarget - this.fov) * (1 - Math.exp(-CAMERA_FOV_DAMP * dt));
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }
}

/** Quintic ease with zero first and second derivatives at both ends. */
function smootherstep(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}
