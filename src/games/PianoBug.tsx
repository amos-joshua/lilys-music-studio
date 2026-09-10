import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { audio } from "../audio/AudioEngine";
import { ICONS, NOTE_COLORS, rollAnimal } from "../config/theme";
import { FREE_PLAY, MELODIES, melodyById } from "../config/melodies";
import type { Step } from "../config/melodies";
import { Slider } from "../components/Slider";
import {
  BUG_SQUISH_MS,
  BUG_WRONG_MS,
  PIANO_LOW_MAX,
  PIANO_LOW_MIN,
  PIANO_OCT_MAX,
  PIANO_OCT_MIN,
  STICKER_HIGH_MIDI,
  STICKER_LOW_MIDI,
} from "../config/settings";
import type { Settings } from "../config/settings";
import { freqFromMidi, isSharp, letterOf, midiFromName, nameFromMidi } from "../game/staff";
import type { NoteHit } from "../midi/types";

type Phase = "ready" | "playing" | "done";

interface Key {
  midi: number;
  sharp: boolean;
  /** Fractions of the keyboard width. */
  left: number;
  width: number;
}

interface Props {
  settings: Settings;
  onSettingsChange: (patch: Partial<Settings>) => void;
  subscribe: (fn: (hit: NoteHit) => void) => () => void;
  onExit: () => void;
}

const BLACK_W = 0.62; // of a white key
const colorOf = (midi: number) => NOTE_COLORS[letterOf(midi)] ?? "#8899bb";

/** The nearest octave of `midi` that the drawn keyboard actually has. */
const fit = (midi: number, low: number, high: number) => {
  let m = midi;
  while (m < low) m += 12;
  while (m > high) m -= 12;
  return m;
};

