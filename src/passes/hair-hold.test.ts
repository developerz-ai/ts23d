import { describe, expect, test } from 'bun:test';
import { createRng, dmath, type Mesh, MeshBuilder, type Vec3 } from '../core/index.ts';
import { hairCards } from './hair-cards.ts';
import { CELL } from './hair-fixtures.ts';
import { hairFlow } from './hair-flow.ts';
import { hang, hold, holdLine, riseOf } from './hair-hold.ts';
import { gradient } from './hair-roots.ts';

// A lip: a shelf with an up-facing top whose front turns under at 45° (rounded 4 mm), hair
// combed straight down with a little forward, as a beard is. Roots on the top face only.
const shelf = (p: Vec3): number =>
  Math.max(
    p[2] - 0.004,
    0.71 * p[0] - 0.7 * p[2] - 0.016,
    Math.abs(p[1]) - 0.036,
    -p[0] - 0.026,
    -p[2] - 0.036,
  ) - 0.004;

function meshOf(f: (p: Vec3) => number, rings = 40, around = 64): Mesh {
  const b = new MeshBuilder();
  for (let i = 0; i <= rings; i++)
    for (let j = 0; j < around; j++) {
      const th = (i / rings) * Math.PI;
      const a = (j / around) * Math.PI * 2;
      const d: Vec3 = [dmath.sin(th) * dmath.cos(a), dmath.sin(th) * dmath.sin(a), dmath.cos(th)];
      let lo = 0;
      let hi = 0.1;
      for (let it = 0; it < 40; it++) {
        const m = (lo + hi) / 2;
        if (f([d[0] * m, d[1] * m, d[2] * m - 0.012]) < 0) lo = m;
        else hi = m;
      }
      const p: Vec3 = [d[0] * lo, d[1] * lo, d[2] * lo - 0.012];
      b.vertex({ p, n: gradient(f, p, 1e-5), uv: [0, 0], color: [0.5, 0.4, 0.3] });
    }
  for (let i = 0; i < rings; i++)
    for (let j = 0; j < around; j++) {
      const v = (ii: number, jj: number): number => ii * around + (jj % around);
      b.quad(v(i, j), v(i + 1, j), v(i + 1, j + 1), v(i, j + 1));
    }
  return b.build();
}

const LIFT = 0.3;
const BEND = 0.6;
const WIDTH = 0.0125;
const LEN = 0.06;
const SEGS = 4;

/** Worst height of any card point over its allowance (the zone's highest lift and length). */
function worstProud(seed: number): { worst: number; cards: number } {
  const surface = meshOf(shelf);
  const out = hairCards({
    surface,
    flow: hairFlow(surface, () => [0.22, 0.12, -1]),
    rng: createRng(seed),
    field: shelf,
    segments: SEGS,
    zones: [
      {
        name: 'beard',
        density: (_p, n) => (n[2] > 0.8 ? 9000 : 0),
        length: LEN,
        width: WIDTH,
        lift: LIFT,
        bend: BEND,
        droop: 0.45,
        hug: 0.6,
        clump: 3,
        fold: 0,
        cells: [CELL],
      },
    ],
  });
  // Lift jitters ×0.7..1.3 and length ±25 %: the allowance of the tallest card the zone declares.
  const rise = riseOf(LEN * 1.25, SEGS, LIFT * 1.3, BEND, WIDTH / 2);
  const P = out.mesh.positions;
  let worst = Number.NEGATIVE_INFINITY;
  for (let c = 0; c < out.roots.length; c++) {
    let z0 = 0;
    for (let k = 0; k <= SEGS; k++) {
      const i = (c * (SEGS + 1) + k) * 6;
      const at = (j: number): number => ((P[i + j] ?? 0) + (P[i + 3 + j] ?? 0)) / 2;
      const p: Vec3 = [at(0), at(1), at(2)];
      if (k === 0) z0 = p[2];
      const allowed = (rise[k] ?? 0) + (WIDTH * 0.15 * k) / SEGS + Math.max(0, z0 - p[2]);
      worst = Math.max(worst, shelf(p) - allowed);
    }
  }
  return { worst, cards: out.roots.length };
}

