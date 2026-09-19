import * as THREE from "three";

/**
 * Procedurally generated canvas textures. Created once (module-level memo) and
 * shared across every mesh that needs them — keeps memory and draw setup low.
 */

function makeCanvas(w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  return { canvas, ctx };
}

function toTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

let roadTex: THREE.CanvasTexture | null = null;

/** Asphalt with dashed lane dividers + edge lines. Tiles every ~5 m along Z. */
export function getRoadTexture(): THREE.CanvasTexture {
  if (roadTex) return roadTex;
  const { canvas, ctx } = makeCanvas(256, 512);

  // Asphalt base
  ctx.fillStyle = "#26262b";
  ctx.fillRect(0, 0, 256, 512);

  // Noise speckle for asphalt grain
  for (let i = 0; i < 1100; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 512;
    const light = Math.random() > 0.5;
    ctx.fillStyle = light ? "rgba(255,255,255,0.045)" : "rgba(0,0,0,0.07)";
    ctx.fillRect(x, y, 1.6, 1.6);
  }

  // Dashed lane dividers at the actual lane boundaries (LANES = -2.4 / 0 / 2.4)
  ctx.fillStyle = "rgba(232,222,200,0.85)";
  for (const x of [91, 165]) {
    for (let y = 0; y < 512; y += 64) {
      ctx.fillRect(x - 3, y, 6, 38);
    }
  }

  // Solid warm edge lines
  ctx.fillStyle = "rgba(240,228,205,0.5)";
  ctx.fillRect(6, 0, 4, 512);
  ctx.fillRect(246, 0, 4, 512);

  roadTex = toTexture(canvas);
  roadTex.repeat.set(1, 6);
  return roadTex;
}

let facadeMap: THREE.CanvasTexture | null = null;
let facadeEmissive: THREE.CanvasTexture | null = null;

/** Building facade (albedo + emissive lit windows) for festival evening. */
export function getFacadeTextures(): {
  map: THREE.CanvasTexture;
  emissive: THREE.CanvasTexture;
} {
  if (facadeMap && facadeEmissive) return { map: facadeMap, emissive: facadeEmissive };
  const { canvas, ctx } = makeCanvas(256, 256);
  const { canvas: eCanvas, ctx: eCtx } = makeCanvas(256, 256);

  ctx.fillStyle = "#1d1a23";
  ctx.fillRect(0, 0, 256, 256);
  eCtx.fillStyle = "#000000";
  eCtx.fillRect(0, 0, 256, 256);

  // Window grid: 8 cols x 10 rows
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 8; col++) {
      const x = 12 + col * 30;
      const y = 10 + row * 25;
      const lit = Math.random() < 0.32;
      ctx.fillStyle = lit ? "#3d3020" : "#0c0b12";
      ctx.fillRect(x, y, 20, 15);
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.strokeRect(x, y, 20, 15);
      if (lit) {
        eCtx.fillStyle = Math.random() < 0.7 ? "#ffb45e" : "#ff9a4a";
        eCtx.fillRect(x, y, 20, 15);
      }
    }
  }

  facadeMap = toTexture(canvas);
  facadeEmissive = toTexture(eCanvas);
  return { map: facadeMap, emissive: facadeEmissive };
}

let toranTex: THREE.CanvasTexture | null = null;

/** Toran banner: green band, marigold circles, hanging pennants. Transparent bg. */
export function getToranTexture(): THREE.CanvasTexture {
  if (toranTex) return toranTex;
  const { canvas, ctx } = makeCanvas(512, 128);

  ctx.clearRect(0, 0, 512, 128);

  // Green band
  ctx.fillStyle = "#2f6b3a";
  ctx.fillRect(0, 0, 512, 16);

  // Marigold garland circles
  for (let x = 14; x < 512; x += 26) {
    ctx.fillStyle = Math.random() < 0.5 ? "#f5a623" : "#ffd24a";
    ctx.beginPath();
    ctx.arc(x, 28, 10, 0, Math.PI * 2);
    ctx.fill();
  }

  // Hanging pennants
  for (let x = 26; x < 512; x += 62) {
    ctx.fillStyle = Math.random() < 0.5 ? "#d94f30" : "#f0c040";
    ctx.beginPath();
    ctx.moveTo(x - 16, 38);
    ctx.lineTo(x + 16, 38);
    ctx.lineTo(x, 96);
    ctx.closePath();
    ctx.fill();
  }

  toranTex = toTexture(canvas);
  return toranTex;
}

let particleTex: THREE.CanvasTexture | null = null;

/** Soft round sprite for the movement particle systems (hot core, soft edge). */
export function getParticleTexture(): THREE.CanvasTexture {
  if (particleTex) return particleTex;
  const { canvas, ctx } = makeCanvas(64, 64);

  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.35, "rgba(255,244,220,0.72)");
  grad.addColorStop(0.7, "rgba(255,236,200,0.22)");
  grad.addColorStop(1, "rgba(255,232,190,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);

  particleTex = new THREE.CanvasTexture(canvas);
  particleTex.colorSpace = THREE.SRGBColorSpace;
  return particleTex;
}

let stripeTex: THREE.CanvasTexture | null = null;

/** Barricade hazard stripes (white / festival orange). */
export function getStripeTexture(): THREE.CanvasTexture {
  if (stripeTex) return stripeTex;
  const { canvas, ctx } = makeCanvas(128, 32);
  for (let x = 0; x < 128; x += 32) {
    ctx.fillStyle = "#e8e2d6";
    ctx.fillRect(x, 0, 16, 32);
    ctx.fillStyle = "#d4622a";
    ctx.fillRect(x + 16, 0, 16, 32);
  }
  stripeTex = toTexture(canvas);
  return stripeTex;
}
