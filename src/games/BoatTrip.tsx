import { useCallback, useEffect, useRef, useState } from "react";
import { audio } from "../audio/AudioEngine";
import { BOAT, ICONS, rollTreat } from "../config/theme";
import type { Sprite } from "../config/theme";
import { Slider } from "../components/Slider";
import {
  ARROW_INSET_PX,
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
  CAM_LERP,
  CAM_MARGIN,
  CULL_MARGIN,
  CULL_STEP,
  FISH_DRIFT,
  FISH_FACING,
  FISH_MAX,
  FISH_MIN,
  FISH_SIZE,
  FISH_SPEED_MAX,
  FISH_SPEED_MIN,
  FRUIT_CATCH,
  FRUIT_FAR,
  FRUIT_NEAR,
  FRUIT_RADIUS,
  ISLAND_COUNT,
  ISLAND_DECOR_R,
  ISLAND_HOUSE_CHANCE,
  ISLAND_MAX_R,
  ISLAND_MAX_TREES,
  ISLAND_MIN_R,
  PAD_BUMP_BACK,
  PAD_DEFLECT,
  PAD_HEAD_ON_COS,
  PAD_KEEP,
  PAD_MAX_R,
  PAD_MIN_R,
  PAD_OVERLAP,
  PAD_PUSH,
  PAD_RELEASE,
  SCHOOL_GAP_MAX,
  SCHOOL_GAP_MIN,
  SCHOOL_MAX,
  SCHOOL_SPREAD,
  SHORE,
  SHORE_BUMP,
  WHALE_COUNT,
  WHALE_R,
  WHALE_SPEED,
  WHALE_TURN,
  WORLD_SCREENS,
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

interface Decor {
  url: string;
  x: number; // offset from the island centre, as a fraction of its radius
  y: number;
  size: number; // as a fraction of the island radius
}

interface Island extends Pad {
  tone: number;
  decor: Decor[];
}

interface Fish {
  ox: number; // offset within the shoal, in screen heights
  oy: number;
  size: number;
  delay: number;
}

interface School {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fish: Fish[];
}

interface Whale {
  x: number;
  y: number;
  dir: number;
  wander: number;
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
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const pick = <T,>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)];

/** A house on most islands and up to a couple of trees, spread around the
 * grassy middle and drawn back to front so the near ones overlap. */
const decorate = (): Decor[] => {
  const out: Decor[] = [];
  if (Math.random() < ISLAND_HOUSE_CHANCE) {
    out.push({ url: pick(BOAT.houses), x: 0, y: 0, size: 0.62 });
  }
  const trees = Math.floor(rand(0, ISLAND_MAX_TREES + 1));
  for (let i = 0; i < trees; i++) {
    const a = rand(0, Math.PI * 2);
    const d = rand(0.45, 1) * ISLAND_DECOR_R;
    out.push({ url: pick(BOAT.trees), x: Math.cos(a) * d, y: Math.sin(a) * d, size: rand(0.5, 0.66) });
  }
  return out.sort((a, b) => a.y - b.y);
};

