import { describe, expect, it } from 'bun:test';
import { compile, defineAsset } from './asset.ts';
import { Ts23dError } from './errors.ts';
import type { HeroView } from './hero-view.ts';

const withHero = (hero: HeroView) =>
  defineAsset({
    name: 'a',
    kind: 'prop',
    budget: { triangles: [9, 9, 9] },
    hero,
    build: (ctx) => ctx.group('root'),
  });
const codeOf = (f: () => unknown): string | undefined => {
  try {
    f();
  } catch (e) {
    if (e instanceof Ts23dError) return `${e.code}|${e.fix ? 'fix' : ''}`;
  }
  return undefined;
};

describe('hero view hint', () => {
  it('rejects angles outside the beauty render ranges, with a fix', () => {
    for (const bad of [
      { elDeg: 95 },
      { elDeg: -11 },
      { fovDeg: 2 },
      { azDeg: Number.NaN },
      { azDeg: '145' as unknown as number },
    ])
      expect(codeOf(() => withHero(bad))).toBe('T3D_RECIPE_INVALID|fix');
  });

  it('rejects a key it does not know (azimuth for azDeg)', () => {
    expect(codeOf(() => withHero({ azimuth: 145 } as unknown as HeroView))).toBe(
      'T3D_RECIPE_INVALID|fix',
    );
  });

  it('rejects half a viewpoint, a zero-length or vertical one, and one mixed with an orbit', () => {
    for (const bad of [
      { eye: [1, 2, 3] },
      { target: [0, 0, 0] },
      { eye: [1, 2, 3], target: [1, 2, 3] },
      { eye: [0, 0, 9], target: [0, 0, 0] },
      { eye: [1, 2, Number.NaN], target: [0, 0, 0] },
      { eye: [5, 0, 2], target: [0, 0, 0], azDeg: 20 },
    ] as HeroView[])
      expect(codeOf(() => withHero(bad))).toBe('T3D_RECIPE_INVALID|fix');
  });

  it('carries a valid hint onto every compiled LOD and nothing when it is absent', () => {
    const hero = { azDeg: 145, elDeg: 30, fovDeg: 24 };
    expect(compile(withHero(hero), { lod: 2 }).hero).toEqual(hero);
    const view = { eye: [5, -3, 2], target: [0, 0, 1] } as const;
    expect(compile(withHero(view)).hero).toEqual(view);
    const plain = defineAsset({
      name: 'a',
      kind: 'prop',
      budget: { triangles: [9, 9, 9] },
      build: (ctx) => ctx.group('root'),
    });
    expect('hero' in compile(plain)).toBe(false);
  });
});
