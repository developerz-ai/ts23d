// Scales and plates — the secondary/tertiary surface: a cellular (Worley) pattern stretched along
// the body gives domed, shingled scales (relief at LOD0, seam paint at every LOD); the belly,
// throat and tail underside carry transverse plates (ochre, dark seams) like a croc's ventral
// scutes. Colour zones too: crimson back, ember flank, cream belly, darker toward the ground.
// Pure functions of position (hash, not rng: the same point always gets the same scale).

import type { Vec3 } from '@developerz.ai/ts23d';
import { mixRgb, smoothstep, v3 } from '../_lib/creature/curve.ts';
import type { Relief } from '../_lib/creature/sculpt-part.ts';
import { neckPath, tailPath, tailRadius } from './lines.ts';
import { C } from './palette.ts';

/** Integer hash → [0, 1). */
function hash(i: number, j: number, k: number, s: number): number {
  let h = (i * 374761393 + j * 668265263 + k * 2147483647 + s * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export interface Cell {
  /** Distance to the nearest / second-nearest feature point (cell units). */
  readonly f1: number;
  readonly f2: number;
  /** Nearest cell's random id 0..1. */
  readonly id: number;
}

/** Worley noise in cell units: p already scaled (and stretched) by the caller. */
export function worley(x: number, y: number, z: number, seed: number): Cell {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  let f1 = 9;
  let f2 = 9;
  let id = 0;
  for (let k = -1; k <= 1; k++)
    for (let j = -1; j <= 1; j++)
      for (let i = -1; i <= 1; i++) {
        const cx = ix + i;
        const cy = iy + j;
        const cz = iz + k;
        const dx = cx + 0.15 + 0.7 * hash(cx, cy, cz, seed) - x;
        const dy = cy + 0.15 + 0.7 * hash(cx, cy, cz, seed + 1) - y;
        const dz = cz + 0.15 + 0.7 * hash(cx, cy, cz, seed + 2) - z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < f1) {
          f2 = f1;
          f1 = d;
          id = hash(cx, cy, cz, seed + 3);
        } else if (d < f2) f2 = d;
      }
  return { f1, f2, id };
}

/** Scale dome 0 (seam) … 1 (crown), and the cell id, for a scale size in metres. */
function scaleAt(p: Vec3, size: number, seed: number): { dome: number; id: number } {
  // Stretched along X: scales are longer than wide, like a monitor lizard's.
  const c = worley(p[0] / (size * 1.35), p[1] / size, p[2] / size, seed);
  const edge = c.f2 - c.f1;
  return { dome: smoothstep(0, 0.45, edge), id: c.id };
}

/** Transverse plate profile along `u` metres: 0 at the seams, 1 on the plate. */
function plateAt(u: number, pitch: number): number {
  const f = u / pitch - Math.floor(u / pitch);
  return smoothstep(0, 0.12, f) * smoothstep(1, 0.8, f);
}

/** Closest point parameter + distance from p to a polyline. */
function nearest(path: readonly Vec3[], p: Vec3): { t: number; d: number; at: Vec3 } {
  let best = { t: 0, d: Number.POSITIVE_INFINITY, at: path[0] ?? p };
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i] ?? p;
    const b = path[i + 1] ?? p;
    const ab = v3.sub(b, a);
    const l2 = v3.dot(ab, ab) || 1;
    const s = Math.min(1, Math.max(0, v3.dot(v3.sub(p, a), ab) / l2));
    const q = v3.add(a, v3.mul(ab, s));
    const d = v3.len(v3.sub(p, q));
    if (d < best.d) best = { t: (i + s) / (path.length - 1), d, at: q };
  }
  return best;
}

const NECK = neckPath();
const TAIL = tailPath();

