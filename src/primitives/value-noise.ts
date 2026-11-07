// Seeded 3D value noise for SDF displacement (rock pitting, skin wrinkles): a shuffled lattice
// from the recipe's Rng, quintic-faded trilinear interpolation, fractal octaves. Deterministic.

import type { Rng } from '../core/index.ts';
import type { Field } from './sdf-ops.ts';

/**
 * Seeded fractal value noise in [−1, 1]: `scale` = metres per feature, `octaves` halve the scale
 * and amplitude each time. Same Rng state → same field, bit for bit.
 */
export function valueNoise(
  rng: Rng,
  o: { readonly scale?: number; readonly octaves?: number } = {},
): Field {
  const perm = new Uint8Array(512);
  const vals = new Float64Array(256);
  for (let i = 0; i < 256; i++) {
    perm[i] = i;
    vals[i] = rng.next() * 2 - 1;
  }
  for (let i = 255; i > 0; i--) {
    const j = rng.int(0, i);
    const t = perm[i] ?? 0;
    perm[i] = perm[j] ?? 0;
    perm[j] = t;
  }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i] ?? 0;
  const at = (x: number, y: number, z: number): number =>
    vals[perm[(perm[(perm[x & 255] ?? 0) + (y & 255)] ?? 0) + (z & 255)] ?? 0] ?? 0;
  const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
  const one = (x: number, y: number, z: number): number => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);
    const u = fade(x - xi);
    const v = fade(y - yi);
    const w = fade(z - zi);
    const plane = (k: number): number =>
      lerp(
        lerp(at(xi, yi, k), at(xi + 1, yi, k), u),
        lerp(at(xi, yi + 1, k), at(xi + 1, yi + 1, k), u),
        v,
      );
    return lerp(plane(zi), plane(zi + 1), w);
  };
  const s = 1 / (o.scale ?? 1);
  const octaves = o.octaves ?? 3;
  return (p) => {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let f = s;
    for (let i = 0; i < octaves; i++) {
      sum += amp * one(p[0] * f, p[1] * f, p[2] * f);
      norm += amp;
      amp *= 0.5;
      f *= 2;
    }
    return sum / norm;
  };
}
