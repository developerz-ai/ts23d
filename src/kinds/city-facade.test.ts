// The city facade by LOD. Failure cases first, as measured on the kind before D306: LOD1 drew
// LOD0's triangles (1848 / 1848 on this terrace), LOD2 lost every window, and walls were the plain
// strip stretched over each prism side.
import { describe, expect, it } from 'bun:test';
import {
  boundsOf,
  compile,
  defineAsset,
  type Lod,
  type Mesh,
  triangleCount,
  type Vec2,
  type Vec3,
} from '../core/index.ts';
import { stripRect } from '../material/index.ts';
import { runQa } from '../qa/index.ts';
import { type CityOptions, cityBlock } from './city.ts';
import { type CityFootprint, cityPlan } from './city-plan.ts';

const W: Vec3[] = [
  [0.5, 0.2, 0.1],
  [0.3, 0.3, 0.3],
  [0.7, 0.6, 0.5],
  [0.2, 0.3, 0.5],
];
const rect = (x: number, y: number, w: number, d: number): Vec2[] => [
  [x, y],
  [x + w, y],
  [x + w, y + d],
  [x, y + d],
];
/** A terrace of four rowhouses sharing party walls, plus a detached one. */
const ROW: CityFootprint[] = [
  { id: 101, ring: rect(0, 0, 6, 15), height: 12.4, levels: null },
  { id: 102, ring: rect(6, 0, 6, 15), height: null, levels: 4 },
  { id: 103, ring: rect(12, 0, 6, 15), height: null, levels: null },
  { id: 104, ring: rect(18, 0, 6, 15), height: 17, levels: 5 },
  { id: 200, ring: rect(40, 0, 10, 10), height: 9, levels: null },
];
const OPT = {
  walls: W,
  glass: [0.1, 0.12, 0.15] as Vec3,
  roof: [0.2, 0.2, 0.2] as Vec3,
  ground: [0.5, 0.5, 0.5] as Vec3,
  road: [0.2, 0.2, 0.2] as Vec3,
};

