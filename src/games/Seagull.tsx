import { useCallback, useEffect, useRef, useState } from "react";
import { audio } from "../audio/AudioEngine";
import { ICONS, rollTreat } from "../config/theme";
import type { Sprite } from "../config/theme";
import { Slider } from "../components/Slider";
import {
  GULL_CATCH,
  GULL_DECAY,
  GULL_EASE,
  GULL_FRUIT_EVERY_MAX,
  GULL_HAZARD_EVERY,
  GULL_HAZARD_GAP,
  GULL_HIGH,
  GULL_HURT_MS,
  GULL_LOW,
  GULL_MAX_MINUTES,
  GULL_MIN_MINUTES,
  GULL_RATE_LERP,
  GULL_RATE_MAX,
  GULL_RATE_MIN,
  GULL_SILENCE,
  GULL_SPEED,
  GULL_X,
  gullCentre,
} from "../config/settings";
import type { Settings } from "../config/settings";
import type { NoteHit } from "../midi/types";

type Phase = "ready" | "playing" | "done";

interface Item {
  id: number;
  kind: "fruit" | "thorn";
  x: number;
  y: number;
  sprite?: Sprite;
  spin: number;
}

interface Puff {
  id: number;
  x: number;
  y: number;
  kind: "yum" | "ouch";
}

interface Props {
  settings: Settings;
  onSettingsChange: (patch: Partial<Settings>) => void;
  subscribe: (fn: (hit: NoteHit) => void) => () => void;
  injectHit: (velocity?: number, note?: number) => void;
  onExit: () => void;
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** The corridor's height read as a tempo: the whole mapping, in one line. */
const rateAt = (x: number) =>
  GULL_RATE_MIN + gullCentre(x) * (GULL_RATE_MAX - GULL_RATE_MIN);

export function Seagull({ settings, onSettingsChange, subscribe, injectHit, onExit }: Props) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [items, setItems] = useState<Item[]>([]);
  const [puffs, setPuffs] = useState<Puff[]>([]);
  const [score, setScore] = useState(0);
  const [left, setLeft] = useState(0);
  const [size, setSize] = useState({ w: 1, h: 1 });

  const arenaRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const birdRef = useRef<HTMLDivElement>(null);

  const worldX = useRef(0);
  const birdY = useRef(0.5);
  const rate = useRef(0);
  const lastTap = useRef(0);
  const lastFrame = useRef(0);
  const hurtUntil = useRef(0);
  const cursor = useRef({ x: 0, beat: 0 });
  const itemId = useRef(0);
  const puffId = useRef(0);
  const itemsRef = useRef<Item[]>([]);
  const phaseRef = useRef<Phase>("ready");
  const endsAt = useRef(0);
  const settingsRef = useRef(settings);

  settingsRef.current = settings;
  phaseRef.current = phase;
  itemsRef.current = items;

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

  /**
   * Lay out the next stretch of corridor. Each step is one beat *at the tempo
   * the corridor asks for there*, so fruit spacing follows the target tempo by
   * construction rather than by tuning a density.
   */
  const generate = useCallback((toX: number) => {
    const made: Item[] = [];
    const every = settingsRef.current.gullFruitEvery;
    const c = cursor.current;
    while (c.x < toX) {
      const centre = gullCentre(c.x);
      if (c.beat % every === 0) {
        made.push({
          id: itemId.current++,
          kind: "fruit",
          x: c.x,
          y: centre,
          sprite: rollTreat(settingsRef.current.treatSetId),
          spin: 0,
        });
      }
      if (c.beat % GULL_HAZARD_EVERY === 0 && c.beat > 0) {
        // Whichever side of the corridor has room for it on screen, so a thorn
        // is never placed where it cannot be seen or reached.
        const roomAbove = centre + GULL_HAZARD_GAP < GULL_HIGH;
        const roomBelow = centre - GULL_HAZARD_GAP > GULL_LOW;
        if (roomAbove || roomBelow) {
          const above = roomAbove && (!roomBelow || Math.random() < 0.5);
          made.push({
            id: itemId.current++,
            kind: "thorn",
            x: c.x,
            y: centre + (above ? GULL_HAZARD_GAP : -GULL_HAZARD_GAP),
            spin: (Math.random() - 0.5) * 16,
          });
        }
      }
      c.x += GULL_SPEED / rateAt(c.x);
      c.beat++;
    }
    if (made.length) setItems((prev) => [...prev, ...made]);
  }, []);

