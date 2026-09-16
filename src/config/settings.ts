/**
 * "Surprise me": held in `animalId` / `treatSetId` alongside the real sprite
 * ids, so a mode reads one field either way and a deliberate pick ("always the
 * lion") still wins.
 */
export const SURPRISE = "surprise";

export interface Settings {
  bpm: number;
  hitWindowMs: number;
  treatCount: number;
  countInBeats: number;
  approachBeats: number;
  velocityJump: boolean;
  tempoRamp: boolean;
  sound: boolean;
  metronome: boolean;
  /** Shout "hey!" whenever a hit lands nearest a downbeat. */
  heyBeat: boolean;
  latencyOffsetMs: number;
  autoCalibrate: boolean;
  /** A sprite id, or SURPRISE to roll a fresh one every round. */
  animalId: string;
  treatSetId: string;
  acceptAnyNote: boolean;
  drumChannelOnly: boolean;
  bridgeWsUrl: string;
  /** Bug Hop: how long a round lasts, in minutes. */
  bugHopMinutes: number;
  /** Sing instead of playing: the microphone becomes another note source. */
  micInput: boolean;
  /** Hill Climb: how fast upward motion dies away. Sets the drumming rate demanded. */
  hillBrake: number;
  /** Piano Bug: which slice of the keyboard is drawn. */
  pianoLowMidi: number;
  pianoOctaves: number;
  /** Note Muncher and Piano Bug: which tune, and whether the octave has to match. */
  melodyId: string;
  staffAnyOctave: boolean;
  /** Boat Trip: how many lily pads clutter the water, and when a trip ends. */
  boatPads: number;
  boatFruitGoal: number;
  /**
   * Play the three drum modes in turn: whichever one is opened first, then the
   * next in MIX_CYCLE each time a round finishes.
   */
  mixedMode: boolean;
  /** Drum Jump's round length while mixed mode is on: a full 24 treats would
   * dwarf a boat trip and a single climb. */
  mixedTreatCount: number;
}

export const DEFAULT_SETTINGS: Settings = {
  bpm: 72,
  hitWindowMs: 250,
  treatCount: 24,
  countInBeats: 4,
  approachBeats: 4,
  velocityJump: true,
  tempoRamp: false,
  sound: true,
  metronome: true,
  heyBeat: true,
  latencyOffsetMs: 0,
  autoCalibrate: true,
  animalId: SURPRISE,
  treatSetId: "fruit",
  acceptAnyNote: true,
  drumChannelOnly: false,
  bridgeWsUrl: "",
  bugHopMinutes: 3,
  micInput: false,
  hillBrake: 0.36,
  pianoLowMidi: 48, // C3
  pianoOctaves: 2,
  melodyId: "up-down",
  staffAnyOctave: true,
  boatPads: 3,
  boatFruitGoal: 4,
  mixedMode: false,
  mixedTreatCount: 8,
};

/**
 * Boat Trip physics. Positions and speeds are in units of the arena height, so
 * motion is isotropic regardless of aspect ratio: x runs 0..(width/height).
 *
 * A tap adds forward thrust and an angular impulse whose sign is the pad's
 * side. Tapping both sides at once needs no special case — the two angular
 * impulses cancel and the thrusts add, which is exactly "go straight, faster".
 */
export const BOAT_THRUST = 0.26;
export const BOAT_V_MAX = 0.55;
export const BOAT_DRAG = 2.4; // exponential; speed halves in ~0.29s
export const BOAT_TURN = 2.6; // rad/s added per tap
export const BOAT_TURN_DRAG = 7; // exponential; ~21 degrees per single tap
export const BOAT_RADIUS = 0.05;
export const BOAT_LENGTH = 0.13;
export const BOAT_MARGIN = 0.095; // keeps pads and fruit clear of the shoreline
/** The Kenney sprite's pointed bow is at the bottom, so it needs turning around. */
export const BOAT_SPRITE_OFFSET_DEG = 180;

