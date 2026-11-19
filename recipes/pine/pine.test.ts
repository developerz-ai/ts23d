// The pine's far LOD keeps its near silhouette, its needles are cutout cards, and its trunk carries
// no stray strip. Failure cases first: the kind's own lathe-blob LOD2 pops (IoU ≈ 0.4), and a
// sweep's seam column sits on the next strip's V (the grey streak the shared grove finish left).
import { describe, expect, it } from 'bun:test';
import {
  cellRect,
  compile,
  defineAsset,
  stripAtV,
  stripRect,
  Ts23dError,
  tree,
  treeReal,
} from '@developerz.ai/ts23d';
import { silhouetteReads } from '@developerz.ai/ts23d/testing';
import { inWoodBand } from '../_lib/trees/bark.ts';
import { leaderClump, pine } from './pine.ts';

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

  it('clumped needle cards hold IoU ≥ 0.85 from front, side and 3/4', () => {
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
    it(`LOD${lod}: needles are cutout cards on foliage_needles`, () => {
      const leaves = compile(pine, { lod }).parts.find((p) => p.name === 'leaves');
      expect(leaves?.surface).toBe('cutout');
      const cell = cellRect('foliage_needles');
      const v = leaves?.mesh?.uvs[1] ?? 0;
      expect(v > cell.v0 && v < cell.v1).toBe(true);
    });

  for (const lod of [0, 1, 2] as const)
    it(`LOD${lod}: every trunk, root and branch vertex is on bark_pine (dead wood weathered)`, () => {
      const bark = stripRect('bark_pine');
      const dead = stripRect('wood_weathered');
      let wood = 0;
      let off = 0;
      for (const p of compile(pine, { lod }).parts) {
        if (!p.mesh || !/trunk|roots|branches/.test(p.name)) continue;
        for (let i = 1; i < p.mesh.uvs.length; i += 2) {
          const v = p.mesh.uvs[i] ?? 0;
          wood++;
          if (!(v > bark.v0 && v < bark.v1) && !(v > dead.v0 && v < dead.v1)) off++;
        }
      }
      expect(wood).toBeGreaterThan(0);
      expect(off).toBe(0);
    });
});

describe('pine bark grade', () => {
  /** Mean bark-band brightness of a part's vertices at or above `zMin` m (world). */
  const bright = (lod: 0 | 1, name: string, zMin: number): number => {
    const c = compile(pine, { lod });
    const part = c.parts.find((p) => p.name === name);
    const parent = c.parts.find((p) => p.name === part?.parent);
    const lift = (parent?.at[2] ?? 0) + (part?.at[2] ?? 0);
    const m = part?.mesh;
    const bark = stripRect('bark_pine');
    let [sum, n] = [0, 0];
    for (let i = 0; m && i < m.positions.length / 3; i++) {
      const v = m.uvs[i * 2 + 1] ?? 0;
      if (v < bark.v0 || v > bark.v1 || (m.positions[i * 3 + 2] ?? 0) + lift < zMin) continue;
      sum += (m.colors[i * 3] ?? 0) + (m.colors[i * 3 + 1] ?? 0) + (m.colors[i * 3 + 2] ?? 0);
      n++;
    }
    expect(n).toBeGreaterThan(10);
    return sum / n / 3;
  };
  for (const lod of [0, 1] as const)
    it(`LOD${lod}: crown branches (all above the 14 m grade) are not darkened like the low bole`, () => {
      // Crown-local branch heights read as the foot of the tree would halve their brightness.
      expect(bright(lod, 'branches', 0)).toBeGreaterThan(0.8 * bright(lod, 'trunk', 16));
    });
});

describe('leaderClump', () => {
  it('scores every clump against the trunk tip, not against the previous best', () => {
    // A: 3 m off the tip, 2 m up (score 2). B: 1 m off the tip, 4 m from A, 1 m up (0.5).
    // Measured from A once it wins, B would score 3.5 and lose; from the tip it wins.
    const a: [number, number, number] = [3, 0, 2];
    const b: [number, number, number] = [-1, 0, 1];
    expect(leaderClump([a, b], [0, 0, 0])).toEqual(b);
  });
  it('keeps the tip when there are no clumps', () => {
    expect(leaderClump([], [1, 2, 3])).toEqual([1, 2, 3]);
  });
});
