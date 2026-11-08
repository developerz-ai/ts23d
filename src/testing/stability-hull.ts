// 2D support-polygon math for the balance assertion: convex hull of ground contacts (monotone
// chain, CCW) and the signed distance of a point to it (> 0 outside, ≤ 0 inside).

export type P2 = readonly [number, number];

const turn = (o: P2, a: P2, b: P2): number =>
  (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/** Convex hull, counter-clockwise, no collinear points. */
export function convexHull2(points: readonly P2[]): P2[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const half = (list: readonly P2[]): P2[] => {
    const out: P2[] = [];
    for (const p of list) {
      while (out.length >= 2) {
        const a = out[out.length - 2];
        const b = out[out.length - 1];
        if (!a || !b || turn(a, b, p) > 1e-12) break;
        out.pop();
      }
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...half(pts), ...half([...pts].reverse())];
}

function segmentDistance(p: P2, a: P2, b: P2): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t);
}

/** Signed distance from p to a CCW convex polygon: > 0 outside, ≤ 0 inside. Empty → Infinity. */
export function distanceOutside(hull: readonly P2[], p: P2): number {
  if (hull.length === 0) return Infinity;
  let edge = Infinity;
  let inside = hull.length >= 3;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i] ?? hull[0];
    const b = hull[(i + 1) % hull.length] ?? hull[0];
    if (!a || !b) continue;
    edge = Math.min(edge, segmentDistance(p, a, b));
    if (turn(a, b, p) < 0) inside = false;
  }
  return inside ? -edge : edge;
}
