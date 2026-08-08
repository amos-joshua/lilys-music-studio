// Minimal Web MIDI typings (not in lib.dom.d.ts).
interface MIDIMessageEvent extends Event {
  readonly data: Uint8Array | null;
  readonly receivedTime?: number;
}

interface MIDIPort extends EventTarget {
  readonly id: string;
  readonly name: string | null;
  readonly manufacturer: string | null;
  readonly state: "connected" | "disconnected";
  readonly connection: "open" | "closed" | "pending";
  open(): Promise<MIDIPort>;
}

interface MIDIInput extends MIDIPort {
  onmidimessage: ((e: MIDIMessageEvent) => void) | null;
}

interface MIDIAccess extends EventTarget {
  readonly inputs: Map<string, MIDIInput>;
  onstatechange: ((e: Event) => void) | null;
}

interface Navigator {
  requestMIDIAccess?: (options?: { sysex?: boolean }) => Promise<MIDIAccess>;
}

interface Window {
  webkit?: { messageHandlers?: Record<string, { postMessage: (msg: unknown) => void }> };
  [key: string]: unknown;
}
