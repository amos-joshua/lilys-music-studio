import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { audio } from "../audio/AudioEngine";
import { ANIMALS, ICONS, NOTE_COLORS } from "../config/theme";
import { FREE_PLAY, MELODIES, melodyById, phraseEnds } from "../config/melodies";
import type { Step } from "../config/melodies";
import {
  STAFF_ANIMAL_X,
  STAFF_BAR_GAP,
  STAFF_BASE,
  STAFF_BEAT_W,
  STAFF_EAT_MS,
  STAFF_MAX_HOLD_MS,
  STAFF_PLAY_X,
  STAFF_REPEAT_GUARD_MS,
  STAFF_SLIDE_MS,
  STAFF_STEP,
  barOpacity,
} from "../config/settings";
import type { Settings } from "../config/settings";
import {
  GUIDE_LINE,
  STAFF_LINES,
  freqFromMidi,
  letterOf,
  matches,
  midiFromName,
  staffStep,
} from "../game/staff";
import type { NoteHit } from "../midi/types";

type Phase = "ready" | "playing" | "done";

interface Spark {
  id: number;
  x: number;
  y: number;
}

interface FreeBar {
  id: number;
  midi: number;
}

interface Props {
  settings: Settings;
  onSettingsChange: (patch: Partial<Settings>) => void;
  subscribe: (fn: (hit: NoteHit) => void) => () => void;
  onExit: () => void;
}

