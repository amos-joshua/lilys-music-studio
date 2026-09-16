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
| **Piano Bug** — a bug waits on the next key of the tune; play it to send it hopping | playable |
| **Bug Hop** — a bug crosses between two lily pads; hit the stick it is sitting on | playable |

Append `?mode=drum|hill|boat|staff|pianobug|bughop` to open straight into a mode.

Boat Trip, Drum Jump and Hill Climb share a **mixed mode** toggle on their start screens:
with it on, finishing a round hands over to the next of the three, starting from whichever
was opened. Drum Jump uses its own shorter round length (`mixedTreatCount`) while it is on,
so one turn each is roughly even.

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

The water is a fixed world of `WORLD_SCREENS²` screens with beaches at its edges. Everything
is laid out in one world div that the frame loop translates, so the camera is a single
transform and no entity re-renders as the view moves. The boat is held a quarter of the view
from each edge and the camera eases toward that deadzone rather than being pinned to it; it
stops at the shoreline, which is the only place the boat reaches the view edge. Islands and
whales reuse the lily pad collision as solid obstacles, fruit spawns within a screen or two of
the boat, and a badge on the view edge points the way when it is off screen. A trip ends at
`boatFruitGoal` fruit.

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

### Bug Hop

Drum Jump is a **reaction** game: the app picks the moment and the child must hit it, which needs
read-ahead and precision. Slow enough to follow is boring, fast enough to be busy is unreadable,
and there is no tempo in between — the difficulty *is* the precision. Hill Climb replaces that
with a continuous mapping (rate → speed), which is far gentler, but its optimum is *maximum* rate,
so all-out whacking wins.

Bug Hop looks for the third thing: a mapping whose optimum is a *particular* rate rather than the
highest one. The bug crosses to the other lily pad when the stick on its own side is struck, so
playing at all means alternating hands, and there is nothing at all to read ahead — the bug is on
the left or it is on the right. The other stick makes it lean that way without jumping: visible,
silent, and free, like a wrong note in Note Muncher. Mid-air taps are ignored rather than scolded,
because the sticks do not stop just because the bug is between pads.

`game/groove.ts` is the other half. Everything else in `game/` assumes the app sets the tempo and
the player follows (`BeatGrid`, `latencyOffsetMs`, the metronome); this is the opposite, and none
of that machinery applies. It watches inter-onset intervals and reports a **streak**: a tap whose
spacing matches the running average extends it *however fast or slow that average is*, so a calm
even beat earns everything that frantic whacking does not. An off-beat tap is not a failure — it
becomes the new tempo and the streak restarts, so drifting gradually faster is allowed to succeed.
Measured against play patterns:

```
steady 600ms (100bpm)              best streak:  19
steady 1200ms (50bpm, slow)        best streak:  19
steady with human jitter +-12%     best streak:  19
all-out whacking (random 80-400)   best streak:   3
gradual speed-up 900->500          best streak:  19
steady then one long pause         best streak:   8
```

`bugHopMs` is the time in the air, and also the tempo ceiling — taps are ignored mid-hop, so a
lazier hop makes frantic drumming physically impossible as well as unrewarding, and gives a small
child something to pace herself against. One slider drives the crossing and the arc together
through a `--hop` custom property. Every fourth hop shouts "hey!" (when `heyBeat` is on), which
groups the beat into bars out loud and gives her three hops to aim at the next one.

Rewards start at `HOP_REWARD_AT` and grow through `HOP_REWARD_TIERS` — more of them, and from a
wider pool, the longer the beat holds. A round ends on the clock (`bugHopMinutes`, 1–6) or early
on a long steady run (`HOP_TARGET_STREAK`), whichever comes first.

### Piano Bug

A keyboard drawn in CSS 3D — a front view tipped back, black keys raised on `translateZ` so they
occlude correctly, and a front face hanging below each key's near edge. The face cancels the
keyboard's tilt (`calc(-1 * var(--tilt))`); rotated a flat 90° from the key plane instead, it
splays out into a ledge that perspective then curls upward.

