import type { MidiSource, RawMessage, SourceStatus } from "./types";

/** Desktop fallback so the games are playable and testable without hardware. */
/** Home row as a one-octave keyboard; the drum modes accept any note anyway. */
const PIANO_KEYS: Record<string, number> = {
  a: 60, s: 62, d: 64, f: 65, g: 67, h: 69, j: 71, k: 72,
};
const PAD_NOTE = 36;

export class KeyboardSource implements MidiSource {
  kind = "keyboard" as const;
  label = "Keyboard";
  status: SourceStatus = "ready";
  detail = "space = pad · A–K = C4–C5";
  private handler: ((e: KeyboardEvent) => void) | null = null;

  start(emit: (m: RawMessage) => void) {
    this.handler = (e) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      const key = e.key.toLowerCase();
      const note = key === " " ? PAD_NOTE : PIANO_KEYS[key];
      if (note === undefined) return;
      e.preventDefault();
      emit({ perfTime: performance.now(), kind: "keyboard", device: "keyboard", bytes: [0x99, note, 100] });
    };
    window.addEventListener("keydown", this.handler);
  }

  stop() {
    if (this.handler) window.removeEventListener("keydown", this.handler);
    this.handler = null;
    this.status = "idle";
  }
}
