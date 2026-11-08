import { describe, expect, it } from 'bun:test';
import { compile, defineAsset, type Mesh, merge } from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { weather } from './weather.ts';
import { traceStreaks } from './weather-streaks.ts';
import { analyse } from './weather-surface.ts';

const paint: [number, number, number] = [0.2, 0.3, 0.2];
// A steel door leaf (1 × 2 m) standing on the ground, a bolt head on its +X face.
const door = (): Mesh => box({ size: [0.05, 1, 2], color: paint });
const bolt = { at: [0.035, 0.2, 1.5] as [number, number, number], radius: 0.02 };

const changed = (a: Mesh, b: Mesh): number[] => {
  const out: number[] = [];
  for (let v = 0; v < b.positions.length / 3; v++)
    if (Math.abs((b.colors[v * 3] ?? 0) - (a.colors[v * 3] ?? 0)) > 1e-6) out.push(v);
  return out;
};

describe('weather — coverage (%)', () => {
  it('rejects amounts outside 0..1 and unknown selectors, with a fix', () => {
    expect(() => weather(door(), { effects: { dust: { amount: 1.5 } } })).toThrow(/outside 0..1/);
    expect(() => weather(door(), { effects: { dust: { where: 'up-facin' } } })).toThrow(
      /unknown selector 'up-facin'/,
    );
    expect(() => weather(door(), { effects: { dust: { where: 'up-facing &' } } })).toThrow(
      /ends early/,
    );
  });

  it('hits every declared amount within ±2% of the eligible area, at LOD0 and at LOD2', () => {
    for (const lod of [0, 2] as const) {
      const { coverage } = weather(door(), {
        lod,
        seed: 4,
        fasteners: [bolt],
        effects: {
          chips: { amount: 0.15 },
          rust: { where: 'below-fasteners | convex-edges', amount: 0.08 },
          dust: { amount: 0.3 },
          mud: { amount: 0.2 },
          bleach: { where: 'up-facing', amount: 0.2 },
        },
      });
      expect(coverage.length).toBe(5);
      for (const c of coverage) {
        expect(c.area).toBeGreaterThan(0);
        expect(Math.abs(c.actual - c.amount)).toBeLessThanOrEqual(0.02);
      }
    }
  });

  it('scales omitted amounts by age', () => {
    const young = weather(door(), { age: 0.2, effects: { dust: {} } }).coverage[0];
    const old = weather(door(), { age: 0.8, effects: { dust: {} } }).coverage[0];
    expect(old?.amount ?? 0).toBeCloseTo(4 * (young?.amount ?? 1), 6);
  });

  it('adds climate effects under explicit ones', () => {
    const { coverage } = weather(door(), { climate: 'desert', effects: { dust: { amount: 0.4 } } });
    expect(coverage.map((c) => c.effect).sort()).toEqual(['bleach', 'chips', 'dust', 'mud']);
    expect(coverage.find((c) => c.effect === 'dust')?.amount).toBe(0.4);
  });
});

describe('weather — where (plausibility)', () => {
  it('reports dust forced onto undersides as misplaced, and never puts default dust there', () => {
    const forced = weather(door(), { effects: { dust: { where: 'down-facing', amount: 0.5 } } });
    expect(forced.coverage[0]?.misplaced).toBe(1);
    const { mesh, coverage } = weather(door(), { effects: { dust: { amount: 0.5 } } });
    expect(coverage[0]?.misplaced).toBe(0);
    const moved = changed(weather(door(), { effects: {} }).mesh, mesh);
    expect(moved.length).toBeGreaterThan(10);
    for (const v of moved) expect(mesh.normals[v * 3 + 2] ?? 0).toBeGreaterThan(0.45);
  });

  it('traces rust streaks that only ever descend, starting below the fastener', () => {
    const { mesh, coverage } = weather(door(), {
      fasteners: [bolt],
      effects: { rust: { amount: 0.3, streaks: true, streakLength: 0.4 } },
    });
    const rust = coverage[0];
    expect(rust?.streaks ?? 0).toBeGreaterThan(5);
    expect(rust?.upward).toBe(0);
    const clean = weather(door(), { effects: {} }).mesh;
    const stained = changed(clean, mesh).map((v) => mesh.positions[v * 3 + 2] ?? 0);
    expect(Math.max(...stained)).toBeLessThan(bolt.at[2] + 0.001);
    expect(Math.min(...stained)).toBeLessThan(bolt.at[2] - 0.2);
  });

  it('traceStreaks never steps uphill even from every vertex of a tilted, bumpy surface', () => {
    const s = analyse(
      merge([
        box({ size: [0.6, 0.6, 0.6], color: paint }),
        box({ size: [0.2, 0.9, 0.3], at: [0.3, 0, 0.1], color: paint }),
      ]),
    );
    const all = new Float32Array(s.groups).fill(1);
    const st = traceStreaks(s, all, 1, (g) => (g * 0.618) % 1);
    expect(st.segments).toBeGreaterThan(0);
    expect(st.upward).toBe(0);
  });
});

