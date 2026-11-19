// Crossing contact the patch samples miss: a tank wall standing across its joists, a rail
// through a post, a probe through an open nose skin. `patch` tests points spread over the smaller
// piece; where a thin wall or a long beam crosses another, no point lands within reach and the
// pair reads as not touching at all. Here every triangle edge of one piece that passes the
// other's box is measured against the other's triangles exactly (segment-contact.ts): an edge
// that passes through one, or comes within `eps` of one anywhere along its length, is contact,
// for a solid piece and an open sheet alike; a nearest approach farther off (within CONTACT_EPS)
// is a hover. It says WHERE they meet, not over how much area: the pair is a weak contact (a
// kiss), and holds only by bridging.

import type { Vec3 } from '../core/index.ts';
import type { Shell } from './connections-shells.ts';
import { probeOf } from './contact.ts';
import { nearestOnSegment, pieceFor, type SegmentHit } from './segment-contact.ts';

/** The part [t0, t1] of segment p → q inside the box lo..hi, or null (slab clipping). */
function clip(p: Vec3, q: Vec3, lo: Vec3, hi: Vec3): [number, number] | null {
  let [t0, t1] = [0, 1];
  for (const k of [0, 1, 2] as const) {
    const d = q[k] - p[k];
    if (Math.abs(d) < 1e-12) {
      if (p[k] < lo[k] || p[k] > hi[k]) return null;
      continue;
    }
    const [a, b] =
      d > 0 ? [(lo[k] - p[k]) / d, (hi[k] - p[k]) / d] : [(hi[k] - p[k]) / d, (lo[k] - p[k]) / d];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    if (t0 > t1) return null;
  }
  return [t0, t1];
}

const on = (p: Vec3, q: Vec3, t: number): Vec3 =>
  t <= 0
    ? p
    : t >= 1
      ? q
      : [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];

/** The point of `a` nearest `b` (the first one found touching, when they touch) and its distance
 *  to `b`'s surface; 0 where an edge passes through it. */
export type EdgeContact = SegmentHit;

/** Where the edges of `a` come nearest `b`, searched out to `reach`: the search stops at the
 *  first edge within `eps` of `b`'s surface or passing through it. Null beyond `reach`. */
export function edgeContact(a: Shell, b: Shell, eps: number, reach: number): EdgeContact | null {
  const lo: Vec3 = [b.bounds.min[0] - reach, b.bounds.min[1] - reach, b.bounds.min[2] - reach];
  const hi: Vec3 = [b.bounds.max[0] + reach, b.bounds.max[1] + reach, b.bounds.max[2] + reach];
  const P = a.mesh.positions;
  const T = b.mesh.positions;
  const q = probeOf(b);
  const near = (l: readonly number[], h: readonly number[]): number[] => q.trianglesIn(l, h);
  const piece = pieceFor(Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]));
  let best: EdgeContact | null = null;
  for (const t of probeOf(a).trianglesIn(lo, hi)) {
    const corner = (v: number): Vec3 => [
      P[t * 9 + v * 3] ?? 0,
      P[t * 9 + v * 3 + 1] ?? 0,
      P[t * 9 + v * 3 + 2] ?? 0,
    ];
    for (let e = 0; e < 3; e++) {
      const p = corner(e);
      const r = corner((e + 1) % 3);
      const span = clip(p, r, lo, hi);
      if (!span) continue;
      const hit = nearestOnSegment(
        on(p, r, span[0]),
        on(p, r, span[1]),
        T,
        near,
        eps,
        best ? best.gap : reach,
        piece,
      );
      if (!hit) continue;
      if (hit.gap <= eps) return hit;
      if (!best || hit.gap < best.gap) best = hit;
    }
  }
  return best;
}
