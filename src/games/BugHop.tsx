import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { audio } from "../audio/AudioEngine";
import { BOAT, ICONS, REWARDS } from "../config/theme";
import type { Sprite } from "../config/theme";
import { Slider } from "../components/Slider";
import { Groove } from "../game/groove";
import {
  HOP_MAX_MINUTES,
  HOP_MIN_MINUTES,
  HOP_MS_MAX,
  HOP_MS_MIN,
  HOP_REWARD_AT,
  HOP_REWARD_MS,
  HOP_REWARD_TIERS,
  HOP_TARGET_STREAK,
  HOP_WOBBLE_MS,
  hopPaceWord,
} from "../config/settings";
import type { Settings } from "../config/settings";
import type { NoteHit } from "../midi/types";

type Side = 1 | -1; // +1 right, -1 left
type Phase = "ready" | "playing" | "done";

interface Reward {
  id: number;
  sprite: Sprite;
  from: Side;
  dx: number;
  dy: number;
  spin: number;
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

export function BugHop({ settings, onSettingsChange, subscribe, injectHit, onExit }: Props) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [side, setSide] = useState<Side>(1);
  const [flying, setFlying] = useState(false);
  const [wobble, setWobble] = useState<Side | 0>(0);
  const [scold, setScold] = useState(false);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const [hops, setHops] = useState(0);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [left, setLeft] = useState(0); // ms
  const [ending, setEnding] = useState<"time" | "streak">("time");
  const [sides, setSides] = useState<{ note: number; side: Side }[]>([]);

  const phaseRef = useRef<Phase>("ready");
  const sideRef = useRef<Side>(1);
  const flyingRef = useRef(false);
  const groove = useRef(new Groove());
  const sideMap = useRef(new Map<number, Side>());
  const nextSide = useRef<Side>(1);
  const rewardId = useRef(0);
  const hopCount = useRef(0);
  const endsAt = useRef(0);
  const settingsRef = useRef(settings);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  settingsRef.current = settings;
  phaseRef.current = phase;
  sideRef.current = side;
  flyingRef.current = flying;

