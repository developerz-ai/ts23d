// Swept volume of a hinged part (sway) for the clashes gate: only the sector it travels through,
// resolved to millimetres (D23). The rest-pose surface is rasterised (triangle interiors too)
// into an occupancy grid of (axial slice, radial ring, angular bin); a point is swept when its
// own ring — and the rings CLASH_EPS either side — held body at some rest angle the travel
// carries onto it. Ends of travel are shrunk by CLASH_EPS of arc, so skin a few mm past the
// closed (or fully open) panel is clearance, not a clash, however long the panel.

import type { Mesh, Vec3 } from '../core/index.ts';
import { axisBasis, axisFrame, type Volume } from './clash-sweep.ts';
import { CLASH_EPS } from './types.ts';

const TAU = Math.PI * 2;
/** Raster step over the surface, and the target arc width of a bin at the farthest point. */
const STEP = 0.006;
const ARC = 0.005;
/** Radial ring width: a little over STEP so a surface crossing rings leaves no gaps. */
const RING = 0.01;
/** Axial slice width target; the count is capped for memory on very wide parts. */
const SLAB = 0.02;
const MAX_SLICES = 96;
const MAX_BINS = 8192;
const MAX_TRI_STEPS = 400;

const mod = (a: number, n: number): number => ((a % n) + n) % n;

/**
 * Visits points covering triangle (p0, p1, p2) within STEP: a grid along the two edges that meet
 * at the corner opposite the longest edge (so slivers cost their area, not their length²), plus
 * that longest edge itself.
 */
function rasterTriangle(
  q0: Vec3,
  q1: Vec3,
  q2: Vec3,
  visit: (a: number, x: number, y: number) => void,
): void {
  const d = (p: Vec3, q: Vec3): number => Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
  const l0 = d(q1, q2);
  const l1 = d(q2, q0);
  const l2 = d(q0, q1);
  const [o, b, c] = l0 >= l1 && l0 >= l2 ? [q0, q1, q2] : l1 >= l2 ? [q1, q2, q0] : [q2, q0, q1];
  const steps = (l: number): number => Math.max(1, Math.min(MAX_TRI_STEPS, Math.ceil(l / STEP)));
  const kb = steps(d(o, b));
  const kc = steps(d(o, c));
  for (let i = 0; i <= kb; i++) {
    const sb = i / kb;
    const jMax = Math.floor(kc * (1 - sb) + 1e-9);
    for (let j = 0; j <= jMax; j++) {
      const sc = j / kc;
      const so = 1 - sb - sc;
      visit(
        o[0] * so + b[0] * sb + c[0] * sc,
        o[1] * so + b[1] * sb + c[1] * sc,
        o[2] * so + b[2] * sb + c[2] * sc,
      );
    }
  }
  const kl = steps(d(b, c));
  for (let i = 0; i <= kl; i++) {
    const t = i / kl;
    visit(b[0] + (c[0] - b[0]) * t, b[1] + (c[1] - b[1]) * t, b[2] + (c[2] - b[2]) * t);
  }
}

/**
 * The sector `mesh` sweeps rotating about `axis` through `pivot` by θ ∈ `range` (radians,
 * rest = 0; positive = right-handed about `axis`).
 */
