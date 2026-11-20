// A VDM edit's placements compiled for the fold: one flat Float64Array (frame, 1/scale, warp,
// height per placement), the shell and reach envelopes, the declared slope, and a uniform grid
// so a query point visits only the placements whose footprint can touch it (each placement is
// binned into every cell its reach box overlaps; the query reads one cell). Deterministic.

import type { Vec3 } from '../core/index.ts';
import { dmath } from '../core/index.ts';
import { invalid } from './check.ts';
import type { SculptVdm } from './vdm.ts';

export interface PlaceTable {
  /** 15 floats per placement: at, right, up, normal, 1/scale, warp a, height k. */
  readonly data: Float64Array;
  readonly count: number;
  /** d-envelope half-width H: inert where |d| ≥ H. */
  readonly shell: number;
  /** Normal-envelope half-width W: a placement is inert farther than W off its tangent plane. */
  readonly reach: number;
  /** Largest |displacement| any point can get, metres (doubled for stamps that raise and cut). */
  readonly depth: number;
  /** Max over placements of their own Lipschitz cost (see vdm.ts). */
  readonly slope: number;
  readonly hasPos: boolean;
  readonly hasNeg: boolean;
  /** Influence sphere: outside it the edit returns d unchanged. */
  readonly c: Vec3;
  readonly r: number;
  /** Per placement, the radius of the box it is binned with. */
  readonly rho: Float64Array;
}

/** Bilinear gradient bound of channel `ch` (0 right, 1 up, 2 normal), per footprint width. */
export function stampSlope(size: number, grid: Float32Array, ch: number): number {
  let worst = 0;
  const at = (i: number, j: number): number => grid[(j * size + i) * 3 + ch] ?? 0;
  for (let j = 0; j + 1 < size; j++)
    for (let i = 0; i + 1 < size; i++) {
      const gx = Math.max(
        Math.abs(at(i + 1, j) - at(i, j)),
        Math.abs(at(i + 1, j + 1) - at(i, j + 1)),
      );
      const gy = Math.max(
        Math.abs(at(i, j + 1) - at(i, j)),
        Math.abs(at(i + 1, j + 1) - at(i + 1, j)),
      );
      worst = Math.max(worst, dmath.hypot(gx, gy));
    }
  return worst * (size - 1);
}

