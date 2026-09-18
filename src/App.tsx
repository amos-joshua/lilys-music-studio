import { useCallback, useState } from "react";
import { DrumJump } from "./games/DrumJump";
import { HillClimb } from "./games/HillClimb";
import { NoteMuncher } from "./games/NoteMuncher";
import { BoatTrip } from "./games/BoatTrip";
import { PianoBug } from "./games/PianoBug";
import { BugHop } from "./games/BugHop";
import { Seagull } from "./games/Seagull";
import { SettingsPanel } from "./components/SettingsPanel";
import { MidiMonitor } from "./components/MidiMonitor";
import { useMidi } from "./midi/useMidi";
import { useStoredState } from "./hooks/useStoredState";
import { DEFAULT_SETTINGS } from "./config/settings";
import type { Settings } from "./config/settings";
import { ICONS } from "./config/theme";
import "./App.css";

type Mode = "home" | "drum" | "hill" | "staff" | "boat" | "pianobug" | "bughop" | "gull";

/** Mixed mode plays these in turn, starting from whichever was opened. */
const MIX_CYCLE: Mode[] = ["boat", "drum", "hill"];

const MODES = [
  {
    id: "drum" as const,
    name: "Drum Jump",
    blurb: "Keep the beat and the animal leaps for the fruit.",
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
    id: "bughop" as const,
    name: "Bug Hop",
    blurb: "Left, right, left, right — keep an even beat and the bug throws things.",
    icon: ICONS.lilypad,
    ready: true,
  },
  {
    id: "gull" as const,
    name: "Seagull",
    blurb: "Drum faster to fly higher. Follow the fruit, mind the thorns.",
    icon: ICONS.gull,
    ready: true,
  },
  {
    id: "boat" as const,
    name: "Boat Trip",
    blurb: "Paddle left and right to steer the boat to the fruit.",
    icon: ICONS.boat,
    ready: true,
  },
  {
    id: "pianobug" as const,
    name: "Piano Bug",
    blurb: "A bug dances on the next key. Play it and squash it.",
    icon: ICONS.bug,
    ready: true,
  },
  {
    id: "staff" as const,
    name: "Note Muncher",
    blurb: "Coloured bars drift along a staff. Play them and the animal eats them.",
    icon: ICONS.piano,
    ready: true,
  },
];

export default function App() {
  // Key is versioned: bump it when a default changes that a stored value would mask.
  const [settings, setSettings] = useStoredState<Settings>("lms-settings-v3", DEFAULT_SETTINGS);
  // ?mode=boat opens straight into a mode — handy for bookmarking on the iPad.
  const [mode, setMode] = useState<Mode>(() => {
    const m = new URLSearchParams(window.location.search).get("mode");
    return MODES.some((x) => x.id === m && x.ready) ? (m as Mode) : "home";
  });
  const [sheet, setSheet] = useState<"none" | "settings" | "monitor">("none");
  const { log, sources, lastHit, subscribe, injectHit, clearLog } = useMidi(settings.bridgeWsUrl, settings.micInput);

  const advance = useCallback((from: Mode) => {
    const i = MIX_CYCLE.indexOf(from);
    setMode(MIX_CYCLE[(i + 1) % MIX_CYCLE.length]);
  }, []);

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
                onClick={() => setMode(m.id)}
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
            onFinish={settings.mixedMode ? () => advance("drum") : undefined}
            onExit={() => setMode("home")}
          />
        )}

        {mode === "boat" && (
          <BoatTrip
            settings={settings}
            onSettingsChange={patch}
            subscribe={subscribe}
            onFinish={settings.mixedMode ? () => advance("boat") : undefined}
            onExit={() => setMode("home")}
          />
        )}

        {mode === "gull" && (
          <Seagull
            settings={settings}
            onSettingsChange={patch}
            subscribe={subscribe}
            injectHit={injectHit}
            onExit={() => setMode("home")}
          />
        )}

        {mode === "bughop" && (
          <BugHop
            settings={settings}
            onSettingsChange={patch}
            subscribe={subscribe}
            injectHit={injectHit}
            onExit={() => setMode("home")}
          />
        )}

        {mode === "pianobug" && (
          <PianoBug
            settings={settings}
            onSettingsChange={patch}
            subscribe={subscribe}
            onExit={() => setMode("home")}
          />
        )}

        {mode === "staff" && (
          <NoteMuncher
            settings={settings}
            onSettingsChange={patch}
            subscribe={subscribe}
            onExit={() => setMode("home")}
          />
        )}

        {mode === "hill" && (
          <HillClimb
            settings={settings}
            onSettingsChange={patch}
            subscribe={subscribe}
            injectHit={injectHit}
            onFinish={settings.mixedMode ? () => advance("hill") : undefined}
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
