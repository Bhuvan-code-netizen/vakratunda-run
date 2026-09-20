/**
 * Premium-feel audio, synthesised at runtime.
 *
 * Nothing here is a sample. The mix has three buses hanging off `master`, so
 * nothing fights anything:
 *   `sfx` — gameplay events (footfalls, pickups, grazes, impacts)
 *   `bgm` — the devotional theme
 *   (drone + rain go straight to master, since they are ambience, not events)
 *
 * THE THEME is a bhajan: a harmonium lead over a tanpura bed, with a temple
 * bell marking every half cycle, a dhol pulse, tabla ticks and hand-claps, and
 * a low "Om" pad swelling underneath. It plays on the menu and through the
 * cinematic intro — where a temple bell tolls as the hero shot begins — then
 * yields to the run's own soundscape.
 *
 * THE EFFECTS are cartoons: rubber boings, squeaky-toy footfalls, pops, slide
 * whistles and a sad trombone when the run ends. They are deliberately funny,
 * but every one still carries the information the player needs (jump = rising
 * boing, crash = falling wah-wah), so the comedy reads as feedback rather than
 * noise.
 *
 * Routing rule: a call carrying an absolute `at` time is music (bgm bus); a
 * call without one is a live effect (sfx bus). That is what lets the whole
 * bhajan, percussion included, fade out as one when the run takes over.
 *
 * The context is only created on the player's first input — browsers refuse to
 * start audio otherwise — and every sound is guarded, so a hostile or missing
 * Web Audio implementation degrades to silence instead of breaking the game.
 */

export interface AudioState {
  speed: number;
  rain: number;
  night: number;
  running: boolean;
  /** True during the cinematic run intro — the theme keeps playing through it. */
  intro?: boolean;
}

/** Pentatonic degrees (semitones) the modak chimes climb through. */
const PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16];

/**
 * The bhajan, in semitones above the lead's root, one entry per step. The
 * scale is Bhairavi (natural minor), the mode devotional singing most often
 * uses, and the phrase resolves on the tonic so it loops seamlessly.
 */
const THEME_STEPS: ReadonlyArray<number> = [
  0, 2, 3, 5, 7, 5, 3, 2,
  0, 2, 3, 5, 8, 7, 5, 3,
  7, 8, 10, 8, 7, 5, 3, 2,
  0, 3, 5, 7, 8, 7, 5, 0,
];
/** Seconds per step (120 bpm in 4/4, one note per beat). */
const THEME_STEP_SECONDS = 0.5;
/** The lead's root: A3, a warm mid register for a harmonium. */
const THEME_ROOT = 220;

/** Inharmonic partials of a temple bell: [ratio, gain, decay seconds]. */
const BELL_PARTIALS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 1, 2.6],
  [2.76, 0.55, 1.7],
  [5.4, 0.28, 0.95],
];

/**
 * Mix levels. The effects bus sits well above the music bus so a footfall or a
 * pickup always cuts through the theme instead of vanishing under it.
 */
const SFX_LEVEL = 0.85;
const BGM_MENU_LEVEL = 0.32;

