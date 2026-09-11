import { PitchDetector } from "pitchy";
import { audio } from "../audio/AudioEngine";
import type { MidiSource, RawMessage, SourceStatus } from "./types";
import {
  MIC_CENTS_DEADBAND,
  MIC_CLARITY,
  MIC_HOLD_FRAMES,
  MIC_MAX_HZ,
  MIC_MIN_HZ,
  MIC_OCTAVE_FRAMES,
  MIC_RELEASE_FRAMES,
} from "../config/settings";

const midiOf = (hz: number) => 69 + 12 * Math.log2(hz / 440);

/**
 * Sing instead of playing: the microphone becomes another note source, so the
 * modes see ordinary note-on/note-off and never learn where a hit came from.
 *
 * The work here is turning a continuous pitch reading into discrete notes:
 * a note starts once the same semitone has held for a few frames, ends when the
 * voice stops or moves, and a deadband around the semitone boundary keeps
 * vibrato from chattering between two neighbours. The octave guard is carried
 * over from singing-bob: detectors jump an octave on a single frame far more
 * often than a child changes octave.
 */
export class MicSource implements MidiSource {
  kind = "mic" as const;
  label = "Microphone";
  status: SourceStatus = "idle";
  detail = "";

  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private raf = 0;
  private emit: ((m: RawMessage) => void) | null = null;

  /** The note currently sounding, if any, and how long the candidate has held. */
  private held = -1;
  private candidate = -1;
  private candidateFrames = 0;
  private quietFrames = 0;
  private stableHz = 0;
  private octaveFrames = 0;

  async start(emit: (m: RawMessage) => void) {
    this.emit = emit;
    if (!navigator.mediaDevices?.getUserMedia) {
      this.status = "unsupported";
      this.detail = "getUserMedia missing";
      return;
    }
    this.status = "connecting";
    try {
      // Echo cancellation on: the app plays a piano tone through the same
      // speakers the microphone is listening to, and without it every note the
      // app sounds comes straight back in as a sung one.
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (err) {
      this.status = "error";
      this.detail = err instanceof Error ? err.message : String(err);
      return;
    }

    this.ctx = new AudioContext();
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 2048;
    this.ctx.createMediaStreamSource(this.stream).connect(analyser);

    const detector = PitchDetector.forFloat32Array(analyser.fftSize);
    const buffer = new Float32Array(analyser.fftSize);
    const sampleRate = this.ctx.sampleRate;

    this.status = "ready";
    this.detail = "sing a note";

    const frame = () => {
      this.raf = requestAnimationFrame(frame);
      // Deaf while the app is sounding, rather than hearing its own piano back.
      // Skipping the frame outright — not reporting silence — means a note being
      // held through one of the app's own sounds is not cut short by it.
      if (audio.sounding) return;
      analyser.getFloatTimeDomainData(buffer);
      const [hz, clarity] = detector.findPitch(buffer, sampleRate);
      const heard = clarity > MIC_CLARITY && hz > MIC_MIN_HZ && hz < MIC_MAX_HZ;
      this.step(heard ? this.steadyHz(hz) : 0, buffer);
    };
    this.raf = requestAnimationFrame(frame);
  }

  /** A single frame an octave off the running pitch is the detector, not the singer. */
  private steadyHz(hz: number): number {
    if (!this.stableHz) {
      this.stableHz = hz;
      return hz;
    }
    const ratio = hz / this.stableHz;
    const jumped = (ratio > 1.8 && ratio < 2.2) || (ratio > 0.45 && ratio < 0.55);
    if (!jumped) {
      this.stableHz = hz;
      this.octaveFrames = 0;
      return hz;
    }
    if (++this.octaveFrames >= MIC_OCTAVE_FRAMES) {
      this.stableHz = hz;
      this.octaveFrames = 0;
      return hz;
    }
    return this.stableHz;
  }

  private step(hz: number, buffer: Float32Array) {
    if (!hz) {
      this.stableHz = 0;
      this.octaveFrames = 0;
      this.candidate = -1;
      this.candidateFrames = 0;
      if (this.held >= 0 && ++this.quietFrames >= MIC_RELEASE_FRAMES) this.release();
      return;
    }
    this.quietFrames = 0;

    const exact = midiOf(hz);
    let note = Math.round(exact);
    // The sounding note holds until the voice is clearly past the halfway point
    // to its neighbour, so wobble around the boundary does not chatter.
    if (this.held >= 0 && note !== this.held && Math.abs(exact - this.held) < 0.5 + MIC_CENTS_DEADBAND / 100) {
      note = this.held;
    }
    if (note === this.held) return;

    if (note !== this.candidate) {
      this.candidate = note;
      this.candidateFrames = 1;
      return;
    }
    if (++this.candidateFrames < MIC_HOLD_FRAMES) return;

    if (this.held >= 0) this.release();
    this.held = note;
    this.send(note, Math.min(127, Math.max(30, Math.round(rms(buffer) * 900))));
  }

  private release() {
    if (this.held < 0) return;
    this.send(this.held, 0);
    this.held = -1;
    this.quietFrames = 0;
  }

  private send(note: number, velocity: number) {
    this.emit?.({
      perfTime: performance.now(),
      kind: "mic",
      device: "microphone",
      bytes: [velocity > 0 ? 0x90 : 0x80, note, velocity],
    });
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.release();
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close();
    this.stream = null;
    this.ctx = null;
    this.status = "idle";
  }
}

function rms(buffer: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
  return Math.sqrt(sum / buffer.length);
}
