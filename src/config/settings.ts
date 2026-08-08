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
}

export const DEFAULT_SETTINGS: Settings = {
  bpm: 84,
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
};

// Timing constants that are engine detail rather than user-facing knobs.
export const JUMP_RISE_S = 0.13;
export const JUMP_FALL_S = 0.32;
export const JUMP_TOTAL_S = JUMP_RISE_S + JUMP_FALL_S;
export const DOUBLE_HIT_MS = 120;
export const PERFECT_FRACTION = 0.35;
export const MAX_OFFSET_MS = 180;
export const CALIBRATE_MIN_SAMPLES = 8;
