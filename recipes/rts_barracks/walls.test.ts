// The far (LOD2) walls cull only faces that surviving geometry hides. Failure first: roofless
// stages (scaffold, rubble, foundation) lost every inward face, and a side wall lost its end even
// where the front or back wall it butts against had been knocked down.

import { describe, expect, it } from 'bun:test';
import { createRng, dmath, type Mesh, type Vec3 } from '@developerz.ai/ts23d';
import { bays, EAVES, HALF_X, HALF_Y, WALL_T, wallCells } from './plan.ts';
import { walls } from './walls.ts';

/** Triangle centroids of `m` whose unit normal is within ~8° of `dir`. */
function facing(m: Mesh | null, dir: Vec3): Vec3[] {
  const out: Vec3[] = [];
  if (!m) return out;
  const p = (i: number): Vec3 => [
    m.positions[i * 3] ?? 0,
    m.positions[i * 3 + 1] ?? 0,
    m.positions[i * 3 + 2] ?? 0,
  ];
  for (let t = 0; t < m.indices.length; t += 3) {
    const [a, b, c] = [p(m.indices[t] ?? 0), p(m.indices[t + 1] ?? 0), p(m.indices[t + 2] ?? 0)];
    const u: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n: Vec3 = [
      u[1] * v[2] - u[2] * v[1],
      u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0],
    ];
    const l = dmath.norm(n) || 1;
    if ((n[0] * dir[0] + n[1] * dir[1] + n[2] * dir[2]) / l > 0.99)
      out.push([(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3]);
  }
  return out;
}

/** The front wall's inner face (x = HALF_X − WALL_T/2, facing −X): seen only from inside. */
const frontInside = (m: Mesh | null) =>
  facing(m, [-1, 0, 0]).filter((c) => Math.abs(c[0] - (HALF_X - WALL_T / 2)) < 1e-3);

describe('walls LOD2 culling', () => {
  it('keeps the inner faces of a roofless hall (scaffold)', () => {
    const list = wallCells('scaffold', 'intact', createRng(3));
    expect(frontInside(walls(2, list, createRng(1), false).walls).length).toBeGreaterThan(0);
  });
  it('still drops them under the roof (complete)', () => {
    const list = wallCells('complete', 'intact', createRng(3));
    expect(frontInside(walls(2, list, createRng(1), true).walls)).toEqual([]);
  });
  it('drops the eaves-course top of the gable ends under a roof, keeps it without one', () => {
    const tops = (roofed: boolean) =>
      facing(walls(2, bays(), createRng(1), roofed).walls, [0, 0, 1]).filter(
        (c) => Math.abs(c[2] - EAVES) < 1e-3 && Math.abs(Math.abs(c[0]) - HALF_X) < WALL_T,
      );
    expect(tops(true)).toEqual([]);
    expect(tops(false).length).toBeGreaterThan(0);
  });
  it("keeps a side wall's end where the front wall it butts against is gone", () => {
    const list = bays();
    const corner = list.find((b) => b.id === 'front_0');
    for (const row of corner?.cells ?? []) row[0] = false;
    // The right wall starts against front_0: its start face looks +X at x = HALF_X − WALL_T/2.
    const end = facing(walls(2, list, createRng(1), true).walls, [1, 0, 0]).filter(
      (c) => Math.abs(c[0] - (HALF_X - WALL_T / 2)) < 1e-3 && Math.abs(c[1] + HALF_Y) < WALL_T,
    );
    expect(end.length).toBeGreaterThan(0);
  });
  it("drops a side wall's end buried in a standing front wall", () => {
    const end = facing(walls(2, bays(), createRng(1), true).walls, [1, 0, 0]).filter(
      (c) => Math.abs(c[0] - (HALF_X - WALL_T / 2)) < 1e-3,
    );
    expect(end).toEqual([]);
  });
});
