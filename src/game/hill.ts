/**
 * The hill is one quadratic Bezier, evaluated both by the SVG that draws it and
 * by the game that walks the animal along it, so the two can never disagree.
 * Coordinates are fractions of the arena; y is measured from the bottom.
 */
/**
 * Control points are chosen so height is gained steadily from the very bottom.
 * A curve that starts near-horizontal makes early hits read as sideways drift
 * rather than climbing, however good the physics feels.
 */
const P0 = { x: 0.05, y: 0.08 };
const P1 = { x: 0.48, y: 0.3 };
const P2 = { x: 0.92, y: 0.8 };

const svgY = (y: number) => (100 - y * 100).toFixed(2);
const svgX = (x: number) => (x * 100).toFixed(2);

export const HILL_PATH =
  `M 0 100 L ${svgX(P0.x)} ${svgY(P0.y)} ` +
  `Q ${svgX(P1.x)} ${svgY(P1.y)} ${svgX(P2.x)} ${svgY(P2.y)} ` +
  `L 100 ${svgY(P2.y)} L 100 100 Z`;

/** The prize sits on the plateau just past the summit. */
export const HILL_TOP = { x: 0.955, y: P2.y + 0.01 };

export function hillPoint(t: number) {
  const u = 1 - t;
  return {
    x: u * u * P0.x + 2 * u * t * P1.x + t * t * P2.x,
    y: u * u * P0.y + 2 * u * t * P1.y + t * t * P2.y,
  };
}

/** Slope of the hill at t, as a screen-space rotation in degrees. */
export function hillAngle(t: number, aspect: number) {
  const u = 1 - t;
  const dx = 2 * u * (P1.x - P0.x) + 2 * t * (P2.x - P1.x);
  const dy = 2 * u * (P1.y - P0.y) + 2 * t * (P2.y - P1.y);
  return -(Math.atan2(dy / aspect, dx) * 180) / Math.PI;
}
