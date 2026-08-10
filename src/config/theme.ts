import lion from "../assets/openmoji/lion.svg";
import elephant from "../assets/openmoji/elephant.svg";
import fox from "../assets/openmoji/fox.svg";
import frog from "../assets/openmoji/frog.svg";
import penguin from "../assets/openmoji/penguin.svg";
import apple from "../assets/openmoji/apple.svg";
import banana from "../assets/openmoji/banana.svg";
import strawberry from "../assets/openmoji/strawberry.svg";
import grapes from "../assets/openmoji/grapes.svg";
import watermelon from "../assets/openmoji/watermelon.svg";
import icecream from "../assets/openmoji/icecream.svg";
import cookie from "../assets/openmoji/cookie.svg";
import doughnut from "../assets/openmoji/doughnut.svg";
import sparkles from "../assets/openmoji/sparkles.svg";
import star from "../assets/openmoji/star.svg";
import drum from "../assets/openmoji/drum.svg";
import piano from "../assets/openmoji/piano.svg";
import trophy from "../assets/openmoji/trophy.svg";

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

export const ICONS = { sparkles, star, drum, piano, trophy, icecream };
