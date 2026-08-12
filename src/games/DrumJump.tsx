import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { audio } from "../audio/AudioEngine";
import { BeatGrid } from "../game/BeatGrid";
import { ANIMALS, ICONS, TREAT_SETS } from "../config/theme";
import { Slider } from "../components/Slider";
import {
  CALIBRATE_MIN_SAMPLES,
  DOUBLE_HIT_MS,
  JUMP_RISE_S,
  JUMP_TOTAL_S,
  MAX_OFFSET_MS,
  PERFECT_FRACTION,
  tempoWord,
} from "../config/settings";
import type { Settings } from "../config/settings";
import type { NoteHit } from "../midi/types";

const LION_X = 0.2; // fraction of arena width
const CATCH_X = 0.26;
const SPAWN_X = 1.08;
const TREAT_Y = 0.5; // fraction of arena height, from the bottom
const GROUND_Y = 0.12;
const JUMP_H = 0.16; // apex puts the animal's head at the treat lane

type Phase = "ready" | "countin" | "playing" | "done";

interface Treat {
  id: number;
  beat: number;
  url: string;
  state: "pending" | "caught" | "missed";
  perfect: boolean;
}

interface Burst {
  id: number;
  x: number;
  y: number;
  perfect: boolean;
}

interface Props {
  settings: Settings;
  onSettingsChange: (patch: Partial<Settings>) => void;
  subscribe: (fn: (hit: NoteHit) => void) => () => void;
  injectHit: (velocity?: number) => void;
  onExit: () => void;
}