export function sectorVolume(
  mesh: Mesh,
  pivot: Vec3,
  axis: Vec3,
  range: readonly [number, number],
): Volume {
  const coords = axisFrame(pivot, axis);
  // Vertices in the axis frame (a along the axis, x/y in the plane): linear in position, so a
  // triangle's interior is the same barycentric blend there. a and r peak at vertices.
  const { u, e1, e2 } = axisBasis(axis);
  const n = mesh.positions.length / 3;
  const va = new Float64Array(n);
  const vx = new Float64Array(n);
  const vy = new Float64Array(n);
  let lo = Infinity;
  let hi = -Infinity;
  let rMax = 0;
  for (let i = 0; i < n; i++) {
    const d0 = (mesh.positions[i * 3] ?? 0) - pivot[0];
    const d1 = (mesh.positions[i * 3 + 1] ?? 0) - pivot[1];
    const d2 = (mesh.positions[i * 3 + 2] ?? 0) - pivot[2];
    const a = d0 * u[0] + d1 * u[1] + d2 * u[2];
    const x = d0 * e1[0] + d1 * e1[1] + d2 * e1[2];
    const y = d0 * e2[0] + d1 * e2[1] + d2 * e2[2];
    va[i] = a;
    vx[i] = x;
    vy[i] = y;
    if (a < lo) lo = a;
    if (a > hi) hi = a;
    rMax = Math.max(rMax, Math.hypot(x, y));
  }
  const span = Math.max(hi - lo, 1e-6);
  const SLICES = Math.max(1, Math.min(MAX_SLICES, Math.ceil(span / SLAB)));
  const slice = (a: number): number =>
    Math.max(0, Math.min(SLICES - 1, Math.floor(((a - lo) / span) * SLICES)));
  const RINGS = Math.floor(rMax / RING) + 1;
  const BINS = Math.ceil(Math.min(MAX_BINS, Math.max(64, (TAU * rMax) / ARC)) / 32) * 32;
  const WORDS = BINS / 32;
  const W = TAU / BINS;
  // Occupancy: one bitset of BINS per (slice, ring) cell, allocated when first touched.
  const cells: (Uint32Array | undefined)[] = new Array(SLICES * RINGS);
  const perSlice = SLICES / span;
  const mark = (a: number, x: number, y: number): void => {
    const r = Math.min(rMax, Math.sqrt(x * x + y * y));
    const s = Math.max(0, Math.min(SLICES - 1, Math.floor((a - lo) * perSlice)));
    const key = s * RINGS + Math.floor(r / RING);
    let bits = cells[key];
    if (!bits) {
      bits = new Uint32Array(WORDS);
      cells[key] = bits;
    }
    const phi = Math.atan2(y, x);
    const b = Math.floor((phi < 0 ? phi + TAU : phi) / W) % BINS;
    bits[b >>> 5] = (bits[b >>> 5] ?? 0) | (1 << (b & 31));
  };
  // Rasterise every triangle (edges and interior) at ≤ STEP spacing.
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const i0 = mesh.indices[t] ?? 0;
    const i1 = mesh.indices[t + 1] ?? 0;
    const i2 = mesh.indices[t + 2] ?? 0;
    const p0: Vec3 = [va[i0] ?? 0, vx[i0] ?? 0, vy[i0] ?? 0];
    const p1: Vec3 = [va[i1] ?? 0, vx[i1] ?? 0, vy[i1] ?? 0];
    const p2: Vec3 = [va[i2] ?? 0, vx[i2] ?? 0, vy[i2] ?? 0];
    rasterTriangle(p0, p1, p2, mark);
  }
  /** Any bin set in the cyclic run [j0, j1] (unwrapped indices, j1 − j0 < BINS). */
  const anySet = (bits: Uint32Array, j0: number, j1: number): boolean => {
    let j = j0;
    while (j <= j1) {
      const k = mod(j, BINS);
      const word = k >>> 5;
      const first = k & 31;
      const last = Math.min(31, first + (j1 - j));
      const width = last - first + 1;
      const mask = width === 32 ? 0xffffffff : ((1 << width) - 1) << first;
      if (((bits[word] ?? 0) & mask) !== 0) return true;
      j += width;
    }
    return false;
  };
  const [from, to] = range;
  const reach = rMax + Math.max(Math.abs(lo), Math.abs(hi));
  return {
    min: [pivot[0] - reach, pivot[1] - reach, pivot[2] - reach],
    max: [pivot[0] + reach, pivot[1] + reach, pivot[2] + reach],
    inside: (p) => {
      const [a, r, phi] = coords(p);
      if (a < lo + CLASH_EPS || a > hi - CLASH_EPS || r < CLASH_EPS) return false;
      // Rest angles φ − θ for θ ∈ [from, to] land on p; shrink the run by CLASH_EPS of arc.
      const tol = CLASH_EPS / r;
      const j0 = Math.floor((phi - to + tol) / W);
      const j1 = Math.min(j0 + BINS - 1, Math.floor((phi - from - tol) / W));
      if (j1 < j0) return false;
      // Deeper than CLASH_EPS radially too: p's ring and the rings ±CLASH_EPS must all be swept.
      const s = slice(a) * RINGS;
      const r0 = Math.floor((r - CLASH_EPS) / RING);
      const r1 = Math.floor((r + CLASH_EPS) / RING);
      for (let k = r0; k <= r1; k++) {
        const bits = k >= 0 && k < RINGS ? cells[s + k] : undefined;
        if (!bits || !anySet(bits, j0, j1)) return false;
      }
      return true;
    },
  };
}