  const start = useCallback(() => {
    audio.resume();
    audio.muted = !settingsRef.current.sound;
    worldX.current = 0;
    birdY.current = 0.5;
    rate.current = 0;
    lastTap.current = 0;
    lastFrame.current = 0;
    hurtUntil.current = 0;
    // Just far enough ahead to be on screen and approaching: any further and
    // the round opens with several seconds of empty sky.
    cursor.current = { x: 0.9, beat: 0 };
    itemsRef.current = [];
    setItems([]);
    setPuffs([]);
    setScore(0);
    const ms = settingsRef.current.gullMinutes * 60000;
    endsAt.current = performance.now() + ms;
    setLeft(ms);
    generate(cursor.current.x + (size.w / size.h) * 2);
    setPhase("playing");
  }, [generate, size.w, size.h]);

  const puff = useCallback((x: number, y: number, kind: "yum" | "ouch") => {
    const id = puffId.current++;
    setPuffs((prev) => [...prev, { id, x, y, kind }]);
    setTimeout(() => setPuffs((prev) => prev.filter((p) => p.id !== id)), 900);
  }, []);

  const onHit = useCallback(
    (hit: NoteHit) => {
      const s = settingsRef.current;
      if (!hit.on) return;
      if (!s.acceptAnyNote && s.drumChannelOnly && hit.channel !== 9) return;

      if (phaseRef.current !== "playing") {
        if (phaseRef.current === "ready") start();
        return;
      }

      const now = performance.now();
      const gap = lastTap.current ? now - lastTap.current : 0;
      lastTap.current = now;
      // Height follows the *rate* she is drumming at, smoothed, rather than
      // each tap kicking the bird upward: an impulse against gravity is
      // twitchy, and this is not a game about recovering from a mistake.
      if (gap > 120 && gap < 4000) {
        const inst = Math.max(GULL_RATE_MIN * 0.6, Math.min(GULL_RATE_MAX * 1.15, 1000 / gap));
        rate.current += (inst - rate.current) * GULL_RATE_LERP;
      } else if (!rate.current) {
        rate.current = GULL_RATE_MIN;
      }
      audio.thump(audio.now + 0.005, hit.velocity);
    },
    [start]
  );

  useEffect(() => subscribe(onHit), [subscribe, onHit]);


