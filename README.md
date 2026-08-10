# Lily's Music Studio

Static, client-side MIDI games for a young child. No server, no build-time config.
Runs from `dist/` on any static host, or inside the iPad MIDI-bridge app.

```bash
npm install
npm run dev      # binds 0.0.0.0 so the iPad can reach it
npm run build
```

## Modes

| Mode | State |
| --- | --- |
| **Drum Jump** — treats arrive on the beat, the animal leaps for them | playable |
| **Hill Climb** — drum fast to climb; stop and the animal slides back | playable |
| **Piano Falls** — falling coloured notes on the sticker key colours | not started |

Drum Jump is about precision and runs on the beat grid. Hill Climb is about sustained
rate and has no rhythm requirement at all — sporadic hits count exactly as much as even
ones. Its physics live in `config/settings.ts` (`HILL_*`) and are tuned by simulation:
uphill speed is capped low and bled off in about half a second, downhill acceleration is
slow, and any hit always leaves the animal moving forwards however fast it was sliding.

## Input

`src/midi/` resolves MIDI through four sources at once; any of them can feed the game.

| Source | Notes |
| --- | --- |
| `webmidi.ts` | `navigator.requestMIDIAccess`. Works on desktop Chrome, and on iPad if the bridge injects a polyfill. |
| `bridge.ts` → `BridgeSource` | Catch-all for a native bridge. Listens on `window.postMessage`, a set of global callbacks (`window.onMidiMessage`, `receiveMIDI`, `__midiBridge.onMessage`, …) and custom DOM events. |
| `bridge.ts` → `WebSocketSource` | Only if a URL is set in Settings. |
| `keyboard.ts` | Space / F / J. Desktop fallback; screen taps go through the same path. |

`parseMidiPayload` accepts byte arrays, `Uint8Array`, `ArrayBuffer`, `{data|bytes|midi|message|payload}`
wrappers, `{status,data1,data2}`, `{type:'noteOn',note,velocity,channel}`, and hex or decimal strings.
Leading framing bytes before the first status byte are stripped.

**The bridge's calling convention is not yet known.** Anything inbound that cannot be
decoded is still shown in the MIDI monitor (top bar → device pill) with its raw payload,
so the actual shape can be read off the screen and taught to the parser.

By default every note-on from every device and channel counts as a drum hit.

## Timing

The beat grid lives on the audio clock, not `requestAnimationFrame`.

- `AudioEngine.syncClock()` maps `performance.now()` ↔ audio output time via `getOutputTimestamp()`,
  so hits, visuals and clicks share one timeline that does not drift.
- `BeatGrid` appends beats one at a time, so a tempo change never moves a beat that has
  already been scheduled or drawn.
- Treat position is derived from `(beatTime − now)` every frame, so a dropped frame cannot desync.
- Treats arrive at the animal one jump-rise (130 ms) *after* the beat, so hitting on the beat
  produces a catch at the top of the jump.

Hit handling is deliberately forgiving: every hit makes the animal jump, a hit outside the window
costs nothing, the second of a rapid double is swallowed once the first has scored, and a missed
treat just floats past. `latencyOffsetMs` absorbs both system latency and the player's own bias —
with `autoCalibrate` on it is nudged by the mean signed error every 8 catches.

## Layout

```
src/audio/AudioEngine.ts   audio clock + synthesised click / thump / chomp / fanfare
src/game/BeatGrid.ts       beat times
src/games/DrumJump.tsx     the game (React for structure, direct DOM writes per frame)
src/midi/                  input sources, decoding, useMidi hook
src/config/theme.ts        sprites + piano sticker colours (shared with singing-bob by copy)
src/config/settings.ts     defaults and engine constants
```

OpenMoji sprites (CC BY-SA 4.0) are vendored in `src/assets/openmoji/` so the app works offline.
