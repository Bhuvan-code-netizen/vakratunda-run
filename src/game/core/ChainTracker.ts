import { CHAIN_TIERS, CHAIN_WINDOW, multiplierForChain } from "../constants";

/**
 * A chain event worth reacting to: a new blessing tier, or the chain lapsing.
 * Both carry enough context for the effect and audio layers to play without
 * reading anything back off the tracker.
 */
export type ChainEvent =
  | { type: "tier-up"; tier: number; count: number }
  | { type: "broken"; count: number };

/**
 * The Blessing Chain: consecutive modak pickups build a score multiplier, and
 * the whole thing lapses if the runner goes CHAIN_WINDOW seconds without
 * collecting one.
 *
 * `tier` is an INDEX, not the multiplier: 0 means 1x, 1 means 2x, up to 3 for
 * 4x. Callers turn it into points with `1 + tier` and into a HUD label with
 * `TIER_LABEL[tier]`, which is why the ladder stops one short of the
 * multiplier it represents.
 */
export class ChainTracker {
  private chainCount = 0;
  private tierIndex = 0;
  private window = 0;

  /** Modaks collected in the current, unbroken chain. */
  get count(): number {
    return this.chainCount;
  }

  /** Multiplier index: 0 = 1x, 1 = 2x, 2 = 3x, 3 = 4x. */
  get tier(): number {
    return this.tierIndex;
  }

  /** The multiplier itself (1x-4x), for scoring without an off-by-one. */
  get multiplier(): number {
    return 1 + this.tierIndex;
  }

  /** Seconds of grace left before the chain lapses. */
  get windowRemaining(): number {
    return this.window;
  }

  /**
   * Registers a collected modak. Returns a `tier-up` event on the pickups that
   * cross a threshold, so the caller can flash and chirp without polling.
   */
  onModak(): ChainEvent | null {
    this.chainCount += 1;
    this.window = CHAIN_WINDOW;

    const tier = multiplierForChain(this.chainCount) - 1;
    if (tier > this.tierIndex) {
      this.tierIndex = tier;
      return { type: "tier-up", tier, count: this.chainCount };
    }
    return null;
  }

  /**
   * Ages the grace window. A chain that lapses breaks here, which is what makes
   * the multiplier feel earned instead of permanent.
   */
  tick(dt: number): ChainEvent | null {
    if (this.chainCount === 0) {
      this.window = 0;
      return null;
    }

    this.window -= dt;
    if (this.window <= 0) return this.break();
    return null;
  }

  /** Ends the chain immediately (a crash). No-op when there is nothing to break. */
  break(): ChainEvent | null {
    if (this.chainCount === 0) return null;

    const count = this.chainCount;
    this.chainCount = 0;
    this.tierIndex = 0;
    this.window = 0;
    return { type: "broken", count };
  }

  /** Back to a fresh run. */
  reset(): void {
    this.chainCount = 0;
    this.tierIndex = 0;
    this.window = 0;
  }
}

/** Thresholds are re-exported so UI code can render tier progress. */
export { CHAIN_TIERS };
