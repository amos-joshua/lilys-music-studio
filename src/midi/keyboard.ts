import type { MidiSource, RawMessage, SourceStatus } from "./types";

/** Desktop fallback so the games are playable and testable without hardware. */
export class KeyboardSource implements MidiSource {
  kind = "keyboard" as const;
  label = "Keyboard";
  status: SourceStatus = "ready";
  detail = "space / F / J = pad";
  private handler: ((e: KeyboardEvent) => void) | null = null;

  start(emit: (m: RawMessage) => void) {
    this.handler = (e) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      const key = e.key.toLowerCase();
      if (key !== " " && key !== "f" && key !== "j") return;
      e.preventDefault();
      const note = key === "f" ? 38 : key === "j" ? 42 : 36;
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
