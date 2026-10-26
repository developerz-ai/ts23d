// Seeded integer-hash value noise and fBm, periodic along X so strips tile seamlessly along U.
// Pure functions of (coords, seed): no state, no allocation, safe in per-pixel loops.

/** Integer hash of a lattice point to [0, 1). */
export function hash2(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iy | 0, 0x165667b1) ^ seed;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Value noise in [0, 1] on a unit lattice, periodic in x with an integer `period` (cells). */
export function valueNoise(x: number, y: number, period: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const x0 = ((xi % period) + period) % period;
  const x1 = (x0 + 1) % period;
  const a = hash2(x0, yi, seed);
  const b = hash2(x1, yi, seed);
  const c = hash2(x0, yi + 1, seed);
  const d = hash2(x1, yi + 1, seed);
  return a + (b - a) * sx + (c - a + (d - c - b + a) * sx) * sy;
}

/**
 * Fractal Brownian motion in [-1, 1]: `octaves` layers of value noise, each at double frequency
 * and `gain` amplitude. Doubling keeps the period an integer, so the sum stays tileable.
 */
export function fbm(
  x: number,
  y: number,
  period: number,
  seed: number,
  octaves = 4,
  gain = 0.5,
): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(x * f, y * f, period * f, seed + o * 1013);
    norm += amp;
    amp *= gain;
    f *= 2;
  }
  return (sum / norm) * 2 - 1;
}
