import lion from "../assets/openmoji/lion.svg";
import elephant from "../assets/openmoji/elephant.svg";
import fox from "../assets/openmoji/fox.svg";
import frog from "../assets/openmoji/frog.svg";
import penguin from "../assets/openmoji/penguin.svg";
import cow from "../assets/openmoji/cow.svg";
import fish from "../assets/openmoji/fish.svg";
import mouse from "../assets/openmoji/mouse.svg";
import crocodile from "../assets/openmoji/crocodile.svg";
import apple from "../assets/openmoji/apple.svg";
import banana from "../assets/openmoji/banana.svg";
import strawberry from "../assets/openmoji/strawberry.svg";
import grapes from "../assets/openmoji/grapes.svg";
import watermelon from "../assets/openmoji/watermelon.svg";
import pear from "../assets/openmoji/pear.svg";
import orange from "../assets/openmoji/orange.svg";
import cherries from "../assets/openmoji/cherries.svg";
import pineapple from "../assets/openmoji/pineapple.svg";
import peach from "../assets/openmoji/peach.svg";
import icecream from "../assets/openmoji/icecream.svg";
import cookie from "../assets/openmoji/cookie.svg";
import doughnut from "../assets/openmoji/doughnut.svg";
import sparkles from "../assets/openmoji/sparkles.svg";
import star from "../assets/openmoji/star.svg";
import drum from "../assets/openmoji/drum.svg";
import piano from "../assets/openmoji/piano.svg";
import trophy from "../assets/openmoji/trophy.svg";
import boatSrc from "../assets/boat/boat.png";
import isoBoatSrc from "../assets/boat/iso-boat.png";
import lilypadSrc from "../assets/boat/lilypad.svg";
import palmTree from "../assets/openmoji/palm-tree.svg";
import evergreenTree from "../assets/openmoji/evergreen-tree.svg";
import house from "../assets/openmoji/house.svg";
import hut from "../assets/openmoji/hut.svg";
import { pickOther, shuffled } from "../game/random";

// Piano key sticker colours (matches the stickers on Lily's piano).
export const NOTE_COLORS: Record<string, string> = {
  C: "#ff7eb3",
  D: "#1a6fe0",
  E: "#ffd32a",
  F: "#ff4757",
  G: "#2ed573",
  A: "#a55eea",
  B: "#ff9f43",
};

export interface Sprite {
  id: string;
  name: string;
  url: string;
}

export const ANIMALS: Sprite[] = [
  { id: "lion", name: "Lion", url: lion },
  { id: "fox", name: "Fox", url: fox },
  { id: "frog", name: "Frog", url: frog },
  { id: "penguin", name: "Penguin", url: penguin },
  { id: "elephant", name: "Elephant", url: elephant },
  { id: "cow", name: "Cow", url: cow },
  { id: "fish", name: "Fish", url: fish },
  { id: "mouse", name: "Mouse", url: mouse },
  { id: "crocodile", name: "Crocodile", url: crocodile },
];

export const TREAT_SETS: { id: string; name: string; items: Sprite[] }[] = [
  {
    id: "fruit",
    name: "Fruit",
    items: [
      { id: "apple", name: "Apple", url: apple },
      { id: "banana", name: "Banana", url: banana },
      { id: "strawberry", name: "Strawberry", url: strawberry },
      { id: "grapes", name: "Grapes", url: grapes },
      { id: "watermelon", name: "Watermelon", url: watermelon },
      { id: "pear", name: "Pear", url: pear },
      { id: "orange", name: "Orange", url: orange },
      { id: "cherries", name: "Cherries", url: cherries },
      { id: "pineapple", name: "Pineapple", url: pineapple },
      { id: "peach", name: "Peach", url: peach },
    ],
  },
  {
    id: "treats",
    name: "Treats",
    items: [
      { id: "icecream", name: "Ice cream", url: icecream },
      { id: "cookie", name: "Cookie", url: cookie },
      { id: "doughnut", name: "Doughnut", url: doughnut },
    ],
  },
];

// The three-quarter boat is only ever shown still, on the mode picker card —
// it cannot be used in play, where the hull rotates through every angle.
export const ICONS = { sparkles, star, drum, piano, trophy, icecream, boat: isoBoatSrc };

export const BOAT = {
  boat: boatSrc,
  lilypad: lilypadSrc,
  trees: [palmTree, evergreenTree],
  houses: [house, hut],
};

/** Every edible sprite, for modes that just want variety. */
export const ALL_TREATS: Sprite[] = TREAT_SETS.flatMap((s) => s.items);

/**
 * The pool a setting names: the one sprite it pins, or everything when it names
 * no single sprite — which is how SURPRISE, and any stale stored id, resolve.
 */
export function animalPool(animalId: string): Sprite[] {
  const chosen = ANIMALS.find((a) => a.id === animalId);
  return chosen ? [chosen] : ANIMALS;
}

export function treatPool(treatSetId: string): Sprite[] {
  const set = TREAT_SETS.find((t) => t.id === treatSetId);
  return set ? set.items : ALL_TREATS;
}

/** A fresh animal for the next round, avoiding the one just seen. */
export function rollAnimal(animalId: string, previous?: Sprite): Sprite {
  return pickOther(animalPool(animalId), previous);
}

export function rollTreat(treatSetId: string, previous?: Sprite): Sprite {
  return pickOther(treatPool(treatSetId), previous);
}

/**
 * A run's worth of treats: the pool shuffled, then reshuffled as often as the
 * run needs. Every fruit is seen once before any is seen twice, and a reshuffle
 * that would put the same fruit either side of the seam is rolled again.
 */
export function rollTreatRun(treatSetId: string, count: number): Sprite[] {
  const pool = treatPool(treatSetId);
  const out: Sprite[] = [];
  while (out.length < count) {
    let block = shuffled(pool);
    for (let tries = 0; tries < 4 && pool.length > 1 && block[0] === out[out.length - 1]; tries++) {
      block = shuffled(pool);
    }
    out.push(...block);
  }
  return out.slice(0, count);
}
