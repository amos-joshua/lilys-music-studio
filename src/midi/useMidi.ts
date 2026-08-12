import { useCallback, useEffect, useRef, useState } from "react";
import { BridgeSource, WebSocketSource } from "./bridge";
import { KeyboardSource } from "./keyboard";
import { WebMidiSource } from "./webmidi";
import { decodeNote } from "./types";
import type { MidiSource, NoteHit, RawMessage } from "./types";

const LOG_LIMIT = 60;

export interface LogEntry extends RawMessage {
  seq: number;
}

export interface SourceInfo {
  kind: string;
  label: string;
  status: string;
  detail: string;
}

export function useMidi(wsUrl: string) {
  const [log, setLog] = useState<LogEntry[]>([]);
  const [sources, setSources] = useState<SourceInfo[]>([]);
  const [lastHit, setLastHit] = useState<NoteHit | null>(null);
  const listeners = useRef(new Set<(hit: NoteHit) => void>());
  const seq = useRef(0);
  const instances = useRef<MidiSource[]>([]);

  const emitHit = useCallback((hit: NoteHit) => {
    setLastHit(hit);
    listeners.current.forEach((fn) => fn(hit));
  }, []);

  useEffect(() => {
    const list: MidiSource[] = [
      new WebMidiSource(),
      new BridgeSource(),
      new KeyboardSource(),
      ...(wsUrl ? [new WebSocketSource(wsUrl)] : []),
    ];
    instances.current = list;

    const onMessage = (m: RawMessage) => {
      setLog((prev) => [{ ...m, seq: seq.current++ }, ...prev].slice(0, LOG_LIMIT));
      const hit = decodeNote(m);
      if (hit) emitHit(hit);
    };

    list.forEach((s) => void s.start(onMessage));

    const poll = setInterval(() => {
      setSources(list.map((s) => ({ kind: s.kind, label: s.label, status: s.status, detail: s.detail })));
    }, 500);

    return () => {
      clearInterval(poll);
      list.forEach((s) => s.stop());
    };
  }, [wsUrl, emitHit]);

  const subscribe = useCallback((fn: (hit: NoteHit) => void) => {
    listeners.current.add(fn);
    return () => listeners.current.delete(fn);
  }, []);

  /** For screen taps — routed through the same path as real MIDI, strike then release. */
  const injectHit = useCallback(
    (velocity = 100) => {
      const base = { note: 36, channel: 9, device: "touch", kind: "keyboard" as const };
      emitHit({ ...base, perfTime: performance.now(), velocity, on: true });
      setTimeout(() => emitHit({ ...base, perfTime: performance.now(), velocity: 0, on: false }), 120);
    },
    [emitHit]
  );

  const clearLog = useCallback(() => setLog([]), []);

  return { log, sources, lastHit, subscribe, injectHit, clearLog };
}