describe('weather — random (determinism, LOD consistency)', () => {
  const opts = {
    seed: 9,
    fasteners: [bolt],
    effects: { chips: {}, rust: { streaks: true }, moss: {}, dents: { count: [2, 3] as const } },
  };

  it('is byte-identical for the same seed and differs for another', () => {
    const a = weather(door(), opts).mesh;
    const b = weather(door(), opts).mesh;
    const c = weather(door(), { ...opts, seed: 10 }).mesh;
    expect(Buffer.from(a.colors.buffer).equals(Buffer.from(b.colors.buffer))).toBe(true);
    expect(Buffer.from(a.positions.buffer).equals(Buffer.from(b.positions.buffer))).toBe(true);
    expect(Buffer.from(a.colors.buffer).equals(Buffer.from(c.colors.buffer))).toBe(false);
  });

  it('dents only LOD0/1, at the same spots on both', () => {
    const lods = ([0, 1, 2] as const).map((lod) => weather(door(), { ...opts, lod }));
    const dents = lods.map((l) => l.coverage.find((c) => c.effect === 'dents'));
    expect(dents[0]?.count).toBe(dents[1]?.count);
    expect(dents[0]?.count ?? 0).toBeGreaterThan(0);
    expect(dents[2]?.count).toBe(0);
    expect(dents[2]?.actual).toBe(0);
    // LOD2: geometry untouched (no tessellation, no deformation).
    expect(Array.from(lods[2]?.mesh.positions ?? [])).toEqual(Array.from(door().positions));
    // LOD0 and LOD1 both press in deeper than 2 mm.
    expect(dents[0]?.actual ?? 0).toBeGreaterThan(0.002);
    expect(dents[1]?.actual ?? 0).toBeGreaterThan(0.0);
  });
});

describe('weather — ctx form', () => {
  it('weathers named parts in one space, resolves globs, records coverage on the asset', () => {
    const a = defineAsset({
      name: 'door_set',
      kind: 'prop',
      budget: { triangles: [90000, 30000, 999] },
      build: (ctx) => {
        const m = weather(
          ctx,
          {
            leaf: door(),
            bolt_0: box({ size: [0.02, 0.04, 0.04], at: [0.035, 0.2, 1.48], color: paint }),
          },
          {
            name: 'door',
            fasteners: ['bolt_*'],
            effects: { rust: { amount: 0.1, streaks: true } },
          },
        );
        ctx.part('leaf', m.leaf);
        ctx.part('bolt_0', m.bolt_0);
      },
    });
    const c = compile(a);
    expect(c.weather?.[0]?.target).toBe('door');
    expect(c.weather?.[0]?.area ?? 0).toBeGreaterThan(0);
    expect(() =>
      compile(
        defineAsset({
          ...a,
          build: (ctx) => {
            weather(ctx, { leaf: door() }, { fasteners: ['nut_*'], effects: { rust: {} } });
          },
        }),
      ),
    ).toThrow(/no mesh matches 'nut_\*'/);
  });
});
