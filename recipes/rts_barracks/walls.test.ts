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

describe('sill stains (D591)', () => {
  const lum = (m: Mesh, i: number): number =>
    0.2126 * (m.colors[i * 3] ?? 0) +
    0.7152 * (m.colors[i * 3 + 1] ?? 0) +
    0.0722 * (m.colors[i * 3 + 2] ?? 0);
  const mean = (a: number[]): number => a.reduce((p, q) => p + q, 0) / Math.max(1, a.length);

  it('darken the stones under each sill, not the stones beside them, and add no decal', () => {
    const list = wallCells('complete', 'intact', createRng(3));
    const w = walls(0, list, createRng(1), true, true);
    expect(Object.keys(w)).not.toContain('stains');
    const m = w.walls;
    if (!m || w.sills.length === 0) throw new Error('no walls or sills');
    const [under, beside] = [[] as number[], [] as number[]];
    for (const b of list) {
      const sill = w.sills.find((s) => {
        const t = (s[0] - b.origin[0]) * b.dir[0] + (s[1] - b.origin[1]) * b.dir[1];
        const o = (s[0] - b.origin[0]) * b.out[0] + (s[1] - b.origin[1]) * b.out[1];
        return Math.abs(t - b.len / 2) < 0.05 && o > WALL_T / 2 && o < WALL_T / 2 + 0.4;
      });
      if (!sill) continue;
      for (let i = 0; i < m.positions.length / 3; i++) {
        const [x, y, z] = [
          m.positions[i * 3] ?? 0,
          m.positions[i * 3 + 1] ?? 0,
          m.positions[i * 3 + 2] ?? 0,
        ];
        const t = (x - b.origin[0]) * b.dir[0] + (y - b.origin[1]) * b.dir[1];
        const o = (x - b.origin[0]) * b.out[0] + (y - b.origin[1]) * b.out[1];
        // The outward face, 0.35–0.9 m below the sill (rain runs from under the string course).
        if (Math.abs(o - WALL_T / 2) > 0.04 || z > sill[2] - 0.35 || z < sill[2] - 0.9) continue;
        if (Math.abs(t - b.len / 2) < 0.12) under.push(lum(m, i));
        else if (Math.abs(t - b.len / 2) > 0.6 && t > 0 && t < b.len) beside.push(lum(m, i));
      }
    }
    expect(under.length).toBeGreaterThan(20);
    expect(mean(under)).toBeLessThan(mean(beside) * 0.92);
  });
});

describe('window reveal (D594)', () => {
  /** Front-wall windows (facing +X): how far the pane sits behind its surround's front. */
  const recess = (frames: Mesh | null, panes: Mesh | null): number => {
    const xs = (m: Mesh | null) => (m ? m.positions.filter((_, i) => i % 3 === 0) : []);
    return Math.max(...xs(frames)) - Math.max(...xs(panes));
  };

  it('fails a light flush with its surround', () => {
    const list = wallCells('complete', 'intact', createRng(3));
    const w = walls(0, list, createRng(1), true, true);
    expect(recess(w.windows, w.windows)).toBeLessThan(0.12);
  });

  for (const lod of [0, 1] as const)
    it(`LOD${lod}: every light sits at least 12 cm back in its reveal`, () => {
      const list = wallCells('complete', 'intact', createRng(3));
      const w = walls(lod, list, createRng(1), true, true);
      expect(recess(w.frames, w.windows)).toBeGreaterThanOrEqual(0.12);
    });
});
