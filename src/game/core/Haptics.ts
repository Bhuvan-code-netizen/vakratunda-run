/**
 * Haptic feedback, best effort.
 *
 * `navigator.vibrate` is unsupported on iOS Safari and is blocked in some
 * contexts, so every call is guarded and the game never depends on it. The
 * patterns are short on purpose: a phone held in two hands should feel a
 * *tap* of feedback, not a buzz.
 */

let enabled = true;

/** Turn the motor off entirely (the game follows the sound setting). */
export function setHapticsEnabled(on: boolean) {
  enabled = on;
}

/** Fire a vibration pattern, if this browser has one. */
export function haptic(pattern: number | number[]) {
  if (!enabled || typeof navigator === "undefined") return;
  if (typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* A hostile or partially implemented vibrate() must never break a frame. */
  }
}

/** A lane change: one crisp tick. */
export function hapticLane() {
  haptic(8);
}

/** A jump: a smaller, lighter tap. */
export function hapticJump() {
  haptic(6);
}

/** A crash: a short double thud. */
export function hapticCrash() {
  haptic([26, 40, 34]);
}

/** A divine power or a milestone: a bright little flourish. */
export function hapticPower() {
  haptic([10, 30, 16]);
}
