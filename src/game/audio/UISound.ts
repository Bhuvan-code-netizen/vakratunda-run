/**
 * UISound — a tiny standalone synth layer for interface sounds.
 *
 * Deliberately separate from the game's AudioSystem: the game engine only
 * exists on /play, while buttons live everywhere (landing, auth, dashboard,
 * the in-game menus and HUD overlays). This module mounts once in main.tsx
 * and stays for the whole session.
 *
 * How it hears clicks: one delegated `click` listener on `window` (capture
 * phase) covers every button ever rendered — React, portal or plain DOM —
 * including buttons added later and HUD buttons stacked over the canvas.
 * Hover uses the same trick, rate-limited so gliding across a menu doesn't
 * turn into an insect chorus.
 *
 * All sounds are synthesised (no assets): a soft wooden tick for hover and a
 * two-layer "tak + plok" for clicks, with a brighter variant for toggles and
 * a falling tone for back/dismiss actions.
 */

class UISoundPlayer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;
  private lastHover = 0;
  private listenersBound = false;
  /** Set once a touch is seen — touch devices have no hover, and a tap would
   *  otherwise fire hover + click back-to-back. */
  private touchSeen = false;

  /** Bind the delegated listeners. Safe to call repeatedly (idempotent). */
  mount() {
    if (this.listenersBound) return;
    this.listenersBound = true;
    document.addEventListener(
      "touchstart",
      () => {
        this.touchSeen = true;
      },
      { capture: true, passive: true },
    );
    document.addEventListener("pointerdown", () => this.ensure(), {
      capture: true,
    });
    document.addEventListener("keydown", (e) => {
      // Any real key press also counts as a gesture for autoplay policy.
      this.ensure();
      if (e.key === "Tab") return; // silent keyboard traversal
    });
    document.addEventListener(
      "click",
      (e) => {
        const t = e.target as HTMLElement | null;
        if (!t || !t.closest) return;
        if (t.closest("input, textarea, select, [contenteditable=true]"))
          return;
        if (t.closest("[data-ui-sound='off']")) return;
        const el = t.closest(
          "button, [role='button'], [role='menuitem'], [role='tab'], a[href]",
        ) as HTMLElement | null;
        if (!el) return;
        const state =
          el.getAttribute("aria-pressed") ??
          el.getAttribute("data-state") ??
          el.getAttribute("aria-checked");
        if (el.hasAttribute("data-ui-back") || state === "open") this.back();
        else if (state === "on" || state === "checked") this.toggle();
        else this.click();
      },
      { capture: true },
    );
    document.addEventListener(
      "mouseover",
      (e) => {
        const t = e.target as HTMLElement | null;
        if (!t || !t.closest) return;
        if (t.closest("input, textarea, select, [contenteditable=true]"))
          return;
        if (t.closest("[data-ui-sound='off']")) return;
        if (
          t.closest("button, [role='button'], [role='menuitem'], [role='tab']")
        )
          this.hover();
      },
      { capture: true },
    );
  }

  setMuted(muted: boolean) {
    this.muted = muted;
  }

  isMuted() {
    return this.muted;
  }

  /** Build (or resume) the AudioContext on the first real gesture. */
  private ensure() {
    if (!this.ctx) {
      type WithWebkit = typeof window & {
        webkitAudioContext?: typeof AudioContext;
      };
      const Ctor =
        window.AudioContext ?? (window as WithWebkit).webkitAudioContext;
      if (!Ctor) return;
      try {
        this.ctx = new Ctor();
      } catch {
        return;
      }
      this.master = this.ctx.createGain();
      this.master.gain.value = 1;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  /** Soft wooden tick — quiet enough to layer under everything. */
  hover() {
    const ctx = this.ctx;
    const out = this.master;
    if (!ctx || !out || this.muted || this.touchSeen || ctx.state !== "running")
      return;
    const now = ctx.currentTime;
    if (now - this.lastHover < 0.045) return;
    this.lastHover = now;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(1250, now);
    osc.frequency.exponentialRampToValueAtTime(900, now + 0.05);
    gain.gain.setValueAtTime(0.028, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);
    osc.connect(gain).connect(out);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  /** The main click: a short noise "tak" over a glassy "plok". */
  click() {
    const ctx = this.ctx;
    const out = this.master;
    if (!ctx || !out || this.muted || ctx.state !== "running") return;
    const now = ctx.currentTime;

    // Tak — the physical contact.
    const len = Math.max(1, Math.floor(ctx.sampleRate * 0.02));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++)
      data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 2100;
    band.Q.value = 7;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.12, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
    noise.connect(band).connect(noiseGain).connect(out);
    noise.start(now);
    noise.stop(now + 0.03);

    // Plok — the accent, a small falling bell.
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(640, now + 0.008);
    osc.frequency.exponentialRampToValueAtTime(470, now + 0.075);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.setValueAtTime(0.075, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.085);
    osc.connect(gain).connect(out);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  /** Toggles and switches: same click with a brighter, two-step accent. */
  toggle() {
    const ctx = this.ctx;
    const out = this.master;
    if (!ctx || !out || this.muted || ctx.state !== "running") return;
    const now = ctx.currentTime;
    this.click();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, now + 0.01);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.setValueAtTime(0.05, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
    osc.connect(gain).connect(out);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  /** Back / dismiss: a small falling tone. */
  back() {
    const ctx = this.ctx;
    const out = this.master;
    if (!ctx || !out || this.muted || ctx.state !== "running") return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(370, now + 0.09);
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
    osc.connect(gain).connect(out);
    osc.start(now);
    osc.stop(now + 0.12);
  }
}

/** App-wide singleton — one AudioContext for the whole session. */
export const uiSound = new UISoundPlayer();

/**
 * Mount once near the app root (main.tsx). Renders nothing and holds no
 * React state, so StrictMode double-mounts are harmless.
 */
export function UISoundProvider() {
  uiSound.mount();
  return null;
}