/**
 * Purely visual smoothing. A tap steps `omega` instantly, so drawing the hull
 * at the true heading makes the rotation start and stop abruptly. The sprite
 * instead chases the real heading with a short lag, and the size of that lag —
 * which grows as a turn begins and decays as it ends — *is* the bank angle. One
 * smoothed value gives both an eased rotation and a bank that swells and
 * settles by itself. Movement still uses the true heading, so nothing about how
 * the boat actually travels changes.
 */
export const BOAT_VISUAL_LAG = 9; // per second; the sprite catches up in ~0.33s
export const BOAT_BANK_PER_RAD = 158; // tuned to keep the previous ~16.5deg peak bank
export const BOAT_BANK_MAX = 20;
export const FRUIT_RADIUS = 0.075;
export const FRUIT_CATCH = 0.135; // generous
export const PAD_MIN_R = 0.06;
export const PAD_MAX_R = 0.098;
export const PAD_OVERLAP = 0.035; // how far in before the boat is nudged out
export const PAD_PUSH = 0.35; // fraction of penetration corrected per frame

/**
 * Lily pads preserve momentum rather than stopping the boat. On first contact
 * the angle between the boat's heading and the line to the pad's centre decides
 * what happens: within HEAD_ON of dead-on it is a real bump, otherwise the boat
 * keeps most of its speed and is turned away from that line.
 */
export const PAD_HEAD_ON_DEG = 10;
export const PAD_HEAD_ON_COS = Math.cos((PAD_HEAD_ON_DEG * Math.PI) / 180);
export const PAD_BUMP_BACK = 0.08; // brief reverse on a head-on hit
export const PAD_KEEP = 0.8; // speed retained on a glancing one
export const PAD_DEFLECT = 0.55; // radians of turn-away, scaled by how head-on it is
export const PAD_RELEASE = 1.2; // hysteresis before the same pad can bump again

/**
 * The water is a fixed WORLD_SCREENS x WORLD_SCREENS world rather than a screen
 * that wraps. The camera holds still until the boat comes within CAM_MARGIN of
 * a view edge — a quarter of the view on that axis — then follows it, and stops
 * at the shoreline, so the beaches are the only place the boat can be pushed
 * right up against the edge.
 */
/**
 * Microphone input. A sung note is a continuous pitch, so it has to be cut into
 * discrete notes: one starts after MIC_HOLD_FRAMES on the same semitone and
 * ends after MIC_RELEASE_FRAMES of quiet, with a deadband at the semitone
 * boundary so vibrato does not chatter between neighbours.
 */
export const MIC_CLARITY = 0.9;
export const MIC_MIN_HZ = 70;
export const MIC_MAX_HZ = 1600;
export const MIC_HOLD_FRAMES = 3;
export const MIC_RELEASE_FRAMES = 4;
export const MIC_OCTAVE_FRAMES = 5; // frames before an octave jump is believed
export const MIC_CENTS_DEADBAND = 25;
/**
 * How long the microphone stays deaf around a sound the app makes. The tail
 * covers the room and the detector's 2048-sample window, which still holds the
 * sound after it has stopped. The cap matters more: a piano note is scheduled
 * for 1.1s but has decayed to nothing long before that, and gating the whole
 * ring would leave no gap to sing the next note into.
 */
export const SOUND_TAIL_MS = 90;
export const SOUND_GATE_MAX_MS = 300;

/**
 * Piano Bug. The keyboard is drawn from pianoLowMidi upward, always starting on
 * a C so the octaves line up with the sticker colours, and a bug waits on the
 * next note of the tune until that exact key is pressed.
 */
export const PIANO_LOW_MIN = 36; // C2
export const PIANO_LOW_MAX = 72; // C5
export const PIANO_OCT_MIN = 1;
export const PIANO_OCT_MAX = 3;
/**
 * Lily's stickers cover one octave, so only one octave is coloured here — the
 * middle one of whatever is drawn, which is also where the tune is played. That
 * keeps the bug within reach however the range is shifted, rather than pinning
 * it to an absolute octave that may not be the one under her hands.
 */
export const stickerLowMidi = (low: number, octaves: number) =>
  low + Math.round((octaves - 1) / 2) * 12;

