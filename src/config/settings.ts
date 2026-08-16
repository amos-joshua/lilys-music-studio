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
  animalId: string;
  treatSetId: string;
  acceptAnyNote: boolean;
  drumChannelOnly: boolean;
  bridgeWsUrl: string;
  /** Hill Climb: how fast upward motion dies away. Sets the drumming rate demanded. */
  hillBrake: number;
  /** Note Muncher: which tune, and whether the octave has to match. */
  melodyId: string;
  staffAnyOctave: boolean;
  /** Boat Trip: how many lily pads clutter the water. */
  boatPads: number;
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
  animalId: "lion",
  treatSetId: "fruit",
  acceptAnyNote: true,
  drumChannelOnly: false,
  bridgeWsUrl: "",
  hillBrake: 0.36,
  melodyId: "up-down",
  staffAnyOctave: true,
  boatPads: 5,
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
export const BOAT_MARGIN = 0.095; // clears the boat's half-length so it never clips the edge
export const BOAT_WALL_LOSS = 0.45;
export const FRUIT_RADIUS = 0.075;
export const FRUIT_CATCH = 0.135; // generous
export const PAD_MIN_R = 0.085;
export const PAD_MAX_R = 0.14;
export const PAD_OVERLAP = 0.035; // how far in before the boat is nudged out
export const PAD_PUSH = 0.35; // fraction of penetration corrected per frame
export const PAD_STEER = 1.6; // rad/s nudge away from a pad

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
/** Safety net for controllers that never send note-off. */
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
