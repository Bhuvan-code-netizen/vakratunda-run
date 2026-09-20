/**
 * Modular input system. Translates raw keyboard / pointer / touch events into
 * semantic game actions. New sources (gamepad, on-screen pads, mobile swipes)
 * plug in by calling `emit` — gameplay never touches DOM events directly.
 *
 * Why pointer events rather than touch events:
 *  - One path serves thumb, stylus and mouse, so desktop testing exercises the
 *    same code the phone will run.
 *  - A cancelled gesture (a call arriving, the app going to the background)
 *    arrives as `pointercancel` and is discarded instead of firing late.
 *
 * The gesture maths lives in the exported pure `resolveGesture` / 
 * `gestureThresholds` pair so it can be unit-tested headlessly, and so the
 * thresholds can scale with the viewport: 28 px is a deliberate swipe on a
 * phone and an accident on a desktop monitor.
 */

export type InputAction =
  | "left"
  | "right"
  | "jump"
  | "restart"
  | "pause"
  | "audio"
  | "debug";

type ActionListener = (action: InputAction) => void;

const KEY_MAP: Record<string, InputAction> = {
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
  ArrowUp: "jump",
  KeyW: "jump",
  Space: "jump",
  KeyR: "restart",
  KeyP: "pause",
  Escape: "pause",
  KeyM: "audio",
  Backquote: "debug",
};

const PREVENT_DEFAULT_CODES = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Space",
]);

/** Elements that own their own taps: a swipe must never start on one. */
const INTERACTIVE_SELECTOR =
  "button, a, input, select, textarea, label, [role='button'], [data-gesture-ignore]";

/** How long a press may last and still count as a tap, in milliseconds. */
export const TAP_MAX_MS = 350;

/** Smallest and largest swipe distance (px) the resolver will ever use. */
export const SWIPE_MIN = 22;
export const SWIPE_MAX = 72;

/**
 * Swipe distance for a viewport. Scaled off the shorter edge so a landscape
 * phone and a portrait phone need the same *feel* of travel, then clamped so
 * it is never so small that a shaky thumb triggers it.
 */
export function gestureThresholds(width: number, height: number) {
  const shortEdge = Math.min(
    width > 0 ? width : 390,
    height > 0 ? height : 780,
  );
  return {
    swipe: Math.min(SWIPE_MAX, Math.max(SWIPE_MIN, shortEdge * 0.09)),
    tapMs: TAP_MAX_MS,
  };
}

/**
 * Turn one finished pointer gesture into an action. Pure: same input, same
 * answer, no DOM. Returns null for a gesture that means nothing (a drag that
 * is neither far enough nor fast enough, or a horizontal slide too small to
 * count as a lane change).
 */
export function resolveGesture(
  dx: number,
  dy: number,
  dtMs: number,
  swipe: number,
  tapMs: number = TAP_MAX_MS,
): InputAction | null {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);

  // Horizontal travel wins when it is both far enough and dominant, so a
  // hurried diagonal still changes lane instead of jumping.
  if (ax >= swipe && ax > ay) return dx > 0 ? "right" : "left";
  // Upward flick jumps. A downward flick is deliberately inert.
  if (dy <= -swipe && ay >= ax) return "jump";
  // A short press in place is a tap: jump (and start / restart elsewhere).
  if (ax < swipe && ay < swipe && dtMs <= tapMs) return "jump";
  return null;
}

/** True when a gesture starting on this target belongs to the UI, not the run. */
export function isInteractiveTarget(target: EventTarget | null): boolean {
  if (typeof Element === "undefined") return false;
  if (!(target instanceof Element)) return false;
  return target.closest(INTERACTIVE_SELECTOR) !== null;
}

export class InputController {
  private listeners = new Set<ActionListener>();
  private root: HTMLElement | null = null;
  /** The one in-flight gesture. Extra fingers are ignored on purpose. */
  private gesture: { id: number; x: number; y: number; t: number } | null = null;

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    // Never steal keys from a real form field (the game has none today, but
    // the auth and dashboard routes share this bundle).
    const target = e.target as HTMLElement | null;
    const tag = target?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
    if (PREVENT_DEFAULT_CODES.has(e.code)) e.preventDefault();
    const action = KEY_MAP[e.code];
    if (action) this.emit(action);
  };

  private handlePointerDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (this.gesture) return;
    if (isInteractiveTarget(e.target)) return;
    this.gesture = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      t: typeof performance !== "undefined" ? performance.now() : Date.now(),
    };
  };

  private handlePointerUp = (e: PointerEvent) => {
    const gesture = this.gesture;
    if (!gesture || e.pointerId !== gesture.id) return;
    this.gesture = null;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const { swipe, tapMs } = gestureThresholds(window.innerWidth, window.innerHeight);
    const action = resolveGesture(
      e.clientX - gesture.x,
      e.clientY - gesture.y,
      now - gesture.t,
      swipe,
      tapMs,
    );
    if (action) this.emit(action);
  };

  private handlePointerCancel = () => {
    this.gesture = null;
  };

  /**
   * Begin listening. `gestureSurface` receives swipes and taps; pass the game
   * container so gestures also land on the intro letterbox and the ready
   * screen, not only on the canvas. Gestures that begin on a button are
   * ignored, so the on-screen pads never double-fire.
   */
  attach(gestureSurface?: HTMLElement | null) {
    if (typeof window === "undefined") return;
    window.addEventListener("keydown", this.handleKeyDown, { passive: false });
    this.root = gestureSurface ?? null;
    if (this.root) {
      this.root.addEventListener("pointerdown", this.handlePointerDown);
    } else {
      window.addEventListener("pointerdown", this.handlePointerDown);
    }
    // Up and cancel live on the window: a thumb that ends its swipe outside
    // the canvas still completes the gesture.
    window.addEventListener("pointerup", this.handlePointerUp);
    window.addEventListener("pointercancel", this.handlePointerCancel);
  }

  detach() {
    if (typeof window === "undefined") return;
    window.removeEventListener("keydown", this.handleKeyDown);
    if (this.root) {
      this.root.removeEventListener("pointerdown", this.handlePointerDown);
      this.root = null;
    } else {
      window.removeEventListener("pointerdown", this.handlePointerDown);
    }
    window.removeEventListener("pointerup", this.handlePointerUp);
    window.removeEventListener("pointercancel", this.handlePointerCancel);
    this.gesture = null;
  }

  /** Drop any half-finished gesture (used when the run is held or suspended). */
  reset() {
    this.gesture = null;
  }

  on(listener: ActionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(action: InputAction) {
    for (const l of this.listeners) l(action);
  }
}