/** Belly weight of a body point: the torso's underside and the throat keel. */
function bellyOf(p: Vec3): { w: number; u: number } {
  const [x, y, z] = p;
  const torso =
    smoothstep(1.2, 1.02, z) *
    smoothstep(0.42, 0.3, Math.abs(y)) *
    smoothstep(-1.0, -0.7, x) *
    smoothstep(1.55, 1.3, x);
  const n = nearest(NECK, p);
  // Throat: the side of the neck facing forward-down.
  const rel = v3.sub(p, n.at);
  const throatSide = (rel[0] * 0.8 - rel[2] * 0.6) / (n.d || 1);
  const throat =
    smoothstep(0.35, 0.65, throatSide) *
    smoothstep(0.42, 0.25, Math.abs(rel[1]) / (n.d || 1)) *
    smoothstep(0.02, 0.12, n.t);
  // Plates along the torso run across X; along the neck they run across its length.
  return throat > torso ? { w: throat, u: n.t * 2.6 } : { w: torso, u: x };
}

const SEED = 7;
/** Scale sizes (metres): chunky stylised scales, larger on the body than on the tail. */
const BODY_SCALE = 0.12;
const TAIL_SCALE = 0.095;

/** Seam darkening and per-scale tint, kept subtle: the scales are read, not counted. */
function scaleTint(c: Vec3, dome: number, id: number, k: number): Vec3 {
  const m = 1 - k + k * (0.72 + 0.28 * dome) * (0.95 + 0.1 * id);
  return [c[0] * m, c[1] * m, c[2] * m];
}

/** How much of the top of the body a point is on: torso back and the neck's crest side. */
function dorsalOf(p: Vec3): number {
  const torso = smoothstep(1.6, 2.15, p[2]) * smoothstep(1.5, 1.1, p[0]);
  const n = nearest(NECK, p);
  const up = n.d > 0 ? (p[2] - n.at[2]) / n.d : 0;
  const neck = smoothstep(0.15, 0.75, up) * smoothstep(0.02, 0.15, n.t) * smoothstep(0.7, 0.4, n.d);
  return Math.max(torso, neck);
}

/** Big-scale zones: shoulders and thighs (the armoured, stretched areas). */
function armourOf(p: Vec3): number {
  const y = Math.abs(p[1]);
  const near = (c: Vec3, r: number): number =>
    smoothstep(r, r * 0.45, Math.hypot(p[0] - c[0], y - c[1], p[2] - c[2]));
  return Math.max(near([0.96, 0.66, 1.58], 0.5), near([-1.12, 0.62, 1.32], 0.6));
}

/**
 * The scale hierarchy at a body point: big plates on the back, shoulders and thighs, medium
 * scales on the flanks (an area of rest: low contrast), tiny ones in the band between the belly
 * plates and the flank and in folds. Returns the dome (0 seam … 1 crown), the scale id and how
 * strongly to paint it. Only the layers a point needs are evaluated.
 */
function scaleHierarchy(p: Vec3, belly: number): { dome: number; id: number; k: number } {
  const big = Math.max(dorsalOf(p), armourOf(p));
  const band = smoothstep(0.0, 0.2, belly) * (1 - smoothstep(0.45, 0.85, belly));
  const pick = (size: number, seed: number) => scaleAt(p, size, seed);
  let dome = 0;
  let id = 0;
  let wsum = 0;
  const add = (w: number, size: number, seed: number): void => {
    if (w <= 0.001) return;
    const s = pick(size, seed);
    dome += s.dome * w;
    id += s.id * w;
    wsum += w;
  };
  const tiny = band;
  const mid = Math.max(0, 1 - big - tiny);
  add(big, 0.17, SEED);
  add(mid, BODY_SCALE * 0.9, SEED + 3);
  add(tiny, 0.055, SEED + 5);
  if (wsum === 0) return { dome: 0.5, id: 0.5, k: 0 };
  return { dome: dome / wsum, id: id / wsum, k: big + mid * 0.5 + tiny * 0.8 };
}

