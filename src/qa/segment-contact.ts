// Exact contact between a segment and a triangle soup, for the two gates that ask whether an
// edge of one part reaches another (`floating-parts`, `connections`). The distance from a segment
// to a triangle is 0 where it passes through (Möller–Trumbore), else the least of its two ends to
// the face and of the segment to the three sides (Ericson, Real-Time Collision Detection §5.1.9),
// so a rod through the middle of an open sheet is found however long the rod or large the
// triangle: nothing is stepped over. Long oblique segments are cut into pieces, each asking the
// index only for the triangles near that piece; the pieces cover the segment, so the cut changes
// the cost and never the answer.

import type { Vec3 } from '../core/index.ts';
import { pointTriDist } from './point-triangle.ts';

export interface SegmentHit {
  /** The point of the segment nearest the triangles (where it passes through, when it does). */
  readonly at: Vec3;
  /** Its distance to them; 0 where the segment passes through one. */
  readonly gap: number;
}

/** Triangles (index into 9 floats each) whose boxes overlap [lo, hi]. */
export type TrianglesIn = (lo: readonly number[], hi: readonly number[]) => readonly number[];

/** Shortest piece a segment is cut into: the triangle grid's 25 cm cell. */
const MIN_PIECE = 0.25;

/** Piece length for a partner of that diagonal: at most 64 pieces across it, so a 300 m tower
 *  costs an edge no more index queries than a 16 m vehicle. */
export const pieceFor = (diag: number): number => Math.max(MIN_PIECE, diag / 64);

/** Where along the segment (0..1) the last distance was measured. */
let along = 0;

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/** Distance between segments p1 → q1 and p2 → q2; sets `along` on the first. */
function segmentSegment(
  p1x: number,
  p1y: number,
  p1z: number,
  d1x: number,
  d1y: number,
  d1z: number,
  p2x: number,
  p2y: number,
  p2z: number,
  q2x: number,
  q2y: number,
  q2z: number,
): number {
  const d2x = q2x - p2x;
  const d2y = q2y - p2y;
  const d2z = q2z - p2z;
  const rx = p1x - p2x;
  const ry = p1y - p2y;
  const rz = p1z - p2z;
  const a = d1x * d1x + d1y * d1y + d1z * d1z;
  const e = d2x * d2x + d2y * d2y + d2z * d2z;
  const f = d2x * rx + d2y * ry + d2z * rz;
  const c = d1x * rx + d1y * ry + d1z * rz;
  const TINY = 1e-18;
  let s = 0;
  let t = 0;
  if (a <= TINY) t = e <= TINY ? 0 : clamp01(f / e);
  else if (e <= TINY) s = clamp01(-c / a);
  else {
    const b = d1x * d2x + d1y * d2y + d1z * d2z;
    const den = a * e - b * b;
    // Parallel segments: any point of the first will do, the clamps below find its partner.
    s = den > 1e-12 * a * e ? clamp01((b * f - c * e) / den) : 0;
    t = (b * s + f) / e;
    if (t < 0) {
      t = 0;
      s = clamp01(-c / a);
    } else if (t > 1) {
      t = 1;
      s = clamp01((b - c) / a);
    }
  }
  along = s;
  return Math.hypot(rx + d1x * s - d2x * t, ry + d1y * s - d2y * t, rz + d1z * s - d2z * t);
}

/** Distance from segment p → q to the triangle at `T[o..o+9)`: 0 when it passes through. Sets
 *  `along` to where on the segment that is. */