export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private drone: GainNode | null = null;
  private droneFilter: BiquadFilterNode | null = null;
  private rain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private started = false;
  private muted = false;
  private pulseTimer = 0;
  private pulseInterval = 0.62;
  /** Extra master trim while a run is paused on the menus. */
  private duckLevel = 1;

  // --- BGM nodes (built in unlock(), torn down in dispose()) ---
  private bgmGain: GainNode | null = null;
  /** The harmonium: two detuned sawtooths sharing one bellows envelope. */
  private reed: { a: OscillatorNode; b: OscillatorNode; gain: GainNode } | null = null;
  /** Persistent oscillators, so a long run never churns nodes. */
  private heldOscillators: OscillatorNode[] = [];
  private melodyTimer: number | null = null;
  private themeStep = 0;
  /** Beat scheduler runs slightly ahead so notes always land on time. */
  private nextNoteTime = 0;
  /** Whether the theme should be audible right now (menu/intro = yes). */
  private bgmShouldPlay = true;
  /** Guards the single bell toll that opens a run's hero shot. */
  private introBellFired = false;

  /** True once the context exists and is running. */
  get isRunning(): boolean {
    return this.started && this.ctx?.state === "running" && !this.muted;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /**
   * Create the audio graph. Must be called from a user gesture (a key press or
   * a tap) — Safari and Chrome both refuse to start audio otherwise.
   */
  unlock() {
    if (this.started) {
      // A suspended context can be resumed by the same gesture.
      if (this.ctx && this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const Ctor =
      typeof window !== "undefined"
        ? window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        : undefined;
    if (!Ctor) return;

    try {
      const ctx = new Ctor();
      this.ctx = ctx;

      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(ctx.destination);

      // The effects bus: every gameplay event lands here, above the music, so
      // a footfall or a chime is never masked by the theme.
      this.sfxBus = ctx.createGain();
      this.sfxBus.gain.value = SFX_LEVEL;
      this.sfxBus.connect(this.master);

      // Ambient bed: two detuned sines a fifth apart, filtered and breathing.
      this.drone = ctx.createGain();
      this.drone.gain.value = 0.0;
      this.droneFilter = ctx.createBiquadFilter();
      this.droneFilter.type = "lowpass";
      this.droneFilter.frequency.value = 420;
      this.droneFilter.Q.value = 0.7;
      this.drone.connect(this.droneFilter);
      this.droneFilter.connect(this.master);

      for (const [freq, gain, detune] of [
        [110, 0.5, -4],
        [164.81, 0.34, 5],
        [220, 0.16, 8],
      ] as const) {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = freq;
        osc.detune.value = detune;
        const g = ctx.createGain();
        g.gain.value = gain;
        osc.connect(g);
        g.connect(this.drone);
        osc.start();
        this.heldOscillators.push(osc);
      }

      // Slow tremolo on the bed, so it breathes instead of sitting still.
      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 0.09;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 90;
      lfo.connect(lfoGain);
      lfoGain.connect(this.droneFilter.frequency);
      lfo.start();
      this.heldOscillators.push(lfo);

      // Rain: a filtered noise sheet whose level follows the weather.
      const source = ctx.createBufferSource();
      source.buffer = this.makeNoiseBuffer(ctx, 2);
      source.loop = true;
      this.noiseBuffer = source.buffer;
      const rainFilter = ctx.createBiquadFilter();
      rainFilter.type = "bandpass";
      rainFilter.frequency.value = 2600;
      rainFilter.Q.value = 0.6;
      this.rain = ctx.createGain();
      this.rain.gain.value = 0;
      source.connect(rainFilter);
      rainFilter.connect(this.rain);
      this.rain.connect(this.master);
      source.start();

      this.buildBgm();

      this.started = true;
      this.fade(this.drone.gain, 0.075, 3.5);
    } catch {
      // Audio is a garnish: if the graph cannot be built, play on in silence.
      this.started = false;
      this.ctx = null;
    }
  }

  /* ------------------------------------------------------------------ */
  /* The devotional theme                                               */
  /* ------------------------------------------------------------------ */

  /**
   * The bhajan ensemble: harmonium lead, tanpura strings, and a low Om pad.
   * Everything hangs off `bgmGain`, so fading the music between scenes is a
   * single gain ramp while the beat scheduler keeps running underneath.
   */
  private buildBgm() {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;

    // The BGM starts audible: the first scene is the menu, and no duck signal
    // will have arrived yet by the time this runs.
    const bus = ctx.createGain();
    this.bgmGain = bus;
    bus.gain.value = BGM_MENU_LEVEL;
    bus.connect(master);

    // Tanpura: a low fifth-and-octave trio, shimmering with slow detune.
    for (const [freq, gain, detune] of [
      [116.54, 0.05, 0],
      [174.61, 0.035, 3],
      [233.08, 0.03, -3],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = freq;
      osc.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = gain;
      const shimmer = ctx.createOscillator();
      shimmer.type = "sine";
      shimmer.frequency.value = 0.13 + Math.random() * 0.08;
      const shimmerGain = ctx.createGain();
      shimmerGain.gain.value = 0.012;
      shimmer.connect(shimmerGain);
      shimmerGain.connect(g.gain);
      shimmer.start();
      this.heldOscillators.push(shimmer);
      osc.connect(g);
      g.connect(bus);
      osc.start();
      this.heldOscillators.push(osc);
    }

    // The Om pad: a low tonic-and-fifth choir that swells almost imperceptibly,
    // the way a gathered crowd holds a drone under a bhajan.
    const omGain = ctx.createGain();
    omGain.gain.value = 0.022;
    const omSwell = ctx.createOscillator();
    omSwell.type = "sine";
    omSwell.frequency.value = 0.045;
    const omSwellDepth = ctx.createGain();
    omSwellDepth.gain.value = 0.014;
    omSwell.connect(omSwellDepth);
    omSwellDepth.connect(omGain.gain);
    omSwell.start();
    this.heldOscillators.push(omSwell);
    for (const freq of [110, 164.81, 220]) {
      const voice = ctx.createOscillator();
      voice.type = "sine";
      voice.frequency.value = freq;
      voice.detune.value = (Math.random() - 0.5) * 12;
      const vg = ctx.createGain();
      vg.gain.value = 0.4;
      voice.connect(vg);
      vg.connect(omGain);
      voice.start();
      this.heldOscillators.push(voice);
    }
    omGain.connect(bus);

    // The harmonium: two detuned sawtooths through a soft lowpass, with the
    // gentle vibrato a player's hand puts on the bellows.
    const reedA = ctx.createOscillator();
    reedA.type = "sawtooth";
    reedA.frequency.value = THEME_ROOT;
    const reedB = ctx.createOscillator();
    reedB.type = "sawtooth";
    reedB.frequency.value = THEME_ROOT * 1.004;
    const reedFilter = ctx.createBiquadFilter();
    reedFilter.type = "lowpass";
    reedFilter.frequency.value = 1350;
    reedFilter.Q.value = 0.6;
    const reedGain = ctx.createGain();
    reedGain.gain.value = 0;
    reedA.connect(reedFilter);
    reedB.connect(reedFilter);
    reedFilter.connect(reedGain);
    reedGain.connect(bus);
    const reedVib = ctx.createOscillator();
    reedVib.type = "sine";
    reedVib.frequency.value = 4.6;
    const reedVibDepth = ctx.createGain();
    reedVibDepth.gain.value = 4;
    reedVib.connect(reedVibDepth);
    reedVibDepth.connect(reedA.detune);
    reedVibDepth.connect(reedB.detune);
    reedA.start();
    reedB.start();
    reedVib.start();
    this.heldOscillators.push(reedA, reedB, reedVib);
    this.reed = { a: reedA, b: reedB, gain: reedGain };

    this.startMelody();
  }

  /** Schedule the bhajan step by step with lookahead, forever. */
  private startMelody() {
    if (!this.ctx) return;
    this.nextNoteTime = this.ctx.currentTime + 0.3;
    const tick = () => {
      if (!this.ctx) return;
      while (this.nextNoteTime < this.ctx.currentTime + 0.5) {
        this.scheduleThemeStep(this.nextNoteTime, this.themeStep);
        this.nextNoteTime += THEME_STEP_SECONDS;
        this.themeStep++;
      }
      this.melodyTimer = window.setTimeout(tick, 140);
    };
    tick();
  }

  /**
   * One step of the cycle: a lead note on every beat, with the dhol on the
   * down-beats, a tabla tick between them, hand-claps on the off-beats and a
   * temple bell marking every half cycle.
   */
  private scheduleThemeStep(at: number, step: number) {
    const bus = this.bgmGain;
    if (!this.ctx || !bus) return;
    const degree = THEME_STEPS[step % THEME_STEPS.length]!;
    this.harmoniumNote(at, THEME_STEP_SECONDS * 1.5, degree);

    if (step % 4 === 0) this.dhol(at);
    if (step % 4 === 2) this.tablaTick(at);
    if (step % 8 === 4) this.handClap(at);
    if (step % 16 === 0) this.strikeBell(at, 0.34, bus);
  }

  /** A harmonium note: bellows attack, gentle swell, soft release. */
  private harmoniumNote(when: number, dur: number, degree: number) {
    const reed = this.reed;
    const ctx = this.ctx;
    if (!reed || !ctx) return;
    const freq = THEME_ROOT * Math.pow(2, degree / 12);
    reed.a.frequency.setValueAtTime(freq, when);
    reed.b.frequency.setValueAtTime(freq * 1.004, when);
    const g = reed.gain.gain;
    if (when <= ctx.currentTime) {
      g.cancelScheduledValues(0);
      g.setTargetAtTime(0.0001, ctx.currentTime, 0.01);
    }
    g.setValueAtTime(0, when);
    g.linearRampToValueAtTime(0.075, when + 0.05); // bellows
    g.linearRampToValueAtTime(0.05, when + dur * 0.7); // swell
    g.setTargetAtTime(0.0001, when + dur * 0.85, 0.06); // release
  }

  /**
   * The dhol: a deep pitched thump with a skin slap over it. Pitched (not just
   * noise) so it reads as an Indian barrel drum rather than a generic kick.
   */
  private dhol(at: number) {
    this.slide(120, 58, 0.3, { gain: 0.2, type: "sine", at });
    this.hiss(0.07, { freq: 260, q: 0.9, gain: 0.09, type: "bandpass", at });
  }

  /** Tabla tick: the dry "na" between the dhol beats. */
  private tablaTick(at: number) {
    this.hiss(0.035, { freq: 1400, q: 1.4, gain: 0.06, type: "bandpass", at });
    this.slide(420, 380, 0.05, { gain: 0.05, type: "sine", at });
  }

  /** Hand-clap: a tight band-limited burst, doubled for the crowd effect. */
  private handClap(at: number) {
    this.hiss(0.06, { freq: 1900, q: 0.8, gain: 0.07, type: "bandpass", at });
    this.hiss(0.05, { freq: 1500, q: 0.9, gain: 0.05, type: "bandpass", at: at + 0.014 });
  }

  /**
   * A temple bell (ghanta). Bells are inharmonic, so it is built from a small
   * set of unrelated partials with long, unequal decays — that shimmer is what
   * makes it read as cast bronze rather than a sine beep.
   */
  private strikeBell(at: number, gain: number, bus: GainNode) {
    const ctx = this.ctx;
    if (!ctx) return;
    for (const [ratio, partialGain, decay] of BELL_PARTIALS) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = THEME_ROOT * 2 * ratio;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, at);
      env.gain.linearRampToValueAtTime(gain * partialGain, at + 0.008);
      env.gain.exponentialRampToValueAtTime(0.0001, at + decay);
      osc.connect(env);
      env.connect(bus);
      osc.start(at);
      osc.stop(at + decay + 0.05);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Mix, buses and small helpers                                        */
  /* ------------------------------------------------------------------ */

  /**
   * Fade the BGM between scenes: BGM_MENU_LEVEL is the menu/intro mix, 0 turns
   * it off for gameplay.
   */
  private setBgmLevel(level: number, seconds = 1.2) {
    if (this.bgmGain && this.ctx) {
      this.fade(this.bgmGain.gain, this.muted ? 0 : level, seconds);
    }
  }

  private makeNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.fade(this.master.gain, muted ? 0 : 0.5, 0.25);
    }
  }

  /**
   * Duck the ambience while the run is not in the player's hands — and ride
   * the BGM with it. GameApp's duck convention: 1 = the run has the player's
   * hands, dimmer levels are the menu and the game-over screen. The bhajan
   * plays on the menu and through the cinematic intro, then yields to the run.
   */
  setMenuDuck(level: number) {
    this.duckLevel = level;
    if (this.drone && this.ctx) {
      this.fade(this.drone.gain, this.muted ? 0 : 0.075 * this.duckLevel, 0.8);
    }
    this.bgmShouldPlay = level < 0.95;
    this.setBgmLevel(this.bgmShouldPlay ? BGM_MENU_LEVEL : 0);
  }

  private fade(param: AudioParam, value: number, seconds: number) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(value, now + seconds);
  }

  /**
   * The comedic workhorse: a pitch glide. Boings, slide whistles, splats and
   * the sad trombone are all this one shape with different numbers, so they
   * stay cheap and consistent.
   *
   * Passing `at` marks the call as music (it lands on the BGM bus); leaving it
   * out marks it as a live effect (the SFX bus).
   */
  private slide(
    from: number,
    to: number,
    duration: number,
    options: {
      gain?: number;
      type?: OscillatorType;
      delay?: number;
      /** Absolute start time. Present = music, absent = live effect. */
      at?: number;
      /** Rubber-band vibrato: rate in Hz, depth in Hz of pitch drift. */
      wobble?: { rate: number; depth: number };
    } = {},
  ) {
    const ctx = this.ctx;
    const bus = this.sfxBus;
    if (!ctx || !bus || this.muted) return;
    const { gain = 0.12, type = "sine", delay = 0, at, wobble } = options;
    const start = at ?? ctx.currentTime + delay;
    const target = at === undefined ? bus : (this.bgmGain ?? bus);

    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, from), start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + duration);

    if (wobble) {
      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = wobble.rate;
      const depth = ctx.createGain();
      depth.gain.value = wobble.depth;
      lfo.connect(depth);
      depth.connect(osc.frequency);
      lfo.start(start);
      lfo.stop(start + duration + 0.05);
    }

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(gain, start + Math.min(0.02, duration * 0.25));
    env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(env);
    env.connect(target);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }

  /** A rubber "boing": a fast upward slide with a wobbling tail. */
  private boing(from: number, to: number, duration: number, gain: number, delay = 0) {
    this.slide(from, to, duration, {
      gain,
      type: "triangle",
      delay,
      wobble: { rate: 22, depth: 55 },
    });
  }

  /** A cartoon "pop": a very short blip pinched upward, like a cork. */
  private pop(freq: number, gain: number, delay = 0, type: OscillatorType = "square") {
    this.slide(freq * 0.65, freq * 1.7, 0.1, { gain, type, delay });
    this.slide(freq * 1.5, freq * 0.9, 0.09, { gain: gain * 0.45, type: "sine", delay: delay + 0.05 });
  }

  /** A pitched blip with an optional glide and exponential decay. */
  private blip(
    freq: number,
    duration: number,
    options: { gain?: number; type?: OscillatorType; glideTo?: number; delay?: number } = {},
  ) {
    const ctx = this.ctx;
    const bus = this.sfxBus;
    if (!ctx || !bus || this.muted) return;
    const { gain = 0.18, type = "sine", glideTo, delay = 0 } = options;
    const start = ctx.currentTime + delay;

    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, glideTo), start + duration);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(gain, start + Math.min(0.02, duration * 0.2));
    env.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    osc.connect(env);
    env.connect(bus);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  /** A filtered noise hit: footsteps, gusts, impacts. */
  private hiss(
    duration: number,
    options: {
      freq?: number;
      sweepTo?: number;
      q?: number;
      gain?: number;
      type?: BiquadFilterType;
      delay?: number;
      /** Absolute start time. Present = music, absent = live effect. */
      at?: number;
    } = {},
  ) {
    const ctx = this.ctx;
    const bus = this.sfxBus;
    if (!ctx || !bus || !this.noiseBuffer || this.muted) return;
    const {
      freq = 800,
      sweepTo,
      q = 1,
      gain = 0.12,
      type = "bandpass",
      delay = 0,
      at,
    } = options;
    const start = at ?? ctx.currentTime + delay;
    const target = at === undefined ? bus : (this.bgmGain ?? bus);

    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.playbackRate.value = 0.8 + Math.random() * 0.4;

    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, start);
    filter.Q.value = q;
    if (sweepTo) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), start + duration);
    }

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(gain, start + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    source.connect(filter);
    filter.connect(env);
    env.connect(target);
    source.start(start, Math.random() * 1.5, duration + 0.05);
  }

  /* ------------------------------------------------------------------ */
  /* Game events — the funny ones                                        */
  /* ------------------------------------------------------------------ */

  /** Alternate the footfall so the run has two comedic steps, not one. */
  private stepFlip = false;

  /**
   * A footfall: a squeaky-toy step. The squeak alternates with a soft plop, and
   * a light scuff keeps it planted on the asphalt instead of floating.
   */
  footstep(speed: number) {
    this.stepFlip = !this.stepFlip;
    const pitch = 380 + speed * 7;
    if (this.stepFlip) {
      // Squeak: the rubber toy going down.
      this.slide(pitch, pitch * 0.45, 0.1, {
        gain: 0.12,
        type: "triangle",
        wobble: { rate: 26, depth: 70 },
      });
    } else {
      // Plop: a soft rubber nub landing.
      this.slide(pitch * 0.42, pitch * 0.24, 0.09, { gain: 0.14, type: "sine" });
    }
    this.hiss(0.045, { freq: 1200 + speed * 30, q: 0.8, gain: 0.045, type: "bandpass" });
  }

  /** Lane change: a slide-whistle that points the way you moved. */
  laneChange(dir: -1 | 1) {
    this.slide(dir > 0 ? 520 : 1150, dir > 0 ? 1150 : 520, 0.24, {
      gain: 0.15,
      type: "sine",
      wobble: { rate: 8, depth: 45 },
    });
    this.hiss(0.24, { freq: 900, sweepTo: 260, q: 0.8, gain: 0.12 });
  }

  /** Jump: a rubber boing, with a second smaller one as it stretches out. */
  jump() {
    this.boing(190, 880, 0.18, 0.2);
    this.boing(880, 520, 0.12, 0.1, 0.09);
  }

  /** Landing: a splat, then a rubbery womp as he compresses. */
  land(impact: number) {
    const power = Math.min(1, Math.max(0.3, impact));
    this.hiss(0.16, { freq: 1100, sweepTo: 140, q: 0.7, gain: 0.2 * power, type: "bandpass" });
    this.slide(240, 68, 0.3, {
      gain: 0.18 * power,
      type: "sawtooth",
      wobble: { rate: 10, depth: 34 },
    });
  }

  /** A modak: a cartoon gulp-pop that climbs as the blessing chain builds. */
  pickup(tier: number, chainCount: number) {
    const degree = PENTATONIC[(chainCount + tier) % PENTATONIC.length]!;
    const freq = 500 * Math.pow(2, degree / 12);
    this.pop(freq, 0.16);
    this.slide(freq * 1.9, freq * 1.1, 0.16, { gain: 0.1, type: "triangle", delay: 0.06 });
  }

  /**
   * Chain tier reached: a kazoo "ta-da!", then a cheeky parp. The tier is
   * the 0-based index (0 = 1x ... 3 = 4x), so it doubles as the pitch step:
   * every tier-up climbs, and the top step sits exactly on the clamp.
   */
  tierUp(tier: number) {
    const root = 392 * Math.pow(2, Math.min(3, Math.max(0, tier)) / 12);
    const notes = [root, root * 1.26, root * 1.6];
    notes.forEach((freq, i) => {
      this.slide(freq, freq * 1.04, 0.14, {
        gain: 0.13,
        type: "square",
        delay: i * 0.11,
        wobble: { rate: 17, depth: 42 },
      });
    });
    this.slide(190, 150, 0.2, {
      gain: 0.11,
      type: "square",
      delay: 0.38,
      wobble: { rate: 24, depth: 30 },
    });
  }

  /** Graze: a startled squeak — and a "whee" when he clears it in the air. */
  graze(flyOver: boolean) {
    if (flyOver) {
      this.slide(1700, 760, 0.26, { gain: 0.14, type: "sine", wobble: { rate: 13, depth: 60 } });
      this.pop(1200, 0.1, 0.02, "triangle");
    } else {
      this.slide(620, 1350, 0.11, {
        gain: 0.13,
        type: "triangle",
        wobble: { rate: 26, depth: 80 },
      });
      this.slide(1350, 900, 0.1, { gain: 0.08, type: "triangle", delay: 0.1 });
    }
    this.hiss(0.2, { freq: flyOver ? 1600 : 1100, sweepTo: 300, q: 0.9, gain: 0.14 });
  }

  /**
   * Power-up pickups: each relic gets its own comic signature, so you can hear
   * which one you took without looking at the HUD.
   */
  powerUp(kind: "shield" | "magnet" | "dash" | "multiplier" | "vighnaharta") {
    if (kind === "vighnaharta") {
      // The ultimate stays devotional — a conch, not a gag.
      this.vighnaharta();
      return;
    }
    if (kind === "shield") {
      // Clang, then a big cartoon boing off the bubble.
      this.slide(340, 150, 0.22, { gain: 0.14, type: "square" });
      this.boing(520, 210, 0.34, 0.16, 0.1);
    } else if (kind === "magnet") {
      // Boing-boing, like a magnet snapping onto a fridge.
      this.boing(300, 760, 0.2, 0.16);
      this.boing(760, 380, 0.2, 0.14, 0.13);
      this.pop(900, 0.1, 0.26, "triangle");
    } else if (kind === "dash") {
      // Zippy slide upward, like a cartoon rocket taking off.
      this.slide(180, 1500, 0.38, {
        gain: 0.17,
        type: "sine",
        wobble: { rate: 26, depth: 90 },
      });
      this.hiss(0.4, { freq: 500, sweepTo: 3200, q: 0.8, gain: 0.1 });
    } else {
      // Blessing: a sparkly ascending ta-da of pops.
      [0, 4, 7, 12].forEach((semi, i) => {
        this.pop(480 * Math.pow(2, semi / 12), 0.12, i * 0.075, "triangle");
      });
    }
  }

  /**
   * Vighnaharta: a conch call — a long fundamental rising a fourth, answered by
   * a temple bell — over a low swell. It should feel like the street itself has
   * stopped for a moment.
   */
  private vighnaharta() {
    const bus = this.sfxBus;
    if (!bus || !this.ctx) return;
    // The conch: a detuned pair, gliding up a perfect fourth.
    this.slide(233.08, 311.13, 1.1, { gain: 0.2, type: "sawtooth" });
    this.slide(234.5, 313.0, 1.1, { gain: 0.12, type: "sawtooth" });
    // The bell answering it, struck as the glide lands.
    this.strikeBell(this.ctx.currentTime + 0.85, 0.24, bus);
    this.blip(699.46, 0.7, { gain: 0.09, type: "sine", delay: 0.9 });
    // A low swell underneath, so the ground feels it.
    this.blip(58.27, 1.6, { gain: 0.16, type: "sine", glideTo: 77.78 });
    this.hiss(1.2, { freq: 300, sweepTo: 3200, q: 0.7, gain: 0.09 });
  }

  /** The ultimate going out: an audible deflation. */
  vighnahartaExpire() {
    this.slide(340, 110, 0.55, { gain: 0.1, type: "sawtooth", wobble: { rate: 9, depth: 25 } });
    this.hiss(0.5, { freq: 1200, sweepTo: 220, q: 0.8, gain: 0.1 });
  }

  /** Any other power going out: a small, rueful "wah-wah". */
  powerUpExpire() {
    this.slide(400, 330, 0.16, { gain: 0.1, type: "square", wobble: { rate: 14, depth: 26 } });
    this.slide(330, 210, 0.24, { gain: 0.09, type: "square", delay: 0.16 });
  }

  /** Shield demolition: a crunch with a honk on top of it. */
  smash() {
    this.slide(420, 90, 0.3, { gain: 0.2, type: "sawtooth" });
    this.hiss(0.34, { freq: 460, sweepTo: 90, q: 0.6, gain: 0.22, type: "lowpass" });
    this.slide(230, 200, 0.18, {
      gain: 0.15,
      type: "square",
      delay: 0.05,
      wobble: { rate: 22, depth: 40 },
    });
  }

  /** Vighnaharta demolition: the crunch, crowned with a bell. */
  vighnahartaSmash() {
    this.smash();
    const bus = this.sfxBus;
    if (bus && this.ctx) this.strikeBell(this.ctx.currentTime + 0.02, 0.16, bus);
  }

  /** Crash: the sad trombone. Three descending "wah"s and a full splat. */
  crash() {
    const steps: Array<[number, number]> = [
      [440, 330],
      [330, 240],
      [240, 120],
    ];
    steps.forEach(([from, to], i) => {
      this.slide(from, to, 0.32, {
        gain: 0.2,
        type: "sawtooth",
        delay: i * 0.34,
        wobble: { rate: 7, depth: 30 },
      });
    });
    this.slide(120, 60, 0.5, { gain: 0.14, type: "sawtooth", delay: 1.02 });
    this.hiss(0.9, { freq: 700, sweepTo: 70, q: 0.5, gain: 0.26, type: "lowpass" });
  }

  /** Milestone: a temple bell and a cheerful kazoo fanfare. */
  milestone() {
    const bus = this.sfxBus;
    if (!bus || !this.ctx) return;
    this.strikeBell(this.ctx.currentTime, 0.2, bus);
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      this.slide(freq, freq * 1.05, 0.18, {
        gain: 0.13,
        type: "square",
        delay: i * 0.12,
        wobble: { rate: 16, depth: 35 },
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Ambience                                                           */
  /* ------------------------------------------------------------------ */

  /**
   * Track the run: the drone darkens toward night, the rain sheet thickens with
   * the monsoon, a temple bell tolls as the hero shot begins, and a soft plop
   * keeps time with the pace.
   */
  update(dt: number, state: AudioState) {
    if (!this.ctx || !this.started) return;

    // The cinematic intro opens with a single bell toll — the devotional beat
    // the run starts on. It re-arms whenever the intro is not running.
    if (state.intro) {
      if (!this.introBellFired) {
        this.introBellFired = true;
        const bus = this.sfxBus;
        if (bus) this.strikeBell(this.ctx.currentTime + 0.05, 0.3, bus);
      }
    } else {
      this.introBellFired = false;
    }

    // If audio was unlocked mid-run (the player's first input was a lane
    // change or a jump), the theme must not start over active gameplay —
    // yield to the run. The cinematic intro is exempt: the theme carries
    // through the hero shot, and handing over control fades it out.
    if (state.running && !state.intro && this.bgmShouldPlay) {
      this.bgmShouldPlay = false;
      this.setBgmLevel(0, 0.8);
    }

    if (this.droneFilter) {
      const target = 420 - state.night * 190 - state.rain * 60;
      this.droneFilter.frequency.value += (target - this.droneFilter.frequency.value) * 0.6 * dt;
    }
    if (this.rain) {
      const target = state.running ? state.rain * 0.075 : state.rain * 0.03;
      this.rain.gain.value += (target - this.rain.gain.value) * 1.5 * dt;
    }
    if (!state.running || this.muted) {
      this.pulseTimer = 0;
      return;
    }

    // Pace drives the pulse: a soft comedic plop once per stride pair at low
    // speed, tightening as he runs faster.
    const pace = Math.min(1, Math.max(0, (state.speed - 8) / 26));
    this.pulseInterval = 0.72 - pace * 0.28;
    this.pulseTimer -= dt;
    if (this.pulseTimer <= 0) {
      this.pulseTimer = this.pulseInterval;
      this.slide(150, 95, 0.16, { gain: 0.1, type: "sine" });
      this.hiss(0.1, { freq: 200, q: 0.7, gain: 0.04, type: "lowpass" });
    }
  }

  dispose() {
    this.started = false;
    if (this.melodyTimer !== null) {
      window.clearTimeout(this.melodyTimer);
      this.melodyTimer = null;
    }
    for (const osc of this.heldOscillators) {
      try {
        osc.stop();
      } catch {
        /* already stopped */
      }
    }
    this.heldOscillators = [];
    this.reed = null;
    this.bgmGain = null;
    this.sfxBus = null;
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    this.drone = null;
    this.droneFilter = null;
    this.rain = null;
    this.noiseBuffer = null;
    if (ctx) void ctx.close();
  }
}
