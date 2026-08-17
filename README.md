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
| **Boat Trip** — paddle left and right to steer a boat to the fruit | playable |
| **Note Muncher** — coloured bars on a treble staff, played to be eaten | playable |

Append `?mode=drum|hill|boat|staff` to open straight into a mode.

Drum Jump is about precision and runs on the beat grid. Hill Climb is about sustained
rate and has no rhythm requirement at all — sporadic hits count exactly as much as even
ones. Its physics live in `config/settings.ts` (`HILL_*`) and are tuned by simulation:
uphill speed is capped low and bled off in about half a second, downhill acceleration is
slow, and any hit always leaves the animal moving forwards however fast it was sliding.

### Boat Trip

Top-down boat on open water. A tap adds forward thrust plus an angular impulse whose sign is
the pad's side; speed bleeds off fast (9% left after a second), so progress needs continuous
paddling. **Hitting both pads together needs no special case** — the two angular impulses
cancel while the thrusts add, which is exactly "go straight, faster". Measured: two taps 40ms
apart net 0.0° of turn at double the distance, and alternating left/right paddling tracks
straight to within a couple of degrees, like real paddling. One tap alone turns ~20°.

A drum pad cannot tell us which stick is which, so sides are learned: the first note number
seen becomes right, the next left, alternating, remembered for the session. The `⇄` button in
the HUD flips every assignment at once, for when the first hit was the wrong hand.

The water **wraps** on both axes, so the boat can never be cornered. Distances to pads and
fruit use the shortest wrapping delta, so a fruit just across the seam is genuinely near.
Pads and fruit are placed clear of the edges so nothing is drawn half-off.

Lily pads preserve momentum. On first contact the angle between the boat's heading and the
line to the pad's centre decides the response — measured:

```
approach   response       speed after   turned away
     0deg  HEAD-ON bump        -0.080         0.0deg
     9deg  HEAD-ON bump        -0.080         0.0deg
    10deg  glance               0.320        31.0deg
    45deg  glance               0.320        22.3deg
    89deg  glance               0.320         0.5deg
   100deg  none (heading away)  0.400         0.0deg
```

So a square-on hit bumps back and stalls, while anything glancing keeps 80% of its speed and
is turned away from the line of centres by an amount that scales with how head-on it was.
Contact is edge-triggered with hysteresis (`PAD_RELEASE`), so resting against a pad does not
re-bump every frame; a positional push-out still runs continuously.

The Kenney sprite's pointed bow is at the *bottom* of the image, so `BOAT_SPRITE_OFFSET_DEG`
turns it around — without it the boat sails stern-first.

The view is top-down because the hull turns through every angle. A three-quarter or isometric
boat would need a pre-rendered frame per direction, and the readily available sheets carry 16 —
22.5deg per step, against the ~20deg a single tap turns. Most taps would not change the frame
at all and then one would jump a whole step, which is a coarser version of the jerk the
smoothing below removes. It would also rule out the bank. 32+ frames would be needed to beat
what free rotation already gives.

The hull is drawn at a lagged copy of the heading rather than the real one, and the size of
that lag *is* the bank angle — so one smoothed value gives both an eased rotation and a bank
that swells and settles by itself. A tap steps `omega` instantly, which otherwise snapped the
bank to full tilt in a single frame:

```
                peak bank   worst per-frame step
before              16.2deg              16.20deg
after               16.5deg               5.24deg
```

Same peak tilt, same final heading, movement untouched — only the drawing is smoothed.

### Note Muncher

A real treble staff drawn horizontally, with middle C as a permanent dim line rather than
per-note ledger lines. Melodies stay inside C4–A4, which is the range with coloured
stickers on the piano, so every bar's colour is findable on a key.

Timing is deliberately decoupled from the melody data. A bar's width is `beats × unit` —
a picture of duration, not a rule. Advancement is event-driven: the bar waits at the play
line indefinitely, and a correct note slides the strip left by exactly one bar. **There is
no clock and no render loop in this mode at all** — every animation is a CSS transition,
so there is nothing to desync or calibrate.

That leaves three knobs which vary independently, and the same melody data serves all of
them: advance (`wait` today, `flow` later), duration (`tap` today, `hold` later), and
tempo (only the slide animation, until `flow` exists).

A correct note starts eating rather than finishing it: while held, the bar slides under the
animal, pulses and throws sparks; on release it vanishes and the strip brings up the next.
So the mode is driven by note-off as well as note-on — `NoteHit.on` distinguishes them, and
the drum modes filter releases out. Controllers that never send note-off are covered by
`STAFF_MAX_HOLD_MS`, and a very short tap degrades naturally to press-and-go.

The screen is kept quiet for a small child: played bars are removed rather than left as a
trail, bars are widely spaced, and only the bar being played is fully opaque — the next is
at 38%, and everything beyond that fades to barely visible (`barOpacity`).

Any octave counts by default. Wrong notes sound the pressed pitch, move the animal to the
wrong height — visibly, which is the lesson — shake it, and cost nothing. Stray presses
during a held note are ignored rather than scolded.

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

## Credits

All assets are vendored so the app works offline.

- **Sprites** — [OpenMoji](https://openmoji.org/), CC BY-SA 4.0, in `src/assets/openmoji/`.
- **Boat** — [Pirate Pack](https://kenney.nl/assets/pirate-pack) by Kenney, **CC0**. One
  top-down sailboat (`ship (1)`, the plain-sailed one — the pack's others carry skulls).
- **Boat Trip card icon** — the same Kenney boat with its perspective reworked into a
  three-quarter view by Google Gemini, so credit runs to **Kenney (CC0)** and **Gemini**.
  Supplied as `iso-boat.jpeg` with a transparency checkerboard flattened into the pixels; that
  was cut back out by flood-filling inward from the border — plus the patch enclosed by the
  rigging, which the border flood cannot reach — then resized to 264px and quantised to 128
  colours, 642KB down to 19KB. The JPEG is kept as the source of record.
  Used **only** on the picker card. A three-quarter hull cannot be rotated through 360°, so
  play keeps the top-down sprite; see the note on 16-direction sheets below.
- **Lily pad** — drawn for this project, `src/assets/boat/lilypad.svg`. One asset rotated per
  pad rather than several variants.
- **"Hey!" sample** — ["Men Shouting Hey.wav"](https://freesound.org/people/Jace/sounds/57204/)
  by Jace via Freesound, **CC0** (no attribution required; recorded here anyway). Trimmed to the
  shout, high-passed, pitched up 10%, compressed and limited, then encoded to stereo 96kbps MP3
  — 6.6KB. `AudioEngine.hey()` falls back to a synthesised shout until it decodes.
