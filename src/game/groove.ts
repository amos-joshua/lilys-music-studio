import { GROOVE_LERP, GROOVE_MAX_MS, GROOVE_MIN_MS, GROOVE_TOLERANCE } from "../config/settings";

export interface Tap {
  /** Milliseconds since the previous tap, or 0 for the first one. */
  interval: number;
  /** Taps in a row whose spacing matched the running average. */
  streak: number;
  /** True when this tap kept the beat rather than starting a new one. */
  onBeat: boolean;
  /** Running tempo, or 0 before there is one. */
  bpm: number;
}

/**
 * Everything else in `game/` assumes the app sets the tempo and the player
 * follows — a beat grid, a latency offset, a metronome. This is the opposite:
 * the player sets the tempo and the app reports how steady it is.
 *
 * Steadiness, not rate, is what it measures. A tap whose spacing matches the
 * running average extends the streak however fast or slow that average is, so
 * whacking as hard as possible earns nothing that a calm even beat does not.
 * A tap that does not match is not a failure — it becomes the new tempo, and
 * the streak starts again from there.
 */
export class Groove {
  private last = 0;
  private avg = 0;
  streak = 0;
  best = 0;

  reset() {
    this.last = 0;
    this.avg = 0;
    this.streak = 0;
    this.best = 0;
  }

  tap(now: number): Tap {
    const prev = this.last;
    this.last = now;
    const interval = prev ? now - prev : 0;

    // The first tap, or one so far from the last that it is a fresh start.
    if (!interval || interval < GROOVE_MIN_MS || interval > GROOVE_MAX_MS) {
      this.avg = 0;
      this.streak = 0;
      return { interval, streak: 0, onBeat: false, bpm: 0 };
    }

    // The first interval only establishes a tempo; it cannot yet be steady.
    if (!this.avg) {
      this.avg = interval;
      this.streak = 1;
      return { interval, streak: 1, onBeat: false, bpm: 60000 / interval };
    }

    const onBeat = Math.abs(interval - this.avg) / this.avg <= GROOVE_TOLERANCE;
    this.streak = onBeat ? this.streak + 1 : 1;
    this.best = Math.max(this.best, this.streak);
    // Follow the player's tempo either way: an off-beat tap is a new tempo, not
    // a mistake, so drifting slowly faster or slower is allowed to succeed.
    this.avg = onBeat ? this.avg + (interval - this.avg) * GROOVE_LERP : interval;
    return { interval, streak: this.streak, onBeat, bpm: 60000 / this.avg };
  }
}
