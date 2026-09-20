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
 * collecting one. The count is a pure counter - nothing here knows about the
 * world, so it can be driven straight from GameApp.
 */
export class ChainTracker {
  private chainCount = 0;
  private multiplierTier = 0;
  private window = 0;

  /** Modaks collected in the current, unbroken chain. */
  get count(): number {
    return this.chainCount;
  }

  /**
   * Current multiplier tier: 0 before the first modak, then 1x-4x following the
   * CHAIN_TIERS thresholds.
   */
  get tier(): number {
    return this.multiplierTier;
  }

  /** Seconds of grace left before the chain lapses. */
  get windowRemaining(): number {
    return this.window;
  }

  /**
   * Registers a collected modak. Returns a tier-up event on the pickups that
   * cross a threshold, so the caller can flash and chirp without polling.
   */
  onModak(): ChainEvent | null {
    this.chainCount += 1;
    this.window = CHAIN_WINDOW;

    const tier = multiplierForChain(this.chainCount);
    if (tier > this.multiplierTier) {
      this.multiplierTier = tier;
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
    this.multiplierTier = 0;
    this.window = 0;
    return { type: "broken", count };
  }

  /** Back to a fresh run. */
  reset(): void {
    this.chainCount = 0;
    this.multiplierTier = 0;
    this.window = 0;
  }
}

/** Thresholds are re-exported so UI code can render tier progress. */
export { CHAIN_TIERS };
