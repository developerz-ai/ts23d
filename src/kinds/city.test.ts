import { describe, expect, it } from 'bun:test';
import { compile, defineAsset, type Vec2, type Vec3 } from '../core/index.ts';
import { cityBlock, cityWindows } from './city.ts';
import { type CityFootprint, cityPlan, footprintIoU, hashId } from './city-plan.ts';

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

describe('cityPlan', () => {
  it('refuses a palette with one colour and a degenerate footprint', () => {
    expect(() => cityPlan(ROW, { walls: [W[0] ?? [0, 0, 0]] })).toThrow('1 wall colour');
    expect(() =>
      cityPlan(
        [
          {
            id: 1,
            ring: [
              [0, 0],
              [1, 0],
            ],
            height: 3,
            levels: null,
          },
        ],
        { walls: W },
      ),
    ).toThrow('footprint points');
  });

  it('two neighbours are never identical: shared walls get different colours', () => {
    const plans = cityPlan(ROW, { walls: W });
    const byId = new Map(plans.map((p) => [p.id, p]));
    for (const p of plans)
      for (const n of p.neighbours) expect(byId.get(n)?.wall).not.toEqual(p.wall);
    expect(byId.get(102)?.neighbours).toEqual([101, 103]);
    expect(byId.get(200)?.neighbours).toEqual([]);
  });

  it('height from the tag, else levels × storey, else the default; party walls marked', () => {
    const p = cityPlan(ROW, { walls: W, floorHeight: 3.2 });
    expect(p.map((x) => x.heightSource)).toEqual([
      'height',
      'levels',
      'default',
      'height',
      'height',
    ]);
    expect(p[1]?.height).toBeCloseTo(4 * 3.2 + 0.6, 6);
    expect(p[1]?.floors).toBe(4);
    // Rowhouse 102: west and east edges are party walls, street and back are not.
    expect(p[1]?.party).toEqual([false, true, false, true]);
  });

  it('seeds are a pure function of the OSM id', () => {
    expect(hashId(250474561)).toBe(hashId(250474561));
    expect(hashId(250474561)).not.toBe(hashId(250474562));
    expect(cityPlan(ROW, { walls: W })).toEqual(cityPlan([...ROW].reverse(), { walls: W }));
  });
});

describe('cityBlock', () => {
  const block = defineAsset({
    name: 'row',
    kind: 'scene',
    budget: { triangles: [20000, 20000, 2000] },
    build: (ctx) => void cityBlock(ctx, ROW, OPT),
  });

  it('extrudes each footprint to its height (IoU 1 against the source) with windows off party walls', () => {
    const c = compile(block, { lod: 0 });
    const walls = c.parts.find((p) => p.name === 'b101');
    const P = walls?.mesh?.positions ?? new Float32Array();
    const zs = Array.from({ length: P.length / 3 }, (_, i) => P[i * 3 + 2] ?? 0);
    const roof = c.parts.find((p) => p.name === 'b101_roof');
    const R = roof?.mesh?.positions ?? new Float32Array();
    const top = Math.max(
      ...Array.from({ length: R.length / 3 }, (_, i) => (R[i * 3 + 2] ?? 0) + (roof?.at[2] ?? 0)),
    );
    expect(Math.min(...zs)).toBeCloseTo(0, 6);
    expect(top).toBeCloseTo(12.4, 4);
    expect(footprintIoU(rect(0, 0, 6, 15), rect(0, 0, 6, 15))).toBe(1);
    expect(footprintIoU(rect(0, 0, 6, 15), rect(0, 3, 6, 15))).toBeCloseTo(0.67, 1);
    const plans = cityPlan(ROW, { walls: W });
    // No window sits on a party wall (x = 6, 12, 18 between rowhouses).
    const ws = plans.flatMap(cityWindows);
    expect(ws.some((w) => [6, 12, 18].some((x) => Math.abs(w.at[0] - x) < 0.01))).toBe(false);
    expect(ws.length).toBeGreaterThan(20);
    expect(c.parts.some((p) => p.name === 'b101_windows')).toBe(true);
  });

  it('LOD2 keeps massing and roofs, drops windows and cornices', () => {
    const c = compile(block, { lod: 2 });
    expect(c.parts.filter((p) => p.name.endsWith('_windows'))).toEqual([]);
    expect(c.parts.filter((p) => /^b\d+$/.test(p.name))).toHaveLength(5);
  });
});
