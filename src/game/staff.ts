const SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const PITCH_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/** Diatonic index of each pitch class relative to C; sharps sit half a step up. */
const DIATONIC: Record<number, number> = {
  0: 0, 1: 0.5, 2: 1, 3: 1.5, 4: 2, 5: 3, 6: 3.5, 7: 4, 8: 4.5, 9: 5, 10: 5.5, 11: 6,
};

/** Treble staff lines, as diatonic steps above middle C: E4 G4 B4 D5 F5. */
export const STAFF_LINES = [2, 4, 6, 8, 10];

/** Middle C — drawn as a permanent dim line instead of a per-note ledger. */
export const GUIDE_LINE = 0;

export function midiFromName(name: string): number {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  if (!m) throw new Error(`bad note name: ${name}`);
  const accidental = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0;
  return (Number(m[3]) + 1) * 12 + SEMITONE[m[1]] + accidental;
}

export function nameFromMidi(midi: number): string {
  return `${PITCH_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

export function letterOf(midi: number): string {
  return PITCH_NAMES[((midi % 12) + 12) % 12][0];
}

export function freqFromMidi(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Vertical staff position, in diatonic steps above middle C. */
export function staffStep(midi: number): number {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return DIATONIC[pc] + (octave - 4) * 7;
}

export function isSharp(midi: number): boolean {
  return !Number.isInteger(staffStep(midi));
}

export function matches(played: number, target: number, anyOctave: boolean): boolean {
  return anyOctave ? ((played - target) % 12 + 12) % 12 === 0 : played === target;
}
