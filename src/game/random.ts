/**
 * One seeded random stream for the whole session, used for anything a player
 * would notice repeating — which animal climbs the hill, which fruit is at the
 * top. `Math.random` would do, but a named stream makes the intent explicit and
 * keeps a run reproducible if the seed is ever pinned by hand.
 *
 * The seed comes from the crypto RNG, so the cast differs on every startup; a
 * fixed seed would hand out the same animal every morning.
 */
export function makeSeed(): number {
  const buf = new Uint32Array(1);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(buf);
  else buf[0] = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
  return buf[0];
}

/** mulberry32: tiny, fast, and well distributed over a session's few hundred draws. */
export function rngFrom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SESSION_SEED = makeSeed();
export const random = rngFrom(SESSION_SEED);

export function pick<T>(items: readonly T[], rnd: () => number = random): T {
  return items[Math.floor(rnd() * items.length)];
}

/** Fisher-Yates on a copy. */
export function shuffled<T>(items: readonly T[], rnd: () => number = random): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Like `pick`, but never repeats `previous` when there is another choice. */
export function pickOther<T>(items: readonly T[], previous: T | undefined, rnd: () => number = random): T {
  if (items.length < 2) return items[0];
  const rest = items.filter((i) => i !== previous);
  return pick(rest.length ? rest : items, rnd);
}
