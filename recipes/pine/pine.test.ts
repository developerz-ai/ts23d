// The pine's far LOD keeps its near silhouette, and its trunk carries no stray strip. Failure
// cases first: the kind's own lathe-blob LOD2 pops (IoU ≈ 0.4), and a sweep's seam column sits on
// the next strip's V (the grey streak the shared grove finish left down the trunk).
import { describe, expect, it } from 'bun:test';
import {
  compile,
  defineAsset,
  stripAtV,
  stripRect,
  Ts23dError,
  tree,
  treeReal,
} from '@developerz.ai/ts23d';
import { silhouetteReads } from '@developerz.ai/ts23d/testing';
import { inWoodBand } from './bark.ts';
import { pine } from './pine.ts';

const blobPine = defineAsset({
  name: 'pine_blob',
  kind: 'vegetation',
  real: treeReal({ height: 25, spread: 9, dbh: 0.6 }),
  budget: { triangles: [26000, 7000, 400] },
  build(ctx) {
    tree(ctx, { species: 'pine', height: 25, spread: 9, dbh: 0.6 });
  },
});

describe('pine LOD2 silhouette', () => {
  it("the kind's lathe blob fails: a solid crown where LOD0 is open", () => {
    let err: unknown;
    try {
      silhouetteReads(blobPine);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(Ts23dError);
    expect((err as Ts23dError).code).toBe('T3D_ART_SILHOUETTE');
  }, 120_000);

  it('needle pads fitted to LOD0 hold IoU ≥ 0.85 from front, side and 3/4', () => {
    const views = silhouetteReads(pine);
    expect(views.length).toBe(3);
    for (const v of views) expect(v.iou).toBeGreaterThanOrEqual(0.85);
  }, 120_000);
});

describe('pine bark', () => {
  it("a sweep's seam column (V = v1) is not on the wood strip by stripAtV", () => {
    const wood = stripRect('wood');
    expect(stripAtV(wood.v1)).not.toBe('wood');
    expect(inWoodBand(wood.v1)).toBe(true);
  });

  for (const lod of [0, 1, 2] as const)
    it(`LOD${lod}: every trunk, root and branch vertex is on bark_pine`, () => {
      const bark = stripRect('bark_pine');
      let wood = 0;
      let off = 0;
      for (const p of compile(pine, { lod }).parts) {
        if (!p.mesh || !/trunk|roots|branches/.test(p.name)) continue;
        for (let i = 1; i < p.mesh.uvs.length; i += 2) {
          const v = p.mesh.uvs[i] ?? 0;
          wood++;
          if (!(v > bark.v0 && v < bark.v1)) off++;
        }
      }
      expect(wood).toBeGreaterThan(0);
      expect(off).toBe(0);
    });
});
