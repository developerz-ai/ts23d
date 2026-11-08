// Flatten SVG curve segments into polyline points within a chord tolerance (SVG user units).
// Counts come from proven error bounds, so the polyline never strays more than `tol` from the
// curve: Bézier chord error ≤ max|B''| / (8 n²); arc sagitta r (1 − cos(Δθ / 2n)). Each function
// appends the points AFTER the start point (the end point included) to `out`.

import type { Vec2 } from '../core/index.ts';

/** More segments than this per curve is a degenerate input (huge curve, microscopic tolerance). */
const MAX_STEPS = 256;

const steps = (n: number): number => Math.min(MAX_STEPS, Math.max(1, Math.ceil(n)));

/** Cubic Bézier p0 → p3 with controls p1, p2. */
export function flattenCubic(
  p0: Vec2,
  p1: Vec2,
  p2: Vec2,
  p3: Vec2,
  tol: number,
  out: Vec2[],
): void {
  const m = Math.max(
    Math.hypot(p0[0] - 2 * p1[0] + p2[0], p0[1] - 2 * p1[1] + p2[1]),
    Math.hypot(p1[0] - 2 * p2[0] + p3[0], p1[1] - 2 * p2[1] + p3[1]),
  );
  // |B''| ≤ 6 m, so the error is ≤ 3 m / (4 n²).
  const n = steps(Math.sqrt((3 * m) / (4 * tol)));
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    const a = u * u * u;
    const b = 3 * u * u * t;
    const c = 3 * u * t * t;
    const d = t * t * t;
    out.push(
      i === n
        ? [p3[0], p3[1]]
        : [
            a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
            a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
          ],
    );
  }
}

/** Quadratic Bézier p0 → p2 with control p1. */
export function flattenQuad(p0: Vec2, p1: Vec2, p2: Vec2, tol: number, out: Vec2[]): void {
  const m = Math.hypot(p0[0] - 2 * p1[0] + p2[0], p0[1] - 2 * p1[1] + p2[1]);
  // |B''| = 2 m, so the error is ≤ m / (4 n²).
  const n = steps(Math.sqrt(m / (4 * tol)));
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push(
      i === n
        ? [p2[0], p2[1]]
        : [
            u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
            u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
          ],
    );
  }
}

/**
 * Elliptical arc in SVG endpoint form (SVG 1.1 F.6.5–F.6.6): radii are scaled up when too small
 * to reach, zero radii degrade to a line.
 */
export function flattenArc(
  p0: Vec2,
  radii: Vec2,
  rotDeg: number,
  large: boolean,
  sweep: boolean,
  p1: Vec2,
  tol: number,
  out: Vec2[],
): void {
  let rx = Math.abs(radii[0]);
  let ry = Math.abs(radii[1]);
  if (rx === 0 || ry === 0 || (p0[0] === p1[0] && p0[1] === p1[1])) {
    out.push([p1[0], p1[1]]);
    return;
  }
  const phi = (rotDeg * Math.PI) / 180;
  const cp = Math.cos(phi);
  const sp = Math.sin(phi);
  const hx = (p0[0] - p1[0]) / 2;
  const hy = (p0[1] - p1[1]) / 2;
  const x1 = cp * hx + sp * hy;
  const y1 = -sp * hx + cp * hy;
  const lam = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lam > 1) {
    const s = Math.sqrt(lam);
    rx *= s;
    ry *= s;
  }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cx1 = (k * rx * y1) / ry;
  const cy1 = (-k * ry * x1) / rx;
  const cx = cp * cx1 - sp * cy1 + (p0[0] + p1[0]) / 2;
  const cy = sp * cx1 + cp * cy1 + (p0[1] + p1[1]) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number): number =>
    Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const ux = (x1 - cx1) / rx;
  const uy = (y1 - cy1) / ry;
  const t0 = ang(1, 0, ux, uy);
  let dt = ang(ux, uy, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  // Sagitta of one step on the larger radius ≤ tol.
  const r = Math.max(rx, ry);
  const step = tol >= r ? Math.PI / 2 : 2 * Math.acos(1 - tol / r);
  const n = steps(Math.abs(dt) / step);
  for (let i = 1; i <= n; i++) {
    if (i === n) {
      out.push([p1[0], p1[1]]);
      break;
    }
    const t = t0 + (dt * i) / n;
    const ex = rx * Math.cos(t);
    const ey = ry * Math.sin(t);
    out.push([cp * ex - sp * ey + cx, sp * ex + cp * ey + cy]);
  }
}
