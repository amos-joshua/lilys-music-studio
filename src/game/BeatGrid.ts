/**
 * Lazily-extended list of beat times on the audio clock. Beats are appended one
 * at a time so the tempo can change mid-session without ever moving a beat that
 * has already been scheduled or drawn.
 */
export class BeatGrid {
  private times: number[];
  private bpm: number;

  constructor(anchor: number, bpm: number) {
    this.times = [anchor];
    this.bpm = bpm;
  }

  setBpm(bpm: number) {
    this.bpm = bpm;
  }

  get spb() {
    return 60 / this.bpm;
  }

  get currentBpm() {
    return this.bpm;
  }

  timeOf(index: number): number {
    while (this.times.length <= index) {
      this.times.push(this.times[this.times.length - 1] + this.spb);
    }
    return this.times[index];
  }

  /** Beat index closest to t, so a hit can be quantised to the grid. */
  nearestIndex(t: number): number {
    const i = Math.max(0, this.indexAt(t));
    return t - this.timeOf(i) <= this.timeOf(i + 1) - t ? i : i + 1;
  }

  /** Highest beat index whose time is <= t (may be negative before the anchor). */
  indexAt(t: number): number {
    let i = 0;
    while (this.timeOf(i + 1) <= t) i++;
    return t < this.times[0] ? -1 : i;
  }
}
