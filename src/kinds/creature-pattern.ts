// Coat pattern generators, seeded and asymmetric (left and right differ like a real animal's):
// stripes (dorso-ventral bands with per-stripe slant, wobble, reach and breaks), spots (jittered
// Worley cells), rosettes (broken rings round a darker centre), patches (piebald blotches from
// low-frequency noise), agouti (banded-hair grizzle streaked along the body, dense on the saddle).
// Each returns mark coverage 0..1 at a world point, antialiased over `aa`
// metres. Pure functions of position + seed: the same point always gets the same mark.

import type { Vec3 } from '../core/index.ts';
import { createRng } from '../core/index.ts';
import { valueNoise } from '../primitives/index.ts';
import { hash, smoothstep } from './creature-curve.ts';
import type { CreaturePattern } from './creature-spec.ts';

/** Where a point sits on the body: v = dorso-ventral (+1 top line, −1 belly line). */
export interface BodyCoord {
  readonly v: number;
  /** Arc fraction along the tail (0 off the tail). */
  readonly tail?: number;
}

export type Marks = (p: Vec3, at: BodyCoord) => number;

interface Cell {
  readonly f1: number;
  readonly f2: number;
  readonly id: number;
  /** Angle of p about the nearest feature point (rosette gaps). */
  readonly ang: number;
}

/** Worley noise in cell units (p already scaled by the caller). */
export function worley(x: number, y: number, z: number, seed: number): Cell {
  const [ix, iy, iz] = [Math.floor(x), Math.floor(y), Math.floor(z)];
  let f1 = 9;
  let f2 = 9;
  let id = 0;
  let ang = 0;
  for (let k = -1; k <= 1; k++)
    for (let j = -1; j <= 1; j++)
      for (let i = -1; i <= 1; i++) {
        const [cx, cy, cz] = [ix + i, iy + j, iz + k];
        const h = hash(cx * 73 + cz * 7919, cy, seed);
        const fx = cx + 0.15 + 0.7 * h;
        const fy = cy + 0.15 + 0.7 * hash(cy * 31 + cz, cx, seed + 1);
        const fz = cz + 0.15 + 0.7 * hash(cz * 17 + cx, cy, seed + 2);
        const d = Math.hypot(x - fx, y - fy, z - fz);
        if (d < f1) {
          f2 = f1;
          f1 = d;
          id = h;
          ang = Math.atan2(z - fz, x - fx);
        } else if (d < f2) f2 = d;
      }
  return { f1, f2, id, ang };
}

const band = (d: number, half: number, aa: number): number => smoothstep(half + aa, half - aa, d);

/** Stripes: bands across the body, each side its own seeds; fewer and broken toward the belly. */
function stripes(o: CreaturePattern, seed: number, aa: number): Marks {
  const cov = o.coverage ?? 0.35;
  return (p, at) => {
    const side = p[1] >= 0 ? 0 : 1;
    // Slant and wobble per side; the stripe index from the phase along the body.
    const tilt = 0.25 * (hash(side, 1, seed) - 0.5);
    const wob = 0.18 * o.scale * Math.sin(p[2] / (o.scale * 0.9) + 6 * hash(side, 2, seed));
    const phase = (p[0] + tilt * p[2] + wob) / o.scale;
    const k = Math.floor(phase);
    const h = hash(k, side, seed);
    // Reach: how far down the flank this stripe runs (−1 = to the belly line).
    const reach = 0.6 - 1.3 * hash(k, side + 7, seed);
    if (at.v < reach) return 0;
    const half = 0.5 * cov * (0.6 + 0.8 * h) * smoothstep(reach, reach + 0.3, at.v);
    const d = Math.abs(phase - k - 0.5) * o.scale;
    // A break: some stripes split into a dash and a spot.
    const gap = hash(k, side + 3, seed) > 0.7 && Math.abs(at.v - (reach + 0.5)) < 0.08 ? 0 : 1;
    return band(d, half * o.scale, aa) * gap;
  };
}

/** Spots: jittered cells, a round mark in some of them. */
function spots(o: CreaturePattern, seed: number, aa: number): Marks {
  const cov = o.coverage ?? 0.35;
  const r = 0.5 * Math.sqrt(cov) * 1.1;
  return (p) => {
    const c = worley(p[0] / o.scale, p[1] / o.scale, p[2] / o.scale, seed);
    const rr = r * (0.7 + 0.6 * c.id);
    return band(c.f1 * o.scale, rr * o.scale, aa);
  };
}

/** Rosettes: a broken ring of marks round a slightly darker centre. */
function rosettes(o: CreaturePattern, seed: number, aa: number): Marks {
  const cov = o.coverage ?? 0.35;
  return (p) => {
    const c = worley(p[0] / o.scale, p[1] / o.scale, p[2] / o.scale, seed);
    const R = 0.36 * o.scale;
    const ring = band(Math.abs(c.f1 * o.scale - R), 0.5 * cov * 0.4 * o.scale, aa);
    // Three to five gaps in the ring.
    const gaps = 3 + Math.floor(c.id * 3);
    const g = Math.cos(c.ang * gaps + c.id * 20) > 0.55 ? 0 : 1;
    const inner = c.f1 * o.scale < R * 0.8 ? 0.25 : 0;
    return Math.max(ring * g, inner);
  };
}

/** Patches: piebald blotches from smooth noise thresholded at the coverage. */
function patches(o: CreaturePattern, seed: number, aa: number): Marks {
  const n = valueNoise(createRng(seed), { scale: o.scale, octaves: 2 });
  const t = 1 - (o.coverage ?? 0.35);
  const k = aa / o.scale;
  return (p) => smoothstep(t - k, t + k, 0.5 + 0.5 * n(p));
}

/** Agouti grizzle: banded guard hairs read as fine dark flecks streaked along the hair flow
 *  (stretched ×3 along the body), dense on the saddle and fading to nothing on the belly. Soft,
 *  not thresholded: `coverage` is the share of dark-tipped hair at the top line. */
function agouti(o: CreaturePattern, seed: number): Marks {
  const n = valueNoise(createRng(seed), { scale: o.scale, octaves: 3 });
  const cov = o.coverage ?? 0.35;
  return (p, at) => {
    // Streaks follow the hair: along the trunk (x), down the hanging tail (z).
    const g = 0.5 + 0.5 * n((at.tail ?? 0) > 0 ? [p[0], p[1], p[2] / 4] : [p[0] / 4, p[1], p[2]]);
    const dorsal = smoothstep(-0.45, 0.7, at.v);
    // Octave sums cluster round 0.5 (spread ≈ ±0.15): map the coverage onto that spread.
    const t = 0.5 + (0.5 - cov) * 0.3;
    return (0.15 + 0.6 * smoothstep(t - 0.2, t + 0.2, g)) * dorsal;
  };
}

/** The marks for a pattern; `aa` = antialias half-band in metres (≈ a vertex spacing). */
export function marks(o: CreaturePattern, aa: number): Marks {
  const seed = o.seed ?? 1;
  switch (o.kind) {
    case 'stripes':
      return stripes(o, seed, aa);
    case 'spots':
      return spots(o, seed, aa);
    case 'rosettes':
      return rosettes(o, seed, aa);
    case 'patches':
      return patches(o, seed, aa);
    case 'agouti':
      return agouti(o, seed);
  }
}
