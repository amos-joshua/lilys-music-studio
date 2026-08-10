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
  latencyOffsetMs: number;
  autoCalibrate: boolean;
  animalId: string;
  treatSetId: string;
  acceptAnyNote: boolean;
  drumChannelOnly: boolean;
  bridgeWsUrl: string;
  /** Hill Climb: how fast the animal slides back, in hill-fractions per second². */
  hillSlide: number;
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
  latencyOffsetMs: 0,
  autoCalibrate: true,
  animalId: "lion",
  treatSetId: "fruit",
  acceptAnyNote: true,
  drumChannelOnly: false,
  bridgeWsUrl: "",
  hillSlide: 0.15,
};

// Hill Climb physics, in fractions of the hill.
export const HILL_IMPULSE = 0.09; // velocity added per hit
export const HILL_STEP = 0.008; // instant nudge per hit, for crispness
export const HILL_V_MAX = 0.55;
export const HILL_V_MIN = -0.45;
export const HILL_BOUNCE = 0.4;

// Timing constants that are engine detail rather than user-facing knobs.
export const JUMP_RISE_S = 0.13;
export const JUMP_FALL_S = 0.32;
export const JUMP_TOTAL_S = JUMP_RISE_S + JUMP_FALL_S;
export const DOUBLE_HIT_MS = 120;
export const PERFECT_FRACTION = 0.35;
export const MAX_OFFSET_MS = 180;
export const CALIBRATE_MIN_SAMPLES = 8;

/**
 * `slide / HILL_IMPULSE` is the hits-per-second at which the animal breaks even,
 * so the words describe the pace actually being asked for.
 */
export function hillPaceWord(slide: number): string {
  const rate = slide / HILL_IMPULSE;
  if (rate <= 0.9) return "very easy";
  if (rate <= 1.4) return "easy";
  if (rate <= 1.9) return "steady drumming";
  if (rate <= 2.4) return "brisk drumming";
  if (rate <= 2.9) return "fast drumming";
  return "very fast";
}

/** Above this the hill is out of reach for a small child. */
export const HILL_SLIDE_MAX = 0.28;

export function tempoWord(bpm: number): string {
  if (bpm <= 60) return "very gentle";
  if (bpm <= 76) return "gentle";
  if (bpm <= 96) return "steady";
  if (bpm <= 116) return "bouncy";
  return "zippy";
}