export function bodyRelief(): Relief {
  const amp = 0.009;
  return {
    amp,
    at: (p) => {
      const b = bellyOf(p);
      const plate = b.w > 0 ? plateAt(b.u, 0.16) : 0;
      const s = b.w < 1 ? scaleHierarchy(p, b.w) : { dome: 0.5, k: 0 };
      return amp * (b.w * (plate - 0.5) + (1 - b.w) * (s.dome - 0.5) * Math.min(1, s.k + 0.3));
    },
  };
}

/** Value gradient feet → head: darker and desaturated low, lighter and richer toward the head. */
export function heightGrade(c: Vec3, p: Vec3): Vec3 {
  const h = smoothstep(0, 3.3, p[2] + 0.12 * p[0]);
  const v = 0.74 + 0.34 * h;
  const sat = 0.7 + 0.4 * h;
  const lum = (c[0] + c[1] + c[2]) / 3;
  return [
    Math.min(1, (lum + (c[0] - lum) * sat) * v),
    Math.min(1, (lum + (c[1] - lum) * sat) * v),
    Math.min(1, (lum + (c[2] - lum) * sat) * v),
  ];
}

export function bodyPaint(lod: number): (p: Vec3, c: Vec3) => Vec3 {
  return (p, c) => {
    // Countershading: dark crimson spine, ember flanks, cream belly plates.
    let col = mixRgb(c, C.back, dorsalOf(p) * 0.9);
    const b = bellyOf(p);
    if (b.w > 0) {
      const plate = plateAt(b.u, 0.16);
      col = mixRgb(col, mixRgb(C.bellySeam, C.belly, 0.3 + 0.7 * plate), b.w);
    }
    if (lod < 2 && b.w < 1) {
      const s = scaleHierarchy(p, b.w);
      col = scaleTint(col, s.dome, s.id, (1 - b.w) * s.k * (lod === 0 ? 1 : 0.6));
    }
    return heightGrade(col, p);
  };
}

/** Underside weight of a tail point (world space) and its plate coordinate. */
function tailBelly(p: Vec3): { w: number; u: number } {
  const n = nearest(TAIL, p);
  const r = tailRadius(n.t);
  const below = (n.at[2] - p[2]) / r;
  return { w: smoothstep(0.25, 0.6, below), u: n.t * 4.2 };
}

export function tailRelief(): Relief {
  const amp = 0.007;
  return {
    amp,
    at: (p) => {
      const b = tailBelly(p);
      const plate = b.w > 0 ? plateAt(b.u, 0.13) : 0;
      const s = b.w < 1 ? scaleAt(p, TAIL_SCALE, SEED + 11).dome : 0;
      return amp * (b.w * (plate - 0.5) + (1 - b.w) * (s - 0.5));
    },
  };
}

export function tailPaint(lod: number): (p: Vec3, c: Vec3) => Vec3 {
  return (p, c) => {
    const n = nearest(TAIL, p);
    const top = (p[2] - n.at[2]) / tailRadius(n.t);
    // Dark crimson saddle bands across the top, like an iguana's banded tail.
    const band = smoothstep(0.35, 0.5, Math.abs(((n.t * 5.5) % 1) - 0.5));
    let col = mixRgb(c, C.back, smoothstep(-0.1, 0.6, top) * (0.6 + 0.35 * band));
    const b = tailBelly(p);
    if (b.w > 0)
      col = mixRgb(col, mixRgb(C.bellySeam, C.belly, 0.35 + 0.65 * plateAt(b.u, 0.13)), b.w);
    if (lod < 2 && b.w < 1) {
      const s = scaleAt(p, TAIL_SCALE, SEED + 11);
      col = scaleTint(
        col,
        s.dome,
        s.id,
        (1 - b.w) * (lod === 0 ? 1 : 0.6) * (1 - smoothstep(0.85, 0.95, n.t)),
      );
    }
    return heightGrade(col, p);
  };
}
