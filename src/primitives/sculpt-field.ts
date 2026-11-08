// A ready-made field as a sculpt edit (`{ field, bounds }`, e.g. `visualHull(...)`): clamped to
// its bounds box (max with the box distance) so the sparse fold's bounding-sphere bound holds for
// any 1-Lipschitz field, and mirrored across y = 0 when the edit mirrors.

import type { Vec3 } from '../core/index.ts';
import { invalid } from './check.ts';
import type { Field } from './sdf-ops.ts';

/** A field edit's field, clamped and maybe mirrored, plus its bounding sphere. */
export function fieldShape(
  f: Field,
  bounds: readonly [Vec3, Vec3],
  mirror: boolean,
  where: string,
): { shape: Field; c: Vec3; r: number } {
  const [lo, hi] = bounds;
  if (
    ![0, 1, 2].every(
      (i) => Number.isFinite(lo[i]) && Number.isFinite(hi[i]) && (lo[i] ?? 0) < (hi[i] ?? 0),
    )
  )
    invalid(
      `${where}: bounds are not a finite [min, max] box`,
      'pass bounds: [[x0, y0, z0], [x1, y1, z1]] with min < max',
    );
  const c: Vec3 = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
  const h: Vec3 = [(hi[0] - lo[0]) / 2, (hi[1] - lo[1]) / 2, (hi[2] - lo[2]) / 2];
  const q: [number, number, number] = [0, 0, 0];
  const one = (x: number, y: number, z: number): number => {
    const qx = Math.abs(x - c[0]) - h[0];
    const qy = Math.abs(y - c[1]) - h[1];
    const qz = Math.abs(z - c[2]) - h[2];
    const [mx, my, mz] = [Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)];
    const box = Math.sqrt(mx * mx + my * my + mz * mz) + Math.min(Math.max(qx, qy, qz), 0);
    q[0] = x;
    q[1] = y;
    q[2] = z;
    return Math.max(box, f(q));
  };
  const shape: Field = mirror
    ? (p) => Math.min(one(p[0], p[1], p[2]), one(p[0], -p[1], p[2]))
    : (p) => one(p[0], p[1], p[2]);
  return { shape, c, r: Math.hypot(h[0], h[1], h[2]) };
}
