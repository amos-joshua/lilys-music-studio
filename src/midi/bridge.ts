import type { MidiSource, RawMessage, SourceStatus } from "./types";

/**
 * Catch-all listener for a native MIDI bridge whose calling convention we do
 * not know yet. It attaches to every plausible inbound channel and forwards
 * whatever arrives — decoded when the shape is recognised, raw otherwise, so
 * the MIDI monitor can show what the bridge actually sends.
 */

const GLOBAL_HOOKS = [
  "onMidiMessage",
  "onMIDIMessage",
  "receiveMidi",
  "receiveMIDI",
  "handleMidiMessage",
  "midiMessage",
  "onMidi",
  "onMIDI",
];

const CUSTOM_EVENTS = ["midi", "midimessage", "MIDIMessage", "midi-message"];

const BYTE_KEYS = ["data", "bytes", "midi", "message", "payload", "midiData"];

export function parseMidiPayload(input: unknown, depth = 0): number[] | null {
  if (input == null || depth > 3) return null;

  if (input instanceof Uint8Array || input instanceof Int8Array) return Array.from(input);
  if (input instanceof ArrayBuffer) return Array.from(new Uint8Array(input));

  if (Array.isArray(input)) {
    if (input.length >= 2 && input.every((n) => typeof n === "number" && n >= 0 && n <= 255)) {
      return input as number[];
    }
    return null;
  }

  if (typeof input === "string") {
    const s = input.trim();
    if (!s) return null;
    if (s.startsWith("{") || s.startsWith("[")) {
      try {
        return parseMidiPayload(JSON.parse(s), depth + 1);
      } catch {
        return null;
      }
    }
    // "90 3C 64", "153,38,100" or "903C64" — radix is ambiguous, so prefer
    // whichever reading yields a plausible status byte.
    const tokens = s.split(/[\s,;:]+/).filter(Boolean);
    if (tokens.length >= 2 && tokens.every((t) => /^(0x)?[0-9a-f]{1,3}$/i.test(t))) {
      const inRadix = (radix: number) => {
        if (radix === 10 && !tokens.every((t) => /^\d+$/.test(t))) return null;
        const nums = tokens.map((t) => parseInt(t.replace(/^0x/i, ""), radix));
        return nums.every((n) => Number.isFinite(n) && n >= 0 && n <= 255) ? nums : null;
      };
      const hex = inRadix(16);
      if (hex && hex[0] >= 0x80) return hex;
      const dec = inRadix(10);
      if (dec && dec[0] >= 0x80) return dec;
      return hex ?? dec;
    }
    if (/^[0-9a-f]{6,}$/i.test(s) && s.length % 2 === 0) {
      const nums: number[] = [];
      for (let i = 0; i < s.length; i += 2) nums.push(parseInt(s.slice(i, i + 2), 16));
      return nums;
    }
    return null;
  }

  if (typeof input === "object") {
    const obj = input as Record<string, unknown>;
    for (const key of BYTE_KEYS) {
      if (key in obj) {
        const parsed = parseMidiPayload(obj[key], depth + 1);
        if (parsed) return parsed;
      }
    }
    // { status, data1, data2 } or { note, velocity, channel, type }
    const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v !== "" && !isNaN(Number(v)) ? Number(v) : null);
    const note = num(obj.note ?? obj.noteNumber ?? obj.key ?? obj.data1);
    if (note !== null) {
      const vel = num(obj.velocity ?? obj.vel ?? obj.data2) ?? 100;
      const ch = num(obj.channel ?? obj.ch) ?? 1;
      const status = num(obj.status);
      const typeStr = String(obj.type ?? obj.event ?? "").toLowerCase();
      const isOff = typeStr.includes("off") || vel === 0;
      const chan = Math.max(0, Math.min(15, ch > 0 ? ch - 1 : 0));
      return [status ?? ((isOff ? 0x80 : 0x90) | chan), note & 0x7f, vel & 0x7f];
    }
    return null;
  }

  return null;
}

/** Drop any framing bytes ahead of the first status byte. */
function toMidi(bytes: number[] | null): number[] | null {
  if (!bytes) return null;
  const start = bytes.findIndex((b) => b >= 0x80);
  if (start < 0) return null;
  const sliced = bytes.slice(start);
  return sliced.length >= 2 ? sliced : null;
}

