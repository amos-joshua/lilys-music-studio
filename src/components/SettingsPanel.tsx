import { ANIMALS, TREAT_SETS } from "../config/theme";
import {
  DEFAULT_SETTINGS,
  HILL_BRAKE_MAX,
  HILL_BRAKE_MIN,
  SURPRISE,
  hillPaceWord,
  tempoWord,
} from "../config/settings";
import type { Settings } from "../config/settings";
import { Slider } from "./Slider";
import { FREE_PLAY, MELODIES } from "../config/melodies";

interface Props {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onClose: () => void;
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="field toggle">
      <span>{label}</span>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function SettingsPanel({ settings, onChange, onClose }: Props) {
  return (
    <div className="sheet" onPointerDown={(e) => e.stopPropagation()}>
      <header>
        <h2>Settings</h2>
        <button className="ghost" onClick={onClose}>
          Close
        </button>
      </header>

      <h3>Feel</h3>
      <Slider
        label="Tempo"
        value={settings.bpm}
        min={40}
        max={150}
        suffix=" bpm"
        note={tempoWord(settings.bpm)}
        onChange={(v) => onChange({ bpm: v })}
      />
      <Slider
        label="How forgiving"
        value={settings.hitWindowMs}
        min={100}
        max={450}
        step={10}
        suffix=" ms"
        onChange={(v) => onChange({ hitWindowMs: v })}
      />
      <Slider
        label="Treats per round"
        value={settings.treatCount}
        min={8}
        max={64}
        step={4}
        onChange={(v) => onChange({ treatCount: v })}
      />
      <Slider
        label="Count-in"
        value={settings.countInBeats}
        min={0}
        max={8}
        suffix=" beats"
        onChange={(v) => onChange({ countInBeats: v })}
      />
      <Slider
        label="Look-ahead"
        value={settings.approachBeats}
        min={2}
        max={8}
        suffix=" beats"
        onChange={(v) => onChange({ approachBeats: v })}
      />
      <Toggle label="Harder hit = higher jump" value={settings.velocityJump} onChange={(v) => onChange({ velocityJump: v })} />
      <Toggle label="Speed up on a hot streak" value={settings.tempoRamp} onChange={(v) => onChange({ tempoRamp: v })} />

      <h3>Hill Climb</h3>
      <Slider
        label="How hard"
        value={Math.round(settings.hillBrake * 100)}
        min={HILL_BRAKE_MIN * 100}
        max={HILL_BRAKE_MAX * 100}
        step={2}
        valueLabel={hillPaceWord(settings.hillBrake)}
        onChange={(v) => onChange({ hillBrake: v / 100 })}
      />
      <p className="hint">How quickly upward motion dies away when the drumming stops.</p>

      <h3>Note Muncher</h3>
      <label className="field">
        <span>Tune</span>
        <select value={settings.melodyId} onChange={(e) => onChange({ melodyId: e.target.value })}>
          {MELODIES.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
          <option value={FREE_PLAY}>Free play</option>
        </select>
      </label>
      <Toggle
        label="Any octave counts"
        value={settings.staffAnyOctave}
        onChange={(v) => onChange({ staffAnyOctave: v })}
      />

      <h3>Sound</h3>
      <Toggle label="Sound effects" value={settings.sound} onChange={(v) => onChange({ sound: v })} />
      <Toggle label="Metronome click" value={settings.metronome} onChange={(v) => onChange({ metronome: v })} />
      <Toggle label={'Shout "hey!" every 4th hit'} value={settings.heyBeat} onChange={(v) => onChange({ heyBeat: v })} />
      <p className="hint">Drum Jump. Counts hits, caught or not; a long pause restarts the count.</p>

      <h3>Timing</h3>
      <Slider
        label="Latency offset"
        value={settings.latencyOffsetMs}
        min={-180}
        max={180}
        step={5}
        suffix=" ms"
        onChange={(v) => onChange({ latencyOffsetMs: v })}
      />
      <Toggle
        label="Adjust automatically while playing"
        value={settings.autoCalibrate}
        onChange={(v) => onChange({ autoCalibrate: v })}
      />
      <p className="hint">Positive offset compensates for hitting late — the game nudges this on its own once it has seen a few hits.</p>

      <h3>Look</h3>
      <label className="field">
        <span>Animal</span>
        <select value={settings.animalId} onChange={(e) => onChange({ animalId: e.target.value })}>
          <option value={SURPRISE}>Surprise me</option>
          {ANIMALS.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Treats</span>
        <select value={settings.treatSetId} onChange={(e) => onChange({ treatSetId: e.target.value })}>
          <option value={SURPRISE}>Surprise me</option>
          {TREAT_SETS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <p className="hint">Surprise me draws a new one each round, from a different sprite every time.</p>

      <h3>Input</h3>
      <Toggle
        label="Accept any note from any device"
        value={settings.acceptAnyNote}
        onChange={(v) => onChange({ acceptAnyNote: v })}
      />
      {!settings.acceptAnyNote && (
        <Toggle
          label="Drum channel (10) only"
          value={settings.drumChannelOnly}
          onChange={(v) => onChange({ drumChannelOnly: v })}
        />
      )}
      <label className="field">
        <span>WebSocket bridge URL</span>
        <input
          type="text"
          placeholder="ws://localhost:8080"
          value={settings.bridgeWsUrl}
          onChange={(e) => onChange({ bridgeWsUrl: e.target.value })}
        />
      </label>
      <p className="hint">Leave empty unless the iPad bridge exposes MIDI over a socket.</p>

      <button className="ghost danger" onClick={() => onChange(DEFAULT_SETTINGS)}>
        Reset to defaults
      </button>
    </div>
  );
}