describe('cityBlock facade by LOD', () => {
  const block = defineAsset({
    name: 'row',
    kind: 'scene',
    budget: { triangles: [20000, 20000, 2000] },
    build: (ctx) => void cityBlock(ctx, ROW, OPT),
  });
  const tris = (a: typeof block, lod: Lod): number =>
    compile(a, { lod }).parts.reduce((n, p) => n + (p.mesh ? triangleCount(p.mesh) : 0), 0);
  const trimmed = defineAsset({
    name: 'row_trim',
    kind: 'scene',
    budget: { triangles: [20000, 20000, 2000] },
    build: (ctx) => void cityBlock(ctx, ROW, { ...OPT, trim: [0.8, 0.8, 0.8] }),
  });

  it('LOD1 is under 0.7 × LOD0 triangles and LOD2 under LOD1, with or without trim (D306)', () => {
    for (const a of [block, trimmed]) {
      const [t0, t1, t2] = [tris(a, 0), tris(a, 1), tris(a, 2)];
      expect(t1).toBeLessThan(0.7 * t0);
      expect(t2).toBeLessThan(0.5 * t1);
    }
  });

  it('LOD2 keeps massing, roofs and the window rows as dark bands; no cornice', () => {
    const c = compile(block, { lod: 2 });
    expect(c.parts.filter((p) => /^b\d+$/.test(p.name))).toHaveLength(5);
    expect(c.parts.filter((p) => p.name.endsWith('_cornice'))).toEqual([]);
    const plan = cityPlan(ROW, { walls: W }).find((q) => q.id === 102);
    if (!plan) throw new Error('missing plan');
    const bands = c.parts.find((q) => q.name === 'b102_windows')?.mesh;
    if (!bands) throw new Error('LOD2 lost the window rows of b102');
    // One band per storey on each open face (front and back of the mid-terrace house): 2 triangles.
    expect(triangleCount(bands)).toBe(plan.floors * 2 * 2);
    // Dark, but the row's mean (glass and piers), not solid glass: between the two.
    for (const k of [0, 1, 2]) {
      const [lo, hi] = [OPT.glass[k] ?? 0, plan.wall[k] ?? 0].sort((x, y) => x - y);
      expect(bands.colors[k]).toBeGreaterThan(lo ?? 0);
      expect(bands.colors[k]).toBeLessThan(hi ?? 0);
    }
    // Each band spans its storey's windows: sill to head, first slot to last.
    const near = compile(block, { lod: 0 }).parts.find((q) => q.name === 'b102_windows')?.mesh;
    const [bf, bn] = [boundsOf(bands), boundsOf(near ?? bands)];
    for (const k of [0, 1, 2] as const) {
      expect(bf.min[k]).toBeCloseTo(bn.min[k], 1);
      expect(bf.max[k]).toBeCloseTo(bn.max[k], 1);
    }
  });

  it('walls carry the wall strip at true scale along each edge, coarser bands further out', () => {
    const wall = (lod: Lod, o: Partial<CityOptions> = {}) => {
      const a = defineAsset({
        name: 'one',
        kind: 'scene',
        budget: { triangles: [20000, 20000, 2000] },
        build: (ctx) =>
          void cityBlock(ctx, [{ id: 1, ring: rect(0, 0, 10, 10), height: 12.4, levels: null }], {
            ...OPT,
            ...o,
          }),
      });
      const m = compile(a, { lod }).parts.find((q) => q.name === 'b1')?.mesh;
      if (!m) throw new Error('no wall');
      return m;
    };
    const vs = (m: Mesh): number[] => Array.from(m.uvs).filter((_, i) => i % 2 === 1);
    const brick = stripRect('brick');
    // Every wall vertex is on the brick strip (the bottom cap too), not the plain one.
    for (const v of vs(wall(0))) expect(v >= brick.v0 && v <= brick.v1).toBe(true);
    const stone = stripRect('stone');
    for (const v of vs(wall(0, { wallStrip: 'stone' })))
      expect(v >= stone.v0 && v <= stone.v1).toBe(true);
    // True scale: a 10 m edge spans 10 m of strip along U (1 m of plain prism side did not).
    const us = Array.from(wall(0).uvs).filter((_, i) => i % 2 === 0);
    const span = ((Math.max(...us) - Math.min(...us)) / (brick.u1 - brick.u0)) * brick.metres;
    expect(span).toBeGreaterThanOrEqual(10 - 1e-3);
    // Courses: many bands at LOD0, one per storey at LOD1, one per wall at LOD2.
    expect(triangleCount(wall(0))).toBeGreaterThan(triangleCount(wall(1)));
    expect(triangleCount(wall(1))).toBeGreaterThan(triangleCount(wall(2)));
  });

  it('with trim, LOD0 gets a projecting cornice, a belt course and a plinth; LOD1 a flush band', () => {
    const part = (lod: Lod, name: string) =>
      compile(trimmed, { lod }).parts.find((q) => q.name === name);
    const span = (lod: Lod, name: string): number => {
      const m = part(lod, name)?.mesh;
      if (!m) throw new Error(`no ${name} at LOD${lod}`);
      return boundsOf(m).max[1] - boundsOf(m).min[1];
    };
    // The detached house (10 m deep): the cornice oversails the wall at LOD0, sits flush at LOD1.
    expect(span(0, 'b200_cornice')).toBeGreaterThan(10.2);
    expect(span(1, 'b200_cornice')).toBeCloseTo(10, 4);
    expect(part(0, 'b200_bands')?.mesh).toBeTruthy();
    expect(part(1, 'b200_bands')).toBeUndefined();
    // Without trim nothing is added (the option stays opt-in).
    expect(compile(block, { lod: 0 }).parts.some((q) => /_cornice|_bands/.test(q.name))).toBe(
      false,
    );
    for (const lod of [0, 1, 2] as Lod[]) expect(runQa(compile(trimmed, { lod }))).toEqual([]);
  });
});
