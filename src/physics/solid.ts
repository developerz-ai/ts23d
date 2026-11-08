// Solid (non-hollow) mass of one part's shells. Closed shells keep their exact signed-volume
// integrals; shells whose bounds overlap form a component, and a component of several (or any open
// shell) adds the ray-sampled union correction (occupancy.ts), so merged overlapping solids count
// once and open shells are filled. A lone manifold shell, or shells that never overlap, stay exact.

import type { Mesh, Vec3 } from '../core/index.ts';
import { cappedHull, pointsOf } from './hull-cap.ts';
import { accumulate, addTetra, emptyMoments, type Moments } from './moments.ts';
import { type Tri, unionCorrection } from './occupancy.ts';
import type { Shell } from './shells.ts';

const vertexAt = (m: Mesh, i: number): Vec3 => [
  m.positions[i * 3] ?? 0,
  m.positions[i * 3 + 1] ?? 0,
  m.positions[i * 3 + 2] ?? 0,
];

export const triangle = (m: Mesh, t: number): [Vec3, Vec3, Vec3] => [
  vertexAt(m, m.indices[t * 3] ?? 0),
  vertexAt(m, m.indices[t * 3 + 1] ?? 0),
  vertexAt(m, m.indices[t * 3 + 2] ?? 0),
];

export interface SolidResult {
  readonly moments: Moments;
  readonly volume: number;
  /** Estimated volume error of the occupancy integration (m³); 0 when exact. */
  readonly error: number;
  readonly open: number;
  readonly inverted: number;
}

interface Prepared {
  readonly tris: Tri[];
  readonly exact: Moments;
  readonly signed: number;
  readonly lo: Vec3;
  readonly hi: Vec3;
  /** Balanced (closed 2-cycle): its signed integral is exact. */
  readonly closed: boolean;
  /** Closed and manifold: cannot overlap itself. */
  readonly manifold: boolean;
  readonly rho: number;
}

function prepare(mesh: Mesh, s: Shell, rho: number): Prepared {
  const tris: Tri[] = [];
  const exact = emptyMoments();
  const lo: [number, number, number] = [Infinity, Infinity, Infinity];
  const hi: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  let signed = 0;
  for (const t of s.triangles) {
    const tri = triangle(mesh, t);
    tris.push(tri);
    signed += addTetra(exact, ...tri, rho);
    for (const p of tri)
      for (const k of [0, 1, 2] as const) {
        lo[k] = Math.min(lo[k], p[k]);
        hi[k] = Math.max(hi[k], p[k]);
      }
  }
  return { tris, exact, signed, lo, hi, closed: s.balanced, manifold: s.closed, rho };
}

/** Bounds that overlap with positive volume (touching faces do not merge solids). */
const EPS = 1e-6;
const overlaps = (a: Prepared, b: Prepared): boolean =>
  [0, 1, 2].every(
    (k) => Math.min(a.hi[k] ?? 0, b.hi[k] ?? 0) - Math.max(a.lo[k] ?? 0, b.lo[k] ?? 0) > EPS,
  );

/** Shell index groups whose bounds overlap (transitively), each ascending, by first index. */
function components(ps: readonly Prepared[]): number[][] {
  const parent = ps.map((_, i) => i);
  const find = (i: number): number => {
    let r = i;
    while ((parent[r] ?? r) !== r) r = parent[r] ?? r;
    parent[i] = r;
    return r;
  };
  const order = ps
    .map((_, i) => i)
    .sort((a, b) => (ps[a]?.lo[0] ?? 0) - (ps[b]?.lo[0] ?? 0) || a - b);
  order.forEach((a, k) => {
    const pa = ps[a];
    if (!pa) return;
    for (let q = k + 1; q < order.length; q++) {
      const b = order[q] ?? 0;
      const pb = ps[b];
      if (!pb || pb.lo[0] >= pa.hi[0] - EPS) break;
      if (!overlaps(pa, pb)) continue;
      const [ra, rb] = [find(a), find(b)];
      if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
    }
  });
  const groups = new Map<number, number[]>();
  ps.forEach((_, i) => {
    const r = find(i);
    const g = groups.get(r);
    if (g) g.push(i);
    else groups.set(r, [i]);
  });
  return [...groups.values()];
}

function hullOf(p: Prepared): Tri[] {
  const h = cappedHull(pointsOf(new Float32Array(p.tris.flat(2))), 256);
  const v = (i: number): Vec3 => h?.vertices[i] ?? [0, 0, 0];
  return (h?.faces ?? []).map(([a, b, c]): Tri => [v(a), v(b), v(c)]);
}

/** Mass moments of `shells` of `mesh` filled solid, overlaps counted once. */
export function solidMass(
  mesh: Mesh,
  shells: readonly Shell[],
  rhos: readonly number[],
): SolidResult {
  const ps = shells.map((s, i) => prepare(mesh, s, rhos[i] ?? 0));
  const moments = emptyMoments();
  let [volume, error, open, inverted] = [0, 0, 0, 0];
  for (const p of ps) {
    if (!p.closed) open++;
    else if (p.signed < 0) inverted++;
  }
  for (const p of ps)
    if (p.closed) {
      accumulate(moments, p.exact, p.signed < 0 ? -1 : 1);
      volume += Math.abs(p.signed);
    }
  for (const group of components(ps)) {
    const members = group.flatMap((i) => ps[i] ?? []);
    if (members.length === 1 && members[0]?.manifold) continue;
    const corr = unionCorrection(
      members.map((p) =>
        p.closed ? { tris: p.tris, rho: p.rho } : { tris: p.tris, rho: p.rho, hull: hullOf(p) },
      ),
    );
    accumulate(moments, corr.moments);
    volume += corr.volume;
    error += corr.error;
  }
  return { moments, volume, error, open, inverted };
}
