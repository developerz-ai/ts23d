// The palm's stem carries its leaf-scar rings without losing its measured width, and its far LOD
// draws every frond (one cutout card each) instead of the kind's few solid blades. Failure cases
// first: the kind's own stem has a ring only every ~1.7 m.
import { describe, expect, it } from 'bun:test';
import { boundsOf, compile, defineAsset, tree, treeReal } from '@developerz.ai/ts23d';
import { PALM, palm } from './palm.ts';
import { ringedStem } from './stem.ts';

const kindPalm = defineAsset({
  name: 'palm_kind',
  kind: 'vegetation',
  real: treeReal({ height: 20, spread: 9, dbh: 0.35 }),
  budget: { triangles: [30000, 8000, 400] },
  build(ctx) {
    tree(ctx, { species: PALM, height: 20, spread: 9, dbh: 0.35 });
  },
});

const trunkOf = (lod: 0 | 1 | 2, a = palm) =>
  compile(a, { lod }).parts.find((p) => p.name === 'trunk')?.mesh;

describe('palm stem', () => {
  it("the kind's stem is too coarse for leaf scars (a ring every > 1 m)", () => {
    const m = trunkOf(0, kindPalm);
    expect(m).toBeDefined();
    if (!m) return;
    expect(boundsOf(m).max[2] / (m.positions.length / 3 / 9)).toBeGreaterThan(1);
  });

  it('the ringed stem has a scar every ≤ 0.25 m and keeps the Y extent (DBH)', () => {
    const kind = trunkOf(0, kindPalm);
    if (!kind) throw new Error('no kind trunk');
    const m = ringedStem(kind, { spacing: 0.22, groove: 0.07, segments: 8 });
    const rings = (m.positions.length / 3 - 2 * 9) / 9;
    expect(boundsOf(kind).max[2] / (rings / 2)).toBeLessThanOrEqual(0.25);
    const span = (x: typeof m) => boundsOf(x).max[1] - boundsOf(x).min[1];
    expect(span(m)).toBeCloseTo(span(kind), 3);
  });
});

describe('palm far LOD', () => {
  it('one cutout card (6 triangles) per frond', () => {
    const leaves = compile(palm, { lod: 2 }).parts.find((p) => p.name === 'leaves');
    expect(leaves?.surface).toBe('cutout');
    const fronds = PALM.levels[1]?.branches ?? 0;
    expect((leaves?.mesh?.indices.length ?? 0) / 3).toBe(fronds * 6);
  });
});