/**
 * Steadiness detection, shared by the modes the player sets the tempo for.
 * The tolerance is wide because the point is a beat a two-year-old can hold,
 * not a metronome; intervals outside the range are a pause, not a beat.
 */
export const GROOVE_TOLERANCE = 0.3; // fraction of the running interval
export const GROOVE_MIN_MS = 200; // faster than this is a flam, not a beat
export const GROOVE_MAX_MS = 2500; // slower than this has lost the thread
export const GROOVE_LERP = 0.3; // how fast the running tempo follows the player

/**
 * Bug Hop. The bug sits on one lily pad and crosses to the other when the stick
 * on its own side is struck, so playing at all means alternating hands. Nothing
 * demands a tempo — the reward for a steady one is the whole game, which is why
 * the thresholds below matter more than any of the physics.
 */
export const HOP_MS = 260; // time in the air
export const HOP_MIN_MINUTES = 1;
export const HOP_MAX_MINUTES = 6;
export const HOP_TARGET_STREAK = 20; // a long steady run ends the round early
/** Rewards start once the beat is convincing, and grow with the streak. */
export const HOP_REWARD_AT = 3;
export const HOP_REWARD_TIERS = [3, 7, 12, 17];
export const HOP_REWARD_MS = 1100;
export const HOP_WOBBLE_MS = 320;

/** Sticker opacity: the note due now, the one after it, and the rest. */
export const STICKER_NOW = 1;
export const STICKER_NEXT = 0.7;
export const STICKER_REST = 0.4;

/** Each tune is played this many times before the next one comes up. */
export const BUG_TUNE_PLAYS = 2;
export const BUG_CHEER_MS = 2100; // the trophy, before the next round begins

export const BUG_HOP_MS = 320; // travel to the next key
export const BUG_STAR_MS = 700; // how long the star left behind lingers
export const BUG_GUARD_MS = 90; // a controller repeating note-on must not skip two bugs
export const BUG_WRONG_MS = 320;

export const MIXED_TREATS_MIN = 3;
export const MIXED_TREATS_MAX = 16;

export const BOAT_GOAL_MIN = 1;
export const BOAT_GOAL_MAX = 10;

export const WORLD_SCREENS = 5;
export const CAM_MARGIN = 0.25; // fraction of the view, per axis
/** The camera eases toward the deadzone rather than being pinned to it: a tap
 * steps the boat's speed instantly, and a hard-clamped camera passes that step
 * straight on to the whole view. Per second; catches up in ~0.4s. */
export const CAM_LERP = 7;
export const SHORE = 0.45; // sand band around the world, in screen heights
export const SHORE_BUMP = 0.1; // reverse speed given by running aground

export const ISLAND_COUNT = 7;
export const ISLAND_MIN_R = 0.13;
export const ISLAND_MAX_R = 0.24;
export const ISLAND_DECOR_R = 0.34; // decor stays this far inside the island, as a fraction of it
export const ISLAND_HOUSE_CHANCE = 0.6;
export const ISLAND_MAX_TREES = 2;

export const WHALE_COUNT = 4;
export const WHALE_R = 0.2;
export const WHALE_SPEED = 0.04; // screen heights per second
export const WHALE_TURN = 0.25; // radians per second of idle wander

/**
 * Schools of fish are pure decoration — no collision — and exist only near the
 * player: one spawns just off the side of the view every so often, darts across
 * faster than the boat can paddle, and is dropped once it is clear of the view.
 */
export const SCHOOL_MAX = 2;
export const SCHOOL_GAP_MIN = 4; // seconds between schools
export const SCHOOL_GAP_MAX = 12;
export const SCHOOL_SPREAD = 0.3; // half-width of the shoal, in screen heights
export const FISH_MIN = 5;
export const FISH_MAX = 10;
export const FISH_SIZE = 0.05;
export const FISH_SPEED_MIN = 0.26; // brisk, but slow enough to actually look at
export const FISH_SPEED_MAX = 0.42;
export const FISH_DRIFT = 0.22; // how far off horizontal a school may swim
/** The sprite swims to the right, so it is flipped when the school goes left. */
export const FISH_FACING = 1;

