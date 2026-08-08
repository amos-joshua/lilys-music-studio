export type SourceKind = "webmidi" | "bridge" | "websocket" | "keyboard";

export type SourceStatus = "idle" | "connecting" | "ready" | "unsupported" | "error";

export interface RawMessage {
  /** performance.now() at the moment the message reached us. */
  perfTime: number;
  kind: SourceKind;
  /** Device or channel label, best effort. */
  device: string;
  /** Decoded MIDI bytes, or null when the payload could not be understood. */
  bytes: number[] | null;
  /** Original payload, kept so the monitor can show unrecognised shapes. */
  raw?: unknown;
}

export interface NoteHit {
  perfTime: number;
  note: number;
  velocity: number;
  channel: number; // 0-based
  device: string;
  kind: SourceKind;
}

export interface MidiSource {
  kind: SourceKind;
  label: string;
  status: SourceStatus;
  detail: string;
  start(emit: (m: RawMessage) => void): Promise<void> | void;
  stop(): void;
}

export function decodeNote(m: RawMessage): NoteHit | null {
  const b = m.bytes;
  if (!b || b.length < 3) return null;
  const status = b[0];
  const type = status & 0xf0;
  const channel = status & 0x0f;
  if (type === 0x90 && b[2] > 0) {
    return { perfTime: m.perfTime, note: b[1], velocity: b[2], channel, device: m.device, kind: m.kind };
  }
  return null;
}

export function describe(bytes: number[] | null): string {
  if (!bytes || bytes.length === 0) return "—";
  const [status, d1 = 0, d2 = 0] = bytes;
  const ch = (status & 0x0f) + 1;
  switch (status & 0xf0) {
    case 0x80:
      return `note off  ch${ch}  n${d1}  v${d2}`;
    case 0x90:
      return d2 > 0 ? `note on   ch${ch}  n${d1}  v${d2}` : `note off  ch${ch}  n${d1}`;
    case 0xa0:
      return `aftertouch ch${ch} n${d1} ${d2}`;
    case 0xb0:
      return `cc        ch${ch}  #${d1}  ${d2}`;
    case 0xc0:
      return `program   ch${ch}  ${d1}`;
    case 0xe0:
      return `pitchbend ch${ch}  ${(d2 << 7) | d1}`;
    default:
      return bytes.map((x) => x.toString(16).padStart(2, "0")).join(" ");
  }
}
