/**
 * Modular input system. Translates raw keyboard / touch events into
 * semantic game actions. New sources (gamepad, on-screen buttons) can be
 * added later by calling `emit` — gameplay never touches DOM events directly.
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

export class InputController {
  private listeners = new Set<ActionListener>();
  private target: HTMLElement | null = null;

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    if (PREVENT_DEFAULT_CODES.has(e.code)) e.preventDefault();
    const action = KEY_MAP[e.code];
    if (action) this.emit(action);
  };

  private touchStartX = 0;
  private touchStartY = 0;
  private touchStartTime = 0;
  private touchTracking = false;

  private handleTouchStart = (e: TouchEvent) => {
    const t = e.changedTouches[0];
    if (!t) return;
    this.touchStartX = t.clientX;
    this.touchStartY = t.clientY;
    this.touchStartTime = performance.now();
    this.touchTracking = true;
  };

  private handleTouchEnd = (e: TouchEvent) => {
    if (!this.touchTracking) return;
    this.touchTracking = false;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - this.touchStartX;
    const dy = t.clientY - this.touchStartY;
    const dt = performance.now() - this.touchStartTime;
    const THRESH = 28;
    if (Math.abs(dx) >= THRESH && Math.abs(dx) > Math.abs(dy)) {
      this.emit(dx > 0 ? "right" : "left");
    } else if (dy <= -THRESH) {
      this.emit("jump");
    } else if (Math.abs(dx) < THRESH && Math.abs(dy) < THRESH && dt < 350) {
      // Tap: jump (also acts as start / restart via game state handling)
      this.emit("jump");
    }
  };

  /** Begin listening. `touchTarget` receives swipe/tap gestures. */
  attach(touchTarget?: HTMLElement) {
    window.addEventListener("keydown", this.handleKeyDown, { passive: false });
    this.target = touchTarget ?? null;
    if (this.target) {
      this.target.addEventListener("touchstart", this.handleTouchStart, {
        passive: true,
      });
      this.target.addEventListener("touchend", this.handleTouchEnd, {
        passive: true,
      });
    }
  }

  detach() {
    window.removeEventListener("keydown", this.handleKeyDown);
    if (this.target) {
      this.target.removeEventListener("touchstart", this.handleTouchStart);
      this.target.removeEventListener("touchend", this.handleTouchEnd);
    }
    this.target = null;
  }

  on(listener: ActionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(action: InputAction) {
    for (const l of this.listeners) l(action);
  }
}
