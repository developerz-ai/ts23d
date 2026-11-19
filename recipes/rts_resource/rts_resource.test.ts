// The LOD0 crystal is a true hexagonal prism: its six faces shade flat, hard at the six corners.
// Failure first: mid-face vertices were pulled onto the hexagon but kept the twelve-sided lathe's
// radial normals, so a flat face shaded as if curved (corners 30° off the face).

import { describe, expect, it } from 'bun:test';
import type { Mesh, Vec3 } from '@developerz.ai/ts23d';
import { type CrystalState, crystal } from './rts_resource.ts';

/** Largest angle (degrees) between a shaft triangle's face normal and its vertex normals, and how
 *  many triangles lie wholly in z0..z1. */
function worstSideNormal(m: Mesh, z0: number, z1: number): { worst: number; n: number } {
  const p = (i: number): Vec3 => [
    m.positions[i * 3] ?? 0,
    m.positions[i * 3 + 1] ?? 0,
    m.positions[i * 3 + 2] ?? 0,
  ];
  let worst = 0;
  let count = 0;
  for (let t = 0; t < m.indices.length; t += 3) {
    const ids = [m.indices[t] ?? 0, m.indices[t + 1] ?? 0, m.indices[t + 2] ?? 0];
    const [a, b, c] = ids.map(p) as [Vec3, Vec3, Vec3];
    if (Math.min(a[2], b[2], c[2]) < z0 || Math.max(a[2], b[2], c[2]) > z1) continue;
    const u: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const f: Vec3 = [
      u[1] * v[2] - u[2] * v[1],
      u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0],
    ];
    const fl = Math.hypot(...f);
    if (fl < 1e-12) continue;
    count++;
    for (const i of ids) {
      const n: Vec3 = [m.normals[i * 3] ?? 0, m.normals[i * 3 + 1] ?? 0, m.normals[i * 3 + 2] ?? 0];
      const d = (n[0] * f[0] + n[1] * f[1] + n[2] * f[2]) / (fl * (Math.hypot(...n) || 1));
      worst = Math.max(worst, (Math.acos(Math.max(-1, Math.min(1, d))) * 180) / Math.PI);
    }
  }
  return { worst, n: count };
}

describe('crystal LOD0 facets', () => {
  // The shaft of each state: from the seat (z = 0) to its first shoulder (fraction of h).
  const shaft: Record<CrystalState, number> = { whole: 0.72, broken: 0.45, stub: 0.22 };
  for (const state of ['whole', 'stub', 'broken'] as CrystalState[])
    it(`${state}: every face of the hexagonal shaft shades flat (vertex normals ≤ 8° off)`, () => {
      const h = 0.6;
      const r = worstSideNormal(crystal(0, 0.1, h, state), -1e-6, h * shaft[state] + 1e-6);
      expect(r.n).toBeGreaterThanOrEqual(24);
      expect(r.worst).toBeLessThan(8);
    });
});