export function NoteMuncher({ settings, onSettingsChange, subscribe, onExit }: Props) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [index, setIndex] = useState(0);
  const [listenIndex, setListenIndex] = useState(-1);
  const [animalStep, setAnimalStep] = useState(0);
  const [eating, setEating] = useState<{ i: number; note: number } | null>(null);
  const [shakes, setShakes] = useState(0);
  const [sparks, setSparks] = useState<Spark[]>([]);
  const [freeBars, setFreeBars] = useState<FreeBar[]>([]);
  const [size, setSize] = useState({ w: 1, h: 1 });

  const arenaRef = useRef<HTMLDivElement>(null);
  const indexRef = useRef(0);
  const phaseRef = useRef<Phase>("ready");
  const listeningRef = useRef(false);
  const lastHit = useRef({ note: -1, t: 0 });
  const eatingRef = useRef<{ i: number; note: number } | null>(null);
  const sparkId = useRef(0);
  const freeId = useRef(0);
  const listenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settingsRef = useRef(settings);

  settingsRef.current = settings;
  indexRef.current = index;
  phaseRef.current = phase;
  eatingRef.current = eating;

  const melody = useMemo(() => melodyById(settings.melodyId), [settings.melodyId]);
  const isFree = settings.melodyId === FREE_PLAY;
  const steps: Step[] = useMemo(() => melody?.steps ?? [], [melody]);
  const ends = useMemo(() => (melody ? phraseEnds(melody) : new Set<number>()), [melody]);
  const animal = useMemo(
    () => ANIMALS.find((a) => a.id === settings.animalId) ?? ANIMALS[0],
    [settings.animalId]
  );

  const measure = useCallback(() => {
    const el = arenaRef.current;
    if (el) setSize({ w: el.clientWidth, h: el.clientHeight });
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  useEffect(() => {
    audio.muted = !settings.sound;
  }, [settings.sound]);

  const yFor = useCallback(
    (step: number) => (1 - (STAFF_BASE + step * STAFF_STEP)) * size.h,
    [size.h]
  );
  const barH = STAFF_STEP * 1.55 * size.h;
  const playX = STAFF_PLAY_X * size.w;

  /** Left edge and width of every bar, laid end to end. */
  const layout = useMemo(() => {
    const unit = size.w * STAFF_BEAT_W;
    const gap = size.w * STAFF_BAR_GAP;
    const xs: number[] = [];
    const widths: number[] = [];
    let x = 0;
    for (const s of steps) {
      xs.push(x);
      widths.push(s.beats * unit);
      x += s.beats * unit + gap;
    }
    return { xs, widths, total: x };
  }, [steps, size.w]);

  const active = listenIndex >= 0 ? listenIndex : index;
  const offset = playX - (layout.xs[active] ?? layout.total);

  const addSpark = useCallback((x: number, y: number) => {
    const id = sparkId.current++;
    setSparks((prev) => [...prev, { id, x, y }]);
    setTimeout(() => setSparks((prev) => prev.filter((s) => s.id !== id)), 700);
  }, []);

  const stopListening = useCallback(() => {
    if (listenTimer.current) clearTimeout(listenTimer.current);
    listenTimer.current = null;
    listeningRef.current = false;
    setListenIndex(-1);
  }, []);

  const listen = useCallback(() => {
    audio.resume();
    stopListening();
    listeningRef.current = true;
    let i = 0;
    const tick = () => {
      if (i >= steps.length) {
        stopListening();
        return;
      }
      const s = steps[i];
      setListenIndex(i);
      if (s.note) {
        const midi = midiFromName(s.note);
        audio.piano(audio.now + 0.005, freqFromMidi(midi), 88);
        setAnimalStep(staffStep(midi));
      }
      const ms = s.beats * 520;
      i++;
      listenTimer.current = setTimeout(tick, ms);
    };
    tick();
  }, [steps, stopListening]);

  useEffect(() => stopListening, [stopListening]);

  const start = useCallback(() => {
    audio.resume();
    audio.muted = !settingsRef.current.sound;
    stopListening();
    setIndex(0);
    setSparks([]);
    setFreeBars([]);
    setAnimalStep(0);
    eatingRef.current = null;
    setEating(null);
    setPhase("playing");
  }, [stopListening]);

  /** Release finishes the mouthful: the bar goes, the strip brings up the next. */
  const finishEat = useCallback(() => {
    const e = eatingRef.current;
    if (!e) return;
    eatingRef.current = null;
    setEating(null);
    if (ends.has(e.i)) audio.chomp(audio.now + 0.02, true);
    setIndex(e.i + 1);
    if (e.i + 1 >= steps.length) {
      setPhase("done");
      setTimeout(() => audio.fanfare(), STAFF_SLIDE_MS);
    }
  }, [ends, steps.length]);

  const onHit = useCallback(
    (hit: NoteHit) => {
      const s = settingsRef.current;
      if (!s.acceptAnyNote && s.drumChannelOnly && hit.channel !== 9) return;

      if (!hit.on) {
        if (eatingRef.current?.note === hit.note) finishEat();
        return;
      }

      if (phaseRef.current === "ready") {
        start();
        return;
      }

      const midi = hit.note;
      const now = performance.now();
      if (lastHit.current.note === midi && now - lastHit.current.t < STAFF_REPEAT_GUARD_MS) return;
      lastHit.current = { note: midi, t: now };

      // The pressed note always sounds, right or wrong — it is a piano.
      audio.piano(audio.now + 0.005, freqFromMidi(midi), hit.velocity);
      setAnimalStep(staffStep(midi));

      if (isFree) {
        const id = freeId.current++;
        setFreeBars((prev) => [...prev, { id, midi }]);
        setTimeout(() => setFreeBars((prev) => prev.filter((b) => b.id !== id)), 5000);
        return;
      }

      // While a bar is being eaten, stray presses are ignored rather than scolded.
      if (phaseRef.current !== "playing" || listeningRef.current || eatingRef.current) return;

      const i = indexRef.current;
      const target = steps[i];
      if (!target?.note) return;

      if (matches(midi, midiFromName(target.note), s.staffAnyOctave)) {
        // The bar is not consumed yet — it slides under the animal and sparks
        // for as long as the note is held, then vanishes on release. The ref is
        // set here too, so a very short tap cannot release before the re-render.
        eatingRef.current = { i, note: midi };
        setEating({ i, note: midi });
      } else {
        setShakes((n) => n + 1);
        audio.buzz(audio.now + 0.03);
      }
    },
    [start, isFree, steps, finishEat]
  );

  useEffect(() => subscribe(onHit), [subscribe, onHit]);

  // Sparks for as long as the note is held.
  useEffect(() => {
    if (!eating) return;
    const note = steps[eating.i]?.note;
    if (!note) return;
    const y = yFor(staffStep(midiFromName(note)));
    const x = STAFF_ANIMAL_X * size.w;
    const spark = () =>
      addSpark(x + (Math.random() - 0.5) * 0.07 * size.w, y + (Math.random() - 0.5) * barH);
    spark();
    const id = setInterval(spark, 130);
    return () => clearInterval(id);
  }, [eating, steps, yFor, size.w, barH, addSpark]);

  // Some controllers never send note-off; do not let a bar hang forever.
  useEffect(() => {
    if (!eating) return;
    const t = setTimeout(finishEat, STAFF_MAX_HOLD_MS);
    return () => clearTimeout(t);
  }, [eating, finishEat]);

  // Rests advance on their own.
  useEffect(() => {
    if (phase !== "playing" || isFree) return;
    const step = steps[index];
    if (!step || step.note !== null) return;
    const t = setTimeout(() => setIndex((i) => i + 1), step.beats * 420);
    return () => clearTimeout(t);
  }, [phase, index, steps, isFree]);

  const lineY = (step: number) => yFor(step);
  const total = steps.length;

  return (
    <div className="game">
      <div className="hud">
        <button className="ghost" onClick={onExit}>
          ← Modes
        </button>
        <span className="tuneName">{isFree ? "Free play" : (melody?.name ?? "")}</span>
        {!isFree && phase !== "ready" && (
          <button className="ghost" onClick={listen} disabled={listenIndex >= 0}>
            ♪ Listen
          </button>
        )}
        <div className="spacer" />
        {!isFree && (
          <div className="stat">
            <img src={ICONS.star} alt="" />
            {Math.min(index, total)} / {total}
          </div>
        )}
      </div>

      <div className="arena staffArena" ref={arenaRef}>
        {STAFF_LINES.map((s) => (
          <div key={s} className="staffLine" style={{ top: lineY(s) }} />
        ))}
        <div className="staffLine guide" style={{ top: lineY(GUIDE_LINE) }} />
        <div className="playLine" style={{ left: playX }} />

        {!isFree && (
          <div
            className="strip"
            style={{
              transform: `translate3d(${offset}px, 0, 0)`,
              transition: `transform ${STAFF_SLIDE_MS}ms cubic-bezier(0.22, 0.7, 0.3, 1)`,
            }}
          >
            {steps.map((s, i) => {
              // Eaten bars are gone entirely — a played trail is just clutter.
              if (!s.note || i < index) return null;
              const isEating = eating?.i === i;
              const ahead = i - active;
              return (
                <div
                  key={i}
                  className={
                    "bar" +
                    (isEating ? " eating" : "") +
                    (i === listenIndex ? " listening" : "") +
                    (i === index && listenIndex < 0 && !isEating ? " next" : "")
                  }
                  style={{
                    left: layout.xs[i],
                    width: layout.widths[i],
                    height: barH,
                    top: yFor(staffStep(midiFromName(s.note))) - barH / 2,
                    background: NOTE_COLORS[letterOf(midiFromName(s.note))],
                    opacity: isEating ? 1 : barOpacity(ahead),
                    transform: isEating ? `translate3d(${STAFF_ANIMAL_X * size.w - playX}px, 0, 0)` : undefined,
                    transition: `opacity 320ms ease, transform ${STAFF_EAT_MS}ms ease-out`,
                  }}
                />
              );
            })}
          </div>
        )}

        {isFree &&
          freeBars.map((b) => (
            <div
              key={b.id}
              className="bar freeBar"
              style={{
                left: playX,
                width: size.w * STAFF_BEAT_W,
                height: barH,
                top: yFor(staffStep(b.midi)) - barH / 2,
                background: NOTE_COLORS[letterOf(b.midi)] ?? "#8899bb",
              }}
            />
          ))}

        {sparks.map((s) => (
          <div key={s.id} className="burst perfect" style={{ transform: `translate3d(${s.x}px, ${s.y}px, 0)` }}>
            <img src={ICONS.sparkles} alt="" />
          </div>
        ))}

        {/* The container keeps its position transition; the img remounts to replay the shake. */}
        <div
          className="muncher"
          style={{ transform: `translate3d(${STAFF_ANIMAL_X * size.w}px, ${yFor(animalStep)}px, 0)` }}
        >
          <img
            key={shakes}
            className={shakes > 0 ? "shake" : ""}
            src={animal.url}
            alt={animal.name}
            draggable={false}
          />
        </div>

        {phase === "ready" && (
          <div className="overlay setup">
            <h2>Play the colours to feed the lion</h2>
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
            <div className="row">
              <button className="big" onClick={start}>
                Start
              </button>
              {!isFree && (
                <button className="big alt2" onClick={listen}>
                  ♪ Listen first
                </button>
              )}
            </div>
            <p className="hint">Any octave counts. Wrong notes cost nothing — the bar just waits.</p>
          </div>
        )}

        {phase === "done" && (
          <div className="overlay">
            <img className="trophy" src={ICONS.trophy} alt="" />
            <h2>{melody?.name} — all done!</h2>
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
