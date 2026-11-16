// Test fixtures for the hair-card passes: an open cylinder along +X (shared vertices, outward
// normals), its SDF, a one-cell zone and a seeded `hairCards` run over it. Not exported publicly.

import { createRng, type Mesh, MeshBuilder, type Vec3 } from '../core/index.ts';
import type { UvRect } from '../material/index.ts';
import { type CardZone, hairCards } from './hair-cards.ts';
import { hairFlow } from './hair-flow.ts';

export const R = 0.1;
export const LEN = 1;
/** Open cylinder along +X, radius R (shared vertices, outward normals). */
export function cylinder(rings = 30, around = 24): Mesh {
  const b = new MeshBuilder();
  for (let i = 0; i <= rings; i++)
    for (let j = 0; j < around; j++) {
      const a = (j / around) * Math.PI * 2;
      const n: Vec3 = [0, Math.cos(a), Math.sin(a)];
      b.vertex({
        p: [(i / rings) * LEN, R * n[1], R * n[2]],
        n,
        uv: [0, 0],
        color: [0.5, 0.4, 0.3],
      });
    }
  for (let i = 0; i < rings; i++)
    for (let j = 0; j < around; j++) {
      const v = (ii: number, jj: number): number => ii * around + (jj % around);
      b.quad(v(i, j), v(i + 1, j), v(i + 1, j + 1), v(i, j + 1));
    }
  return b.build();
}
/** Infinite-cylinder SDF (the mesh is a polygon inside it; close enough for 24 sides). */
export const field = (p: Vec3): number => Math.hypot(p[1], p[2]) - R;

export const CELL: UvRect = { u0: 0.1, u1: 0.2, v0: 0.5, v1: 0.51, metres: 1 };
export const zone = (o: Partial<CardZone> = {}): CardZone => ({
  name: 'coat',
  density: () => 400,
  length: 0.05,
  width: 0.012,
  cells: [CELL],
  ...o,
});
export const surface = cylinder();
export const flow = hairFlow(surface, () => [1, 0, 0]);
export const run = (o: Partial<Parameters<typeof hairCards>[0]> = {}) =>
  hairCards({ surface, flow, zones: [zone()], rng: createRng(3), field, ...o });

export const at = (m: Mesh, i: number): Vec3 => [
  m.positions[i * 3] ?? 0,
  m.positions[i * 3 + 1] ?? 0,
  m.positions[i * 3 + 2] ?? 0,
];