  const later = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(fn, ms);
    timers.current.push(id);
    return id;
  }, []);

  useEffect(() => {
    const list = timers.current;
    return () => list.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    audio.muted = !settings.sound;
  }, [settings.sound]);

  const finish = useCallback((why: "time" | "streak") => {
    if (phaseRef.current !== "playing") return;
    setEnding(why);
    setPhase("done");
    audio.fanfare();
  }, []);

  const start = useCallback(() => {
    audio.resume();
    audio.muted = !settingsRef.current.sound;
    groove.current.reset();
    hopCount.current = 0;
    setSide(1);
    setFlying(false);
    setWobble(0);
    setScold(false);
    setStreak(0);
    setBest(0);
    setHops(0);
    setRewards([]);
    const ms = settingsRef.current.bugHopMinutes * 60000;
    endsAt.current = performance.now() + ms;
    setLeft(ms);
    setPhase("playing");
  }, []);

  // The clock is the only thing running between taps.
  useEffect(() => {
    if (phase !== "playing") return;
    const id = setInterval(() => {
      const remaining = endsAt.current - performance.now();
      setLeft(remaining);
      if (remaining <= 0) finish("time");
    }, 250);
    return () => clearInterval(id);
  }, [phase, finish]);

  /**
   * Strict mode only. Without it the optimal strategy is to mash: the bug hops
   * the instant it lands, so the intervals come out at almost exactly the hop
   * time — steadier than anything a two-year-old could play on purpose, and the
   * detector cannot tell the difference. Making every tap that is not the hop
   * cost the streak is what makes waiting for the bug the way to win.
   */
  const stumble = useCallback(() => {
    groove.current.stumble();
    setStreak(0);
    setScold(true);
    audio.buzz(audio.now + 0.02);
    later(() => setScold(false), HOP_WOBBLE_MS);
  }, [later]);

  /** Thrown out on landing, more of them the longer the beat has held. */
  const celebrate = useCallback(
    (from: Side, run: number) => {
      const tier = HOP_REWARD_TIERS.filter((t) => run >= t).length;
      if (!tier) return;
      const made: Reward[] = [];
      for (let i = 0; i < tier + 1; i++) {
        made.push({
          id: rewardId.current++,
          sprite: REWARDS[Math.floor(Math.random() * Math.min(REWARDS.length, tier + 2))],
          from,
          dx: (Math.random() - 0.5) * 2.2,
          dy: -0.8 - Math.random() * 1.4,
          spin: (Math.random() - 0.5) * 220,
        });
      }
      setRewards((prev) => [...prev, ...made]);
      const ids = made.map((r) => r.id);
      later(() => setRewards((prev) => prev.filter((r) => !ids.includes(r.id))), HOP_REWARD_MS);
    },
    [later]
  );

  const hop = useCallback(
    (from: Side) => {
      const tap = groove.current.tap(performance.now());
      setFlying(true);
      flyingRef.current = true;
      setSide((s) => (s * -1) as Side);
      setHops((n) => n + 1);
      setStreak(tap.streak);
      setBest(groove.current.best);
      // Pitch rises with the streak, so a steady run is audibly going somewhere.
      audio.blip(audio.now + 0.005, Math.min(1, tap.streak / HOP_TARGET_STREAK), 100);
      // Every fourth hop shouts, which groups the beat into bars out loud and
      // gives her something to aim the next three at.
      hopCount.current += 1;
      if (settingsRef.current.heyBeat && hopCount.current % 4 === 0) audio.hey(audio.now + 0.02);

      later(() => {
        setFlying(false);
        flyingRef.current = false;
        // Read the streak as it stands on landing, not as it was on take-off:
        // a stumble in mid-air has to cost this hop's reward too.
        const run = groove.current.streak;
        if (run >= HOP_REWARD_AT) celebrate((from * -1) as Side, run);
        if (groove.current.best >= HOP_TARGET_STREAK) finish("streak");
      }, settingsRef.current.bugHopMs);
    },
    [later, celebrate, finish]
  );

  const onHit = useCallback(
    (hit: NoteHit) => {
      const s = settingsRef.current;
      if (!hit.on) return;
      if (!s.acceptAnyNote && s.drumChannelOnly && hit.channel !== 9) return;

      if (phaseRef.current !== "playing") {
        if (phaseRef.current === "ready") start();
        return;
      }
      // Mid-air taps: ignored by default, since at this age the sticks do not
      // stop just because the bug is between pads. Strict mode makes them cost
      // the streak instead, which is the only thing that rules out mashing.
      if (flyingRef.current) {
        if (s.bugHopStrict) stumble();
        return;
      }

      // First pad seen becomes right, the next left — the same learning the
      // boat does, since a drum cannot say which stick it is.
      let hitSide = sideMap.current.get(hit.note);
      if (hitSide === undefined) {
        hitSide = nextSide.current;
        sideMap.current.set(hit.note, hitSide);
        nextSide.current = (hitSide * -1) as Side;
        setSides(Array.from(sideMap.current, ([note, sd]) => ({ note, side: sd })));
      }

      if (hitSide === sideRef.current) {
        hop(hitSide);
      } else {
        // The other stick: the bug leans that way and stays put. No sound, no
        // penalty — the lesson is which stick, and it is made by showing it.
        setWobble(hitSide);
        later(() => setWobble(0), HOP_WOBBLE_MS);
        if (s.bugHopStrict) stumble();
      }
    },
    [start, hop, later, stumble]
  );

  useEffect(() => subscribe(onHit), [subscribe, onHit]);

  const pads: { side: Side; x: string }[] = useMemo(
    () => [
      { side: -1, x: "27%" },
      { side: 1, x: "73%" },
    ],
    []
  );

  const rightNote = sides.find((s) => s.side === 1)?.note;
  const leftNote = sides.find((s) => s.side === -1)?.note;
  const progress = Math.min(1, best / HOP_TARGET_STREAK);

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
            title="Swap which stick is which"
            onClick={() => {
              sideMap.current.forEach((v, k) => sideMap.current.set(k, (v * -1) as Side));
              nextSide.current = (nextSide.current * -1) as Side;
              setSides(Array.from(sideMap.current, ([note, sd]) => ({ note, side: sd })));
            }}
          >
            ⇄
          </button>
          <span className={rightNote === undefined ? "off" : ""}>right ▶</span>
        </span>
        <div className="spacer" />
        {phase === "playing" && <span className="clock">{clock(left)}</span>}
        <div className="stat">
          <img src={ICONS.star} alt="" />
          {streak}
        </div>
      </div>

      <div
        className={"arena pondArena" + (scold ? " scold" : "")}
        // Drives the crossing and the arc together, so one slider moves both.
        style={{ ["--hop" as string]: `${settings.bugHopMs}ms` }}
        onPointerDown={(e) => {
          // Each half of the screen stands in for one stick, so the mode is
          // playable — and testable — with no drum at all.
          e.preventDefault();
          audio.resume();
          const rect = e.currentTarget.getBoundingClientRect();
          injectHit(100, e.clientX - rect.left < rect.width / 2 ? 36 : 38);
        }}
      >
        <div className="grooveBar">
          <div className="grooveFill" style={{ width: `${progress * 100}%` }} />
        </div>

        {pads.map((p) => (
          <img
            key={p.side}
            className={"hopPad" + (side === p.side && !flying ? " here" : "")}
            src={BOAT.lilypad}
            alt=""
            style={{ left: p.x }}
          />
        ))}

        {rewards.map((r) => (
          <img
            key={r.id}
            className="hopReward"
            src={r.sprite.url}
            alt=""
            style={{
              left: r.from === 1 ? "73%" : "27%",
              ["--dx" as string]: `${r.dx * 10}vh`,
              ["--dy" as string]: `${r.dy * 10}vh`,
              ["--spin" as string]: `${r.spin}deg`,
            }}
          />
        ))}

        {/* The layer carries the crossing; the inner element only arcs. */}
        <div className={"hopBug" + (flying ? " flying" : "")} style={{ left: side === 1 ? "73%" : "27%" }}>
          <div className={"hopArc" + (flying ? " flying" : "")}>
            <img
              className={"bug" + (wobble ? (wobble === 1 ? " leanRight" : " leanLeft") : "")}
              src={ICONS.bug}
              alt=""
              draggable={false}
            />
          </div>
        </div>

        {phase === "ready" && (
          <div className="overlay setup" onPointerDown={(e) => e.stopPropagation()}>
            <h2>Hit the stick the bug is sitting on</h2>
            <div className="setupBox">
              <Slider
                big
                label="How long"
                value={settings.bugHopMinutes}
                min={HOP_MIN_MINUTES}
                max={HOP_MAX_MINUTES}
                suffix=" min"
                onChange={(v) => onSettingsChange({ bugHopMinutes: v })}
              />
            </div>

            <div className="setupBox">
              <Slider
                big
                label="Hop speed"
                value={HOP_MS_MIN + HOP_MS_MAX - settings.bugHopMs}
                min={HOP_MS_MIN}
                max={HOP_MS_MAX}
                step={20}
                valueLabel={hopPaceWord(settings.bugHopMs)}
                onChange={(v) => onSettingsChange({ bugHopMs: HOP_MS_MIN + HOP_MS_MAX - v })}
              />
              <button
                className={"ghost" + (settings.bugHopStrict ? " on" : "")}
                title="Taps that are not the hop buzz and break the streak"
                onClick={() => onSettingsChange({ bugHopStrict: !settings.bugHopStrict })}
              >
                No extra taps
              </button>
            </div>
            <button className="big" onClick={start}>
              Start
            </button>
            <p className="hint">
              Left, right, left, right. Keep an even beat — however fast or slow — and the bug
              starts throwing things.
              {settings.bugHopStrict && " Wait for it to land: drumming in between breaks the run."}
            </p>
          </div>
        )}

        {phase === "done" && (
          <div className="overlay" onPointerDown={(e) => e.stopPropagation()}>
            <img className="trophy" src={ICONS.trophy} alt="" />
            <h2>{ending === "streak" ? "What a beat!" : `${hops} hops!`}</h2>
            <p className="hint">Best run: {best} in a row</p>
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