export function PianoBug({ settings, onSettingsChange, subscribe, onExit }: Props) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [down, setDown] = useState<number[]>([]);
  const [squishing, setSquishing] = useState(false);
  const [wrong, setWrong] = useState(-1);
  const [freeTarget, setFreeTarget] = useState(-1);

  const phaseRef = useRef<Phase>("ready");
  const indexRef = useRef(0);
  const squishRef = useRef(false);
  const settingsRef = useRef(settings);
  const wrongTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Read inside the hit handler, which must not be rebuilt on every bug. */
  const targetRef = useRef(-1);

  settingsRef.current = settings;
  phaseRef.current = phase;
  indexRef.current = index;
  squishRef.current = squishing;

  const melody = useMemo(() => melodyById(settings.melodyId), [settings.melodyId]);
  const isFree = settings.melodyId === FREE_PLAY;
  const steps: Step[] = useMemo(() => melody?.steps ?? [], [melody]);
  const [animal] = useState(() => rollAnimal(settings.animalId));

  useEffect(() => {
    audio.muted = !settings.sound;
  }, [settings.sound]);

  const low = settings.pianoLowMidi;
  const high = low + settings.pianoOctaves * 12;

  /** White keys share the width evenly; black ones straddle the seam behind them. */
  const keys = useMemo(() => {
    const whites: number[] = [];
    for (let m = low; m <= high; m++) if (!isSharp(m)) whites.push(m);
    const w = 1 / whites.length;
    const out: Key[] = [];
    let seen = 0;
    for (let m = low; m <= high; m++) {
      if (isSharp(m)) {
        out.push({ midi: m, sharp: true, left: seen * w - (w * BLACK_W) / 2, width: w * BLACK_W });
      } else {
        out.push({ midi: m, sharp: false, left: seen * w, width: w });
        seen++;
      }
    }
    return out;
  }, [low, high]);

  const rollFree = useCallback(() => {
    setFreeTarget(keys[Math.floor(Math.random() * keys.length)].midi);
  }, [keys]);

  /** The key the bug is sitting on, or -1 once the tune is finished. Tunes are
   * played in the stickered octave when it is on screen, so the colours are
   * always there to go by. */
  const target = useMemo(() => {
    if (isFree) return freeTarget;
    const step = steps[index];
    if (!step?.note) return -1;
    const home = STICKER_LOW_MIDI >= low && STICKER_LOW_MIDI + 11 <= high ? STICKER_LOW_MIDI : low;
    return fit(fit(midiFromName(step.note), home, home + 11), low, high);
  }, [isFree, freeTarget, steps, index, low, high]);

  const bugKey = keys.find((k) => k.midi === target);

  targetRef.current = target;

  const notesTotal = useMemo(() => steps.filter((s) => s.note).length, [steps]);

  const start = useCallback(() => {
    audio.resume();
    audio.muted = !settingsRef.current.sound;
    setIndex(0);
    setScore(0);
    setDown([]);
    setWrong(-1);
    setSquishing(false);
    squishRef.current = false;
    if (settingsRef.current.melodyId === FREE_PLAY) rollFree();
    setPhase("playing");
  }, [rollFree]);

  /** Squashed: the splat plays, then the next bug takes its place. */
  const squish = useCallback(() => {
    setSquishing(true);
    squishRef.current = true;
    setScore((n) => n + 1);
    audio.chomp(audio.now + 0.02, true);
    setTimeout(() => {
      setSquishing(false);
      squishRef.current = false;
      if (settingsRef.current.melodyId === FREE_PLAY) {
        rollFree();
        return;
      }
      // Rests hold no bug, so step over them on the way to the next note.
      let next = indexRef.current + 1;
      while (next < steps.length && !steps[next].note) next++;
      setIndex(next);
      if (next >= steps.length) {
        setPhase("done");
        audio.fanfare();
      }
    }, BUG_SQUISH_MS);
  }, [rollFree, steps]);

  const onHit = useCallback(
    (hit: NoteHit) => {
      const s = settingsRef.current;
      if (!s.acceptAnyNote && s.drumChannelOnly && hit.channel !== 9) return;

      if (!hit.on) {
        setDown((prev) => prev.filter((m) => m !== hit.note));
        return;
      }
      setDown((prev) => (prev.includes(hit.note) ? prev : [...prev, hit.note]));

      if (phaseRef.current === "ready") {
        start();
        return;
      }
      // The pressed key always sounds, right or wrong — it is a piano.
      audio.piano(audio.now + 0.005, freqFromMidi(hit.note), hit.velocity);
      if (phaseRef.current !== "playing" || squishRef.current) return;

      if (hit.note === targetRef.current) {
        squish();
      } else {
        audio.buzz(audio.now + 0.03);
        setWrong(hit.note);
        if (wrongTimer.current) clearTimeout(wrongTimer.current);
        wrongTimer.current = setTimeout(() => setWrong(-1), BUG_WRONG_MS);
      }
    },
    [start, squish]
  );

  useEffect(() => subscribe(onHit), [subscribe, onHit]);
  useEffect(() => () => void (wrongTimer.current && clearTimeout(wrongTimer.current)), []);

  const rangeLabel = `${nameFromMidi(low)} – ${nameFromMidi(high)}`;

  return (
    <div className="game">
      <div className="hud">
        <button className="ghost" onClick={onExit}>
          ← Modes
        </button>
        <span className="tuneName">{isFree ? "Free play" : (melody?.name ?? "")}</span>
        <div className="spacer" />
        <div className="stat">
          <img src={ICONS.bug} alt="" />
          {isFree ? score : `${score} / ${notesTotal}`}
        </div>
      </div>

      <div className="arena bugArena">
        <div className="keyboard">
          <div className="keys">
            {keys.map((k) => {
              const isTarget = k.midi === target && phase === "playing";
              const lit = colorOf(k.midi);
              return (
                <div
                  key={k.midi}
                  className={
                    "pianoKey" +
                    (k.sharp ? " black" : " white") +
                    (down.includes(k.midi) ? " down" : "") +
                    (isTarget ? " lit" : "") +
                    (wrong === k.midi ? " wrong" : "")
                  }
                  style={{
                    left: `${k.left * 100}%`,
                    width: `${k.width * 100}%`,
                    ["--lit" as string]: lit,
                  }}
                >
                  {!k.sharp && k.midi >= STICKER_LOW_MIDI && k.midi <= STICKER_HIGH_MIDI && (
                    <span className="sticker" style={{ background: lit }} />
                  )}
                </div>
              );
            })}

            {/* One bug for the whole tune: it hops from key to key rather than
                blinking out and back in. The layer slides, the inner element
                arcs, and remounting on each target restarts the arc. */}
            {bugKey && phase === "playing" && (
              <div
                className="bugLayer"
                style={{
                  left: `${(bugKey.left + bugKey.width / 2) * 100}%`,
                  top: bugKey.sharp ? "46%" : "79%",
                  transform: bugKey.sharp ? "translateZ(3rem)" : "translateZ(0.1rem)",
                }}
              >
                <div className={"bugHop" + (squishing ? " squished" : "")} key={target}>
                  <span className="bugGlow" style={{ background: colorOf(target) }} />
                  <img
                    className={"bug" + (squishing ? " squished" : "")}
                    src={ICONS.bug}
                    alt=""
                    draggable={false}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {phase === "ready" && (
          <div className="overlay setup">
            <h2>Squash the bug on the glowing key</h2>
            <div className="tunes">
              {MELODIES.map((m) => (
                <button
                  key={m.id}
                  className={"chip" + (settings.melodyId === m.id ? " on" : "")}
                  onClick={() => onSettingsChange({ melodyId: m.id })}
                >
                  {m.name}
                </button>
              ))}
              <button
                className={"chip" + (isFree ? " on" : "")}
                onClick={() => onSettingsChange({ melodyId: FREE_PLAY })}
              >
                Free play
              </button>
            </div>

            <div className="setupBox">
              <Slider
                big
                label="Octaves"
                value={settings.pianoOctaves}
                min={PIANO_OCT_MIN}
                max={PIANO_OCT_MAX}
                onChange={(v) => onSettingsChange({ pianoOctaves: v })}
              />
              <button
                className="ghost"
                disabled={low <= PIANO_LOW_MIN}
                onClick={() => onSettingsChange({ pianoLowMidi: Math.max(PIANO_LOW_MIN, low - 12) })}
              >
                ◀ lower
              </button>
              <span className="rangeLabel">{rangeLabel}</span>
              <button
                className="ghost"
                disabled={low >= PIANO_LOW_MAX}
                onClick={() => onSettingsChange({ pianoLowMidi: Math.min(PIANO_LOW_MAX, low + 12) })}
              >
                higher ▶
              </button>
            </div>

            <button className="big" onClick={start}>
              Start
            </button>
            <p className="hint">
              The bug takes the colour of its key. Wrong notes cost nothing — the bug just waits.
            </p>
          </div>
        )}

        {phase === "done" && (
          <div className="overlay">
            <img className="trophy" src={ICONS.trophy} alt="" />
            <h2>{melody?.name} — every bug!</h2>
            <p className="hint">{animal.name} is impressed.</p>
            <div className="row">
              <button className="big" onClick={start}>
                Again
              </button>
              <button className="big alt2" onClick={() => setPhase("ready")}>
                Pick a tune
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
