export interface Step {
  /** Note name, or null for a rest. */
  note: string | null;
  /** Length in beats — drawn as bar width, not enforced unless hold mode is on. */
  beats: number;
}

export interface Melody {
  id: string;
  name: string;
  /** Step counts per phrase; the melody pauses to celebrate at each boundary. */
  phrases: number[];
  steps: Step[];
}

const q = (note: string | null, beats = 1): Step => ({ note, beats });

/**
 * All within C4-A4 to match the sticker colours on the piano. Rhythms are
 * simplified to whole beats — the bar widths teach long vs short, and nothing
 * enforces duration in wait mode.
 */
export const MELODIES: Melody[] = [
  {
    id: "up-down",
    name: "Up and Down",
    phrases: [5, 4],
    steps: [q("C4"), q("D4"), q("E4"), q("F4"), q("G4", 2), q("F4"), q("E4"), q("D4"), q("C4", 2)],
  },
  {
    id: "twinkle",
    name: "Twinkle Twinkle",
    phrases: [7, 7],
    steps: [
      q("C4"), q("C4"), q("G4"), q("G4"), q("A4"), q("A4"), q("G4", 2),
      q("F4"), q("F4"), q("E4"), q("E4"), q("D4"), q("D4"), q("C4", 2),
    ],
  },
  {
    id: "frere",
    name: "Frère Jacques",
    phrases: [4, 4, 3, 3],
    steps: [
      q("C4"), q("D4"), q("E4"), q("C4"),
      q("C4"), q("D4"), q("E4"), q("C4"),
      q("E4"), q("F4"), q("G4", 2),
      q("E4"), q("F4"), q("G4", 2),
    ],
  },
  {
    id: "birthday",
    name: "Happy Birthday",
    phrases: [6, 6],
    steps: [
      q("C4"), q("C4"), q("D4"), q("C4"), q("F4"), q("E4", 2),
      q("C4"), q("C4"), q("D4"), q("C4"), q("G4"), q("F4", 2),
    ],
  },
];

export const FREE_PLAY = "free";

export function melodyById(id: string): Melody | null {
  return MELODIES.find((m) => m.id === id) ?? null;
}

/** Step index of the last note of each phrase. */
export function phraseEnds(melody: Melody): Set<number> {
  const ends = new Set<number>();
  let i = 0;
  for (const count of melody.phrases) {
    i += count;
    ends.add(i - 1);
  }
  return ends;
}
