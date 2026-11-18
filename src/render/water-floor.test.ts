// A `medium: 'water'` asset is rendered with no studio floor: no cast shadow in the raster beauty
// or the path-traced hero. The same model on the ground keeps its shadow.

import { describe, expect, it } from 'bun:test';
import { compile, defineAsset } from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { renderBeauty } from './beauty.ts';
import type { PerspectiveCamera } from './camera.ts';
import { floorLight, NO_FLOOR } from './ground.ts';
import { renderPath } from './path/path-hero.ts';

const slab = (medium: 'ground' | 'water') =>
  compile(
    defineAsset({
      name: 'water_floor',
      kind: 'prop',
      medium,
      budget: { triangles: [24, 24, 24] },
      // A foot sets the floor height; the raised slab throws a clear shadow onto it.
      build: (ctx) => {
        ctx.part('foot', box({ size: [0.1, 0.1, 0.1], color: [0.8, 0.8, 0.8] }));
        ctx.part('slab', box({ size: [2, 2, 0.2], at: [0, 0, 1], color: [0.8, 0.8, 0.8] }));
      },
    }),
  );

/** Background pixels the ground render darkens compared with the water render. */
function shadowPixels(ground: Uint8Array, water: Uint8Array, mask?: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < ground.length / 4; i++) {
    if (mask && (mask[i] ?? 0) > 0) continue;
    if ((water[i * 4] ?? 0) - (ground[i * 4] ?? 0) > 8) n++;
  }
  return n;
}

describe('water assets have no studio floor', () => {
  it('the raster beauty casts no shadow', () => {
    const size = { width: 160, height: 90 };
    const ground = renderBeauty(slab('ground'), size);
    const water = renderBeauty(slab('water'), size);
    expect(shadowPixels(ground.rgba, water.rgba)).toBeGreaterThan(50);
  });

  it('the empty floor leaves every downward eye ray fully lit', () => {
    const cam = {
      cx: 0,
      cy: 0,
      focal: 1,
      eye: [0, 0, 5],
      f: [0, 0, -1],
      r: [1, 0, 0],
      u: [0, 1, 0],
    } as unknown as PerspectiveCamera;
    expect(floorLight(NO_FLOOR, cam, 0, 0)).toBe(1);
  });

  it('the path-traced hero casts no shadow', () => {
    const o = { width: 160, height: 90, spp: 8, denoise: false };
    const ground = renderPath(slab('ground'), o);
    const water = renderPath(slab('water'), o);
    expect(shadowPixels(ground.rgba, water.rgba, water.mask)).toBeGreaterThan(50);
    const noFloor = renderPath(slab('ground'), { ...o, floor: false });
    expect(Buffer.compare(water.rgba, noFloor.rgba)).toBe(0);
  });
});
