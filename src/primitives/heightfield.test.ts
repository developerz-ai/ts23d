import { expect, it } from 'bun:test';
import { boundsOf, triangleCount } from '../core/index.ts';
import { heightfield } from './heightfield.ts';

it('samples the height function on a grid with upward normals', () => {
  const m = heightfield({
    rect: [-10, -10, 10, 10],
    cells: [8, 4],
    height: (x) => x * 0.1,
    color: [1, 1, 1],
  });
  expect(triangleCount(m)).toBe(8 * 4 * 2);
  expect(boundsOf(m).max[2]).toBeCloseTo(1, 5);
  expect(m.normals[2]).toBeGreaterThan(0.9);
});

it('rejects a flipped or empty rect and zero / fractional cells', () => {
  const ok = { height: () => 0, color: [1, 1, 1] as const };
  for (const rect of [
    [4, 4, 0, 0],
    [0, 0, 0, 4],
    [0, 0, 4, Number.NaN],
  ] as const)
    expect(() => heightfield({ ...ok, rect, cells: [2, 2] })).toThrow('T3D_RECIPE_INVALID');
  for (const cells of [
    [0, 2],
    [2, 1.5],
  ] as const)
    expect(() => heightfield({ ...ok, rect: [0, 0, 4, 4], cells })).toThrow('T3D_RECIPE_INVALID');
});

it('keeps true normals on rectangular cells (a 45° plane is 45° whatever dx : dy)', () => {
  const m = heightfield({
    rect: [0, 0, 10, 1],
    cells: [10, 10],
    height: (x) => x,
    color: [1, 1, 1],
  });
  expect(m.normals[0]).toBeCloseTo(-Math.SQRT1_2, 5);
  expect(m.normals[1]).toBeCloseTo(0, 5);
  expect(m.normals[2]).toBeCloseTo(Math.SQRT1_2, 5);
});

/** Every triangle whose three normals are `n` faces along `n`, has area, and spans V. */
function wallsFaceOut(m: ReturnType<typeof heightfield>): number {
  let walls = 0;
  const P = (i: number, k: number): number => m.positions[i * 3 + k] ?? 0;
  for (let t = 0; t < m.indices.length; t += 3) {
    const [a = 0, b = 0, c = 0] = m.indices.subarray(t, t + 3);
    if (Math.abs(m.normals[a * 3 + 2] ?? 0) > 1e-6) continue;
    walls++;
    const u = [0, 1, 2].map((k) => P(b, k) - P(a, k));
    const w = [0, 1, 2].map((k) => P(c, k) - P(a, k));
    const g = [
      (u[1] ?? 0) * (w[2] ?? 0) - (u[2] ?? 0) * (w[1] ?? 0),
      (u[2] ?? 0) * (w[0] ?? 0) - (u[0] ?? 0) * (w[2] ?? 0),
      (u[0] ?? 0) * (w[1] ?? 0) - (u[1] ?? 0) * (w[0] ?? 0),
    ];
    const facing = [0, 1, 2].reduce((s, k) => s + (g[k] ?? 0) * (m.normals[a * 3 + k] ?? 0), 0);
    expect(facing).toBeGreaterThan(1e-9);
    const vs = [a, b, c].map((i) => m.uvs[i * 2 + 1] ?? 0);
    expect(Math.max(...vs) - Math.min(...vs)).toBeGreaterThan(1e-6);
  }
  return walls;
}

it('winds skirt walls outward with a real V span where the terrain dips below the skirt', () => {
  const base = { rect: [0, 0, 4, 4], cells: [2, 2], color: [1, 1, 1] } as const;
  expect(wallsFaceOut(heightfield({ ...base, height: () => -1, skirt: 0 }))).toBe(16);
  // Crossing the base inside a cell: one triangle each side of the crossing, both facing out.
  expect(wallsFaceOut(heightfield({ ...base, height: (x) => x - 1, skirt: 0 }))).toBe(16);
  expect(wallsFaceOut(heightfield({ ...base, height: () => 1, skirt: 0 }))).toBe(16);
});
