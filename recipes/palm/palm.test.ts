// The palm's stem carries its leaf-scar rings without losing its measured width, and its far LOD
// draws every frond (one folded cutout card each) instead of the kind's few solid blades. Failure cases
// first: the kind's own stem has a ring only every ~1.7 m.
import { describe, expect, it } from 'bun:test';
import {
  boundsOf,
  compile,
  defineAsset,
  dmath,
  tree,
  treeReal,
  type Vec3,
} from '@developerz.ai/ts23d';
import { foldNormals } from './fronds.ts';
import { hands } from './nuts.ts';
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
  it('one folded cutout card (8 triangles) per frond', () => {
    const leaves = compile(palm, { lod: 2 }).parts.find((p) => p.name === 'leaves');
    expect(leaves?.surface).toBe('cutout');
    const fronds = PALM.levels[1]?.branches ?? 0;
    expect((leaves?.mesh?.indices.length ?? 0) / 3).toBe(fronds * 8);
  });
  it('each card shades as a V: its left and right leaflet edges face apart', () => {
    const m = compile(palm, { lod: 2 }).parts.find((p) => p.name === 'leaves')?.mesh;
    const N = m?.normals ?? new Float32Array();
    const n = (i: number): Vec3 => [N[i * 3] ?? 0, N[i * 3 + 1] ?? 0, N[i * 3 + 2] ?? 0];
    const fronds = PALM.levels[1]?.branches ?? 0;
    // Eight vertices a card: two stations of (left, rachis, right), then root and tip.
    for (let f = 0; f < fronds; f++) {
      const [l, r] = [n(f * 8), n(f * 8 + 2)];
      expect(l[0] * r[0] + l[1] * r[1] + l[2] * r[2]).toBeLessThan(0.99);
    }
  });
});

describe('palm coconut hands', () => {
  // Failure first: the ring of nuts sat 0.92 radii from the stalk tip, just past the smallest
  // nut's 0.92 radius, so that nut floated a hair off its stalk.
  const [r, nutR] = [0.15, 0.17];
  for (const lod of [0, 1, 2] as const)
    it(`LOD${lod}: every nut touches its stalk tip and the hands hang clear of the stem`, () => {
      const hs = hands([0, 0, 0], r, 4, nutR, lod);
      expect(hs.length).toBe(4);
      for (const h of hs) {
        expect(h.nuts.length).toBeGreaterThanOrEqual(3);
        for (const n of h.nuts) {
          const d = dmath.hypot(n.at[0] - h.tip[0], n.at[1] - h.tip[1], n.at[2] - h.tip[2]);
          expect(d).toBeLessThanOrEqual(n.r);
          // The whole nut lies outside the stem (and its frond boots, one nut radius round it).
          expect(dmath.hypot(n.at[0], n.at[1]) - n.r).toBeGreaterThan(r + 0.1);
        }
      }
    });
});

describe('palm far frond fold', () => {
  it('the two halves of a folded card shade as two planes, the rachis between them', () => {
    // A V: left edge, raised rachis, right edge, one triangle each side, laid normals all +Z.
    const m = foldNormals({
      positions: new Float32Array([-1, 0, 0, 0, 0, 0.5, 1, 0, 0, -1, 1, 0, 0, 1, 0.5, 1, 1, 0]),
      normals: new Float32Array(Array.from({ length: 6 }, () => [0, 0, 1]).flat()),
      uvs: new Float32Array(12),
      colors: new Float32Array(18),
      indices: new Uint32Array([0, 1, 4, 0, 4, 3, 1, 2, 5, 1, 5, 4]),
    });
    const n = (i: number): Vec3 => [
      m.normals[i * 3] ?? 0,
      m.normals[i * 3 + 1] ?? 0,
      m.normals[i * 3 + 2] ?? 0,
    ];
    // Left edge leans −X, right edge +X (the slope of each half), the rachis straight up.
    expect(n(0)[0]).toBeLessThan(-0.3);
    expect(n(2)[0]).toBeGreaterThan(0.3);
    expect(Math.abs(n(1)[0])).toBeLessThan(1e-6);
    for (const i of [0, 1, 2, 3, 4, 5]) expect(n(i)[2]).toBeGreaterThan(0);
  });
});
