// The far (LOD2) walls cull only faces that surviving geometry hides. Failure first: roofless
// stages (scaffold, rubble, foundation) lost every inward face, and a side wall lost its end even
// where the front or back wall it butts against had been knocked down.

import { describe, expect, it } from 'bun:test';
import { createRng, dmath, type Mesh, type Vec3 } from '@developerz.ai/ts23d';
import { bays, EAVES, HALF_X, HALF_Y, ROWS, WALL_T, wallCells } from './plan.ts';
import { CORNERS, quoinRows, walls } from './walls.ts';

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

describe('quoin stacks', () => {
  const origin: Vec3 = [0, 0, 0];
  const [a, b] = [CORNERS[0] ?? origin, CORNERS[1] ?? origin];
  it('stand full height on an intact hall', () => {
    expect(quoinRows(bays(), a)).toBe(ROWS);
    expect(quoinRows(bays(), b)).toBe(ROWS);
  });
  it('a corner knocked down to 3 courses truncates its own stack only', () => {
    // Failure first: both stacks took the minimum over every bay meeting either corner.
    const list = bays();
    for (const bay of list.filter((x) => x.id === 'front_0'))
      for (let r = 3; r < bay.cells.length; r++) bay.cells[r]?.fill(false);
    const lowered = [quoinRows(list, a), quoinRows(list, b)].sort((x, y) => x - y);
    expect(lowered).toEqual([3, ROWS]);
  });
});

describe('sill drips', () => {
  it('hang only under a window sill (none on the gate bay or a bay whose window is knocked out)', () => {
    const list = wallCells('complete', 'damaged', createRng(3));
    const w = walls(0, list, createRng(1), true, true);
    const m = w.stains;
    expect(m).not.toBeNull();
    expect(w.sills.length).toBeLessThan(list.length);
    const pos = m?.positions ?? new Float32Array();
    for (let i = 0; i < pos.length / 3; i++) {
      const [x, y] = [pos[i * 3] ?? 0, pos[i * 3 + 1] ?? 0];
      const under = w.sills.some((s) => dmath.hypot(x - s[0], y - s[1]) < 0.6);
      expect({ i, under }).toEqual({ i, under: true });
    }
  });
});
