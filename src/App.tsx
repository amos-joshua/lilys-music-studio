import { useCallback, useState } from "react";
import { DrumJump } from "./games/DrumJump";
import { HillClimb } from "./games/HillClimb";
import { SettingsPanel } from "./components/SettingsPanel";
import { MidiMonitor } from "./components/MidiMonitor";
import { useMidi } from "./midi/useMidi";
import { useStoredState } from "./hooks/useStoredState";
import { DEFAULT_SETTINGS } from "./config/settings";
import type { Settings } from "./config/settings";
import { ICONS } from "./config/theme";
import "./App.css";

type Mode = "home" | "drum" | "hill";

const MODES = [
  {
    id: "drum" as const,
    name: "Drum Jump",
    blurb: "Keep the beat and the lion leaps for the fruit.",
    icon: ICONS.drum,
    ready: true,
  },
  {
    id: "hill" as const,
    name: "Hill Climb",
    blurb: "Drum fast to climb the hill. Stop and you slide back down.",
    icon: ICONS.icecream,
    ready: true,
  },
  {
    id: "piano" as const,
    name: "Piano Falls",
    blurb: "Coloured notes drift down to your sticker keys.",
    icon: ICONS.piano,
    ready: false,
  },
];

export default function App() {
  // Key is versioned: bump it when a default changes that a stored value would mask.
  const [settings, setSettings] = useStoredState<Settings>("lms-settings-v2", DEFAULT_SETTINGS);
  const [mode, setMode] = useState<Mode>("home");
  const [sheet, setSheet] = useState<"none" | "settings" | "monitor">("none");
  const { log, sources, lastHit, subscribe, injectHit, clearLog } = useMidi(settings.bridgeWsUrl);

  const patch = useCallback(
    (p: Partial<Settings>) => setSettings((prev) => ({ ...prev, ...p })),
    [setSettings]
  );

  const live = sources.filter((s) => s.status === "ready" && s.kind !== "keyboard");
  const midiLabel = lastHit
    ? lastHit.device
    : live.length
      ? live.map((s) => s.label).join(" · ")
      : "no MIDI yet";

  return (
    <div className="app">
      <header className="topbar">
        <h1>Lily&apos;s Music Studio</h1>
        <div className="spacer" />
        <button className="pill" onClick={() => setSheet(sheet === "monitor" ? "none" : "monitor")}>
          <span className={"dot" + (lastHit ? " live" : "")} />
          {midiLabel}
        </button>
        <button className="pill" onClick={() => setSheet(sheet === "settings" ? "none" : "settings")}>
          Settings
        </button>
        <button
          className="pill"
          onClick={() => {
            if (document.fullscreenElement) void document.exitFullscreen();
            else void document.documentElement.requestFullscreen?.();
          }}
        >
          Full screen
        </button>
      </header>

      <main>
        {mode === "home" && (
          <div className="picker">
            {MODES.map((m) => (
              <button
                key={m.id}
                className={"card" + (m.ready ? "" : " soon")}
                disabled={!m.ready}
                onClick={() => {
                  if (m.id === "drum" || m.id === "hill") setMode(m.id);
                }}
              >
                <img src={m.icon} alt="" />
                <h2>{m.name}</h2>
                <p>{m.blurb}</p>
                {!m.ready && <span className="badge">soon</span>}
              </button>
            ))}
          </div>
        )}

        {mode === "drum" && (
          <DrumJump
            settings={settings}
            onSettingsChange={patch}
            subscribe={subscribe}
            injectHit={injectHit}
            onExit={() => setMode("home")}
          />
        )}

        {mode === "hill" && (
          <HillClimb
            settings={settings}
            onSettingsChange={patch}
            subscribe={subscribe}
            injectHit={injectHit}
            onExit={() => setMode("home")}
          />
        )}
      </main>

      {sheet !== "none" && (
        <div className="scrim" onPointerDown={() => setSheet("none")}>
          {sheet === "settings" && (
            <SettingsPanel settings={settings} onChange={patch} onClose={() => setSheet("none")} />
          )}
          {sheet === "monitor" && (
            <MidiMonitor sources={sources} log={log} onClear={clearLog} onClose={() => setSheet("none")} />
          )}
        </div>
      )}
    </div>
  );
}
