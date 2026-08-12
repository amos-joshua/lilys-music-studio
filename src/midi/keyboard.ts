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
  private down: ((e: KeyboardEvent) => void) | null = null;
  private up: ((e: KeyboardEvent) => void) | null = null;
  private held = new Set<string>();

  start(emit: (m: RawMessage) => void) {
    const noteFor = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return null;
      const key = e.key.toLowerCase();
      const note = key === " " ? PAD_NOTE : PIANO_KEYS[key];
      return note === undefined ? null : { key, note };
    };
    const send = (note: number, on: boolean) =>
      emit({
        perfTime: performance.now(),
        kind: "keyboard",
        device: "keyboard",
        bytes: [on ? 0x99 : 0x89, note, on ? 100 : 0],
      });

    this.down = (e) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const hit = noteFor(e);
      if (!hit) return;
      e.preventDefault();
      this.held.add(hit.key);
      send(hit.note, true);
    };
    this.up = (e) => {
      const hit = noteFor(e);
      if (!hit || !this.held.delete(hit.key)) return;
      e.preventDefault();
      send(hit.note, false);
    };
    window.addEventListener("keydown", this.down);
    window.addEventListener("keyup", this.up);
  }

  stop() {
    if (this.down) window.removeEventListener("keydown", this.down);
    if (this.up) window.removeEventListener("keyup", this.up);
    this.down = null;
    this.up = null;
    this.held.clear();
    this.status = "idle";
  }
}
