// The film's variance layer (D473): the denoiser scales its luminance stop by it, so it must be
// the variance of each pixel's mean, not of one sample, and never below the real noise (or noise
// would pass as detail). The samples are Owen-scrambled Sobol, whose mean moves less between
// independent renders (other seed salts) than the i.i.d. estimate says: the film's number is a
// bound, within a small factor. Zero where the asset is absent.

import { describe, expect, it } from 'bun:test';
import { compile, defineAsset } from '../../core/index.ts';
import type { PaintedSheet } from '../../material/index.ts';
import { box } from '../../primitives/index.ts';
import { cameraFor } from '../beauty.ts';
import { studioRig } from '../lighting.ts';
import { sheetTextures } from '../texture.ts';
import { type Film, newFilm, renderTile, spatialVariance, tileCount } from './film.ts';
import { makeSky } from './sky.ts';
import { buildWorld } from './world.ts';

const flat = (size: number, rgba: readonly number[]): Uint8Array => {
  const out = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) out.set(rgba, i * 4);
  return out;
};
const sheet: PaintedSheet = {
  size: 4,
  albedo: flat(4, [200, 200, 200, 255]),
  normal: flat(4, [128, 128, 255, 255]),
  orm: flat(4, [255, 204, 0, 255]),
};

const asset = compile(
  defineAsset({
    name: 'film_box',
    kind: 'prop',
    budget: { triangles: [12, 12, 12] },
    build: (ctx) => ctx.part('body', box({ size: [1, 1, 1], color: [0.8, 0.6, 0.4] })),
  }),
);
const size = { width: 24, height: 24 };
const cam = cameraFor(asset, size);
const rig = studioRig(-35);
const sky = makeSky({
  sun: rig.sun,
  sunColor: rig.sunColor.map((c) => c * Math.PI) as typeof rig.sunColor,
});
const world = buildWorld(asset, cam, sheetTextures(sheet), { sky, floor: true });

function render(spp: number, salt: number): Film {
  const f = newFilm(size.width, size.height);
  for (let t = 0; t < tileCount(f); t++)
    renderTile(world, cam, f, t, spp, { maxDepth: 4, rrDepth: 3 }, salt);
  return f;
}

const lum = (c: Float32Array, i: number): number =>
  0.2126 * (c[i * 3] ?? 0) + 0.7152 * (c[i * 3 + 1] ?? 0) + 0.0722 * (c[i * 3 + 2] ?? 0);

describe('film variance', () => {
  it("bounds the spread of the pixel's mean across independent renders", () => {
    const films = Array.from({ length: 12 }, (_, s) => render(4, s));
    const first = films[0] as Film;
    let measured = 0;
    let observed = 0;
    let n = 0;
    for (let i = 0; i < size.width * size.height; i++) {
      if (films.some((f) => f.mask[i] !== 255)) continue;
      let s = 0;
      let s2 = 0;
      for (const f of films) {
        const l = lum(f.color, i);
        s += l;
        s2 += l * l;
        measured += (f.variance[i] ?? 0) / films.length;
      }
      const m = s / films.length;
      observed += (s2 - films.length * m * m) / (films.length - 1);
      n++;
    }
    expect(n).toBeGreaterThan(50);
    expect(observed).toBeGreaterThan(0);
    // Never under the real noise; stratification makes it an over-estimate, but a bounded one.
    expect(measured / observed).toBeGreaterThan(1);
    expect(measured / observed).toBeLessThan(4);
    // Where the asset is absent there is nothing to measure.
    for (let i = 0; i < size.width * size.height; i++)
      if (first.mask[i] === 0) expect(first.variance[i]).toBe(0);
  });

  it('shrinks with the sample count (variance of the mean, not of one sample)', () => {
    const sum = (f: Film) => f.variance.reduce((a, v) => a + v, 0);
    const ratio = sum(render(4, 0)) / sum(render(16, 0));
    expect(ratio).toBeGreaterThan(2.5);
    expect(ratio).toBeLessThan(6);
  });

  it('measures nothing at 1 sample; the spatial estimate sees the noise, 0 off the asset', () => {
    const one = render(1, 0);
    expect(one.variance.every((v) => v === 0)).toBe(true);
    const est = spatialVariance(one);
    let inside = 0;
    for (let i = 0; i < size.width * size.height; i++) {
      if (one.mask[i] === 0) expect(est[i]).toBe(0);
      else if ((est[i] ?? 0) > 0) inside++;
    }
    expect(inside).toBeGreaterThan(50);
    // A flat film (no spread anywhere) has none.
    const flatFilm = { ...one, color: new Float32Array(one.color.length).fill(0.5) };
    expect(spatialVariance(flatFilm).every((v) => v === 0)).toBe(true);
  });
});
