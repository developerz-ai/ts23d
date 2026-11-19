import { describe, expect, it } from 'bun:test';
import { compile, defineAsset } from '../core/index.ts';
import { DEFAULT_SHEET, paintTrimSheet } from '../material/index.ts';
import { box } from '../primitives/index.ts';
import { type BeautyRender, renderBeauty } from './beauty.ts';

const sheet = paintTrimSheet({ ...DEFAULT_SHEET, size: 512 });
const block = compile(
  defineAsset({
    name: 'block',
    kind: 'prop',
    budget: { triangles: [12, 12, 12] },
    build(ctx) {
      ctx.part('b', box({ size: [1, 1, 1], at: [0, 0, 0.5], color: [0.02, 0.02, 0.02] }));
    },
  }),
);
const shot = { width: 64, height: 48, supersample: 3, sheet } as const;
/** The asset-only output of a render; fails the test (and yields nothing) when it is missing. */
const sums = (r: BeautyRender) => {
  expect(r.assetSum).toBeDefined();
  expect(r.hits).toBeDefined();
  return { assetSum: r.assetSum ?? new Float32Array(0), hits: r.hits ?? new Uint8Array(0) };
};

describe('resolve asset-only output', () => {
  it('does not change with the backdrop: studio floor with its shadow vs no floor at all', () => {
    // `medium: 'water'` drops the floor, so every background sample is lit differently.
    const studio = renderBeauty(block, shot);
    const bare = renderBeauty({ ...block, medium: 'water' }, shot);
    expect(Bun.hash(studio.rgba)).not.toBe(Bun.hash(bare.rgba));
    const a = sums(studio);
    const b = sums(bare);
    expect(a.assetSum.some((v) => v > 0)).toBe(true);
    expect(Bun.hash(a.assetSum)).toBe(Bun.hash(b.assetSum));
    expect(Bun.hash(a.hits)).toBe(Bun.hash(b.hits));
  });

  it('counts the samples behind the coverage mask and sums nothing where the asset is not', () => {
    const r = renderBeauty(block, shot);
    const a = sums(r);
    const n = shot.supersample ** 2;
    let partial = 0;
    for (let i = 0; i < r.mask.length; i++) {
      const hits = a.hits[i] ?? -1;
      expect(r.mask[i]).toBe(Math.round((hits / n) * 255));
      // Nothing see-through: every asset sample is fully opaque.
      expect(r.opacity?.[i]).toBe(hits);
      if (hits === 0) expect([...a.assetSum.subarray(i * 3, i * 3 + 3)]).toEqual([0, 0, 0]);
      if (hits > 0 && hits < n) partial++;
    }
    expect(partial).toBeGreaterThan(10);
  });

  it('keeps glass over the asset’s own opaque parts opaque: opacity = coverage there', () => {
    // A glass shell round an opaque core: through the middle the shell shows the core, at its
    // rim (past the core's silhouette) only backdrop.
    const jar = compile(
      defineAsset({
        name: 'jar',
        kind: 'prop',
        budget: { triangles: [24, 24, 24] },
        build(ctx) {
          ctx.part('core', box({ size: [0.4, 0.4, 0.4], at: [0, 0, 0.5], color: [0.6, 0.1, 0.1] }));
          ctx.part('shell', box({ size: [1, 1, 1], at: [0, 0, 0.5], color: [0.9, 0.95, 1] }), {
            surface: 'glass',
          });
        },
      }),
    );
    const r = renderBeauty(jar, shot);
    const { hits } = sums(r);
    const n = shot.supersample ** 2;
    const opacity = r.opacity ?? new Float32Array(0);
    const centre = (shot.height / 2) * shot.width + shot.width / 2;
    expect(hits[centre]).toBe(n);
    expect(opacity[centre]).toBe(n);
    // The rim is see-through to the backdrop: opacity below coverage, so the glass is in play.
    expect([...hits.keys()].some((i) => hits[i] === n && (opacity[i] ?? n) < n)).toBe(true);
  });
});
