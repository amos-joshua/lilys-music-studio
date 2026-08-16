import { useCallback, useEffect, useRef, useState } from "react";
import { audio } from "../audio/AudioEngine";
import { ALL_TREATS, BOAT, ICONS } from "../config/theme";
import { Slider } from "../components/Slider";
import {
  BOAT_DRAG,
  BOAT_LENGTH,
  BOAT_MARGIN,
  BOAT_RADIUS,
  BOAT_THRUST,
  BOAT_TURN,
  BOAT_TURN_DRAG,
  BOAT_BANK_MAX,
  BOAT_BANK_PER_RAD,
  BOAT_SPRITE_OFFSET_DEG,
  BOAT_VISUAL_LAG,
  BOAT_V_MAX,
  FRUIT_CATCH,
  FRUIT_RADIUS,
  PAD_BUMP_BACK,
  PAD_DEFLECT,
  PAD_HEAD_ON_COS,
  PAD_KEEP,
  PAD_MAX_R,
  PAD_MIN_R,
  PAD_OVERLAP,
  PAD_PUSH,
  PAD_RELEASE,
} from "../config/settings";
import type { Settings } from "../config/settings";
import type { NoteHit } from "../midi/types";

type Side = 1 | -1; // +1 right, -1 left

interface Pad {
  x: number;
  y: number;
  r: number;
  spin: number;
}

interface Ripple {
  id: number;
  x: number;
  y: number;
}

