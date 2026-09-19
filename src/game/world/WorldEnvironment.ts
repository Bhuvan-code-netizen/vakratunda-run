import * as THREE from "three";
import { COLORS } from "../constants";

/** Clear-air fog distances, and the dense festival haze of the opening shot. */
const FOG_NEAR = 45;
const FOG_FAR = 160;
const HAZE_NEAR = 14;
const HAZE_FAR = 62;

/**
 * How the run looks right now. Every field is 0…1 and is normally derived from
 * distance by the helpers in `constants.ts` (`nightForDistance`,
 * `weatherAtDistance`), so the city changes continuously as the runner travels:
 * the sunset sinks into night, and the air cycles from still to downpour.
 */
export interface Climate {
  /** 0 = the first sunset frame, 1 = deep night. */
  night: number;
  /** 0 = clear air, 1 = dense festival haze. */
  mist: number;
  /** 0 = dry, 1 = monsoon downpour. */
  rain: number;
  /** Extra haze for the cinematic opening; fades out as control is handed over. */
  haze?: number;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Static environment: gradient sky dome, lighting rig with soft shadows, fog,
 * and a large dark ground plane. Built once; never recycled.
 *
 * When a renderer is supplied we also pre-filter a small procedural dusk
 * gradient into an environment map. Without image-based lighting the gold,
 * ivory and skin materials read as flat plastic; with it they pick up the warm
 * horizon on one side and the cool zenith on the other.
 *
 * `update` drives the time of day and the weather: sky gradient, background,
 * fog, key light, hemisphere fill and the strength of the image-based lighting
 * are all cross-faded toward the current night and rain values.
 */
export class WorldEnvironment {
  readonly sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private ambient: THREE.AmbientLight;
  private scene: THREE.Scene;
  private fog: THREE.Fog;
  private skyUniforms: {
    topColor: { value: THREE.Color };
    midColor: { value: THREE.Color };
    bottomColor: { value: THREE.Color };
    offset: { value: number };
    exponent: { value: number };
  };
  private groundMaterial: THREE.MeshStandardMaterial;
  private envTexture: THREE.Texture | null = null;

  // Palette endpoints, allocated once so the per-frame cross-fade never
  // allocates a colour.
  private readonly c = {
    skyTop: new THREE.Color(COLORS.skyTop),
    skyMid: new THREE.Color(COLORS.skyMid),
    skyHorizon: new THREE.Color(COLORS.skyHorizon),
    nightTop: new THREE.Color(COLORS.nightTop),
    nightMid: new THREE.Color(COLORS.nightMid),
    nightHorizon: new THREE.Color(COLORS.nightHorizon),
    fogDusk: new THREE.Color(COLORS.fog),
    fogNight: new THREE.Color(COLORS.nightFog),
    fogRain: new THREE.Color(COLORS.rainFog),
    sunDusk: new THREE.Color(COLORS.sunLight),
    sunNight: new THREE.Color(COLORS.nightSun),
    hemiSky: new THREE.Color(COLORS.hemiSky),
    hemiGround: new THREE.Color(COLORS.hemiGround),
    work: new THREE.Color(),
    work2: new THREE.Color(),
  };

  constructor(scene: THREE.Scene, renderer?: THREE.WebGLRenderer) {
    this.scene = scene;
    scene.background = new THREE.Color(COLORS.fog);
    this.fog = new THREE.Fog(COLORS.fog, FOG_NEAR, FOG_FAR);
    scene.fog = this.fog;

    if (renderer) {
      this.envTexture = buildDuskEnvironment(renderer);
      scene.environment = this.envTexture;
      scene.environmentIntensity = 0.55;
    }

    // Gradient sky dome (BackSide sphere with a vertex-colored shader)
    const skyGeo = new THREE.SphereGeometry(400, 24, 16);
    this.skyUniforms = {
      topColor: { value: new THREE.Color(COLORS.skyTop) },
      midColor: { value: new THREE.Color(COLORS.skyMid) },
      bottomColor: { value: new THREE.Color(COLORS.skyHorizon) },
      offset: { value: 30 },
      exponent: { value: 0.9 },
    };
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: this.skyUniforms,
      vertexShader: /* glsl */ `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 topColor;
        uniform vec3 midColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
          vec3 c = mix(bottomColor, midColor, smoothstep(0.0, 0.18, h));
          c = mix(c, topColor, smoothstep(0.18, 0.65, h));
          gl_FragColor = vec4(c, 1.0);
        }
      `,
    });
    scene.add(new THREE.Mesh(skyGeo, skyMat));

    // Lighting: warm sun low on the horizon + hemi fill + faint ambient
    this.hemi = new THREE.HemisphereLight(COLORS.hemiSky, COLORS.hemiGround, 0.85);
    scene.add(this.hemi);