export function BoatTrip({ settings, onSettingsChange, subscribe, onExit }: Props) {
  const [phase, setPhase] = useState<"ready" | "playing">("ready");
  const [score, setScore] = useState(0);
  const [pads, setPads] = useState<Pad[]>([]);
  const [shownPads, setShownPads] = useState<Pad[]>([]);
  const [islands, setIslands] = useState<Island[]>([]);
  const [whales, setWhales] = useState<Whale[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [fruit, setFruit] = useState<{ x: number; y: number; sprite: Sprite }>(() => ({
    x: 1,
    y: 0.5,
    sprite: rollTreat(settings.treatSetId),
  }));
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const [sparks, setSparks] = useState<Ripple[]>([]);
  const [sides, setSides] = useState<{ note: number; side: Side }[]>([]);
  const [size, setSize] = useState({ w: 1, h: 1 });

  const arenaRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const boatRef = useRef<HTMLDivElement>(null);
  const arrowRef = useRef<HTMLDivElement>(null);
  const arrowTipRef = useRef<HTMLSpanElement>(null);
  const whaleRefs = useRef<(HTMLDivElement | null)[]>([]);
  const schoolRefs = useRef(new Map<number, HTMLDivElement | null>());

  const pos = useRef({ x: 0.5, y: 0.5 });
  const cam = useRef({ x: 0, y: 0 });
  const lastCull = useRef({ x: -99, y: -99 });
  const heading = useRef(0); // radians, 0 = pointing up
  const shownHeading = useRef(0); // lagged copy, used only for drawing
  const speed = useRef(0);
  const omega = useRef(0);
  const lastFrame = useRef(0);
  const phaseRef = useRef<"ready" | "playing">("ready");
  const padsRef = useRef<Pad[]>([]);
  const islandsRef = useRef<Island[]>([]);
  const whalesRef = useRef<Whale[]>([]);
  const schoolsRef = useRef<School[]>([]);
  const nextSchool = useRef(0);
  const schoolId = useRef(0);
  const fruitRef = useRef(fruit);
  const contact = useRef(new Set<string>());
  const sideMap = useRef(new Map<number, Side>());
  const nextSide = useRef<Side>(1);
  const rippleId = useRef(0);
  const settingsRef = useRef(settings);

  settingsRef.current = settings;
  phaseRef.current = phase;
  padsRef.current = pads;
  islandsRef.current = islands;
  whalesRef.current = whales;
  schoolsRef.current = schools;
  fruitRef.current = fruit;

  const asp = size.w / size.h || 1.6;
  // The world is a fixed block of water: WORLD_SCREENS screens on each side.
  const worldW = asp * WORLD_SCREENS;
  const worldH = WORLD_SCREENS;
  // Sailable water, inside the beaches.
  const sea = { x0: SHORE, y0: SHORE, x1: worldW - SHORE, y1: worldH - SHORE };

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

  /** Fruit lands within a screen or two of the boat, clear of everything solid,
   * and is never the same twice running — the reward should look new. */
  const placeFruit = useCallback(
    (padList: Pad[], isles: Island[], whaleList: Whale[], from: { x: number; y: number }) => {
      const sprite = rollTreat(settingsRef.current.treatSetId, fruitRef.current.sprite);
      const lo = SHORE + BOAT_MARGIN;
      for (let tries = 0; tries < 80; tries++) {
        const a = rand(0, Math.PI * 2);
        const d = rand(FRUIT_FAR, FRUIT_NEAR);
        const x = clamp(from.x + Math.cos(a) * d, lo, worldW - lo);
        const y = clamp(from.y + Math.sin(a) * d, lo, worldH - lo);
        if (Math.hypot(x - from.x, y - from.y) < FRUIT_FAR) continue;
        if (padList.some((p) => Math.hypot(x - p.x, y - p.y) < p.r + FRUIT_RADIUS + 0.04)) continue;
        if (isles.some((p) => Math.hypot(x - p.x, y - p.y) < p.r + FRUIT_RADIUS + 0.1)) continue;
        if (whaleList.some((p) => Math.hypot(x - p.x, y - p.y) < WHALE_R + FRUIT_RADIUS + 0.1)) continue;
        return { x, y, sprite };
      }
      return { x: clamp(from.x + FRUIT_NEAR, lo, worldW - lo), y: from.y, sprite };
    },
    [worldW, worldH]
  );

  /** Camera: held still until the boat is within CAM_MARGIN of a screen edge,
   * then dragged along, and never past the beaches. */
  const follow = useCallback(
    (dt: number) => {
      const mx = asp * CAM_MARGIN;
      const my = CAM_MARGIN;
      const c = cam.current;
      const tx = clamp(c.x, pos.current.x - asp + mx, pos.current.x - mx);
      const ty = clamp(c.y, pos.current.y - 1 + my, pos.current.y - my);
      const k = dt ? 1 - Math.exp(-CAM_LERP * dt) : 1;
      c.x = clamp(c.x + (tx - c.x) * k, 0, worldW - asp);
      c.y = clamp(c.y + (ty - c.y) * k, 0, worldH - 1);
    },
    [asp, worldW, worldH]
  );

  const start = useCallback(() => {
    audio.resume();
    audio.muted = !settingsRef.current.sound;
    const mid = { x: worldW / 2, y: worldH / 2 };

    const isles: Island[] = [];
    for (let i = 0; i < ISLAND_COUNT; i++) {
      for (let tries = 0; tries < 60; tries++) {
        const r = rand(ISLAND_MIN_R, ISLAND_MAX_R);
        const x = rand(sea.x0 + r + 0.2, sea.x1 - r - 0.2);
        const y = rand(sea.y0 + r + 0.2, sea.y1 - r - 0.2);
        if (Math.hypot(x - mid.x, y - mid.y) < r + 0.6) continue;
        if (isles.some((p) => Math.hypot(x - p.x, y - p.y) < p.r + r + 0.5)) continue;
        isles.push({ x, y, r, spin: rand(0, 360), tone: rand(0, 1), decor: decorate() });
        break;
      }
    }

    const made: Pad[] = [];
    const total = settingsRef.current.boatPads * WORLD_SCREENS * WORLD_SCREENS;
    for (let i = 0; i < total; i++) {
      for (let tries = 0; tries < 40; tries++) {
        const r = rand(PAD_MIN_R, PAD_MAX_R);
        const x = rand(sea.x0 + r, sea.x1 - r);
        const y = rand(sea.y0 + r, sea.y1 - r);
        if (Math.hypot(x - mid.x, y - mid.y) < r + 0.22) continue;
        if (isles.some((p) => Math.hypot(x - p.x, y - p.y) < p.r + r + 0.06)) continue;
        if (made.some((p) => Math.hypot(x - p.x, y - p.y) < p.r + r + 0.05)) continue;
        made.push({ x, y, r, spin: rand(0, 360) });
        break;
      }
    }

    const pod: Whale[] = [];
    for (let i = 0; i < WHALE_COUNT; i++) {
      for (let tries = 0; tries < 60; tries++) {
        const x = rand(sea.x0 + WHALE_R, sea.x1 - WHALE_R);
        const y = rand(sea.y0 + WHALE_R, sea.y1 - WHALE_R);
        if (Math.hypot(x - mid.x, y - mid.y) < WHALE_R + 0.8) continue;
        if (isles.some((p) => Math.hypot(x - p.x, y - p.y) < p.r + WHALE_R + 0.2)) continue;
        pod.push({ x, y, dir: rand(0, Math.PI * 2), wander: rand(-1, 1) });
        break;
      }
    }

    pos.current = mid;
    cam.current = { x: clamp(mid.x - asp / 2, 0, worldW - asp), y: clamp(mid.y - 0.5, 0, worldH - 1) };
    lastCull.current = { x: -99, y: -99 };
    heading.current = 0;
    shownHeading.current = 0;
    speed.current = 0;
    omega.current = 0;
    lastFrame.current = 0;
    contact.current.clear();
    schoolsRef.current = [];
    nextSchool.current = 0;
    setSchools([]);
    padsRef.current = made;
    islandsRef.current = isles;
    whalesRef.current = pod;
    setPads(made);
    setIslands(isles);
    setWhales(pod);
    setFruit(placeFruit(made, isles, pod, mid));
    setScore(0);
    setPhase("playing");
  }, [asp, worldW, worldH, sea.x0, sea.y0, sea.x1, sea.y1, placeFruit]);

  /** A shoal just off one side of the view, aimed across it. */
  const spawnSchool = useCallback(() => {
    const c = cam.current;
    const rightward = Math.random() < 0.5;
    const speed = rand(FISH_SPEED_MIN, FISH_SPEED_MAX) * (rightward ? 1 : -1);
    const n = Math.floor(rand(FISH_MIN, FISH_MAX + 1));
    const fish: Fish[] = [];
    for (let i = 0; i < n; i++) {
      fish.push({
        ox: rand(-SCHOOL_SPREAD, SCHOOL_SPREAD),
        oy: rand(-SCHOOL_SPREAD, SCHOOL_SPREAD) * 0.55,
        size: FISH_SIZE * rand(0.75, 1.15),
        delay: rand(0, 0.6),
      });
    }
    const school: School = {
      id: schoolId.current++,
      x: rightward ? c.x - SCHOOL_SPREAD * 2 : c.x + asp + SCHOOL_SPREAD * 2,
      y: clamp(c.y + rand(0.15, 0.85), sea.y0 + SCHOOL_SPREAD, sea.y1 - SCHOOL_SPREAD),
      vx: speed,
      vy: rand(-FISH_DRIFT, FISH_DRIFT) * Math.abs(speed),
      fish,
    };
    setSchools((prev) => [...prev, school]);
  }, [asp, sea.y0, sea.y1]);

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
      const h = size.h;

      speed.current *= Math.exp(-BOAT_DRAG * dt);
      omega.current *= Math.exp(-BOAT_TURN_DRAG * dt);
      heading.current += omega.current * dt;

      const th = heading.current;
      pos.current.x += Math.sin(th) * speed.current * dt;
      pos.current.y += -Math.cos(th) * speed.current * dt;

      // Beaches: the boat runs aground rather than sailing off the world.
      const bx = clamp(pos.current.x, sea.x0 + BOAT_RADIUS, sea.x1 - BOAT_RADIUS);
      const by = clamp(pos.current.y, sea.y0 + BOAT_RADIUS, sea.y1 - BOAT_RADIUS);
      if (bx !== pos.current.x || by !== pos.current.y) {
        pos.current.x = bx;
        pos.current.y = by;
        if (speed.current > 0) speed.current = -SHORE_BUMP;
      }

      // Whales cruise slowly and turn away from the beaches.
      const pod = whalesRef.current;
      for (let i = 0; i < pod.length; i++) {
        const wl = pod[i];
        wl.dir += wl.wander * WHALE_TURN * dt;
        wl.x += Math.cos(wl.dir) * WHALE_SPEED * dt;
        wl.y += Math.sin(wl.dir) * WHALE_SPEED * dt;
        if (wl.x < sea.x0 + WHALE_R || wl.x > sea.x1 - WHALE_R) {
          wl.dir = Math.PI - wl.dir;
          wl.x = clamp(wl.x, sea.x0 + WHALE_R, sea.x1 - WHALE_R);
        }
        if (wl.y < sea.y0 + WHALE_R || wl.y > sea.y1 - WHALE_R) {
          wl.dir = -wl.dir;
          wl.y = clamp(wl.y, sea.y0 + WHALE_R, sea.y1 - WHALE_R);
        }
        const el = whaleRefs.current[i];
        if (el) {
          el.style.transform =
            `translate3d(${wl.x * h}px, ${wl.y * h}px, 0) ` +
            `rotate(${(wl.dir * 180) / Math.PI}deg)`;
        }
      }

      // Fish schools: decoration only, so they are moved and dropped without
      // ever touching the boat.
      const now = t / 1000;
      if (!nextSchool.current) nextSchool.current = now + rand(0, SCHOOL_GAP_MIN);
      if (now > nextSchool.current && schoolsRef.current.length < SCHOOL_MAX) {
        nextSchool.current = now + rand(SCHOOL_GAP_MIN, SCHOOL_GAP_MAX);
        spawnSchool();
      }
      const gone: number[] = [];
      for (const sc of schoolsRef.current) {
        sc.x += sc.vx * dt;
        sc.y += sc.vy * dt;
        const el = schoolRefs.current.get(sc.id);
        if (el) el.style.transform = `translate3d(${sc.x * h}px, ${sc.y * h}px, 0)`;
        const edge = SCHOOL_SPREAD * 3;
        if (sc.x < cam.current.x - edge || sc.x > cam.current.x + asp + edge) gone.push(sc.id);
      }
      if (gone.length) {
        setSchools((prev) => prev.filter((sc) => !gone.includes(sc.id)));
        gone.forEach((id) => schoolRefs.current.delete(id));
      }

      /**
       * One circular obstacle. Lily pads preserve momentum — only a near
       * head-on hit really stops the boat — while islands and whales are solid
       * and always stop it.
       */
      const bump = (ox: number, oy: number, r: number, solid: boolean, key: string) => {
        const dx = pos.current.x - ox;
        const dy = pos.current.y - oy;
        const d = Math.hypot(dx, dy) || 1e-6;
        const touch = r + BOAT_RADIUS - (solid ? 0 : PAD_OVERLAP);

        if (d >= touch) {
          if (d > touch * PAD_RELEASE) contact.current.delete(key);
          return;
        }

        const nx = dx / d;
        const ny = dy / d; // outward, obstacle -> boat
        const push = solid ? 1 : PAD_PUSH;
        pos.current.x += nx * (touch - d) * push;
        pos.current.y += ny * (touch - d) * push;

        if (contact.current.has(key)) return;
        contact.current.add(key);

        const dirX = Math.sin(th);
        const dirY = -Math.cos(th);
        const align = -(dirX * nx + dirY * ny); // cos of angle to the obstacle's centre
        if (align <= 0) return; // already heading away

        if (solid || align > PAD_HEAD_ON_COS) {
          speed.current = -PAD_BUMP_BACK;
          if (solid) addRipple(ox + nx * r, oy + ny * r);
        } else {
          speed.current *= PAD_KEEP;
          const cross = dirX * -ny - dirY * -nx;
          heading.current -= Math.sign(cross || 1) * PAD_DEFLECT * align;
        }
      };

      const padList = padsRef.current;
      for (let i = 0; i < padList.length; i++) {
        const p = padList[i];
        if (Math.abs(p.x - pos.current.x) > 1 || Math.abs(p.y - pos.current.y) > 1) continue;
        bump(p.x, p.y, p.r, false, `p${i}`);
      }
      const isles = islandsRef.current;
      for (let i = 0; i < isles.length; i++) bump(isles[i].x, isles[i].y, isles[i].r, true, `i${i}`);
      for (let i = 0; i < pod.length; i++) bump(pod[i].x, pod[i].y, WHALE_R, true, `w${i}`);

      // Fruit
      const f = fruitRef.current;
      if (Math.hypot(pos.current.x - f.x, pos.current.y - f.y) < FRUIT_CATCH) {
        audio.chomp(audio.now + 0.005, true);
        addSpark(f.x, f.y);
        setScore((n) => n + 1);
        setFruit(placeFruit(padsRef.current, isles, pod, pos.current));
      }

      follow(dt);
      const c = cam.current;
      const world = worldRef.current;
      if (world) world.style.transform = `translate3d(${-c.x * h}px, ${-c.y * h}px, 0)`;

      // Only the pads near the view stay in the DOM, recut when the camera has
      // moved far enough for the margin to matter.
      if (Math.abs(c.x - lastCull.current.x) > CULL_STEP || Math.abs(c.y - lastCull.current.y) > CULL_STEP) {
        lastCull.current = { x: c.x, y: c.y };
        setShownPads(
          padsRef.current.filter(
            (p) =>
              p.x > c.x - CULL_MARGIN &&
              p.x < c.x + asp + CULL_MARGIN &&
              p.y > c.y - CULL_MARGIN &&
              p.y < c.y + 1 + CULL_MARGIN
          )
        );
      }

      // Off-screen fruit gets an arrow pinned to the edge of the view.
      const arrow = arrowRef.current;
      if (arrow) {
        const inset = ARROW_INSET_PX / h;
        const off = f.x < c.x + inset || f.x > c.x + asp - inset || f.y < c.y + inset || f.y > c.y + 1 - inset;
        arrow.style.opacity = off ? "1" : "0";
        if (off) {
          const ux = f.x - (c.x + asp / 2);
          const uy = f.y - (c.y + 0.5);
          const k = Math.min(
            (asp / 2 - inset) / (Math.abs(ux) || 1e-6),
            (0.5 - inset) / (Math.abs(uy) || 1e-6)
          );
          arrow.style.transform =
            `translate3d(${(asp / 2 + ux * k) * h}px, ${(0.5 + uy * k) * h}px, 0)`;
          const tip = arrowTipRef.current;
          if (tip) {
            const reach = FRUIT_RADIUS * 0.95 * h;
            tip.style.transform =
              `rotate(${(Math.atan2(uy, ux) * 180) / Math.PI + 90}deg) translateY(${-reach}px)`;
          }
        }
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
  }, [phase, size, sea.x0, sea.y0, sea.x1, sea.y1, asp, follow, placeFruit, spawnSchool, addRipple, addSpark]);

  const px = (v: number) => v * size.h;
  // Before a run the boat sits mid-water; the world aspect is only known once measured.
  const shown = phase === "ready" ? { x: worldW / 2, y: worldH / 2 } : pos.current;
  const view = phase === "ready" ? { x: worldW / 2 - asp / 2, y: worldH / 2 - 0.5 } : cam.current;
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

      <div className="arena deepWater" ref={arenaRef}>
        {/* Everything below lives in world coordinates; only this one div moves. */}
        <div
          className="world"
          ref={worldRef}
          style={{
            width: px(worldW),
            height: px(worldH),
            transform: `translate3d(${-px(view.x)}px, ${-px(view.y)}px, 0)`,
          }}
        >
          <div className="sea" style={{ inset: px(SHORE) }} />

          {islands.map((p, i) => (
            <div
              key={i}
              className="island"
              style={{
                left: px(p.x),
                top: px(p.y),
                width: px(p.r * 2),
                height: px(p.r * 2),
                transform: `translate(-50%, -50%) rotate(${p.spin}deg)`,
                filter: `hue-rotate(${(p.tone - 0.5) * 40}deg)`,
              }}
            >
              {/* The blob is rotated for variety; what stands on it is not. */}
              {p.decor.map((d, j) => (
                <img
                  key={j}
                  className="islandDecor"
                  src={d.url}
                  alt=""
                  style={{
                    left: px(p.r * (1 + d.x)),
                    top: px(p.r * (1 + d.y)),
                    width: px(p.r * d.size),
                    transform: `translate(-50%, -72%) rotate(${-p.spin}deg)`,
                    // Undo the island's tint: the sand shifts hue, the trees do not.
                    filter: `hue-rotate(${(0.5 - p.tone) * 40}deg) drop-shadow(0 0.15rem 0.25rem rgba(0, 0, 0, 0.3))`,
                  }}
                />
              ))}
            </div>
          ))}

          {whales.map((wl, i) => (
            <div
              key={i}
              className="whale"
              ref={(el) => {
                whaleRefs.current[i] = el;
              }}
              style={{
                transform: `translate3d(${px(wl.x)}px, ${px(wl.y)}px, 0) rotate(${(wl.dir * 180) / Math.PI}deg)`,
              }}
            >
              <svg viewBox="0 0 100 46" style={{ width: px(WHALE_R * 2.4), height: px(WHALE_R * 1.1) }}>
                <path
                  d="M4 23 L26 4 L30 16 Q60 2 88 18 Q98 23 88 28 Q60 44 30 30 L26 42 Z"
                  fill="#2e4a7a"
                  stroke="#1b2f52"
                  strokeWidth="2"
                />
                <ellipse cx="72" cy="30" rx="16" ry="6" fill="#4a6ea8" opacity="0.7" />
                <circle cx="82" cy="20" r="2.6" fill="#0d1832" />
              </svg>
            </div>
          ))}

          {schools.map((sc) => (
            <div
              key={sc.id}
              className="school"
              ref={(el) => {
                schoolRefs.current.set(sc.id, el);
              }}
              style={{ transform: `translate3d(${px(sc.x)}px, ${px(sc.y)}px, 0)` }}
            >
              {sc.fish.map((f, i) => (
                <img
                  key={i}
                  src={BOAT.fish}
                  alt=""
                  style={{
                    left: px(f.ox),
                    top: px(f.oy),
                    width: px(f.size),
                    animationDelay: `${f.delay}s`,
                    transform: `translate(-50%, -50%) scaleX(${Math.sign(sc.vx) * FISH_FACING})`,
                  }}
                />
              ))}
            </div>
          ))}

          {shownPads.map((p, i) => (
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
            src={fruit.sprite.url}
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
        </div>

        {/* Screen space, not world space: points the way to fruit off the view. */}
        <div className="fruitArrow" ref={arrowRef} style={{ opacity: 0 }}>
          <span className="fruitArrowTip" ref={arrowTipRef} />
          <span className="fruitArrowBadge" style={{ width: px(FRUIT_RADIUS * 1.5), height: px(FRUIT_RADIUS * 1.5) }}>
            <img src={fruit.sprite.url} alt="" style={{ width: px(FRUIT_RADIUS * 0.95) }} />
          </span>
        </div>

        {phase === "ready" && (
          <div className="overlay setup">
            <h2>Paddle left and right to reach the fruit</h2>
            <div className="setupBox">
              <Slider
                big
                label="Lily pads per screen"
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
              Follow the arrow to the fruit — mind the islands and the whales.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
