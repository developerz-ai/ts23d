// Fur cards' shadows (D475): sparse guard-hair cards over a painted coat each cast a solid,
// card-sized sun shadow (shadow rays alpha-tested at the camera's coverage-preserving mip, where
// thin strands thicken into a solid card, and fully opaque fibres), which the noise-aware denoiser
// keeps: dark specks all over the tiger's and bear's coats. A shadow ray now reads the strands as
// drawn (finest mip) and passes the fibre's forward scatter; opaque surfaces still block.
// Coat-scale before/after: the tiger's flank went from 99 isolated dark pixels to 61, against 59
// with fur casting no shadow at all (the rest are the guard-hair cards themselves; 43 once their
// strand shading stopped reading darker than the coat, D476).

import { describe, expect, it } from 'bun:test';
import { compile, defineAsset, merge, translate } from '../../core/index.ts';
import type { PaintedSheet } from '../../material/index.ts';
import { box } from '../../primitives/index.ts';
import { cameraFor } from '../beauty.ts';
import { sheetTextures } from '../texture.ts';
import { lambertLobes, newLobes } from './bsdf.ts';
import { directLight } from './nee.ts';
import { makeSky } from './sky.ts';
import { newSurf } from './surf.ts';
import { buildWorld } from './world.ts';

const S = 1024;
/** Orange strands: every other texel column opaque (50 % coverage as drawn), flat normal. */
const strands: PaintedSheet = (() => {
  const albedo = new Uint8Array(S * S * 4);
  const normal = new Uint8Array(S * S * 4);
  const orm = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) {
    albedo.set([220, 120, 40, i % 2 === 0 ? 255 : 0], i * 4);
    normal.set([128, 128, 255, 255], i * 4);
    orm.set([255, 204, 0, 255], i * 4);
  }
  return { size: S, albedo, normal, orm };
})();

const SPOTS = 5;
/** A creature-kind coat patch: a 5 cm opaque slab, SPOTS² guard-hair cards lying 4 mm above it. */
const patch = compile(
  defineAsset({
    name: 'coat_patch',
    kind: 'creature',
    budget: {
      triangles: [12 + 12 * SPOTS * SPOTS, 12 + 12 * SPOTS * SPOTS, 12 + 12 * SPOTS * SPOTS],
    },
    build: (ctx) => {
      ctx.part('body', box({ size: [1, 1, 0.05], color: [1, 1, 1] }));
      const cards = [];
      for (let i = 0; i < SPOTS; i++)
        for (let j = 0; j < SPOTS; j++)
          cards.push(
            translate(box({ size: [0.06, 0.03, 0.002], color: [1, 1, 1] }), [
              -0.4 + i * 0.2,
              -0.4 + j * 0.2,
              0.055,
            ]),
          );
      ctx.part('fur', merge(cards), { surface: 'cutout' });
    },
  }),
);

const cam = cameraFor(patch, {});
const sky = makeSky({ sun: [0, 0, 1], sunColor: [1, 1, 1] });
const world = buildWorld(patch, cam, sheetTextures(strands), { sky, floor: false });

/** Direct sun (straight down) on the slab's white top at each (x, y), summed per channel. */
function sunOnSlab(points: readonly (readonly [number, number])[]): Float64Array {
  const s = newSurf();
  s.ng.set([0, 0, 1]);
  s.n.set([0, 0, 1]);
  s.albedo.fill(1);
  const l = newLobes();
  lambertLobes(s, l);
  const acc = new Float64Array(3);
  for (const [x, y] of points) {
    s.p.set([x, y, 0.05]);
    directLight(world, s, l, false, [0, 0, 1], [1, 1, 1], 0, 0, 0, acc);
  }
  return acc;
}

/** 16 points across the card at (−0.4, −0.4), and the same row shifted into the open. */
const under = Array.from({ length: 16 }, (_, i) => [-0.428 + i * 0.0037, -0.4] as const);
const open = under.map(([x, y]) => [x + 0.1, y] as const);

describe('fur card shadows', () => {
  it('a fur card shades the coat under it partly, tinted by its strands, not solidly', () => {
    const lit = sunOnSlab(open);
    const shade = sunOnSlab(under);
    expect(lit[0] ?? 0).toBeGreaterThan(0);
    const r = (shade[0] ?? 0) / (lit[0] ?? 1);
    const b = (shade[2] ?? 0) / (lit[2] ?? 1);
    // Opaque fibres at a coverage mip: 0 (a solid card). Strands as drawn, passing light: ~0.8.
    expect(r).toBeGreaterThan(0.6);
    expect(r).toBeLessThan(1);
    expect(r).toBeGreaterThan(b);
  });

  it('casts the same shadow however far the camera is (strands as drawn, not its mip)', () => {
    const far = cameraFor(patch, { width: 24, height: 16 });
    const small = buildWorld(patch, far, sheetTextures(strands), { sky, floor: false });
    expect(Math.max(...small.mip)).toBeGreaterThan(Math.max(...world.mip));
    const t0 = new Float64Array(3);
    const t1 = new Float64Array(3);
    for (const [x, y] of under) {
      t0.fill(1);
      t1.fill(1);
      expect(small.pass([x, y, 0.052], [0, 0, 1], t0)).toBe(
        world.pass([x, y, 0.052], [0, 0, 1], t1),
      );
      expect(Array.from(t0)).toEqual(Array.from(t1));
    }
  });

  it('passes light through a strand, blocks it at an opaque surface', () => {
    const w = world;
    const t = new Float64Array(3);
    // Up through a card (between the slab's top at 5 cm and the card at 5.5 cm), across its
    // width: every ray gets out, the ones through a strand tinted orange.
    let strand = 0;
    for (let i = 0; i < 16; i++) {
      t.fill(1);
      expect(w.pass([-0.428 + i * 0.0037, -0.4, 0.052], [0, 0, 1], t)).toBe(true);
      if ((t[0] ?? 0) < 1) {
        strand++;
        expect(t[0] ?? 0).toBeGreaterThan(t[2] ?? 0);
        expect(t[2] ?? 0).toBeGreaterThan(0);
      }
    }
    expect(strand).toBeGreaterThan(0);
    // Up from under the slab: blocked whatever lies beyond.
    t.fill(1);
    expect(w.pass([0.1, 0.1, -0.01], [0, 0, 1], t)).toBe(false);
  });
});