    const sun = new THREE.DirectionalLight(COLORS.sunLight, 1.6);
    sun.position.set(-18, 14, -8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 90;
    sun.shadow.camera.left = -16;
    sun.shadow.camera.right = 16;
    sun.shadow.camera.top = 24;
    sun.shadow.camera.bottom = -60;
    sun.shadow.bias = -0.0004;
    scene.add(sun);
    scene.add(sun.target);
    this.sun = sun;

    this.ambient = new THREE.AmbientLight(0x2a1e2e, 0.7);
    scene.add(this.ambient);

    // Ground plane well below/around the road
    this.groundMaterial = new THREE.MeshStandardMaterial({ color: COLORS.ground, roughness: 1 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(300, 600), this.groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    scene.add(ground);
  }

  /**
   * Keep the shadow frustum tracking the player zone and cross-fade the whole
   * scene toward the given time of day and weather.
   */
  update(playerZ: number, climate: Climate) {
    this.sun.position.set(-18, 14, playerZ - 10);
    this.sun.target.position.set(0, 0, playerZ);
    this.sun.target.updateMatrixWorld();

    const { c } = this;
    const night = clamp01(climate.night);
    const rain = clamp01(climate.rain);
    // The opening haze counts as mist while it lasts.
    const mist = clamp01(climate.mist + (climate.haze ?? 0) * 0.85);
    const wet = rain * 0.55;

    // --- Sky and air ---
    c.work.copy(c.skyTop).lerp(c.nightTop, night);
    this.skyUniforms.topColor.value.copy(c.work);
    c.work.copy(c.skyMid).lerp(c.nightMid, night);
    this.skyUniforms.midColor.value.copy(c.work);
    c.work.copy(c.skyHorizon).lerp(c.nightHorizon, night);
    this.skyUniforms.bottomColor.value.copy(c.work);

    c.work.copy(c.fogDusk).lerp(c.fogNight, night).lerp(c.fogRain, wet);
    this.fog.color.copy(c.work);
    (this.scene.background as THREE.Color).copy(c.work);

    // Haze and rain both close the world in, by different amounts.
    const near = (FOG_NEAR + (HAZE_NEAR - FOG_NEAR) * mist) * (1 - 0.45 * rain);
    const far = (FOG_FAR + (HAZE_FAR - FOG_FAR) * mist) * (1 - 0.3 * rain);
    this.fog.near = Math.max(6, near);
    this.fog.far = Math.max(24, far);

    // --- Light ---
    c.work.copy(c.sunDusk).lerp(c.sunNight, night);
    this.sun.color.copy(c.work);
    this.sun.intensity = 1.6 * (1 - 0.5 * night) * (1 - 0.28 * rain);

    c.work.copy(c.hemiSky).lerp(c.nightMid, night);
    c.work2.copy(c.hemiGround).lerp(c.nightTop, night);
    this.hemi.color.copy(c.work);
    this.hemi.groundColor.copy(c.work2);
    this.hemi.intensity = 0.85 * (1 - 0.22 * night) * (1 - 0.12 * rain);

    this.ambient.color.setHex(0x2a1e2e).lerp(c.nightMid, night);
    this.ambient.intensity = 0.7 + 0.3 * night;

    // Wet asphalt mirrors the street lamps; dry asphalt stays matte. The
    // ground plane does the same, so the rain reads even at the horizon.
    this.groundMaterial.roughness = 1 - rain * 0.5;
    this.groundMaterial.metalness = rain * 0.25;

    this.scene.environmentIntensity = 0.55 - 0.22 * night;
  }

  dispose() {
    this.envTexture?.dispose();
    this.envTexture = null;
  }
}

/** Pre-filtered dusk sky, used as the scene's image-based lighting. */
function buildDuskEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 32;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createLinearGradient(0, 0, 0, 32);
    gradient.addColorStop(0, "#2b1e3d"); // zenith: night violet
    gradient.addColorStop(0.42, "#6b2f33");
    gradient.addColorStop(0.6, "#c9703c"); // warm horizon glow
    gradient.addColorStop(0.72, "#8a3f26");
    gradient.addColorStop(1, "#1a1218"); // ground bounce
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 32);

    // A brighter patch where the sun sits, so speculars have a source.
    const sunSpot = ctx.createRadialGradient(14, 19, 0, 14, 19, 20);
    sunSpot.addColorStop(0, "rgba(255,196,130,0.95)");
    sunSpot.addColorStop(1, "rgba(255,196,130,0)");
    ctx.fillStyle = sunSpot;
    ctx.fillRect(0, 0, 64, 32);
  }

  const source = new THREE.CanvasTexture(canvas);
  source.mapping = THREE.EquirectangularReflectionMapping;
  source.colorSpace = THREE.SRGBColorSpace;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(source).texture;
  pmrem.dispose();
  source.dispose();
  return env;
}