function segmentTriangle(p: Vec3, q: Vec3, T: ArrayLike<number>, o: number): number {
  const [px, py, pz] = p;
  const dx = q[0] - px;
  const dy = q[1] - py;
  const dz = q[2] - pz;
  const ax = T[o] ?? 0;
  const ay = T[o + 1] ?? 0;
  const az = T[o + 2] ?? 0;
  const bx = T[o + 3] ?? 0;
  const by = T[o + 4] ?? 0;
  const bz = T[o + 5] ?? 0;
  const cx = T[o + 6] ?? 0;
  const cy = T[o + 7] ?? 0;
  const cz = T[o + 8] ?? 0;
  const e1x = bx - ax;
  const e1y = by - ay;
  const e1z = bz - az;
  const e2x = cx - ax;
  const e2y = cy - ay;
  const e2z = cz - az;
  const hx = dy * e2z - dz * e2y;
  const hy = dz * e2x - dx * e2z;
  const hz = dx * e2y - dy * e2x;
  const det = e1x * hx + e1y * hy + e1z * hz;
  const scale =
    (dx * dx + dy * dy + dz * dz) *
    (e1x * e1x + e1y * e1y + e1z * e1z) *
    (e2x * e2x + e2y * e2y + e2z * e2z);
  // Not parallel to the face (and neither is degenerate): does the segment pass through it?
  if (det * det > 1e-18 * scale) {
    const sx = px - ax;
    const sy = py - ay;
    const sz = pz - az;
    const u = (sx * hx + sy * hy + sz * hz) / det;
    if (u >= 0 && u <= 1) {
      const qx = sy * e1z - sz * e1y;
      const qy = sz * e1x - sx * e1z;
      const qz = sx * e1y - sy * e1x;
      const v = (dx * qx + dy * qy + dz * qz) / det;
      const t = (e2x * qx + e2y * qy + e2z * qz) / det;
      if (v >= 0 && u + v <= 1 && t >= 0 && t <= 1) {
        along = t;
        return 0;
      }
    }
  }
  let best = pointTriDist(px, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz);
  let at = 0;
  const end = pointTriDist(q[0], q[1], q[2], ax, ay, az, bx, by, bz, cx, cy, cz);
  if (end < best) [best, at] = [end, 1];
  const ab = segmentSegment(px, py, pz, dx, dy, dz, ax, ay, az, bx, by, bz);
  if (ab < best) [best, at] = [ab, along];
  const bc = segmentSegment(px, py, pz, dx, dy, dz, bx, by, bz, cx, cy, cz);
  if (bc < best) [best, at] = [bc, along];
  const ca = segmentSegment(px, py, pz, dx, dy, dz, cx, cy, cz, ax, ay, az);
  if (ca < best) [best, at] = [ca, along];
  along = at;
  return best;
}

const lerp = (p: Vec3, q: Vec3, t: number): Vec3 => [
  p[0] + (q[0] - p[0]) * t,
  p[1] + (q[1] - p[1]) * t,
  p[2] + (q[2] - p[2]) * t,
];

/** Where segment p → q comes nearest the triangles `T` (9 floats each, found through
 *  `trianglesIn`), searched out to `reach`: the first point within `eps` of one (gap 0 where the
 *  segment passes through it), else the nearest within `reach`, else null. `piece` is the longest
 *  stretch asked of the index at once (`pieceFor`). */
export function nearestOnSegment(
  p: Vec3,
  q: Vec3,
  T: ArrayLike<number>,
  trianglesIn: TrianglesIn,
  eps: number,
  reach: number,
  piece: number,
): SegmentHit | null {
  // An axis-aligned segment's box is already thin: only the second-longest extent widens it.
  const ext = [Math.abs(q[0] - p[0]), Math.abs(q[1] - p[1]), Math.abs(q[2] - p[2])].sort(
    (x, y) => y - x,
  );
  const n = Math.max(1, Math.ceil((ext[1] ?? 0) / piece));
  let best: SegmentHit | null = null;
  let lim = reach;
  let a = p;
  for (let i = 1; i <= n; i++) {
    const b = i === n ? q : lerp(p, q, i / n);
    const lo = [Math.min(a[0], b[0]) - lim, Math.min(a[1], b[1]) - lim, Math.min(a[2], b[2]) - lim];
    const hi = [Math.max(a[0], b[0]) + lim, Math.max(a[1], b[1]) + lim, Math.max(a[2], b[2]) + lim];
    for (const t of trianglesIn(lo, hi)) {
      const gap = segmentTriangle(a, b, T, t * 9);
      if (gap > lim || (best && gap >= best.gap)) continue;
      best = { at: lerp(a, b, along), gap };
      if (gap <= eps) return best;
      lim = gap;
    }
    a = b;
  }
  return best;
}