  useEffect(() => {
    if (phase !== "playing") return;
    let raf = 0;

    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      const dt = lastFrame.current ? Math.min(0.05, (t - lastFrame.current) / 1000) : 0;
      lastFrame.current = t;
      if (!dt) return;
      const { w, h } = size;
      const now = performance.now();

      const remaining = endsAt.current - now;
      if (remaining <= 0) {
        setPhase("done");
        audio.fanfare();
        return;
      }

      // Late for the next beat: the rate bleeds away and the bird sinks. Stop
      // drumming altogether and it settles at the bottom, which is as bad as
      // anything gets here.
      const expected = rate.current > 0.05 ? 1000 / rate.current : 1000;
      if (lastTap.current && now - lastTap.current > expected * GULL_SILENCE) {
        rate.current *= Math.exp(-GULL_DECAY * dt);
      }

      worldX.current += GULL_SPEED * dt;

      // The exact inverse of rateAt(): the corridor's height is read as a
      // tempo, so a tempo has to be read back as that same height, or flying at
      // the rate the corridor asks for does not put the bird on it.
      const span = GULL_RATE_MAX - GULL_RATE_MIN;
      const wanted = (rate.current - GULL_RATE_MIN) / span;
      const targetY = Math.max(GULL_LOW, Math.min(GULL_HIGH, wanted));
      birdY.current += (targetY - birdY.current) * (1 - Math.exp(-GULL_EASE * dt));

      // Keep about two screens of corridor ahead, and forget what is behind.
      generate(worldX.current + (w / h) * 2.2);
      const behind = worldX.current - 0.6;
      if (itemsRef.current.some((i) => i.x < behind)) {
        setItems((prev) => prev.filter((i) => i.x >= behind));
      }

      const hit: number[] = [];
      for (const it of itemsRef.current) {
        if (Math.abs(it.x - worldX.current) > GULL_CATCH) continue;
        if (Math.abs(it.y - birdY.current) > GULL_CATCH) continue;
        if (it.kind === "fruit") {
          hit.push(it.id);
          setScore((n) => n + 1);
          audio.chomp(audio.now + 0.005, true);
          puff(it.x, it.y, "yum");
        } else if (now > hurtUntil.current) {
          hurtUntil.current = now + GULL_HURT_MS;
          audio.boing(audio.now + 0.005, 0.7);
          puff(it.x, it.y, "ouch");
          // Nudged back toward the middle of the corridor, never killed.
          rate.current += (rateAt(worldX.current) - rate.current) * 0.6;
        }
      }
      if (hit.length) setItems((prev) => prev.filter((i) => !hit.includes(i.id)));

      const world = worldRef.current;
      if (world) {
        world.style.transform = `translate3d(${GULL_X * w - worldX.current * h}px, 0, 0)`;
      }
      const b = birdRef.current;
      if (b) {
        // Tilt with the climb, so the bird leans into a faster beat.
        const climb = (targetY - birdY.current) * 90;
        const tilt = Math.max(-26, Math.min(26, climb));
        b.style.transform =
          `translate3d(${GULL_X * w}px, ${(1 - birdY.current) * h}px, 0) rotate(${-tilt}deg)`;
        b.classList.toggle("hurt", now < hurtUntil.current);
      }
      setLeft(remaining);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [phase, size, generate, puff]);

  const px = (v: number) => v * size.h;

  return (
    <div className="game">
      <div className="hud">
        <button className="ghost" onClick={onExit}>
          ← Modes
        </button>
        <div className="spacer" />
        {phase === "playing" && <span className="clock">{clock(left)}</span>}
        <div className="stat">
          <img src={ICONS.star} alt="" />
          {score}
        </div>
      </div>

      <div
        className="arena skyArena"
        ref={arenaRef}
        onPointerDown={(e) => {
          e.preventDefault();
          audio.resume();
          injectHit(100);
        }}
      >
        <div className="clouds" />
        <div className="sea" style={{ inset: "auto 0 0 0", height: "12%" }} />

        <div className="gullWorld" ref={worldRef}>
          {items.map((it) =>
            it.kind === "fruit" ? (
              <img
                key={it.id}
                className="gullFruit"
                src={it.sprite!.url}
                alt=""
                style={{ left: px(it.x), top: px(1 - it.y), width: px(0.11), height: px(0.11) }}
              />
            ) : (
              <img
                key={it.id}
                className="gullThorn"
                src={ICONS.thorn}
                alt=""
                style={{
                  left: px(it.x),
                  top: px(1 - it.y),
                  width: px(0.15),
                  height: px(0.15),
                  transform: `translate(-50%, -50%) rotate(${it.spin}deg)`,
                }}
              />
            )
          )}

          {puffs.map((p) => (
            <span
              key={p.id}
              className={"gullPuff " + p.kind}
              style={{ left: px(p.x), top: px(1 - p.y) }}
            >
              {p.kind === "yum" ? "yum!" : "ouch!"}
            </span>
          ))}
        </div>

        <div className="gull" ref={birdRef}>
          <img src={ICONS.gull} alt="Seagull" draggable={false} style={{ height: px(0.16) }} />
        </div>

        {phase === "ready" && (
          <div className="overlay setup" onPointerDown={(e) => e.stopPropagation()}>
            <h2>Drum faster to fly higher</h2>
            <div className="setupBox">
              <Slider
                big
                label="How long"
                value={settings.gullMinutes}
                min={GULL_MIN_MINUTES}
                max={GULL_MAX_MINUTES}
                suffix=" min"
                onChange={(v) => onSettingsChange({ gullMinutes: v })}
              />
            </div>
            <div className="setupBox">
              <Slider
                big
                label="Fruit"
                value={GULL_FRUIT_EVERY_MAX + 1 - settings.gullFruitEvery}
                min={1}
                max={GULL_FRUIT_EVERY_MAX}
                valueLabel={["sparse", "some", "every beat"][GULL_FRUIT_EVERY_MAX - settings.gullFruitEvery]}
                onChange={(v) => onSettingsChange({ gullFruitEvery: GULL_FRUIT_EVERY_MAX + 1 - v })}
              />
            </div>
            <button className="big" onClick={start}>
              Start
            </button>
            <p className="hint">
              The fruit are the beat — one for every drum. Follow them up and down, and mind the
              thorns.
            </p>
          </div>
        )}

        {phase === "done" && (
          <div className="overlay" onPointerDown={(e) => e.stopPropagation()}>
            <img className="trophy" src={ICONS.trophy} alt="" />
            <h2>{score} fruit!</h2>
            <div className="row">
              <button className="big" onClick={start}>
                Again
              </button>
              <button className="big alt2" onClick={onExit}>
                ← Modes
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
