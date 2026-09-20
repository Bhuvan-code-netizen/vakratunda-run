/**
 * Device profiling for the run.
 *
 * Everything here is deliberately defensive: a browser may lack `matchMedia`,
 * may report a coarse pointer on a touchscreen laptop, or may hide its core
 * count. Nothing in this file gates gameplay — it only ever *lowers* cost — so
 * a wrong answer gives a slightly softer picture instead of a broken game.
 *
 * `profileForDevice` takes optional overrides purely so the headless smoke
 * tests can pin a device instead of inheriting whatever Node reports.
 */

export type HardwareBudget = "low" | "medium" | "high";

export interface DeviceProfile {
  /** A touch-first device: coarse pointer, or touch events, or multi-touch. */
  touch: boolean;
  /** A modest GPU/CPU budget: the cheapest rendering tier. */
  lowPower: boolean;
  /** Hard cap applied to devicePixelRatio — the single biggest mobile win. */
  maxPixelRatio: number;
  /** Directional shadow map edge, in texels. */
  shadowMapSize: number;
  /** Weather droplet capacity. */
  rainCapacity: number;
  /** The visitor asked the system for less motion. */
  reducedMotion: boolean;
}

export interface DeviceOverrides {
  touch?: boolean;
  budget?: HardwareBudget;
  reducedMotion?: boolean;
}

function safeMatch(query: string): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia(query).matches;
  } catch {
    return false;
  }
}

/** True on phones and tablets — i.e. where swipes and on-screen pads are needed. */
export function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  if (safeMatch("(pointer: coarse)")) return true;
  // Older Safari reports a fine pointer until a touch has happened, so
  // "can it touch at all?" is the fallback signal.
  if ("ontouchstart" in window) return true;
  return typeof navigator !== "undefined" && (navigator.maxTouchPoints ?? 0) > 1;
}

/** True when the visitor prefers reduced motion. */
export function prefersReducedMotion(): boolean {
  return safeMatch("(prefers-reduced-motion: reduce)");
}

/** How much hardware the browser admits to having. */
export function hardwareBudget(): HardwareBudget {
  if (typeof navigator === "undefined") return "high";
  const cores = navigator.hardwareConcurrency ?? 0;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 0;
  if ((cores > 0 && cores <= 4) || (memory > 0 && memory <= 4)) return "low";
  if (cores >= 8) return "high";
  return "medium";
}

/**
 * The rendering budget for this device.
 *
 * A phone at devicePixelRatio 3 would otherwise render nine times the pixels
 * of the same frame at 1 — by far the most expensive mistake an endless
 * runner can make in a mobile browser — so touch devices get a bounded ratio
 * and a smaller shadow map. Desktops keep the full-quality picture.
 */
export function profileForDevice(overrides: DeviceOverrides = {}): DeviceProfile {
  const touch = overrides.touch ?? isTouchDevice();
  const budget = overrides.budget ?? hardwareBudget();
  const reducedMotion = overrides.reducedMotion ?? prefersReducedMotion();
  const lowPower = budget === "low";

  if (touch) {
    return {
      touch,
      lowPower,
      maxPixelRatio: lowPower ? 1.25 : 1.5,
      shadowMapSize: 1024,
      rainCapacity: lowPower ? 380 : 520,
      reducedMotion,
    };
  }
  if (lowPower) {
    return {
      touch,
      lowPower,
      maxPixelRatio: 1.5,
      shadowMapSize: 1024,
      rainCapacity: 520,
      reducedMotion,
    };
  }
  return {
    touch,
    lowPower,
    maxPixelRatio: 2,
    shadowMapSize: 2048,
    rainCapacity: 900,
    reducedMotion,
  };
}
