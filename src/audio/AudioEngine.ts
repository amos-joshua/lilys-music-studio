import heyUrl from "../assets/audio/hey.mp3";

/**
 * Owns the AudioContext and the mapping between `performance.now()` (when MIDI
 * and frames arrive) and the audio output clock (when sound is actually heard).
 * The game's beat grid lives on the audio clock because it does not drift.
 */
export class AudioEngine {
  ctx: AudioContext | null = null;
  private offset = 0; // contextTime - performanceTime/1000, in the heard domain
  private synced = false;
  private master: GainNode | null = null;
  private heyBuffer: AudioBuffer | null = null;
  private heyLoading = false;
  muted = false;

  /** Must be called from a user gesture. */
  resume(): AudioContext {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor({ latencyHint: "interactive" });
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      // Safety limiter, so overlapping sounds cannot clip and the shout can
      // run at full gain without having to be mixed down defensively.
      const limiter = this.ctx.createDynamicsCompressor();
      limiter.threshold.value = -6;
      limiter.knee.value = 6;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.15;
      this.master.connect(limiter);
      limiter.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    this.syncClock(true);
    void this.loadHey();
    return this.ctx;
  }

  private async loadHey() {
    if (this.heyBuffer || this.heyLoading || !this.ctx) return;
    this.heyLoading = true;
    try {
      const res = await fetch(heyUrl);
      this.heyBuffer = await this.ctx.decodeAudioData(await res.arrayBuffer());
    } catch {
      // Leave it null; hey() falls back to the synthesised shout.
    } finally {
      this.heyLoading = false;
    }
  }

  get now(): number {
    return this.ctx ? this.ctx.currentTime : performance.now() / 1000;
  }

  /**
   * Re-measure the perf<->context offset. Uses getOutputTimestamp so the
   * mapping refers to sound leaving the speaker, not entering the buffer.
   */
  syncClock(force = false) {
    const ctx = this.ctx;
    if (!ctx) return;
    let next: number | null = null;
    const ts = ctx.getOutputTimestamp?.();
    if (ts && ts.contextTime && ts.performanceTime) {
      next = ts.contextTime - ts.performanceTime / 1000;
    } else if (force) {
      next = ctx.currentTime - performance.now() / 1000;
    }
    if (next === null) return;
    if (!this.synced || force) {
      this.offset = next;
      this.synced = true;
    } else {
      this.offset += (next - this.offset) * 0.05; // gentle, avoids visual jitter
    }
  }

  perfToCtx(perfMs: number): number {
    return perfMs / 1000 + this.offset;
  }

  ctxToPerf(ctxTime: number): number {
    return (ctxTime - this.offset) * 1000;
  }

  private tone(at: number, freq: number, dur: number, gain: number, type: OscillatorType = "sine", endFreq?: number) {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted) return;
    const t = Math.max(at, ctx.currentTime);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (endFreq !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 1), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(at: number, dur: number, gain: number, hz: number) {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted) return;
    const t = Math.max(at, ctx.currentTime);
    const frames = Math.ceil(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
    const chan = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) chan[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = hz;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t);
  }

  /** Metronome / count-in click. */
  click(at: number, accent = false) {
    this.tone(at, accent ? 1400 : 900, 0.05, accent ? 0.22 : 0.12, "square");
  }

  /** Instant feedback for a pad strike — the pad itself may be silent. */
  thump(at: number, velocity: number) {
    const v = 0.25 + (velocity / 127) * 0.45;
    this.tone(at, 180, 0.14, 0.35 * v, "sine", 55);
    this.noise(at, 0.06, 0.18 * v, 2200);
  }

  /** Reward when the animal actually reaches the treat. */
  chomp(at: number, perfect: boolean) {
    this.tone(at, 520, 0.09, 0.2, "triangle", 880);
    this.tone(at + 0.07, 880, 0.14, 0.18, "triangle", 1320);
    if (perfect) this.tone(at + 0.14, 1760, 0.16, 0.12, "sine");
  }

  /** Recorded "hey!", falling back to synthesis until the sample has decoded. */
  hey(at: number) {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted) return;
    if (!this.heyBuffer) {
      this.heySynth(at);
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.heyBuffer;
    const g = ctx.createGain();
    g.gain.value = 1;
    src.connect(g);
    g.connect(this.master);
    src.start(Math.max(at, ctx.currentTime));
  }

  /**
   * Stand-in shout — a sawtooth through a sweeping bandpass formant over a clap
   * transient. Vowel-ish enough to read as a voice if the sample is missing.
   */
  private heySynth(at: number) {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted) return;
    const t = Math.max(at, ctx.currentTime);

    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.linearRampToValueAtTime(560, t + 0.05);
    osc.frequency.linearRampToValueAtTime(370, t + 0.26);

    const formant = ctx.createBiquadFilter();
    formant.type = "bandpass";
    formant.Q.value = 3.5;
    formant.frequency.setValueAtTime(700, t);
    formant.frequency.linearRampToValueAtTime(1500, t + 0.06);
    formant.frequency.linearRampToValueAtTime(900, t + 0.26);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.3, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);

    osc.connect(formant);
    formant.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.32);

    this.noise(t, 0.05, 0.16, 1800);
  }

  /** Piano-ish note. The controller may be silent, so the app has to sound it. */
  piano(at: number, freq: number, velocity = 100) {
    const gain = 0.1 + (velocity / 127) * 0.14;
    this.tone(at, freq, 1.1, gain, "triangle");
    this.tone(at, freq * 2, 0.55, gain * 0.28, "sine");
    this.tone(at, freq * 3, 0.3, gain * 0.12, "sine");
  }

  /** Gentle "not that one" — deliberately soft and short. */
  buzz(at: number) {
    this.tone(at, 150, 0.16, 0.08, "sawtooth", 110);
  }

  /** Climbing blip — pitch rises with progress up the hill. */
  blip(at: number, progress: number, velocity: number) {
    const freq = 330 * Math.pow(2, progress * 1.5);
    this.tone(at, freq, 0.08, 0.13 + (velocity / 127) * 0.08, "triangle", freq * 1.12);
  }

  /** Landing at the bottom of the hill. */
  boing(at: number, strength: number) {
    this.tone(at, 220, 0.22, 0.12 * strength, "sine", 90);
  }

  fanfare(at?: number) {
    const t = at ?? this.now + 0.02;
    [523, 659, 784, 1047].forEach((f, i) => this.tone(t + i * 0.12, f, 0.3, 0.2, "triangle"));
  }
}

export const audio = new AudioEngine();