describe('hair lift bound', () => {
  test('fails if a card runs off a shelf edge and stands proud of its lift (the stray beard card)', () => {
    for (const seed of [1, 2, 6, 8]) {
      const { worst, cards } = worstProud(seed);
      expect(cards).toBeGreaterThan(20);
      // 0.5 mm: finite-difference normals on the 4 mm rounding.
      expect(worst).toBeLessThan(5e-4);
    }
  });

  test('riseOf: flat-skin height of the lift, bend taking it off, slack reached by the tip', () => {
    expect(riseOf(0.04, 4, 0, 0.5, 0)).toEqual([0, 0, 0, 0, 0]);
    const straight = riseOf(0.04, 4, 0.3, 0, 0);
    expect(straight[4]).toBeCloseTo(0.04 * dmath.sin(0.3), 9);
    expect(riseOf(0.04, 4, 0.3, 0.8, 0)[4] ?? 0).toBeLessThan(straight[4] ?? 0);
    expect((riseOf(0.04, 4, 0.3, 0, 0.006)[2] ?? 0) - (straight[2] ?? 0)).toBeCloseTo(0.003, 9);
  });

  const floor = (p: Vec3): number => p[2];
  const wall = (p: Vec3): number => p[0];
  test('hold: within the allowance nothing moves; over a floor the step is turned down onto it', () => {
    const q: Vec3 = [0.01, 0, 0.004];
    expect(hold(floor, undefined, [0, 0, 0], [0, 0, 0.001], q, 0.005, 1e-4)).toBe(q);
    const held = hold(floor, undefined, [0, 0, 0], [0, 0, 0.001], [0.01, 0, 0.011], 0.005, 1e-4);
    expect(held[2]).toBeCloseTo(0.005, 4);
    expect(dmath.hypot(held[0], held[2] - 0.001)).toBeCloseTo(dmath.hypot(0.01, 0.01), 9);
  });

  test('fails before D404: a step straight off the skin is laid over, never turned into it', () => {
    // Exactly opposed to the target (straight up from up-facing skin): no side to blend by.
    const p: Vec3 = [0, 0, 0.001];
    const held = hold(floor, undefined, [0, 0, 0], p, [0, 0, 0.011], 0.005, 1e-4);
    expect(held[2]).toBeGreaterThanOrEqual(0); // not buried
    expect(held[2]).toBeCloseTo(0.005, 4); // turned only until within its allowance
    expect(dmath.hypot(held[0] - p[0], held[1] - p[1], held[2] - p[2])).toBeCloseTo(0.01, 9);
    // Along a finished line, every point stays out of the skin.
    const line: Vec3[] = [0, 1, 2, 3, 4].map((k): Vec3 => [0, 0, 0.001 + 0.01 * k]);
    for (const q of holdLine(line, floor, undefined, [0, 0.002, 0.004, 0.006, 0.008], 0, 1e-4))
      expect(q[2]).toBeGreaterThanOrEqual(0);
  });

  test('hold: hanging is not proud — a point below its root may be that far off a wall', () => {
    const root: Vec3 = [0, 0, 0.05];
    const q: Vec3 = [0.02, 0, 0.02];
    expect(hold(wall, undefined, root, [0.01, 0, 0.03], q, 0.002, 1e-4)).toBe(q);
    // The same offset level with the root is 2 cm proud: turned back to the wall.
    const level = hold(wall, undefined, root, [0.01, 0, 0.05], [0.03, 0, 0.05], 0.002, 1e-4);
    expect(level[0] - Math.max(0, root[2] - level[2])).toBeLessThan(0.002 + 1e-5);
  });

  test('holdLine: a root the field reads as proud keeps its card; no field, no change', () => {
    const line: Vec3[] = [
      [0.02, 0, 0],
      [0.021, 0.01, 0],
      [0.022, 0.02, 0],
    ];
    expect(holdLine(line, wall, undefined, [0, 0.001, 0.002], 0.001, 1e-4)).toEqual(line);
    expect(holdLine(line, undefined, undefined, [0, 0, 0], 0, 1e-4)).toEqual(line);
  });

  test('hang: only a strand from supporting skin, near skin turned under, is turned down', () => {
    const d: Vec3 = [1, 0, 0];
    const up: Vec3 = [0, 0, 1];
    const under: Vec3 = [0.7, 0, -0.714];
    expect(hang(d, up, up, 1)).toBe(d);
    expect(hang(d, under, under, 1)).toBe(d); // rooted under a chin: never held up
    expect(hang(d, under, up, 0)).toBe(d); // clear of the skin: free already
    const h = hang(d, under, up, 1);
    expect(h[2]).toBeCloseTo(-1, 6);
    expect(hang(d, under, up, 0.5)[2]).toBeCloseTo(-Math.SQRT1_2, 6);
  });
});
