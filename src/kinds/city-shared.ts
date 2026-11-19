// Shared walls between footprints: for one edge of a ring, the stretches that run along an edge of
// a neighbour (within EPS, near-parallel). Partial by design: a long wall with a short neighbour
// is shared only where the neighbour stands, so windows can fill the rest.

import type { Vec2 } from '../core/index.ts';

export type Span = readonly [number, number];

/** Walls within this distance are one wall, metres. */
export const EPS = 0.3;
/** Edges count as running along each other within ~10°. */
const PARALLEL = 0.985;
/** A shared stretch shorter than this is a corner touching, not a wall, metres. */
const MIN_SHARED = 0.5;

/** Stretches of edge i of `ring` (metres from ring[i]) that lie within EPS of an edge of `other`. */
export function sharedSpans(ring: readonly Vec2[], i: number, other: readonly Vec2[]): Span[] {
  const a = ring[i] ?? [0, 0];
  const b = ring[(i + 1) % ring.length] ?? a;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len < 1e-9) return [];
  const [ux, uy] = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  const along = (p: Vec2): number => (p[0] - a[0]) * ux + (p[1] - a[1]) * uy;
  const off = (p: Vec2): number => (p[1] - a[1]) * ux - (p[0] - a[0]) * uy;
  const out: Span[] = [];
  other.forEach((c, j) => {
    const d = other[(j + 1) % other.length] ?? c;
    const l = Math.hypot(d[0] - c[0], d[1] - c[1]);
    if (l < 1e-9 || Math.abs((d[0] - c[0]) * ux + (d[1] - c[1]) * uy) / l < PARALLEL) return;
    // Clip c→d to the strip |offset| < EPS around this edge's line, then project it onto the edge.
    const [oc, od] = [off(c), off(d)];
    let [s0, s1] = [0, 1];
    if (Math.abs(od - oc) < 1e-12) {
      if (Math.abs(oc) >= EPS) return;
    } else {
      const [p, q] = [(-EPS - oc) / (od - oc), (EPS - oc) / (od - oc)];
      s0 = Math.max(0, Math.min(p, q));
      s1 = Math.min(1, Math.max(p, q));
      if (s0 >= s1) return;
    }
    const [tc, td] = [along(c), along(d)];
    const [t0, t1] = [tc + (td - tc) * s0, tc + (td - tc) * s1];
    const span: Span = [Math.max(0, Math.min(t0, t1)), Math.min(len, Math.max(t0, t1))];
    if (span[1] > span[0]) out.push(span);
  });
  return out;
}

/** Union of spans, sorted; stretches under MIN_SHARED dropped. */
export function mergeSpans(spans: readonly Span[]): Span[] {
  const out: [number, number][] = [];
  for (const [lo, hi] of [...spans].sort((p, q) => p[0] - q[0])) {
    const last = out.at(-1);
    if (last && lo <= last[1] + 1e-6) last[1] = Math.max(last[1], hi);
    else out.push([lo, hi]);
  }
  return out.filter(([lo, hi]) => hi - lo >= MIN_SHARED);
}

export const edgeLength = (ring: readonly Vec2[], i: number): number => {
  const a = ring[i] ?? [0, 0];
  const b = ring[(i + 1) % ring.length] ?? a;
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
};
