// Polyline helpers for swept parts: fillet the corners of a rigid run (pipe bends of radius r), or
// smooth a polyline into a Catmull-Rom spline (a hose, a cable). Pure maths, no meshes.

import type { Vec3 } from '@developerz.ai/ts23d';

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** Replace each interior corner with a quadratic arc of roughly radius r, `steps` segments. */
export function filletPath(pts: readonly Vec3[], r: number, steps: number): Vec3[] {
  const out: Vec3[] = [pts[0] ?? [0, 0, 0]];
  for (let i = 1; i + 1 < pts.length; i++) {
    const [a, p, c] = [pts[i - 1], pts[i], pts[i + 1]] as [Vec3, Vec3, Vec3];
    const la = len(sub(a, p));
    const lc = len(sub(c, p));
    const d = Math.min(r, la * 0.45, lc * 0.45);
    const s = lerp(p, a, d / la);
    const e = lerp(p, c, d / lc);
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      out.push(lerp(lerp(s, p, t), lerp(p, e, t), t));
    }
  }
  out.push(pts[pts.length - 1] ?? [0, 0, 0]);
  return out;
}

/** Catmull-Rom through every point, `steps` segments per span. */
export function smoothPath(pts: readonly Vec3[], steps: number): Vec3[] {
  if (pts.length < 3) return [...pts];
  const at = (i: number): Vec3 => pts[Math.max(0, Math.min(pts.length - 1, i))] ?? [0, 0, 0];
  const out: Vec3[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push(
        [0, 1, 2].map(
          (j) =>
            0.5 *
            (2 * (p1[j] ?? 0) +
              (-(p0[j] ?? 0) + (p2[j] ?? 0)) * t +
              (2 * (p0[j] ?? 0) - 5 * (p1[j] ?? 0) + 4 * (p2[j] ?? 0) - (p3[j] ?? 0)) * t2 +
              (-(p0[j] ?? 0) + 3 * (p1[j] ?? 0) - 3 * (p2[j] ?? 0) + (p3[j] ?? 0)) * t3),
        ) as unknown as Vec3,
      );
    }
  }
  out.push(at(pts.length - 1));
  return out;
}

/** Pull both ends of a polyline in by d along their end segments. */
export function inset(pts: readonly Vec3[], d: number): Vec3[] {
  const out = [...pts];
  const pull = (i: number, j: number): void => {
    const a = pts[i];
    const b = pts[j];
    if (!a || !b) return;
    const l = len(sub(b, a));
    if (l > 2 * d) out[i] = lerp(a, b, d / l);
  };
  pull(0, 1);
  pull(pts.length - 1, pts.length - 2);
  return out;
}
