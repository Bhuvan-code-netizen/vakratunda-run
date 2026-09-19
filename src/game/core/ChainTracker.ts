import { CHAIN_WINDOW, multiplierForChain } from "../constants";

export type ChainEventType = "tier-up" | "broken";

export interface ChainEvent {
  type: ChainEventType;
  tier: number;
}

/**
 * Blessing Chain: consecutive modak pickups build a streak; the streak raises
 * the score multiplier in tiers and decays after CHAIN_WINDOW seconds without
 * a pickup. Hitting an obstacle breaks the chain immediately.
 */
export class ChainTracker {
  private chainCount = 0;
  private timeSinceLast = 0;
  private lastTier = 0;

  /** Register a modak pickup. Returns tier-up events, if any. */
  onModak(): ChainEvent | null {
    this.chainCount++;
    this.timeSinceLast = 0;
    const tier = multiplierForChain(this.chainCount);
    if (tier > this.lastTier) {
      this.lastTier = tier;
      return { type: "tier-up", tier };
    }
    return null;
  }

  /** Break the chain (collision). Returns a broken event if a chain existed. */
  break(): ChainEvent | null {
    const had = this.chainCount > 0;
    this.chainCount = 0;
    this.timeSinceLast = 0;
    const wasTier = this.lastTier;
    this.lastTier = 0;
    return had ? { type: "broken", tier: wasTier } : null;
  }

  /** Advance the grace window; decays the chain when it lapses. */
  tick(dt: number): ChainEvent | null {
    if (this.chainCount === 0) return null;
    this.timeSinceLast += dt;
    if (this.timeSinceLast >= CHAIN_WINDOW) {
      return this.break();
    }
    return null;
  }

  get count(): number {
    return this.chainCount;
  }

  get tier(): number {
    return this.lastTier;
  }

  /** Seconds remaining before the chain lapses (for HUD decay bar). */
  get windowRemaining(): number {
    if (this.chainCount === 0) return 0;
    return Math.max(0, CHAIN_WINDOW - this.timeSinceLast);
  }

  reset() {
    this.chainCount = 0;
    this.timeSinceLast = 0;
    this.lastTier = 0;
  }
}
