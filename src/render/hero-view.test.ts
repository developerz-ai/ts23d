import { describe, expect, it } from 'bun:test';
import {
  type CompiledAsset,
  compile,
  defineAsset,
  dmath,
  type HeroView,
  Ts23dError,
} from '../core/index.ts';
import { DEFAULT_SHEET, paintTrimSheet } from '../material/index.ts';
import { box } from '../primitives/index.ts';
import { beauty, cameraFor } from './beauty.ts';
import { pathHero } from './path/path-hero.ts';
import { reviewPack } from './review.ts';

const sheet = paintTrimSheet({ ...DEFAULT_SHEET, size: 512 }, []);
const def = (hero?: HeroView) =>
  defineAsset({
    name: 'crate',
    kind: 'prop',
    budget: { triangles: [99, 99, 99] },
    ...(hero ? { hero } : {}),
    build: (ctx) => {
      ctx.part('body', box({ size: [2, 1, 1], color: [0.6, 0.2, 0.2] }));
      // The worn side: a dark plate on the rear face only (−X).
      ctx.part('wear', box({ size: [0.05, 0.8, 0.8], at: [-1, 0, 0], color: [0.05, 0.05, 0.05] }), {
        parent: 'body',
      });
    },
  });
const plain = compile(def());
const small = { width: 96, height: 54, sheet };
const same = (a: Uint8Array, b: Uint8Array): boolean => Buffer.from(a).equals(Buffer.from(b));

describe('per-asset hero view', () => {
  const turned: CompiledAsset = compile(def({ azDeg: 145, elDeg: 30, fovDeg: 24 }));

  it('without the hint the hero is the default orbit', () => {
    expect(same(beauty(plain, small), beauty(plain, { ...small, azDeg: -35, elDeg: 18 }))).toBe(
      true,
    );
  });

  it('the hint moves the default camera: the same bytes as passing its angles', () => {
    const want = beauty(plain, { ...small, azDeg: 145, elDeg: 30, fovDeg: 24 });
    expect(same(beauty(turned, small), want)).toBe(true);
    expect(same(beauty(turned, small), beauty(plain, small))).toBe(false);
  });

  it('an explicit option (a CLI flag) still wins over the hint', () => {
    const flag = { ...small, azDeg: -35, elDeg: 18, fovDeg: 30 };
    expect(same(beauty(turned, flag), beauty(plain, small))).toBe(true);
    // One flag overrides one field: the others stay the asset's.
    expect(cameraFor(turned, { ...small, fovDeg: 30 })).toEqual(
      cameraFor(plain, { ...small, azDeg: 145, elDeg: 30 }),
    );
  });

  it('a fixed viewpoint puts the eye there, looking at the target', () => {
    const view = compile(def({ eye: [6, -4, 3], target: [0, 0, 0.5] }));
    const cam = cameraFor(view, small);
    expect(cam.eye).toEqual([6, -4, 3]);
    const l = dmath.hypot(6, 4, 2.5);
    expect(cam.f[0]).toBeCloseTo(-6 / l, 9);
    expect(cam.f[2]).toBeCloseTo(-2.5 / l, 9);
    // An orbit flag replaces the viewpoint; a size or fov flag keeps it.
    expect(cameraFor(view, { ...small, azDeg: -35 })).toEqual(cameraFor(plain, small));
    expect(cameraFor(view, { ...small, fovDeg: 50 }).eye).toEqual([6, -4, 3]);
    expect(same(beauty(view, small), beauty(plain, small))).toBe(false);
  });

  it('half a viewpoint in the options is refused', () => {
    let code = '';
    try {
      cameraFor(plain, { ...small, eye: [1, 2, 3] });
    } catch (e) {
      if (e instanceof Ts23dError) code = e.code;
    }
    expect(code).toBe('T3D_RENDER_OPTIONS');
  });

  it('the path-traced hero and the review pack honour it too', () => {
    const o = { width: 32, height: 18, spp: 1, sheet };
    expect(
      same(pathHero(turned, o), pathHero(plain, { ...o, azDeg: 145, elDeg: 30, fovDeg: 24 })),
    ).toBe(true);
    const pack = reviewPack(def({ azDeg: 145, elDeg: 30, fovDeg: 24 }), { ...small, sheet });
    const hero = pack.files.get('hero.png');
    expect(hero instanceof Uint8Array && same(hero, beauty(turned, small))).toBe(true);
  });
});
