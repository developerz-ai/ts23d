// The path-traced hero end to end: bad options fail with a code, a white Lambert box in a uniform
// white sky renders radiance 1 (render-level white furnace), two runs are byte-identical, a 64 × 64
// studio scene matches its golden hash, and a cutout card's transparent texels let the floor show.

import { describe, expect, it } from 'bun:test';
import { compile, defineAsset, Ts23dError } from '../../core/index.ts';
import type { PaintedSheet } from '../../material/index.ts';
import { box } from '../../primitives/index.ts';
import { pathHero, renderPath, renderPathThreaded } from './path-hero.ts';
import { makeSky } from './sky.ts';

const flat = (size: number, rgba: readonly number[]): Uint8Array => {
  const out = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) out.set(rgba, i * 4);
  return out;
};
/** White albedo, flat normals, ORM = (1, 0.8, 0): the furnace's sheet. */
const white: PaintedSheet = {
  size: 4,
  albedo: flat(4, [255, 255, 255, 255]),
  normal: flat(4, [128, 128, 255, 255]),
  orm: flat(4, [255, 204, 0, 255]),
};

const boxAsset = (surface: 'opaque' | 'cutout', color: [number, number, number]) =>
  compile(
    defineAsset({
      name: 'furnace',
      kind: 'prop',
      budget: { triangles: [12, 12, 12] },
      finishes: { matte: { metallic: 0, roughness: 0.6, specular: { factor: 0 } } },
      build: (ctx) =>
        ctx.part('body', box({ size: [1, 1, 1], color }), {
          ...(surface === 'opaque' ? { finish: 'matte' } : { surface }),
        }),
    }),
  );

const uniform = makeSky({
  sun: [0, 0, 1],
  sunColor: [0, 0, 0],
  zenith: [1, 1, 1],
  horizon: [1, 1, 1],
  ground: [1, 1, 1],
});

describe('pathHero', () => {
  it('refuses a sample count it cannot honour', () => {
    expect(() => renderPath(boxAsset('opaque', [1, 1, 1]), { spp: 0 })).toThrow(Ts23dError);
    expect(() => renderPath(boxAsset('opaque', [1, 1, 1]), { spp: 1.5 })).toThrow(/spp/);
  });

  it('white furnace: a white Lambert box under a uniform white sky renders radiance 1', () => {
    const r = renderPath(boxAsset('opaque', [1, 1, 1]), {
      width: 24,
      height: 24,
      spp: 16,
      sheet: white,
      sky: uniform,
      floor: false,
      denoise: false,
    });
    let sum = 0;
    let n = 0;
    for (let i = 0; i < r.width * r.height; i++)
      if (r.mask[i] === 255) {
        sum += (r.linear[i * 3] ?? 0) + (r.linear[i * 3 + 1] ?? 0) + (r.linear[i * 3 + 2] ?? 0);
        n += 3;
      }
    expect(n).toBeGreaterThan(100);
    expect(Math.abs(sum / n - 1)).toBeLessThan(0.01);
  });

  const scene = boxAsset('opaque', [0.7, 0.3, 0.2]);
  const o = { width: 64, height: 64, spp: 8, sheet: white };

  it('renders the same bytes twice', () => {
    expect(Buffer.from(pathHero(scene, o)).equals(Buffer.from(pathHero(scene, o)))).toBe(true);
  });

  it('renders the same bytes on worker threads as in-line', async () => {
    const threaded = await renderPathThreaded(scene, { ...o, threads: 3 });
    expect(Buffer.from(threaded.rgba).equals(Buffer.from(renderPath(scene, o).rgba))).toBe(true);
  });

  it('matches the golden hash of a 64 × 64 studio scene', () => {
    const hash = new Bun.CryptoHasher('sha256').update(renderPath(scene, o).rgba).digest('hex');
    // Fixed order per pixel, integer sampler, no clocks: stable across runs and thread counts (the
    // transcendental Math.* calls are the same engine-dependence the raster hero already has).
    expect(hash).toBe('9be545816087afb79e8f687ea70626e6882ad4a57fee7fd38dc86a6211ade3ba');
  });

  it("lets a cutout card's transparent texels show the floor behind", () => {
    const sheet = (a: number): PaintedSheet => ({ ...white, albedo: flat(4, [200, 200, 200, a]) });
    const card = boxAsset('cutout', [1, 1, 1]);
    const covered = (s: PaintedSheet): number =>
      renderPath(card, { width: 24, height: 24, spp: 2, sheet: s }).mask.reduce((a, m) => a + m, 0);
    expect(covered(sheet(255))).toBeGreaterThan(50 * 255);
    expect(covered(sheet(0))).toBe(0);
  });
});