interface Props {
  settings: Settings;
  onSettingsChange: (patch: Partial<Settings>) => void;
  subscribe: (fn: (hit: NoteHit) => void) => () => void;
  onExit: () => void;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const wrap = (v: number, span: number) => ((v % span) + span) % span;
/** Shortest signed distance a - b on a wrapping axis. */
const delta = (a: number, b: number, span: number) => {
  const d = a - b;
  return d > span / 2 ? d - span : d < -span / 2 ? d + span : d;
};

export function BoatTrip({ settings, onSettingsChange, subscribe, onExit }: Props) {
  const [phase, setPhase] = useState<"ready" | "playing">("ready");
  const [score, setScore] = useState(0);
  const [pads, setPads] = useState<Pad[]>([]);
  const [fruit, setFruit] = useState({ x: 1, y: 0.5, url: ALL_TREATS[0].url });
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const [sparks, setSparks] = useState<Ripple[]>([]);
  const [sides, setSides] = useState<{ note: number; side: Side }[]>([]);
  const [size, setSize] = useState({ w: 1, h: 1 });

  const arenaRef = useRef<HTMLDivElement>(null);
  const boatRef = useRef<HTMLDivElement>(null);

  const pos = useRef({ x: 0.5, y: 0.5 });
  const heading = useRef(0); // radians, 0 = pointing up
  const shownHeading = useRef(0); // lagged copy, used only for drawing
  const speed = useRef(0);
  const omega = useRef(0);
  const lastFrame = useRef(0);
  const phaseRef = useRef<"ready" | "playing">("ready");
  const padsRef = useRef<Pad[]>([]);
  const fruitRef = useRef(fruit);
  const contact = useRef(new Set<number>());
  const sideMap = useRef(new Map<number, Side>());
  const nextSide = useRef<Side>(1);
  const rippleId = useRef(0);
  const settingsRef = useRef(settings);

  settingsRef.current = settings;
  phaseRef.current = phase;
  padsRef.current = pads;
  fruitRef.current = fruit;

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

  /** Somewhere clear of the boat, the pads and the edges. */
  const placeFruit = useCallback(
    (asp: number, padList: Pad[], avoid: { x: number; y: number }) => {
      for (let tries = 0; tries < 60; tries++) {
        const x = rand(BOAT_MARGIN + 0.1, asp - BOAT_MARGIN - 0.1);
        const y = rand(BOAT_MARGIN + 0.1, 1 - BOAT_MARGIN - 0.1);
        if (Math.hypot(x - avoid.x, y - avoid.y) < 0.45) continue;
        if (padList.some((p) => Math.hypot(x - p.x, y - p.y) < p.r + FRUIT_RADIUS + 0.04)) continue;
        return { x, y, url: ALL_TREATS[Math.floor(Math.random() * ALL_TREATS.length)].url };
      }
      return { x: asp / 2, y: 0.2, url: ALL_TREATS[0].url };
    },
    []
  );

  const start = useCallback(() => {
    audio.resume();
    audio.muted = !settingsRef.current.sound;
    const asp = size.w / size.h || 1.6;
    const made: Pad[] = [];
    for (let i = 0; i < settingsRef.current.boatPads; i++) {
      for (let tries = 0; tries < 40; tries++) {
        const r = rand(PAD_MIN_R, PAD_MAX_R);
        const x = rand(BOAT_MARGIN + r, asp - BOAT_MARGIN - r);
        const y = rand(BOAT_MARGIN + r, 1 - BOAT_MARGIN - r);
        if (Math.hypot(x - asp / 2, y - 0.5) < r + 0.22) continue;
        if (made.some((p) => Math.hypot(x - p.x, y - p.y) < p.r + r + 0.05)) continue;
        made.push({ x, y, r, spin: rand(0, 360) });
        break;
      }
    }
    pos.current = { x: asp / 2, y: 0.5 };
    heading.current = 0;
    shownHeading.current = 0;
    speed.current = 0;
    omega.current = 0;
    lastFrame.current = 0;
    contact.current.clear();
    padsRef.current = made;
    setPads(made);
    setFruit(placeFruit(asp, made, pos.current));
    setScore(0);
    setPhase("playing");
  }, [size.w, size.h, placeFruit]);

  const addRipple = useCallback((x: number, y: number) => {
    const id = rippleId.current++;
    setRipples((prev) => [...prev, { id, x, y }]);
    setTimeout(() => setRipples((prev) => prev.filter((r) => r.id !== id)), 650);
  }, []);

  const addSpark = useCallback((x: number, y: number) => {
    const id = rippleId.current++;
    setSparks((prev) => [...prev, { id, x, y }]);
    setTimeout(() => setSparks((prev) => prev.filter((r) => r.id !== id)), 700);
  }, []);

  const onHit = useCallback(
    (hit: NoteHit) => {
      const s = settingsRef.current;
      if (!hit.on) return;
      if (!s.acceptAnyNote && s.drumChannelOnly && hit.channel !== 9) return;

      if (phaseRef.current === "ready") {
        start();
        return;
      }

      // First pad seen becomes right, the next left, alternating from there.
      let side = sideMap.current.get(hit.note);
      if (side === undefined) {
        side = nextSide.current;
        sideMap.current.set(hit.note, side);
        nextSide.current = (side * -1) as Side;
        setSides(Array.from(sideMap.current, ([note, sd]) => ({ note, side: sd })));
      }

      const scale = s.velocityJump ? 0.75 + (hit.velocity / 127) * 0.5 : 1;
      speed.current = Math.min(BOAT_V_MAX, speed.current + BOAT_THRUST * scale);
      omega.current += BOAT_TURN * side * scale;
      audio.thump(audio.now + 0.005, hit.velocity);

      // Splash behind the boat on the side that was paddled.
      const th = heading.current;
      const back = { x: -Math.sin(th), y: Math.cos(th) };
      const across = { x: Math.cos(th), y: Math.sin(th) };
      addRipple(
        pos.current.x + back.x * BOAT_LENGTH * 0.35 + across.x * side * BOAT_RADIUS * 1.1,
        pos.current.y + back.y * BOAT_LENGTH * 0.35 + across.y * side * BOAT_RADIUS * 1.1
      );
    },
    [start, addRipple]
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
      const asp = w / h;

      speed.current *= Math.exp(-BOAT_DRAG * dt);
      omega.current *= Math.exp(-BOAT_TURN_DRAG * dt);
      heading.current += omega.current * dt;

      const th = heading.current;
      pos.current.x += Math.sin(th) * speed.current * dt;
      pos.current.y += -Math.cos(th) * speed.current * dt;

      // The water wraps, so the boat can never be cornered.
      pos.current.x = wrap(pos.current.x, asp);
      pos.current.y = wrap(pos.current.y, 1);

      // Lily pads keep the boat moving; only a near head-on hit really stops it.
      const pads2 = padsRef.current;
      for (let i = 0; i < pads2.length; i++) {
        const p = pads2[i];
        const dx = delta(pos.current.x, p.x, asp);
        const dy = delta(pos.current.y, p.y, 1);
        const d = Math.hypot(dx, dy) || 1e-6;
        const touch = p.r + BOAT_RADIUS - PAD_OVERLAP;

        if (d >= touch) {
          if (d > touch * PAD_RELEASE) contact.current.delete(i);
          continue;
        }

        const nx = dx / d;
        const ny = dy / d; // outward, pad -> boat
        pos.current.x += nx * (touch - d) * PAD_PUSH;
        pos.current.y += ny * (touch - d) * PAD_PUSH;

        if (contact.current.has(i)) continue;
        contact.current.add(i);

        const dirX = Math.sin(th);
        const dirY = -Math.cos(th);
        const align = -(dirX * nx + dirY * ny); // cos of angle to the pad's centre
        if (align <= 0) continue; // already heading away

        if (align > PAD_HEAD_ON_COS) {
          speed.current = -PAD_BUMP_BACK; // square on: bump back and stall
        } else {
          speed.current *= PAD_KEEP;
          const cross = dirX * -ny - dirY * -nx;
          heading.current -= Math.sign(cross || 1) * PAD_DEFLECT * align;
        }
      }

      // Fruit
      const f = fruitRef.current;
      if (Math.hypot(delta(pos.current.x, f.x, asp), delta(pos.current.y, f.y, 1)) < FRUIT_CATCH) {
        audio.chomp(audio.now + 0.005, true);
        addSpark(f.x, f.y);
        setScore((n) => n + 1);
        setFruit(placeFruit(asp, padsRef.current, pos.current));
      }

      // Visual only: the drawn hull chases the real heading, and the lag it
      // builds up during a turn doubles as the bank angle.
      const lag = heading.current - shownHeading.current;
      shownHeading.current += lag * (1 - Math.exp(-BOAT_VISUAL_LAG * dt));
      const bank = Math.max(
        -BOAT_BANK_MAX,
        Math.min(BOAT_BANK_MAX, (heading.current - shownHeading.current) * BOAT_BANK_PER_RAD)
      );

      const b = boatRef.current;
      if (b) {
        b.style.transform =
          `translate3d(${pos.current.x * h}px, ${pos.current.y * h}px, 0) ` +
          `rotate(${(shownHeading.current * 180) / Math.PI + BOAT_SPRITE_OFFSET_DEG}deg)`;
        const img = b.firstElementChild as HTMLElement | null;
        if (img) {
          img.style.transform =
            `translate(-50%, -50%) rotate(${bank}deg) scaleX(${1 - Math.abs(bank) / 90})`;
        }
      }
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [phase, size, placeFruit, addSpark]);

  const px = (v: number) => v * size.h;
  // Before a run the boat sits mid-water; the arena aspect is only known once measured.
  const shown = phase === "ready" ? { x: size.w / size.h / 2, y: 0.5 } : pos.current;
  const rightNote = sides.find((s) => s.side === 1)?.note;
  const leftNote = sides.find((s) => s.side === -1)?.note;

  return (
    <div className="game">
      <div className="hud">
        <button className="ghost" onClick={onExit}>
          ← Modes
        </button>
        <span className="padMap">
          <span className={leftNote === undefined ? "off" : ""}>◀ left</span>
          <button
            className="ghost"
            title="Swap which pad steers which way"
            onClick={() => {
              sideMap.current.forEach((v, k) => sideMap.current.set(k, (v * -1) as Side));
              nextSide.current = (nextSide.current * -1) as Side;
              setSides(Array.from(sideMap.current, ([note, side]) => ({ note, side })));
            }}
          >
            ⇄
          </button>
          <span className={rightNote === undefined ? "off" : ""}>right ▶</span>
        </span>
        <div className="spacer" />
        <div className="stat">
          <img src={ICONS.star} alt="" />
          {score}
        </div>
      </div>

      <div className="arena water" ref={arenaRef}>
        {pads.map((p, i) => (
          <img
            key={i}
            className="lilypad"
            src={BOAT.lilypad}
            alt=""
            style={{
              left: px(p.x),
              top: px(p.y),
              width: px(p.r * 2),
              height: px(p.r * 2),
              transform: `translate(-50%, -50%) rotate(${p.spin}deg)`,
            }}
          />
        ))}

        {ripples.map((r) => (
          <span key={r.id} className="ripple" style={{ left: px(r.x), top: px(r.y) }} />
        ))}

        <img
          className="boatFruit"
          src={fruit.url}
          alt=""
          style={{ left: px(fruit.x), top: px(fruit.y), width: px(FRUIT_RADIUS * 2), height: px(FRUIT_RADIUS * 2) }}
        />

        {sparks.map((s) => (
          <div key={s.id} className="burst perfect" style={{ transform: `translate3d(${px(s.x)}px, ${px(s.y)}px, 0)` }}>
            <img src={ICONS.sparkles} alt="" />
          </div>
        ))}

        {/* Rendered position keeps the boat placed before the loop starts; the
            frame loop overwrites this transform while playing. */}
        <div
          className="boat"
          ref={boatRef}
          style={{
            transform:
              `translate3d(${px(shown.x)}px, ${px(shown.y)}px, 0) ` +
              `rotate(${(shownHeading.current * 180) / Math.PI + BOAT_SPRITE_OFFSET_DEG}deg)`,
          }}
        >
          <img src={BOAT.boat} alt="Boat" draggable={false} style={{ height: px(BOAT_LENGTH * 1.25) }} />
        </div>

        {phase === "ready" && (
          <div className="overlay setup">
            <h2>Paddle left and right to reach the fruit</h2>
            <div className="setupBox">
              <Slider
                big
                label="Lily pads"
                value={settings.boatPads}
                min={0}
                max={8}
                onChange={(v) => onSettingsChange({ boatPads: v })}
              />
            </div>
            <button className="big" onClick={start}>
              Start
            </button>
            <p className="hint">
              The first pad you hit steers right, the next steers left. Hit both together to go straight.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
