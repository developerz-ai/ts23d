// Extra clash samples where a sweep is thin: sections of a static mesh through the band a thin
// moving body fills (a rotor's disc, a door leaf's slide). Plain STEP sampling can step over a
// 2 cm band; here every triangle that crosses the band is cut by planes ≤ 1 cm apart inside it
// and each cut is sampled along its length, so whatever pierces the band lands samples in it.

import type { Mesh, Vec3 } from '../core/index.ts';
import { dmath } from '../core/index.ts';
import { dot, type Volume } from './clash-sweep.ts';

/** Bands thicker than this are covered by the ordinary STEP sampling. */
const THIN = 0.1;
/** Plane spacing across the band, and sample spacing along each cut. */
const GAP = 0.01;
const ALONG = 0.02;

type Band = NonNullable<Volume['band']>;

const gap = (p: Vec3, q: Vec3): number => dmath.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);

/** The two cut points farthest apart: a plane through a vertex reports that vertex twice. */
function farthest(ends: readonly Vec3[]): readonly [Vec3?, Vec3?] {
  let best: readonly [Vec3?, Vec3?] = ends[0] ? [ends[0], ends[0]] : [];
  let far = -1;
  for (const p of ends)
    for (const q of ends)
      if (gap(p, q) > far) {
        far = gap(p, q);
        best = [p, q];
      }
  return best;
}

/** Section samples of `mesh` inside `band`; none for a band thick enough not to need them. */
export function sectionSamples(mesh: Mesh, band: Band): Vec3[] {
  const width = band.hi - band.lo;
  if (!(width > 0) || width >= THIN) return [];
  const planes = Math.max(1, Math.ceil(width / GAP));
  const levels = Array.from({ length: planes }, (_, k) => band.lo + ((k + 0.5) * width) / planes);
  const P = mesh.positions;
  const I = mesh.indices;
  const point = (i: number): Vec3 => [P[3 * i] ?? 0, P[3 * i + 1] ?? 0, P[3 * i + 2] ?? 0];
  const out: Vec3[] = [];
  for (let t = 0; t + 2 < I.length; t += 3) {
    const v = [point(I[t] ?? 0), point(I[t + 1] ?? 0), point(I[t + 2] ?? 0)] as const;
    const d = v.map((p) => dot(p, band.dir));
    const lo = Math.min(...d);
    const hi = Math.max(...d);
    if (hi <= band.lo || lo >= band.hi) continue;
    for (const level of levels) {
      if (level < lo || level > hi) continue;
      const ends: Vec3[] = [];
      for (let e = 0; e < 3; e++) {
        const [a, b] = [v[e] ?? v[0], v[(e + 1) % 3] ?? v[0]];
        const [da, db] = [d[e] ?? 0, d[(e + 1) % 3] ?? 0];
        if ((da - level) * (db - level) > 0 || da === db) continue;
        const f = (level - da) / (db - da);
        ends.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]);
      }
      const [p, q] = farthest(ends);
      if (!p || !q) continue;
      const n = Math.max(1, Math.ceil(gap(p, q) / ALONG));
      for (let s = 0; s <= n; s++) {
        const f = s / n;
        out.push([p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f, p[2] + (q[2] - p[2]) * f]);
      }
    }
  }
  return out;
}
