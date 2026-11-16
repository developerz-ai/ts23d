// recipes/sets.ts: the sets look like one game: every declared set passes coherence, and an off-palette recipe
// dropped into one is flagged (failure first). Bestiary compiles four creatures: slow-ish.

import { describe, expect, it } from 'bun:test';
import { type Asset, type CompiledAsset, compile, defineAsset, hex } from '@developerz.ai/ts23d';
import { rts_worker } from '../rts_worker/rts_worker.ts';
import { bestiary, checkSet, rts } from '../sets.ts';

const SLOW = 120_000;

/** rts_worker repainted hot pink: same mesh, an off-palette colour everywhere. */
const pink: Asset = defineAsset({
  name: 'pink_worker',
  kind: 'prop',
  budget: { triangles: [99999, 99999, 99999] },
  build(ctx) {
    const c: CompiledAsset = compile(rts_worker, { lod: ctx.lod });
    const p = hex('#ff3fb4');
    for (const part of c.parts)
      if (part.mesh)
        ctx.part(`w_${part.name}`, {
          ...part.mesh,
          colors: part.mesh.colors.map((_, i) => p[i % 3] ?? 0),
        });
  },
});

describe('asset sets', () => {
  it('flags an off-palette recipe dropped into the rts set', async () => {
    const f = await checkSet(rts, [pink]);
    expect(f.length).toBeGreaterThan(0);
    expect(f.every((x) => x.code === 'T3D_STYLE_OUTLIER' && x.part === 'pink_worker')).toBe(true);
  });

  it('the rts set is coherent', async () => {
    expect(await checkSet(rts)).toEqual([]);
  });

  it(
    'the bestiary (wolf, fox, brown bear, tiger) is coherent',
    async () => {
      expect(await checkSet(bestiary)).toEqual([]);
    },
    SLOW,
  );
});
