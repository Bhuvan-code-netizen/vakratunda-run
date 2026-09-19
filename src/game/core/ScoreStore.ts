import { STORAGE_KEY_BEST } from "../constants";

/** Score tracking with local best-score persistence. */
export class ScoreStore {
  private bestValue = 0;

  constructor() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_BEST);
      if (raw !== null) {
        const n = Number.parseInt(raw, 10);
        if (Number.isFinite(n) && n >= 0) this.bestValue = n;
      }
    } catch {
      // Storage unavailable (private mode etc.) — session-only best.
    }
  }

  get best(): number {
    return this.bestValue;
  }

  /** Submit a finished run. Returns whether it set a new best. */
  submit(score: number): boolean {
    if (score > this.bestValue) {
      this.bestValue = score;
      try {
        localStorage.setItem(STORAGE_KEY_BEST, String(score));
      } catch {
        // Ignore persistence failure; in-memory best still updates.
      }
      return true;
    }
    return false;
  }
}
