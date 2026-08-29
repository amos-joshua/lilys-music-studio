import { useCallback, useEffect, useRef, useState } from "react";
import { audio } from "../audio/AudioEngine";
import { HILL_PATH, HILL_TOP, hillAngle, hillPoint } from "../game/hill";
import { ICONS, rollAnimal, rollTreat } from "../config/theme";
import type { Sprite } from "../config/theme";
import { Slider } from "../components/Slider";
import {
  HILL_BOUNCE,
  HILL_BRAKE_MAX,
  HILL_BRAKE_MIN,
  HILL_GRAVITY,
  HILL_KICK,
  HILL_MIN_KICK,
  HILL_STEP,
  HILL_V_MAX,
  HILL_V_MIN,
  hillPaceWord,
} from "../config/settings";
import type { Settings } from "../config/settings";
import type { NoteHit } from "../midi/types";

type Phase = "ready" | "playing" | "win" | "reset";

interface Burst {
  id: number;
  x: number;
  y: number;
}

interface Props {
  settings: Settings;
  onSettingsChange: (patch: Partial<Settings>) => void;
  subscribe: (fn: (hit: NoteHit) => void) => () => void;
  injectHit: (velocity?: number) => void;
  /** Set only in mixed mode: called after one climb instead of resetting. */
  onFinish?: () => void;
  onExit: () => void;
}

