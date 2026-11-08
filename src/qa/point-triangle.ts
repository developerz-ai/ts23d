// Exact point↔triangle distance (Ericson, Real-Time Collision Detection §5.1.5), scalar and
// allocation-free for the QA hot path (TriangleGrid.nearest), plus the Vec3 convenience form.

import type { Vec3 } from '../core/index.ts';

/** Distance from p to triangle abc (Ericson, Real-Time Collision Detection §5.1.5). */
export const pointTriangleDistance = (p: Vec3, a: Vec3, b: Vec3, c: Vec3): number =>
  pointTriDist(p[0], p[1], p[2], a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);

const len = (x: number, y: number, z: number): number => Math.sqrt(x * x + y * y + z * z);

/** Scalar, allocation-free `pointTriangleDistance` (the QA hot path). */
export function pointTriDist(
  px: number,
  py: number,
  pz: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
): number {
  const abx = bx - ax,
    aby = by - ay,
    abz = bz - az;
  const acx = cx - ax,
    acy = cy - ay,
    acz = cz - az;
  const apx = px - ax,
    apy = py - ay,
    apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) return len(apx, apy, apz);
  const bpx = px - bx,
    bpy = py - by,
    bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return len(bpx, bpy, bpz);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const t = d1 / (d1 - d3);
    return len(px - (ax + abx * t), py - (ay + aby * t), pz - (az + abz * t));
  }
  const cpx = px - cx,
    cpy = py - cy,
    cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return len(cpx, cpy, cpz);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const t = d2 / (d2 - d6);
    return len(px - (ax + acx * t), py - (ay + acy * t), pz - (az + acz * t));
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const t = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return len(px - (bx + (cx - bx) * t), py - (by + (cy - by) * t), pz - (bz + (cz - bz) * t));
  }
  const den = 1 / (va + vb + vc);
  const v = vb * den;
  const w = vc * den;
  return len(
    px - (ax + abx * v + acx * w),
    py - (ay + aby * v + acy * w),
    pz - (az + abz * v + acz * w),
  );
}