export function DrumJump({ settings, onSettingsChange, subscribe, injectHit, onExit }: Props) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [treats, setTreats] = useState<Treat[]>([]);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [countLabel, setCountLabel] = useState("");
  const [hud, setHud] = useState({ caught: 0, streak: 0, best: 0 });
  const [preview, setPreview] = useState(false);

  const animal = useMemo(
    () => ANIMALS.find((a) => a.id === settings.animalId) ?? ANIMALS[0],
    [settings.animalId]
  );
  const treatSet = useMemo(
    () => TREAT_SETS.find((t) => t.id === settings.treatSetId) ?? TREAT_SETS[0],
    [settings.treatSetId]
  );

  const arenaRef = useRef<HTMLDivElement>(null);
  const animalRef = useRef<HTMLDivElement>(null);
  const pulseRef = useRef<HTMLDivElement>(null);
  const nodes = useRef(new Map<number, HTMLDivElement>());
  const size = useRef({ w: 1, h: 1 });

  const grid = useRef<BeatGrid | null>(null);
  const treatsRef = useRef<Treat[]>([]);
  const phaseRef = useRef<Phase>("ready");
  const jumpStart = useRef<number | null>(null);
  const jumpScale = useRef(1);
  const scheduledBeat = useRef(-1);
  const shownBeat = useRef(-1);
  const lastHit = useRef({ t: -99, scored: false });
  const offsetMs = useRef(settings.latencyOffsetMs);
  const errors = useRef<number[]>([]);
  const streak = useRef(0);
  const caught = useRef(0);
  const best = useRef(0);
  const burstId = useRef(0);
  const removed = useRef(new Set<number>());
  const settingsRef = useRef(settings);

  settingsRef.current = settings;
  treatsRef.current = treats;
  phaseRef.current = phase;

  useEffect(() => {
    offsetMs.current = settings.latencyOffsetMs;
  }, [settings.latencyOffsetMs]);

  useEffect(() => {
    audio.muted = !settings.sound;
  }, [settings.sound]);

  const measure = useCallback(() => {
    const el = arenaRef.current;
    if (el) size.current = { w: el.clientWidth, h: el.clientHeight };
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  // Metronome preview on the setup screen, so a tempo can be heard before
  // committing to it. Reads the bpm each tick, so dragging the slider is live.
  useEffect(() => {
    if (!preview || phase !== "ready") return;
    audio.resume();
    let next = audio.now + 0.15;
    let beat = 0;
    const id = setInterval(() => {
      const spb = 60 / settingsRef.current.bpm;
      while (next < audio.now + 0.3) {
        audio.click(next, beat % 4 === 0);
        beat++;
        next += spb;
      }
    }, 60);
    return () => clearInterval(id);
  }, [preview, phase]);

  const start = useCallback((overrideBpm?: number) => {
    setPreview(false);
    const ctx = audio.resume();
    audio.muted = !settingsRef.current.sound;
    const s = settingsRef.current;
    const anchor = ctx.currentTime + 0.7;
    grid.current = new BeatGrid(anchor, overrideBpm ?? s.bpm);
    const items = Array.from({ length: s.treatCount }, (_, i) => ({
      id: i,
      beat: s.countInBeats + i,
      url: treatSet.items[i % treatSet.items.length].url,
      state: "pending" as const,
      perfect: false,
    }));
    nodes.current.clear();
    removed.current.clear();
    scheduledBeat.current = -1;
    shownBeat.current = -1;
    errors.current = [];
    streak.current = 0;
    caught.current = 0;
    best.current = 0;
    jumpStart.current = null;
    setTreats(items);
    setBursts([]);
    setHud({ caught: 0, streak: 0, best: 0 });
    setPhase("countin");
  }, [treatSet]);

  const addBurst = useCallback((x: number, y: number, perfect: boolean) => {
    const id = burstId.current++;
    setBursts((prev) => [...prev, { id, x, y, perfect }]);
    setTimeout(() => setBursts((prev) => prev.filter((b) => b.id !== id)), 700);
  }, []);

  const onHit = useCallback(
    (hit: NoteHit) => {
      const s = settingsRef.current;
      if (!hit.on) return; // strikes only
      if (!s.acceptAnyNote && s.drumChannelOnly && hit.channel !== 9) return;

      if (phaseRef.current === "ready" || phaseRef.current === "done") {
        start();
        return;
      }

      audio.syncClock();
      const raw = audio.perfToCtx(hit.perfTime);
      const t = raw - offsetMs.current / 1000;
      const g = grid.current;
      if (!g) return;

      // Swallow the second of a rapid double once the first already scored.
      if (t - lastHit.current.t < DOUBLE_HIT_MS / 1000 && lastHit.current.scored) return;

      // Always jump: an off-beat hit is play, never a penalty.
      jumpStart.current = raw;
      jumpScale.current = s.velocityJump ? 0.78 + (hit.velocity / 127) * 0.5 : 1;
      audio.thump(audio.now + 0.005, hit.velocity);

      const hitWindow = s.hitWindowMs / 1000;
      let target: Treat | null = null;
      let bestErr = Infinity;
      for (const tr of treatsRef.current) {
        if (tr.state !== "pending") continue;
        const err = t - g.timeOf(tr.beat);
        if (Math.abs(err) < Math.abs(bestErr)) {
          bestErr = err;
          target = tr;
        }
      }

      const scored = !!target && Math.abs(bestErr) <= hitWindow;
      lastHit.current = { t, scored };
      if (!scored || !target) return;

      const perfect = Math.abs(bestErr) <= hitWindow * PERFECT_FRACTION;
      target.state = "caught";
      target.perfect = perfect;
      setTreats((prev) => prev.map((tr) => (tr.id === target!.id ? { ...tr, state: "caught", perfect } : tr)));

      caught.current++;
      streak.current++;
      best.current = Math.max(best.current, streak.current);
      setHud({ caught: caught.current, streak: streak.current, best: best.current });

      if (s.tempoRamp && streak.current > 0 && streak.current % 8 === 0) {
        g.setBpm(Math.min(160, g.currentBpm + 4));
      }

      errors.current.push(bestErr * 1000);
      if (s.autoCalibrate && errors.current.length >= CALIBRATE_MIN_SAMPLES) {
        const mean = errors.current.reduce((a, b) => a + b, 0) / errors.current.length;
        errors.current = [];
        const next = Math.max(-MAX_OFFSET_MS, Math.min(MAX_OFFSET_MS, offsetMs.current + mean * 0.4));
        offsetMs.current = next;
        onSettingsChange({ latencyOffsetMs: Math.round(next) });
      }
    },
    [start, onSettingsChange]
  );

  useEffect(() => subscribe(onHit), [subscribe, onHit]);

  // ---- render loop -------------------------------------------------------
  useEffect(() => {
    if (phase === "ready") return;
    let raf = 0;

    const frame = () => {
      raf = requestAnimationFrame(frame);
      const g = grid.current;
      const ctx = audio.ctx;
      if (!g || !ctx) return;
      audio.syncClock();

      const s = settingsRef.current;
      const now = audio.perfToCtx(performance.now());
      const { w, h } = size.current;
      const approach = s.approachBeats * g.spb;
      const hitWindow = s.hitWindowMs / 1000;

      // schedule clicks a little ahead of time
      const horizon = now + 0.3;
      while (g.timeOf(scheduledBeat.current + 1) < horizon) {
        scheduledBeat.current++;
        const b = scheduledBeat.current;
        const isCountIn = b < s.countInBeats;
        if (s.metronome || isCountIn) audio.click(g.timeOf(b), b % 4 === 0);
      }

      // count-in label / beat pulse
      const beatNow = g.indexAt(now);
      if (beatNow !== shownBeat.current) {
        shownBeat.current = beatNow;
        if (beatNow >= 0 && beatNow < s.countInBeats) {
          setCountLabel(String(s.countInBeats - beatNow));
        } else if (beatNow >= s.countInBeats) {
          setCountLabel("");
          if (phaseRef.current === "countin") setPhase("playing");
        }
        const p = pulseRef.current;
        if (p) {
          p.classList.remove("beat");
          void p.offsetWidth;
          p.classList.add("beat");
        }
      }

      // treats
      for (const tr of treatsRef.current) {
        const node = nodes.current.get(tr.id);
        if (!node || removed.current.has(tr.id)) continue;
        const beatTime = g.timeOf(tr.beat);
        const arrival = beatTime + JUMP_RISE_S;
        const progress = (arrival - now) / approach;

        if (tr.state === "pending" && now > beatTime + hitWindow) {
          tr.state = "missed";
          const id = tr.id;
          streak.current = 0;
          setHud((prev) => ({ ...prev, streak: 0 }));
          setTreats((prev) => prev.map((x) => (x.id === id ? { ...x, state: "missed" } : x)));
        }

        const gone = tr.state === "caught" ? progress <= 0 : progress < -0.6;
        if (gone) {
          removed.current.add(tr.id);
          if (tr.state === "caught") {
            audio.chomp(audio.now + 0.005, tr.perfect);
            addBurst(CATCH_X * w, (1 - TREAT_Y) * h, tr.perfect);
          }
          node.style.visibility = "hidden";
          const id = tr.id;
          setTreats((prev) => prev.filter((x) => x.id !== id));
          continue;
        }

        if (progress > 1.15) {
          node.style.visibility = "hidden";
          continue;
        }
        node.style.visibility = "visible";
        const x = CATCH_X * w + progress * (SPAWN_X - CATCH_X) * w;
        const bob = Math.sin(now * 3 + tr.id) * 0.012 * h;
        const y = (1 - TREAT_Y) * h + bob + (tr.state === "missed" ? Math.min(0.25, -progress) * h : 0);
        node.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${tr.state === "missed" ? -progress * 220 : 0}deg)`;
        node.style.opacity = tr.state === "missed" ? String(Math.max(0, 1 + progress * 2.2)) : "1";
      }

      // animal
      const a = animalRef.current;
      if (a) {
        let lift = 0;
        let squash = 1;
        if (jumpStart.current !== null) {
          const u = now - jumpStart.current;
          if (u >= JUMP_TOTAL_S) {
            jumpStart.current = null;
          } else if (u >= 0) {
            lift =
              u < JUMP_RISE_S
                ? Math.sin((u / JUMP_RISE_S) * (Math.PI / 2))
                : Math.cos(((u - JUMP_RISE_S) / (JUMP_TOTAL_S - JUMP_RISE_S)) * (Math.PI / 2));
            lift *= JUMP_H * jumpScale.current;
            squash = u < 0.05 ? 0.86 : 1;
          }
        }
        const walk = lift === 0 ? Math.sin(now * 8) * 0.008 : 0;
        a.style.transform = `translate3d(${LION_X * w}px, ${(1 - GROUND_Y) * h - (lift + walk) * h}px, 0) scale(${squash}, ${2 - squash})`;
      }

      if (phaseRef.current === "playing" && treatsRef.current.length === 0) {
        setPhase("done");
        audio.fanfare();
      }
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [phase, addBurst]);

  const total = settings.treatCount;

  return (
    <div className="game">
      <div className="hud">
        <button className="ghost" onClick={onExit}>
          ← Modes
        </button>
        <div ref={pulseRef} className="pulse" />
        <div className="stat">
          <img src={ICONS.star} alt="" />
          {hud.caught} / {total}
        </div>
        <div className={"stat" + (hud.streak >= 4 ? " hot" : "")}>
          <img src={ICONS.sparkles} alt="" />
          {hud.streak}
        </div>
      </div>

      <div
        className="arena"
        ref={arenaRef}
        onPointerDown={(e) => {
          e.preventDefault();
          audio.resume();
          injectHit(100);
        }}
      >
        <div className="sky" />
        <div className="ground" style={{ animationDuration: `${(60 / settings.bpm) * 4}s` }} />

        {treats.map((t) => (
          <div
            key={t.id}
            className={"treat" + (t.state === "missed" ? " missed" : "")}
            ref={(el) => {
              if (el) nodes.current.set(t.id, el);
              else nodes.current.delete(t.id);
            }}
          >
            <img src={t.url} alt="" draggable={false} />
          </div>
        ))}

        {bursts.map((b) => (
          <div
            key={b.id}
            className={"burst" + (b.perfect ? " perfect" : "")}
            style={{ transform: `translate3d(${b.x}px, ${b.y}px, 0)` }}
          >
            <img src={ICONS.sparkles} alt="" />
          </div>
        ))}

        <div className="animal" ref={animalRef}>
          <img src={animal.url} alt={animal.name} draggable={false} />
        </div>

        {countLabel && <div className="countin">{countLabel}</div>}

        {phase === "ready" && (
          <div className="overlay setup" onPointerDown={(e) => e.stopPropagation()}>
            <h2>Hit the drum when the fruit arrives!</h2>

            <div className="setupBox">
              <Slider
                big
                label="Speed"
                value={settings.bpm}
                min={40}
                max={150}
                suffix=" bpm"
                note={tempoWord(settings.bpm)}
                onChange={(v) => onSettingsChange({ bpm: v })}
              />
              <button className={"ghost" + (preview ? " on" : "")} onClick={() => setPreview((p) => !p)}>
                {preview ? "◼ Stop" : "▶ Hear it"}
              </button>
            </div>

            <button className="big" onClick={() => start()}>
              Start
            </button>
            <p className="hint">Tap the screen or press space if there is no pad yet.</p>
          </div>
        )}

        {phase === "done" && (
          <div className="overlay" onPointerDown={(e) => e.stopPropagation()}>
            <img className="trophy" src={ICONS.trophy} alt="" />
            <h2>
              {hud.caught} of {total}!
            </h2>
            <p className="hint">Best streak: {hud.best}</p>
            <div className="row">
              <button className="big" onClick={() => start()}>
                Again
              </button>
              {settings.bpm < 140 && (
                <button
                  className="big alt"
                  onClick={() => {
                    onSettingsChange({ bpm: settings.bpm + 6 });
                    start(settings.bpm + 6);
                  }}
                >
                  A bit faster
                </button>
              )}
              <button className="big alt2" onClick={() => setPhase("ready")}>
                Change speed
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
