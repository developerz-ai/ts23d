import { describe, expect, it } from 'bun:test';
import { boundsOf, compile, defineAsset, Ts23dError, type Vec2, type Vec3 } from '../core/index.ts';
import { cityBlock, cityWindows } from './city.ts';
import { CITY_BANDS, type CityFootprint, cityPlan, footprintIoU, hashId } from './city-plan.ts';

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
const never = (): never => {
  throw new Error('missing plan');
};
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

  it('minHeight comes off the extruded body, and a body with no height is refused', () => {
    const lifted = { id: 1, ring: rect(0, 0, 10, 10), height: 20, levels: null, minHeight: 10 };
    const [p] = cityPlan([lifted], { walls: W, floorHeight: 3.2 });
    expect(p?.base).toBe(10);
    expect(p?.height).toBe(10);
    expect((p?.base ?? 0) + (p?.height ?? 0)).toBe(20);
    expect(p?.floors).toBe(3);
    const refuse = (minHeight: number): Ts23dError => {
      try {
        cityPlan([{ ...lifted, minHeight }], { walls: W });
      } catch (e) {
        if (e instanceof Ts23dError) return e;
      }
      throw new Error('expected a Ts23dError');
    };
    expect(refuse(20).code).toBe('T3D_RECIPE_INVALID');
    expect(refuse(25).fix).toContain('above minHeight');
    expect(refuse(-1).fix).toContain('minHeight ≥ 0');
  });

  it('refuses a body too short for the roof band and cornice, naming the minimum', () => {
    const slab = (height: number, minHeight: number): CityFootprint => ({
      id: 7,
      ring: rect(0, 0, 10, 10),
      height,
      levels: null,
      minHeight,
    });
    const tried = (f: CityFootprint): string => {
      try {
        cityPlan([f], { walls: W });
      } catch (e) {
        return e instanceof Ts23dError ? `${e.code} ${e.message} ${e.fix}` : String(e);
      }
      return 'ok';
    };
    // 0.2 m of body under a 0.3 m roof band: a −0.4 m storey and a wall extruded downwards.
    for (const f of [slab(20, 19.8), slab(0.5, 0), slab(0.99, 0)]) {
      expect(tried(f)).toContain('T3D_RECIPE_INVALID');
      expect(tried(f)).toContain(`at least ${CITY_BANDS.minBody} m`);
    }
    expect(CITY_BANDS.minBody).toBeGreaterThan(CITY_BANDS.roof + CITY_BANDS.cornice);
    expect(tried(slab(20, 19))).toBe('ok');
    // The shortest body allowed builds with every band and storey right way up, cornice on.
    const low = defineAsset({
      name: 'kiosk',
      kind: 'scene',
      budget: { triangles: [999, 999, 999] },
      build(ctx) {
        cityBlock(ctx, [slab(20, 20 - CITY_BANDS.minBody)], { ...OPT, trim: [0.8, 0.8, 0.8] });
      },
    });
    const [p] = cityPlan([slab(20, 20 - CITY_BANDS.minBody)], { walls: W });
    expect(p?.floorHeight).toBeGreaterThan(0);
    const wall = compile(low, { lod: 0 }).parts.find((x) => x.name === 'b7')?.mesh;
    const zs = Array.from(wall?.positions ?? [], (v, i) => (i % 3 === 2 ? v : 0));
    expect(Math.max(...zs)).toBeCloseTo(CITY_BANDS.minBody - CITY_BANDS.roof - CITY_BANDS.cornice);
    expect(Math.min(...zs)).toBe(0);
  });

  it('a wall is shared only where the neighbour stands: windows fill the rest', () => {
    // A 30 m hall with a 6 m annexe on its north wall (x 10–16).
    const hall = { id: 1, ring: rect(0, 0, 30, 10), height: 12, levels: null };
    const plans = cityPlan([hall, { id: 2, ring: rect(10, 10, 6, 8), height: 6, levels: null }], {
      walls: W,
    });
    expect(plans[0]?.party).toEqual([false, false, false, false]);
    expect(plans[0]?.shared[2]).toEqual([[14, 20]]);
    expect(plans[1]?.party).toEqual([true, false, false, false]);
    expect(plans[0]?.neighbours).toEqual([2]);
    const north = cityWindows(plans[0] ?? never()).filter((w) => Math.abs(w.at[1] - 10) < 1e-6);
    expect(north.length).toBeGreaterThan(0);
    for (const w of north)
      expect(w.at[0] + w.scale[1] / 2 <= 10 || w.at[0] - w.scale[1] / 2 >= 16).toBe(true);
    // Three 2 m sheds under the old probe points (1/3, 1/2, 2/3) must not blank the whole wall.
    const sheds = [10, 15, 20].map((x, k) => ({
      id: 10 + k,
      ring: rect(x - 1, 10, 2, 3),
      height: 3,
      levels: null,
    }));
    const [alone] = cityPlan([hall, ...sheds], { walls: W });
    expect(alone?.party[2]).toBe(false);
    expect(
      cityWindows(alone ?? never()).filter((w) => Math.abs(w.at[1] - 10) < 1e-6).length,
    ).toBeGreaterThan(0);
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
  it('window rows stand on their sill and stay under the cornice; roads stay on the slab', () => {
    const trim: Vec3 = [0.8, 0.8, 0.8];
    const extent = [-10, -10, 20, 20] as const;
    const a = defineAsset({
      name: 'one',
      kind: 'scene',
      budget: { triangles: [20000, 20000, 2000] },
      build: (ctx) =>
        void cityBlock(ctx, [{ id: 1, ring: rect(0, 0, 10, 10), height: 12.4, levels: null }], {
          ...OPT,
          trim,
          extent,
          streets: [
            {
              highway: 'primary',
              line: [
                [-50, -8],
                [50, -8],
              ],
            },
            {
              highway: 'residential',
              line: [
                [-50, -50],
                [50, 60],
              ],
            },
            {
              highway: 'service',
              line: [
                [-50, -40],
                [50, -40],
              ],
            },
          ],
        }),
    });
    const c = compile(a, { lod: 0 });
    const part = (n: string) => {
      const p = c.parts.find((q) => q.name === n);
      if (!p?.mesh) throw new Error(`no ${n}`);
      return { b: boundsOf(p.mesh), z: p.at[2] };
    };
    const [p] = cityPlan([{ id: 1, ring: rect(0, 0, 10, 10), height: 12.4, levels: null }], OPT);
    const win = part('b1_windows');
    expect(win.b.min[2]).toBeCloseTo((p?.floorHeight ?? 0) * 0.26, 5);
    expect(win.b.max[2]).toBeLessThan(part('b1_cornice').z + part('b1_cornice').b.min[2]);
    const road = part('streets').b;
    expect(road.min[0]).toBeGreaterThanOrEqual(extent[0] - 1e-6);
    expect(road.min[1]).toBeGreaterThanOrEqual(extent[1] - 1e-6);
    expect(road.max[0]).toBeLessThanOrEqual(extent[2] + 1e-6);
    expect(road.max[1]).toBeLessThanOrEqual(extent[3] + 1e-6);
    // The primary road (14 m wide, centre 2 m inside the slab edge) keeps its inside half.
    expect(road.min[1]).toBeCloseTo(-10, 6);
  });

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
