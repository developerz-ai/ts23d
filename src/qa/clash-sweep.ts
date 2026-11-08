// Swept volume of a spinning part for the clashes gate: the solid of revolution (radius profile
// per axial slice) a wheel, axle or rotor fills over a full turn. Also the shared axis frame and
// Volume shape; hinged parts (sways) sweep only their sector in clash-sector.ts.

import type { Mesh, Vec3 } from '../core/index.ts';
import { surfaceSamples } from './geometry.ts';
import { CLASH_EPS } from './types.ts';

/** A swept volume plus its conservative world AABB, so far-away parts and samples skip the test. */
export interface Volume {
  readonly inside: (p: Vec3) => boolean;
  readonly min: Vec3;
  readonly max: Vec3;
}

const SLICES = 24;

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

/** Solid of revolution `mesh` sweeps spinning a full turn about `axis` through `pivot`. */
export function spinVolume(mesh: Mesh, pivot: Vec3, axis: Vec3): Volume {
  const coords = axisFrame(pivot, axis);
  const pts = surfaceSamples(mesh, 0.05, 8).map(coords);
  // Loops, not Math.min(...xs): a spread of ≥ ~1 M samples overflows the call stack.
  let lo = Infinity;
  let hi = -Infinity;
  let rMax = 0;
  for (const p of pts) {
    if (p[0] < lo) lo = p[0];
    if (p[0] > hi) hi = p[0];
    if (p[1] > rMax) rMax = p[1];
  }
  const span = Math.max(hi - lo, 1e-6);
  const slice = (a: number): number => Math.min(SLICES - 1, Math.floor(((a - lo) / span) * SLICES));
  // Per axial slice, everything nearer the axis than the farthest body sample.
  const sliceMax = new Float64Array(SLICES).fill(-1);
  for (const [a, r] of pts) {
    const s = slice(a);
    sliceMax[s] = Math.max(sliceMax[s] ?? -1, r);
  }
  const reach = rMax + Math.max(Math.abs(lo), Math.abs(hi));
  return {
    min: [pivot[0] - reach, pivot[1] - reach, pivot[2] - reach],
    max: [pivot[0] + reach, pivot[1] + reach, pivot[2] + reach],
    inside: (p) => {
      const [a, r] = coords(p);
      if (a < lo + CLASH_EPS || a > hi - CLASH_EPS) return false;
      return r < (sliceMax[slice(a)] ?? -1) - CLASH_EPS;
    },
  };
}