/** Fruit is placed near the boat: 25 screens of empty water is not a game. */
export const FRUIT_NEAR = 1.7;
export const FRUIT_FAR = 0.55; // ...but never right under the bow
export const ARROW_INSET_PX = 52; // how far the off-screen fruit arrow sits from the edge

/** Only pads within this much of the view are in the DOM, recut every CULL_STEP. */
export const CULL_MARGIN = 0.7;
export const CULL_STEP = 0.3;

// Note Muncher layout, in fractions of the arena.
export const STAFF_BASE = 0.17; // middle C, measured from the bottom
export const STAFF_STEP = 0.061; // one diatonic step
export const STAFF_PLAY_X = 0.29;
export const STAFF_ANIMAL_X = 0.14;
export const STAFF_BEAT_W = 0.1; // bar width per beat
export const STAFF_BAR_GAP = 0.055; // roomy, so only a few bars are on screen at once
export const STAFF_SLIDE_MS = 300;
export const STAFF_REPEAT_GUARD_MS = 100;
export const STAFF_EAT_MS = 260;
/** How long the mouthful takes once the bar has reached the animal: it is
 * drawn in from its right end, left edge pinned at the mouth, rather than
 * sitting there pulsing until the key is released. */
export const STAFF_CHEW_MS = 520;
/** Safety net for controllers that never send note-off. */
export const STAFF_SPARK_MS = 260; // one spark per mouthful bite, not a shower

export const STAFF_MAX_HOLD_MS = 2500;

/** How visible an upcoming bar is, by how many notes away it is. */
export function barOpacity(ahead: number): number {
  if (ahead <= 0) return 1;
  if (ahead === 1) return 0.38;
  if (ahead === 2) return 0.2;
  return 0.1;
}

/**
 * Hill Climb physics, in fractions of the hill per second.
 *
 * Uphill speed is capped low and bled off quickly, so the climb is driven by
 * sustained drumming rather than by momentum built up from a few hits. Below
 * zero the animal instead accelerates gently, so stopping is a slow slide
 * rather than a fall. A hit always leaves the animal moving forwards, however
 * fast it was sliding — otherwise a burst of hits reads as doing nothing.
 */
export const HILL_V_MAX = 0.18; // ~5.6s climb at full speed
export const HILL_KICK = 0.18; // added per hit, then clamped into range
export const HILL_MIN_KICK = 0.035; // the floor a single hit always reaches
export const HILL_STEP = 0.005; // instant nudge per hit, for crispness
export const HILL_GRAVITY = 0.05; // downhill only, deliberately slow
export const HILL_V_MIN = -0.25;
export const HILL_BOUNCE = 0.45;
export const HILL_BRAKE_MIN = 0.18;
export const HILL_BRAKE_MAX = 0.66;

// Timing constants that are engine detail rather than user-facing knobs.
export const JUMP_RISE_S = 0.13;
export const JUMP_FALL_S = 0.32;
export const JUMP_TOTAL_S = JUMP_RISE_S + JUMP_FALL_S;
export const DOUBLE_HIT_MS = 120;
export const PERFECT_FRACTION = 0.35;
export const MAX_OFFSET_MS = 180;
export const CALIBRATE_MIN_SAMPLES = 8;

/**
 * `brake / HILL_V_MAX` is the hits-per-second at which the animal never stops
 * moving forwards, so the words describe the pace actually being asked for.
 */
export function hillPaceWord(brake: number): string {
  const rate = brake / HILL_V_MAX;
  if (rate <= 1.2) return "very easy";
  if (rate <= 1.7) return "easy";
  if (rate <= 2.2) return "steady drumming";
  if (rate <= 2.8) return "brisk drumming";
  if (rate <= 3.4) return "fast drumming";
  return "very fast";
}

export function tempoWord(bpm: number): string {
  if (bpm <= 60) return "very gentle";
  if (bpm <= 76) return "gentle";
  if (bpm <= 96) return "steady";
  if (bpm <= 116) return "bouncy";
  return "zippy";
}