export class BridgeSource implements MidiSource {
  kind = "bridge" as const;
  label = "Native bridge";
  status: SourceStatus = "idle";
  detail = "listening for postMessage / global callbacks";
  private emit: ((m: RawMessage) => void) | null = null;
  private detach: (() => void)[] = [];
  private seen = new Set<string>();

  start(emit: (m: RawMessage) => void) {
    this.emit = emit;
    this.status = "ready";

    const onWindowMessage = (e: MessageEvent) => this.ingest(e.data, "postMessage");
    window.addEventListener("message", onWindowMessage);
    this.detach.push(() => window.removeEventListener("message", onWindowMessage));

    for (const name of GLOBAL_HOOKS) {
      const fn = (...args: unknown[]) => this.ingest(args.length > 1 ? args : args[0], `window.${name}`);
      (window as unknown as Record<string, unknown>)[name] = fn;
      this.detach.push(() => {
        delete (window as unknown as Record<string, unknown>)[name];
      });
    }

    // window.__midiBridge.onMessage(...) style
    const container = { onMessage: (p: unknown) => this.ingest(p, "__midiBridge") };
    (window as unknown as Record<string, unknown>).__midiBridge = container;
    (window as unknown as Record<string, unknown>).midiBridge = container;
    this.detach.push(() => {
      delete (window as unknown as Record<string, unknown>).__midiBridge;
      delete (window as unknown as Record<string, unknown>).midiBridge;
    });

    for (const name of CUSTOM_EVENTS) {
      const handler = (e: Event) => this.ingest((e as CustomEvent).detail ?? e, `event:${name}`);
      window.addEventListener(name, handler);
      document.addEventListener(name, handler);
      this.detach.push(() => {
        window.removeEventListener(name, handler);
        document.removeEventListener(name, handler);
      });
    }
  }

  private ingest(payload: unknown, via: string) {
    const perfTime = performance.now();
    // Anything that is not recognisable MIDI is still surfaced to the monitor,
    // so an unknown bridge convention is visible rather than silently dropped.
    const bytes = toMidi(parseMidiPayload(payload));
    if (!bytes && this.isNoise(payload)) return;
    if (bytes && !this.seen.has(via)) {
      this.seen.add(via);
      this.detail = `via ${Array.from(this.seen).join(", ")}`;
    }
    this.emit?.({ perfTime, kind: "bridge", device: via, bytes, raw: bytes ? undefined : payload });
  }

  /** React DevTools / Vite HMR chatter should not fill the monitor. */
  private isNoise(payload: unknown): boolean {
    if (typeof payload !== "object" || payload === null) return typeof payload !== "string";
    const src = (payload as { source?: unknown }).source;
    if (typeof src === "string" && (src.startsWith("react-devtools") || src.startsWith("vite"))) return true;
    const type = (payload as { type?: unknown }).type;
    return typeof type === "string" && (type.startsWith("webpack") || type.startsWith("vite"));
  }

  stop() {
    this.detach.forEach((fn) => fn());
    this.detach = [];
    this.status = "idle";
  }
}

export class WebSocketSource implements MidiSource {
  kind = "websocket" as const;
  label = "WebSocket bridge";
  status: SourceStatus = "idle";
  detail = "";
  private ws: WebSocket | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private url: string;

  constructor(url: string) {
    this.url = url;
  }

  start(emit: (m: RawMessage) => void) {
    if (!this.url) {
      this.status = "idle";
      return;
    }
    const connect = () => {
      this.status = "connecting";
      this.detail = this.url;
      try {
        this.ws = new WebSocket(this.url);
      } catch (err) {
        this.status = "error";
        this.detail = err instanceof Error ? err.message : String(err);
        return;
      }
      this.ws.binaryType = "arraybuffer";
      this.ws.onopen = () => {
        this.status = "ready";
        this.detail = `connected ${this.url}`;
      };
      this.ws.onerror = () => {
        this.status = "error";
        this.detail = `cannot reach ${this.url}`;
      };
      this.ws.onclose = () => {
        if (this.status !== "idle") this.retry = setTimeout(connect, 2000);
      };
      this.ws.onmessage = (e) => {
        const bytes = toMidi(parseMidiPayload(e.data));
        emit({ perfTime: performance.now(), kind: "websocket", device: "ws", bytes, raw: bytes ? undefined : e.data });
      };
    };
    connect();
  }

  stop() {
    this.status = "idle";
    if (this.retry) clearTimeout(this.retry);
    this.ws?.close();
    this.ws = null;
  }
}