export function HillClimb({ settings, onSettingsChange, subscribe, injectHit, onFinish, onExit }: Props) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [rounds, setRounds] = useState(0);
  const [bursts, setBursts] = useState<Burst[]>([]);

  // A new climber and a new prize every round, so the fiftieth climb of the
  // afternoon still has something to look at. Rolled from state rather than
  // derived, so a re-render never swaps the animal out mid-climb.
  const [cast, setCast] = useState<{ animal: Sprite; prize: Sprite }>(() => ({
    animal: rollAnimal(settings.animalId),
    prize: rollTreat(settings.treatSetId),
  }));
  const { animal, prize } = cast;

  const arenaRef = useRef<HTMLDivElement>(null);
  const animalRef = useRef<HTMLDivElement>(null);
  const prizeRef = useRef<HTMLDivElement>(null);
  const meterRef = useRef<HTMLDivElement>(null);
  const size = useRef({ w: 1, h: 1 });

  const pos = useRef(0);
  const vel = useRef(0);
  const lastFrame = useRef(0);
  const squash = useRef(0);
  const phaseRef = useRef<Phase>("ready");
  const onFinishRef = useRef<(() => void) | undefined>(undefined);
  const handedOver = useRef(false);
  const winAt = useRef(0);
  const burstId = useRef(0);
  const settingsRef = useRef(settings);

  settingsRef.current = settings;
  phaseRef.current = phase;
  onFinishRef.current = onFinish;

  const recast = useCallback(() => {
    const s = settingsRef.current;
    setCast((prev) => ({
      animal: rollAnimal(s.animalId, prev.animal),
      prize: rollTreat(s.treatSetId, prev.prize),
    }));
  }, []);

  const measure = useCallback(() => {
    const el = arenaRef.current;
    if (el) size.current = { w: el.clientWidth, h: el.clientHeight };
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  useEffect(() => {
    audio.muted = !settings.sound;
  }, [settings.sound]);

  const addBurst = useCallback((x: number, y: number) => {
    const id = burstId.current++;
    setBursts((prev) => [...prev, { id, x, y }]);
    setTimeout(() => setBursts((prev) => prev.filter((b) => b.id !== id)), 700);
  }, []);

  const start = useCallback(() => {
    audio.resume();
    audio.muted = !settingsRef.current.sound;
    pos.current = 0;
    vel.current = 0;
    lastFrame.current = 0;
    handedOver.current = false;
    setRounds(0);
    setBursts([]);
    recast();
    setPhase("playing");
  }, [recast]);

  const onHit = useCallback(
    (hit: NoteHit) => {
      const s = settingsRef.current;
      if (!hit.on) return; // strikes only
      if (!s.acceptAnyNote && s.drumChannelOnly && hit.channel !== 9) return;

      if (phaseRef.current === "ready") {
        start();
        return;
      }
      if (phaseRef.current !== "playing") return;

      // A hit always leaves the animal moving forwards, however fast it was
      // sliding, so a burst of hits never reads as having done nothing.
      const scale = s.velocityJump ? 0.7 + (hit.velocity / 127) * 0.6 : 1;
      const kicked = vel.current + HILL_KICK * scale;
      vel.current = Math.min(HILL_V_MAX, Math.max(HILL_MIN_KICK, kicked));
      pos.current = Math.min(1, pos.current + HILL_STEP * scale);
      squash.current = 1;
      audio.blip(audio.now + 0.005, pos.current, hit.velocity);
    },
    [start]
  );

  useEffect(() => subscribe(onHit), [subscribe, onHit]);

  useEffect(() => {
    if (phase === "ready") return;
    let raf = 0;

    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      const dt = lastFrame.current ? Math.min(0.05, (t - lastFrame.current) / 1000) : 0;
      lastFrame.current = t;
      const { w, h } = size.current;
      const s = settingsRef.current;

      if (phaseRef.current === "playing") {
        // Braking uphill is quick; the downhill slide builds up slowly.
        vel.current =
          vel.current > 0
            ? Math.max(0, vel.current - s.hillBrake * dt)
            : Math.max(HILL_V_MIN, vel.current - HILL_GRAVITY * dt);
        pos.current += vel.current * dt;

        if (pos.current <= 0) {
          pos.current = 0;
          if (vel.current < -0.04) {
            audio.boing(audio.now + 0.005, Math.min(1, vel.current / HILL_V_MIN));
            squash.current = 1;
            vel.current = -vel.current * HILL_BOUNCE;
          } else if (vel.current < 0) {
            vel.current = 0;
          }
        }

        if (pos.current >= 1) {
          pos.current = 1;
          vel.current = 0;
          winAt.current = t;
          setPhase("win");
          setRounds((r) => r + 1);
          audio.fanfare();
          addBurst(HILL_TOP.x * w, (1 - HILL_TOP.y) * h);
        }
      } else if (phaseRef.current === "win") {
        // One climb is a turn: in mixed mode the next game follows the cheer.
        if (t - winAt.current > 1900 && !handedOver.current) {
          if (onFinishRef.current) {
            handedOver.current = true; // the mode swap takes a frame or two
            onFinishRef.current();
          } else setPhase("reset");
        }
      } else if (phaseRef.current === "reset") {
        // Run back down for the next one, rather than teleporting.
        pos.current = Math.max(0, pos.current - 2.2 * dt);
        if (pos.current === 0) {
          vel.current = 0;
          squash.current = 1;
          audio.boing(audio.now + 0.005, 0.5);
          // Back at the bottom: the next climber and the next prize step in.
          recast();
          setPhase("playing");
        }
      }

      // animal on the hill
      const a = animalRef.current;
      if (a) {
        const p = hillPoint(pos.current);
        const tilt = hillAngle(pos.current, w / h);
        squash.current = Math.max(0, squash.current - dt * 6);
        const sq = 1 - squash.current * 0.12;
        const hop = phaseRef.current === "win" ? Math.abs(Math.sin((t - winAt.current) / 130)) * 0.05 : 0;
        a.style.transform =
          `translate3d(${p.x * w}px, ${(1 - p.y - hop) * h}px, 0) ` +
          `rotate(${tilt}deg) scale(${sq}, ${2 - sq})`;
      }

      const pz = prizeRef.current;
      if (pz) {
        const bob = Math.sin(t / 320) * 0.012;
        const grow = phaseRef.current === "win" ? 1 + Math.min(1, (t - winAt.current) / 300) * 0.5 : 1;
        pz.style.transform =
          `translate3d(${HILL_TOP.x * w}px, ${(1 - HILL_TOP.y - bob) * h}px, 0) scale(${grow})`;
        pz.style.opacity = phaseRef.current === "win" && t - winAt.current > 400 ? "0" : "1";
      }

      const m = meterRef.current;
      if (m) {
        const rising = vel.current >= 0;
        const frac = rising ? vel.current / HILL_V_MAX : vel.current / HILL_V_MIN;
        m.style.width = `${Math.round(Math.min(1, frac) * 100)}%`;
        m.style.background = rising ? "var(--accent-2)" : "var(--danger)";
      }
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [phase, addBurst, recast]);

  return (
    <div className="game">
      <div className="hud">
        <button className="ghost" onClick={onExit}>
          ← Modes
        </button>
        <div className="meter">
          <div ref={meterRef} className="meterFill" />
        </div>
        <div className="stat">
          <img src={prize.url} alt="" />
          {rounds}
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
        <svg className="hill" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path d={HILL_PATH} />
        </svg>

        <div className="prize" ref={prizeRef}>
          <img src={prize.url} alt="" draggable={false} />
        </div>

        <div className="climber" ref={animalRef}>
          <img src={animal.url} alt={animal.name} draggable={false} />
        </div>

        {bursts.map((b) => (
          <div key={b.id} className="burst perfect" style={{ transform: `translate3d(${b.x}px, ${b.y}px, 0)` }}>
            <img src={ICONS.sparkles} alt="" />
          </div>
        ))}

        {phase === "win" && <div className="yum">Yum!</div>}

        {phase === "ready" && (
          <div className="overlay setup" onPointerDown={(e) => e.stopPropagation()}>
            <h2>Drum fast to climb the hill!</h2>

            <div className="setupBox">
              <Slider
                big
                label="How hard"
                value={Math.round(settings.hillBrake * 100)}
                min={HILL_BRAKE_MIN * 100}
                max={HILL_BRAKE_MAX * 100}
                step={2}
                valueLabel={hillPaceWord(settings.hillBrake)}
                onChange={(v) => onSettingsChange({ hillBrake: v / 100 })}
              />
              <button
                className={"ghost" + (settings.mixedMode ? " on" : "")}
                onClick={() => onSettingsChange({ mixedMode: !settings.mixedMode })}
              >
                Mixed mode
              </button>
            </div>

            <button className="big" onClick={start}>
              Start
            </button>
            <p className="hint">Stop drumming and the animal slides back down — faster and faster.</p>
          </div>
        )}
      </div>
    </div>
  );
}
