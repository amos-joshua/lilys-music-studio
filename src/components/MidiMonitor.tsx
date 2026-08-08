import { describe } from "../midi/types";
import type { LogEntry, SourceInfo } from "../midi/useMidi";

interface Props {
  sources: SourceInfo[];
  log: LogEntry[];
  onClear: () => void;
  onClose: () => void;
}

export function MidiMonitor({ sources, log, onClear, onClose }: Props) {
  return (
    <div className="sheet" onPointerDown={(e) => e.stopPropagation()}>
      <header>
        <h2>MIDI monitor</h2>
        <button className="ghost" onClick={onClose}>
          Close
        </button>
      </header>

      <div className="sources">
        {sources.map((s) => (
          <div key={s.kind} className={`source ${s.status}`}>
            <span className="dot" />
            <strong>{s.label}</strong>
            <span className="detail">{s.detail || s.status}</span>
          </div>
        ))}
      </div>

      <div className="logHead">
        <span>Last {log.length} messages</span>
        <button className="ghost" onClick={onClear}>
          Clear
        </button>
      </div>

      <div className="log">
        {log.length === 0 && <p className="hint">Nothing received yet. Hit a pad.</p>}
        {log.map((m) => (
          <div key={m.seq} className={"line" + (m.bytes ? "" : " unknown")}>
            <span className="src">{m.device}</span>
            <span className="msg">{m.bytes ? describe(m.bytes) : summarise(m.raw)}</span>
            <span className="hex">{m.bytes ? m.bytes.map((b) => b.toString(16).padStart(2, "0")).join(" ") : "unparsed"}</span>
          </div>
        ))}
      </div>

      <p className="hint">
        Unparsed lines show the raw payload the bridge sent — useful for teaching the adapter a new shape.
      </p>
    </div>
  );
}

function summarise(raw: unknown): string {
  if (raw === undefined) return "—";
  try {
    const s = typeof raw === "string" ? raw : JSON.stringify(raw);
    return s.length > 120 ? s.slice(0, 120) + "…" : s;
  } catch {
    return String(raw);
  }
}
