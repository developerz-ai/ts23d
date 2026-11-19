import { describe, expect, it } from 'bun:test';
import { boundsOf, compile, defineAsset, Ts23dError } from '../core/index.ts';
import { type FacadeOptions, facade } from './building.ts';

const base: FacadeOptions = {
  prefix: 'f',
  at: [0, 0, 0],
  footprint: [10, 6],
  floors: 2,
  floorHeight: 3,
  grammar: 'wall:~ | win:1 | wall:~',
  sides: ['front'],
  glass: [0.1, 0.1, 0.1],
};

const build = (o: Partial<FacadeOptions>) =>
  compile(
    defineAsset({
      name: 'f',
      kind: 'building',
      budget: { triangles: [1000, 1000, 1000] },
      build: (ctx) => facade(ctx, { ...base, ...o }),
    }),
  );

describe('facade', () => {
  it('refuses a window taller than its storey, fractional floors and a zero storey height', () => {
    for (const [bad, word] of [
      [{ windowRatio: 1.5 }, 'windowRatio'],
      [{ windowRatio: 0 }, 'windowRatio'],
      [{ windowRatio: Number.NaN }, 'windowRatio'],
      [{ floors: 2.5 }, 'whole number'],
      [{ floors: 0 }, 'whole number'],
      [{ floorHeight: 0 }, 'whole number'],
    ] as const) {
      try {
        build(bad);
        throw new Error(`expected a throw for ${JSON.stringify(bad)}`);
      } catch (e) {
        expect(e).toBeInstanceOf(Ts23dError);
        expect((e as Ts23dError).code).toBe('T3D_RECIPE_INVALID');
        expect((e as Ts23dError).fix).toContain(word);
      }
    }
  });

  it('one inset window per floor, each inside its own storey', () => {
    const parts = build({ windowRatio: 1 }).parts;
    expect(parts.map((p) => p.name)).toEqual(['f_front_0_1', 'f_front_1_1']);
    parts.forEach((p, f) => {
      if (!p.mesh) throw new Error('window has no mesh');
      const b = boundsOf(p.mesh);
      expect(b.min[2] + p.at[2]).toBeCloseTo(f * 3, 6);
      expect(b.max[2] + p.at[2]).toBeCloseTo(f * 3 + 3, 6);
    });
  });
});
