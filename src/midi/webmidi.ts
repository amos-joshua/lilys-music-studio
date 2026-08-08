import type { MidiSource, RawMessage, SourceStatus } from "./types";

export class WebMidiSource implements MidiSource {
  kind = "webmidi" as const;
  label = "Web MIDI";
  status: SourceStatus = "idle";
  detail = "";
  private access: MIDIAccess | null = null;
  private emit: ((m: RawMessage) => void) | null = null;

  async start(emit: (m: RawMessage) => void) {
    this.emit = emit;
    if (!navigator.requestMIDIAccess) {
      this.status = "unsupported";
      this.detail = "navigator.requestMIDIAccess missing";
      return;
    }
    this.status = "connecting";
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
    } catch (err) {
      this.status = "error";
      this.detail = err instanceof Error ? err.message : String(err);
      return;
    }
    this.access.onstatechange = () => this.bind();
    this.bind();
  }

  private bind() {
    if (!this.access) return;
    const names: string[] = [];
    for (const input of this.access.inputs.values()) {
      names.push(input.name ?? input.id);
      input.onmidimessage = (e) => {
        if (!e.data) return;
        this.emit?.({
          perfTime: typeof e.timeStamp === "number" && e.timeStamp > 0 ? e.timeStamp : performance.now(),
          kind: "webmidi",
          device: input.name ?? input.id,
          bytes: Array.from(e.data),
        });
      };
    }
    this.status = "ready";
    this.detail = names.length ? names.join(", ") : "no inputs connected";
  }

  stop() {
    if (this.access) {
      for (const input of this.access.inputs.values()) input.onmidimessage = null;
      this.access.onstatechange = null;
    }
    this.access = null;
    this.status = "idle";
  }
}