Only the middle octave of the drawn range carries sticker tabs, matching the one octave stickered
on Lily's piano, and the tune is folded into that octave so the bug is always on a coloured key.
Stickers are graded while playing — `STICKER_NOW` for the note due, `STICKER_NEXT` for the one
after it, `STICKER_REST` for everything else — so the key coming up is a hint rather than a second
thing competing for attention. A repeated note leaves only the one sticker lit.
The stickered octave is derived from the range rather than pinned to absolute MIDI numbers, so
shifting the range on the start screen carries stickers, bug and targets with it.

Finishing a tune leads straight into the next round rather than a choice: the same tune until it
has been played `BUG_TUNE_PLAYS` times, then the one after it in `MELODIES`, wrapping. The trophy
is the only pause. "Pick a tune" is still there for an adult, but nothing has to be chosen to keep
playing. Free play never moves on.

The bug's layer sits proud of the keys (`translateZ`) because a held key tips its front edge
toward the viewer by more than a rem at the bug's end of the key — enough to swallow it whole.
Stars sit between the two: above a pressed key, below the bug.

## Input

`src/midi/` resolves MIDI through four sources at once; any of them can feed the game.

| Source | Notes |
| --- | --- |
| `webmidi.ts` | `navigator.requestMIDIAccess`. Works on desktop Chrome, and on iPad if the bridge injects a polyfill. |
| `bridge.ts` → `BridgeSource` | Catch-all for a native bridge. Listens on `window.postMessage`, a set of global callbacks (`window.onMidiMessage`, `receiveMIDI`, `__midiBridge.onMessage`, …) and custom DOM events. |
| `bridge.ts` → `WebSocketSource` | Only if a URL is set in Settings. |
| `keyboard.ts` | Space = pad, A–K = C4–C5. Desktop fallback; screen taps go through the same path. |
| `mic.ts` | Opt-in in Settings. Sung pitch becomes note-on/note-off, so the piano modes work with no keyboard attached. |

`parseMidiPayload` accepts byte arrays, `Uint8Array`, `ArrayBuffer`, `{data|bytes|midi|message|payload}`
wrappers, `{status,data1,data2}`, `{type:'noteOn',note,velocity,channel}`, and hex or decimal strings.
Leading framing bytes before the first status byte are stripped.

**The bridge's calling convention is not yet known.** Anything inbound that cannot be
decoded is still shown in the MIDI monitor (top bar → device pill) with its raw payload,
so the actual shape can be read off the screen and taught to the parser.

By default every note-on from every device and channel counts as a drum hit.

### Singing

`MicSource` is an ordinary `MidiSource`, so no mode knows a hit was sung. The work is turning a
continuous pitch into discrete notes ([pitchy](https://github.com/ianprime0509/pitchy), McLeod
pitch method): a note starts once the same semitone has held for `MIC_HOLD_FRAMES`, ends after
`MIC_RELEASE_FRAMES` of quiet, and holds until the voice is `MIC_CENTS_DEADBAND` cents past the
halfway point to its neighbour, so vibrato does not chatter between two semitones. A single
frame an octave off the running pitch is treated as the detector rather than the singer.

Echo cancellation is **on**, because the app plays a piano tone through the same speakers the
microphone is listening to, and on top of that the microphone is **gated** while the app is
sounding: `AudioEngine` records a window per scheduled sound and `MicSource` skips those frames
entirely — skipping rather than reporting silence, so a note held through one of the app's own
sounds is not cut short by it. Two details matter. Sounds are often scheduled well ahead (the
metronome most of all), so a window is a span to be *inside*, not a deadline to be before; and
the gated span is capped at `SOUND_GATE_MAX_MS`, because a piano note is scheduled for 1.1s but
decays to nothing long before that and gating the whole ring would leave no gap to sing the next
note into. Headphones remove the question entirely. Piano Bug forgives the
octave for microphone hits only (`hit.kind === "mic"`) — a voice sings the tune wherever it
sits, while a key press still has to be the key the bug is standing on.

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
src/midi/mic.ts            microphone pitch -> notes (method carried over from singing-bob)
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