const norm = (v: Vec3): Vec3 => {
  const l = dmath.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

export function compilePlaces(e: SculptVdm, where: string, mirror: boolean): PlaceTable {
  const s = e.vdm;
  if (e.places.length === 0) invalid(`${where}: no places`, 'give places: [{ at, normal, scale }]');
  let peak = 0;
  let hasPos = false;
  let hasNeg = false;
  for (let k = 2; k < s.grid.length; k += 3) {
    const z = s.grid[k] ?? 0;
    peak = Math.max(peak, Math.abs(z));
    if (z > 0) hasPos = true;
    if (z < 0) hasNeg = true;
  }
  if (!(peak > 0)) invalid(`${where}: the stamp has no normal displacement`, 'use vdmStamp()');
  const warp = dmath.hypot(stampSlope(s.size, s.grid, 0), stampSlope(s.size, s.grid, 1));
  const all = mirror ? [...e.places, ...e.places.map((q) => ({ ...q, mirrored: true }))] : e.places;
  const n = all.length;
  const data = new Float64Array(n * 15);
  let maxScale = 0;
  let maxDepth = 0;
  e.places.forEach((q, i) => {
    const ok =
      q.at.every(Number.isFinite) &&
      q.normal.every(Number.isFinite) &&
      dmath.norm(q.normal) > 0 &&
      q.scale > 0 &&
      Number.isFinite(q.scale) &&
      (q.depth === undefined || (q.depth > 0 && Number.isFinite(q.depth)));
    if (!ok)
      invalid(
        `${where} place ${i}: needs finite at, a non-zero normal, scale > 0 and depth > 0`,
        'give at: [x, y, z], normal: [nx, ny, nz], scale in metres (footprint width)',
      );
    maxScale = Math.max(maxScale, q.scale);
    maxDepth = Math.max(maxDepth, q.depth ?? peak * q.scale);
  });
  const both = hasPos && hasNeg;
  const depth = maxDepth * (both ? 2 : 1);
  // Shell: wide enough that the displaced surface sits on the plateau (|d| ≤ shell / 2 ≥ 2 depth)
  // and d' stays monotonic in d. Reach: the same, so a stamp covers its own surface (the plateau
  // takes a footprint's sagitta on a radius ≥ 1.4 × scale) but never a surface facing it across a
  // gap (inner leg ↔ chest), which it would print through.
  const shell = Math.max(0.35 * maxScale, 4 * depth);
  const reach = shell;
  const rho = new Float64Array(n);
  let slope = 0;
  const lo: [number, number, number] = [Infinity, Infinity, Infinity];
  const hi: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  all.forEach((q, i) => {
    const flip = 'mirrored' in q;
    const f = (v: Vec3): Vec3 => (flip ? [v[0], -v[1], v[2]] : v);
    const nn = norm(q.normal);
    const up0 =
      q.up && dmath.norm(q.up) > 0
        ? norm(q.up)
        : Math.abs(nn[2]) < 0.9
          ? ([0, 0, 1] as Vec3)
          : ([1, 0, 0] as Vec3);
    const dot = up0[0] * nn[0] + up0[1] * nn[1] + up0[2] * nn[2];
    let tv: Vec3 = [up0[0] - nn[0] * dot, up0[1] - nn[1] * dot, up0[2] - nn[2] * dot];
    if (dmath.norm(tv) < 1e-6) tv = Math.abs(nn[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    tv = norm(tv);
    const tu = cross(tv, nn);
    const dep = q.depth ?? peak * q.scale;
    const a = dep / (peak * q.scale);
    const k = dep / peak;
    data.set([...f(q.at), ...f(tu), ...f(tv), ...f(nn), 1 / q.scale, a, k], i * 15);
    slope = Math.max(slope, (k * s.lipschitz * (1 + a * warp)) / q.scale + (dep * 3.75) / reach);
    const r = dmath.hypot(q.scale * Math.SQRT1_2, reach);
    rho[i] = r;
    const at = f(q.at);
    for (let j = 0; j < 3; j++) {
      lo[j] = Math.min(lo[j] ?? 0, (at[j] ?? 0) - r);
      hi[j] = Math.max(hi[j] ?? 0, (at[j] ?? 0) + r);
    }
  });
  const c: Vec3 = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
  const r = dmath.hypot(hi[0] - c[0], hi[1] - c[1], hi[2] - c[2]) + depth;
  return { data, count: n, shell, reach, depth, slope, hasPos, hasNeg, c, r, rho };
}

/** Uniform grid over the placements: p → the indices of placements that can touch it (or null). */
export function placeTable(t: PlaceTable): (p: Vec3) => Int32Array | null {
  let cell = 0;
  for (const r of t.rho) cell = Math.max(cell, r);
  const lo = [t.c[0] - t.r, t.c[1] - t.r, t.c[2] - t.r];
  const dims = [0, 1, 2].map(() => Math.max(1, Math.ceil((2 * t.r) / cell)));
  // Keep the grid small: coarsen until it has ≤ 2M cells.
  while ((dims[0] ?? 1) * (dims[1] ?? 1) * (dims[2] ?? 1) > 2_000_000) {
    cell *= 1.5;
    for (let j = 0; j < 3; j++) dims[j] = Math.max(1, Math.ceil((2 * t.r) / cell));
  }
  const [nx = 1, ny = 1, nz = 1] = dims;
  const idx = (v: number, j: number): number => Math.floor((v - (lo[j] ?? 0)) / cell);
  const lists = new Map<number, number[]>();
  for (let i = 0; i < t.count; i++) {
    const o = i * 15;
    const r = t.rho[i] ?? 0;
    const a = [0, 1, 2].map((j) => Math.max(0, idx((t.data[o + j] ?? 0) - r, j)));
    const b = [0, 1, 2].map((j) => Math.min((dims[j] ?? 1) - 1, idx((t.data[o + j] ?? 0) + r, j)));
    for (let z = a[2] ?? 0; z <= (b[2] ?? 0); z++)
      for (let y = a[1] ?? 0; y <= (b[1] ?? 0); y++)
        for (let x = a[0] ?? 0; x <= (b[0] ?? 0); x++) {
          const key = (z * ny + y) * nx + x;
          const l = lists.get(key);
          if (l) l.push(i);
          else lists.set(key, [i]);
        }
  }
  const cells = new Map<number, Int32Array>();
  for (const [key, l] of lists) cells.set(key, Int32Array.from(l));
  return (p) => {
    const x = idx(p[0], 0);
    const y = idx(p[1], 1);
    const z = idx(p[2], 2);
    if (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz) return null;
    return cells.get((z * ny + y) * nx + x) ?? null;
  };
}
