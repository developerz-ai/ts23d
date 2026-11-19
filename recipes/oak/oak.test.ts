// The oak's far LOD keeps its near crown, its leaves are alpha-cut twig cards, and its bark is on
// the oak bark strip. Failure case first: the kind's own lathe-blob LOD2 pops (a solid dome where
// LOD0 is an open crown on a visible bole).
import { describe, expect, it } from 'bun:test';
import { compile, defineAsset, stripRect, Ts23dError, tree, treeReal } from '@developerz.ai/ts23d';
import { silhouetteReads } from '@developerz.ai/ts23d/testing';
import { OAK, oak } from './oak.ts';

const blobOak = defineAsset({
  name: 'oak_blob',
  kind: 'vegetation',
  real: treeReal({ height: 22, spread: 22, dbh: 1.3 }),
  budget: { triangles: [30000, 8000, 400] },
  build(ctx) {
    tree(ctx, { species: OAK, height: 22, spread: 22, dbh: 1.3, seed: 14 });
  },
});

describe('oak LOD2 silhouette', () => {
  it("the kind's lathe blob fails against this crown", () => {
    let err: unknown;
    try {
      silhouetteReads(blobOak);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(Ts23dError);
    expect((err as Ts23dError).code).toBe('T3D_ART_SILHOUETTE');
  }, 120_000);

  it('clumped twig cards hold IoU ≥ 0.85 from front, side and 3/4', () => {
    const views = silhouetteReads(oak);
    expect(views.length).toBe(3);
    for (const v of views) expect(v.iou).toBeGreaterThanOrEqual(0.85);
  }, 120_000);
});

describe('oak materials', () => {
  for (const lod of [0, 1, 2] as const)
    it(`LOD${lod}: leaves are cutout twig cards, wood is on bark_oak`, () => {
      const c = compile(oak, { lod });
      const leaves = c.parts.find((p) => p.name === 'leaves');
      expect(leaves?.surface).toBe('cutout');
      const bark = stripRect('bark_oak');
      let off = 0;
      for (const p of c.parts) {
        if (!p.mesh || !/trunk|roots|branches/.test(p.name)) continue;
        for (let i = 1; i < p.mesh.uvs.length; i += 2) {
          const v = p.mesh.uvs[i] ?? 0;
          if (
            !(v > bark.v0 && v < bark.v1) &&
            !(v > stripRect('wood_weathered').v0 && v < stripRect('wood_weathered').v1)
          )
            off++;
        }
      }
      expect(off).toBe(0);
    });
});
