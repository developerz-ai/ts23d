// Tiny SDF-style helpers for cell motifs: distances in metres, no allocation.

/** Distance from (px, py) to the segment (ax, ay)–(bx, by). */
export function segment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

/** Signed distance to an axis-aligned rectangle (negative inside). */
export function rect(px: number, py: number, x0: number, y0: number, x1: number, y1: number) {
  const qx = Math.max(x0 - px, px - x1);
  const qy = Math.max(y0 - py, py - y1);
  return qx > 0 || qy > 0 ? Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) : Math.max(qx, qy);
}

/** Dome profile in [0, 1] for a round boss of radius `r` at distance `d`. */
export const dome = (d: number, r: number): number => (d < r ? Math.sqrt(1 - (d / r) ** 2) : 0);

/** Distance to the nearest of `n` points evenly spaced on a circle of radius `ring`. */
export function boltRing(px: number, py: number, ring: number, n: number, phase = 0): number {
  const a = Math.atan2(py, px) - phase;
  const step = (Math.PI * 2) / n;
  const k = Math.round(a / step);
  const ba = k * step + phase;
  return Math.hypot(px - ring * Math.cos(ba), py - ring * Math.sin(ba));
}
