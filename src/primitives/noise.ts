// Seeded 2D noise kit for terrain and maps: gradient (Perlin) and value noise, fBm, ridged
// multifractal (Musgrave: sharp ridgelines), billow (rounded hills), domain warp (Quílez: folded,
// flowing ranges) and terraces. Everything derives from an Rng and uses only + − × ÷ sqrt floor,
// so the same seed gives the same bits on every engine (no sin/pow/exp in the hot path).
// A Noise2 takes metres (x, y) and returns roughly [−1, 1] (ridged: [0, 1]).

import type { Rng } from '../core/index.ts';

export type Noise2 = (x: number, y: number) => number;

export interface FractalOptions {
  /** Metres per base feature (the first octave's wavelength). Default 1. */
  readonly scale?: number;
  readonly octaves?: number;
  /** Frequency multiplier per octave. Default 2. */
  readonly lacunarity?: number;
  /** Amplitude multiplier per octave (persistence). Default 0.5. */
  readonly gain?: number;
}

const R = Math.SQRT1_2;
/** Eight unit gradients with exact constants (no trig: bitwise identical everywhere). */
const GX = [1, -1, 0, 0, R, -R, R, -R];
const GY = [0, 0, 1, -1, R, R, -R, -R];

function permutation(rng: Rng): Uint8Array {
  const p = new Uint8Array(512);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = rng.int(0, i);
    const t = p[i] ?? 0;
    p[i] = p[j] ?? 0;
    p[j] = t;
  }
  for (let i = 0; i < 256; i++) p[i + 256] = p[i] ?? 0;
  return p;
}

const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);

/** Perlin gradient noise, feature size 1 m, ≈ [−1, 1]. */
export function gradientNoise2(rng: Rng): Noise2 {
  const p = permutation(rng);
  const grad = (ix: number, iy: number, dx: number, dy: number): number => {
    const g = (p[(p[ix & 255] ?? 0) + (iy & 255)] ?? 0) & 7;
    return (GX[g] ?? 0) * dx + (GY[g] ?? 0) * dy;
  };
  return (x, y) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const u = fade(fx);
    const v = fade(fy);
    const a = grad(ix, iy, fx, fy);
    const b = grad(ix + 1, iy, fx - 1, fy);
    const c = grad(ix, iy + 1, fx, fy - 1);
    const d = grad(ix + 1, iy + 1, fx - 1, fy - 1);
    const top = a + (b - a) * u;
    return (top + (c + (d - c) * u - top) * v) * Math.SQRT2;
  };
}

/** Value noise (smoothed random lattice), feature size 1 m, [−1, 1]. Blobbier than gradient. */
export function valueNoise2(rng: Rng): Noise2 {
  const p = permutation(rng);
  const vals = new Float64Array(256);
  for (let i = 0; i < 256; i++) vals[i] = rng.next() * 2 - 1;
  const at = (ix: number, iy: number): number => vals[p[(p[ix & 255] ?? 0) + (iy & 255)] ?? 0] ?? 0;
  return (x, y) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const u = fade(x - ix);
    const v = fade(y - iy);
    const top = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * u;
    const bot = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * u;
    return top + (bot - top) * v;
  };
}

/** Sum octaves of `shape(n(x·f, y·f))`, normalised by the amplitude sum. */
function fractal(n: Noise2, o: FractalOptions, shape: (v: number) => number): Noise2 {
  const s = 1 / (o.scale ?? 1);
  const octaves = o.octaves ?? 5;
  const lac = o.lacunarity ?? 2;
  const gain = o.gain ?? 0.5;
  return (x, y) => {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let f = s;
    for (let i = 0; i < octaves; i++) {
      // Offset each octave so lattice zeros never line up at the origin.
      sum += amp * shape(n(x * f + i * 17.31, y * f - i * 9.73));
      norm += amp;
      amp *= gain;
      f *= lac;
    }
    return sum / norm;
  };
}

/** Fractal Brownian motion: the default rolling-hills / rough-surface noise, ≈ [−1, 1]. */
export const fbm = (n: Noise2, o: FractalOptions = {}): Noise2 => fractal(n, o, (v) => v);

/** Billow: |noise| octaves, rounded domes and sharp creases (hills, clouds), [−1, 1]. */
export const billow = (n: Noise2, o: FractalOptions = {}): Noise2 =>
  fractal(n, o, (v) => 2 * Math.abs(v) - 1);

/**
 * Ridged multifractal (Musgrave): inverted |noise| squared, each octave weighted by the last, so
 * detail piles up on the ridgelines and valleys stay smooth. [0, 1].
 */
export function ridged(n: Noise2, o: FractalOptions & { readonly offset?: number } = {}): Noise2 {
  const s = 1 / (o.scale ?? 1);
  const octaves = o.octaves ?? 6;
  const lac = o.lacunarity ?? 2;
  const gain = o.gain ?? 0.5;
  const offset = o.offset ?? 1;
  return (x, y) => {
    let sum = 0;
    let norm = 0;
    let amp = 1;
    let weight = 1;
    let f = s;
    for (let i = 0; i < octaves; i++) {
      const crest = offset - Math.abs(n(x * f + i * 17.31, y * f - i * 9.73));
      const signal = crest * crest * weight;
      weight = Math.min(1, Math.max(0, signal * 2));
      sum += signal * amp;
      norm += amp * offset * offset;
      amp *= gain;
      f *= lac;
    }
    return sum / norm;
  };
}

/** Domain warp: sample `n` at a point pushed by two other noises × `amount` metres (Quílez). */
export const warp =
  (n: Noise2, wx: Noise2, wy: Noise2, amount: number): Noise2 =>
  (x, y) =>
    n(x + amount * wx(x, y), y + amount * wy(x, y));

/**
 * Terraces: snap a height to steps of `step` metres. `sharpness` is the share of each step that is
 * a flat tread (0 = no terracing, 1 = flat treads and vertical risers); the rest is a smooth riser.
 * Strata, rice paddies, open-pit benches.
 */
export function terrace(h: number, step: number, sharpness = 0.5): number {
  const k = Math.floor(h / step);
  const t = h / step - k;
  const s = Math.min(1, Math.max(0, sharpness));
  const u = s >= 1 ? 0 : Math.min(1, Math.max(0, (t - s) / (1 - s)));
  const riser = u * u * (3 - 2 * u);
  return (k + t + (riser - t) * s) * step;
}
