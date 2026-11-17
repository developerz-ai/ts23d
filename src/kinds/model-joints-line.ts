// Polyline helpers of the joint mapping (model-joints.ts): a point at an arc-length fraction,
// the fractions of a polyline's own points, and a scapula's upper end kept under the skin.

import type { Vec3 } from '../core/index.ts';
import { v3 } from './creature-curve.ts';

/** The point at arc-length fraction `f` (0..1) of a polyline. */
export function along(pts: readonly Vec3[], f: number): Vec3 {
  const seg = pts.slice(1).map((p, i) => v3.len(v3.sub(p, pts[i] ?? p)));
  let left = f * seg.reduce((a, b) => a + b, 0);
  for (let i = 0; i < seg.length; i++) {
    const l = seg[i] ?? 0;
    if (left <= l || i === seg.length - 1)
      return v3.lerp(
        pts[i] ?? [0, 0, 0],
        pts[i + 1] ?? [0, 0, 0],
        l > 0 ? Math.min(1, left / l) : 0,
      );
    left -= l;
  }
  return pts[0] ?? [0, 0, 0];
}

/** Arc-length fraction of each point of a polyline. */
export function fractions(pts: readonly Vec3[]): number[] {
  const run = [0];
  for (let i = 1; i < pts.length; i++)
    run.push((run[i - 1] ?? 0) + v3.len(v3.sub(pts[i] ?? [0, 0, 0], pts[i - 1] ?? [0, 0, 0])));
  const total = run[run.length - 1] || 1;
  return run.map((r) => r / total);
}

/**
 * A scapula's upper end lies just under the skin of the withers. When the mapped point is outside
 * the mesh it is pulled along the bone toward the shoulder joint until it is inside, then a tenth
 * of the bone further (QA `model` wants every joint inside the mesh).
 */
export function underSkin(head: Vec3, tail: Vec3, inside: (p: Vec3) => boolean): Vec3 {
  if (inside(head)) return head;
  const at = (t: number): Vec3 => v3.lerp(head, tail, t);
  const STEPS = 20;
  for (let i = 1; i < STEPS; i++)
    if (inside(at(i / STEPS))) return at(Math.min(0.9, i / STEPS + 0.1));
  return head;
}
