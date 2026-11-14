// Swept volume of a spinning part for the clashes gate: the solid of revolution (exact largest
// radius per 1 cm axial slab) a wheel, axle or rotor fills over a full turn. Also the shared axis
// frame and Volume shape; hinged parts (sways) sweep only their sector in clash-sector.ts.

import type { Mesh, Vec3 } from '../core/index.ts';
import { CLASH_EPS } from './types.ts';

/** A swept volume plus its conservative world AABB, so far-away parts and samples skip the test. */
export interface Volume {
  readonly inside: (p: Vec3) => boolean;
  readonly min: Vec3;
  readonly max: Vec3;
}

/** An orthonormal frame around `axis`: u along it, e1/e2 spanning the plane of rotation. */
export function axisBasis(axis: Vec3): { u: Vec3; e1: Vec3; e2: Vec3 } {
  const len = Math.hypot(...axis) || 1;
  const u: Vec3 = [axis[0] / len, axis[1] / len, axis[2] / len];
  const ref: Vec3 = Math.abs(u[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const dr = ref[0] * u[0] + ref[1] * u[1] + ref[2] * u[2];
  const e1raw: Vec3 = [ref[0] - dr * u[0], ref[1] - dr * u[1], ref[2] - dr * u[2]];
  const l1 = Math.hypot(...e1raw) || 1;
  const e1: Vec3 = [e1raw[0] / l1, e1raw[1] / l1, e1raw[2] / l1];
  const e2: Vec3 = [
    u[1] * e1[2] - u[2] * e1[1],
    u[2] * e1[0] - u[0] * e1[2],
    u[0] * e1[1] - u[1] * e1[0],
  ];
  return { u, e1, e2 };
}

/** Coordinates about the axis: [along axis, radius, angle] for any world point. */
export function axisFrame(pivot: Vec3, axis: Vec3): (p: Vec3) => [number, number, number] {
  const { u, e1, e2 } = axisBasis(axis);
  return (p) => {
    const d0 = p[0] - pivot[0];
    const d1 = p[1] - pivot[1];
    const d2 = p[2] - pivot[2];
    const x = d0 * e1[0] + d1 * e1[1] + d2 * e1[2];
    const y = d0 * e2[0] + d1 * e2[1] + d2 * e2[2];
    return [d0 * u[0] + d1 * u[1] + d2 * u[2], Math.sqrt(x * x + y * y), Math.atan2(y, x)];
  };
}

/** Slab width along the axis (m): a flange 3 cm beside a feed pipe resolves; capped in count. */
const SLAB = 0.01;
const MAX_SLABS = 4096;

/**
 * Solid of revolution `mesh` sweeps spinning a full turn about `axis` through `pivot`: per axial
 * slab, the largest radius the surface reaches inside it. Exact, not sampled: distance from the
 * axis is convex, so over a triangle clipped to a slab it peaks at a corner of the clipped
 * polygon, i.e. a triangle vertex or an edge crossing a slab plane. A thin rotor blade fills
 * every slab it crosses; two wheels with no axle mesh between them sweep two discs, not a drum.
 */
export function spinVolume(mesh: Mesh, pivot: Vec3, axis: Vec3): Volume {
  const coords = axisFrame(pivot, axis);
  const P = mesh.positions;
  const I = mesh.indices;
  const point = (i: number): Vec3 => [P[3 * i] ?? 0, P[3 * i + 1] ?? 0, P[3 * i + 2] ?? 0];
  const nv = P.length / 3;
  const A = new Float64Array(nv);
  const R = new Float64Array(nv);
  for (let i = 0; i < nv; i++) {
    const [a, r] = coords(point(i));
    A[i] = a;
    R[i] = r;
  }
  let lo = Infinity;
  let hi = -Infinity;
  let rMax = 0;
  for (const i of I) {
    const a = A[i] ?? 0;
    if (a < lo) lo = a;
    if (a > hi) hi = a;
    if ((R[i] ?? 0) > rMax) rMax = R[i] ?? 0;
  }
  const span = Math.max(hi - lo, 1e-6);
  const count = Math.min(MAX_SLABS, Math.max(1, Math.ceil(span / SLAB)));
  const width = span / count;
  const slab = (a: number): number =>
    Math.min(count - 1, Math.max(0, Math.floor((a - lo) / width)));
  const sliceMax = new Float64Array(count).fill(-1);
  const put = (s: number, r: number): void => {
    if (s >= 0 && s < count && r > (sliceMax[s] ?? -1)) sliceMax[s] = r;
  };
  for (let t = 0; t < I.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const p = I[t + k] ?? 0;
      const q = I[t + ((k + 1) % 3)] ?? 0;
      put(slab(A[p] ?? 0), R[p] ?? 0);
      const [ap, aq] = [A[p] ?? 0, A[q] ?? 0];
      const [s0, s1] = [slab(Math.min(ap, aq)), slab(Math.max(ap, aq))];
      if (s0 === s1) continue;
      const [pp, pq] = [point(p), point(q)];
      // The edge crosses the planes between slabs s0 … s1: each crossing bounds both neighbours.
      for (let b = s0 + 1; b <= s1; b++) {
        const f = (lo + b * width - ap) / (aq - ap);
        const r = coords([
          pp[0] + (pq[0] - pp[0]) * f,
          pp[1] + (pq[1] - pp[1]) * f,
          pp[2] + (pq[2] - pp[2]) * f,
        ])[1];
        put(b - 1, r);
        put(b, r);
      }
    }
  }
  const reach = rMax + Math.max(Math.abs(lo), Math.abs(hi));
  return {
    min: [pivot[0] - reach, pivot[1] - reach, pivot[2] - reach],
    max: [pivot[0] + reach, pivot[1] + reach, pivot[2] + reach],
    inside: (p) => {
      const [a, r] = coords(p);
      if (a < lo + CLASH_EPS || a > hi - CLASH_EPS) return false;
      return r < (sliceMax[slab(a)] ?? -1) - CLASH_EPS;
    },
  };
}
