// Footprint edges as facade frames: for each edge of a counter-clockwise ring, its start, unit
// direction, length, outward normal and the yaw that turns local +X (out of the wall) onto that
// normal, so facade pieces are authored once in edge-local space (x out, y along the edge from
// its start, z up) and `place`d. Also how far an edge is from the nearest street centreline.

import type { Vec2 } from '@developerz.ai/ts23d';

export interface Edge {
  readonly i: number;
  readonly a: Vec2;
  readonly b: Vec2;
  /** Unit direction a → b. */
  readonly u: Vec2;
  /** Outward unit normal (the edge turned clockwise). */
  readonly n: Vec2;
  readonly len: number;
  /** Yaw for `place`: local +X → n, local +Y → u. */
  readonly yaw: number;
}

export function edgesOf(ring: readonly Vec2[]): Edge[] {
  const out: Edge[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i] ?? [0, 0];
    const b = ring[(i + 1) % ring.length] ?? a;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-6) continue;
    const u: Vec2 = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    out.push({ i, a, b, u, n: [u[1], -u[0]], len, yaw: Math.atan2(-u[0], u[1]) });
  }
  return out;
}

/** World point at `t` metres along the edge and `out` metres off it. */
export const along = (e: Edge, t: number, out = 0): Vec2 => [
  e.a[0] + e.u[0] * t + e.n[0] * out,
  e.a[1] + e.u[1] * t + e.n[1] * out,
];

/** Distance from a point to a polyline, metres. */
export function distToLine(p: Vec2, line: readonly Vec2[]): number {
  let best = Infinity;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i] ?? [0, 0];
    const b = line[i + 1] ?? a;
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const l2 = ex * ex + ey * ey || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / l2));
    best = Math.min(best, Math.hypot(a[0] + ex * t - p[0], a[1] + ey * t - p[1]));
  }
  return best;
}
