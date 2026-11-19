// The far LOD keeps the near tree: failure cases first (no cards → no crown, a crown outside the
// LOD0 box is pulled back), then the silhouette every species must hold at the LOD2 switch. The
// lathe blob this replaced measured 0.57–0.64 (oak), 0.65–0.72 (pine), 0.55–0.67 (palm): D305.
import { describe, expect, it } from 'bun:test';
import {
  boundsOf,
  compile,
  defineAsset,
  type Lod,
  type Mesh,
  MeshBuilder,
  merge,
  triangleCount,
  worldMeshes,
} from '../core/index.ts';
import { planar } from '../primitives/index.ts';
import { artMetrics } from '../testing/index.ts';
import { tree } from './vegetation.ts';
import { cluster, samples } from './vegetation-clumps.ts';
import { clumpCards, fillBox, frondCards } from './vegetation-impostor.ts';
import { SPECIES } from './vegetation-presets.ts';

/** A square leaf card of side 1 at `c`, coloured `g` green. */
const leaf = (c: readonly [number, number, number], g: number): Mesh =>
  planar({
    points: [
      [c[0] - 0.5, c[1], c[2] - 0.5],
      [c[0] + 0.5, c[1], c[2] - 0.5],
      [c[0] + 0.5, c[1], c[2] + 0.5],
      [c[0] - 0.5, c[1], c[2] + 0.5],
    ],
    color: [0, g, 0],
    doubleSided: true,
  });

describe('far crown (clumps)', () => {
  it('no cards, no clumps, no crown', () => {
    const none = new MeshBuilder().build();
    expect(cluster(samples(none), 8)).toEqual([]);
    expect(triangleCount(clumpCards(none, 200))).toBe(0);
  });

  it('two groups of cards become two clumps, each with its own mean colour', () => {
    const near = merge([leaf([0, 0, 5], 0.2), leaf([1, 0, 5], 0.2), leaf([20, 0, 9], 0.8)]);
    const clumps = cluster(samples(near), 2);
    expect(clumps.map((c) => Math.round(c.centre[0] * 10) / 10).sort((a, b) => a - b)).toEqual([
      0.5, 20,
    ]);
    const far = clumpCards(near, 24);
    expect(triangleCount(far)).toBe(24);
    const greens = new Set(Array.from(far.colors).filter((_, i) => i % 3 === 1 && far.colors[i]));
    // Each clump shades its own mean 0.85–1.15 foot to top: the dark clump never reaches 0.3.
    expect(Math.min(...greens)).toBeLessThan(0.3);
    expect(Math.max(...greens)).toBeGreaterThan(0.6);
  });

  it('never spends more than its budget, and the same cards give the same crown', () => {
    const near = merge(
      Array.from({ length: 60 }, (_, i) =>
        leaf([(i * 7) % 11, (i * 5) % 7, 4 + ((i * 3) % 9)], 0.5),
      ),
    );
    expect(triangleCount(clumpCards(near, 100))).toBeLessThanOrEqual(100);
    expect(Bun.hash(clumpCards(near, 100).positions)).toBe(
      Bun.hash(clumpCards(near, 100).positions),
    );
  });

  it('fillBox clamps into the LOD0 box and reaches every face of it', () => {
    const box = { min: [-1, -1, 0], max: [1, 1, 2] } as const;
    const b = boundsOf(fillBox(merge([leaf([0, 0, 1], 0.5), leaf([3, 0, 5], 0.5)]), box));
    expect(b.min).toEqual([-1, -1, 0]);
    expect(b.max).toEqual([1, 1, 2]);
  });
});

describe('far crown (fronds)', () => {
  it('a leaflet mesh too short for the fronds asked draws none', () => {
    const stem = {
      level: 1,
      pts: [
        [0, 0, 10],
        [1, 0, 10],
        [2, 0, 9.5],
      ],
      radii: [0.05, 0.04, 0.02],
      length: 2.1,
      parent: 0,
      surface: [0, 0, 10],
      maxLength: 2.1,
    } as const;
    expect(triangleCount(frondCards(new MeshBuilder().build(), [stem], 26, 200))).toBe(0);
  });
});

const asset = (species: keyof typeof SPECIES) =>
  defineAsset({
    name: `${species}_far`,
    kind: 'vegetation',
    budget: { triangles: [25000, 6000, 300] },
    build: (ctx) => {
      tree(ctx, { species, ...SPECIES[species].typical });
    },
  });

describe('tree LOD2 keeps the LOD0 silhouette', () => {
  // A broadleaf, a conifer and a palm: 32 px soft IoU of LOD2 against LOD0 (testing/readability).
  for (const species of ['oak', 'pine', 'palm'] as const)
    it(`${species}: IoU ≥ 0.8 from front, side and 3/4, trunk kept, under 300 triangles`, () => {
      const a = asset(species);
      const views = artMetrics(a).metrics.silhouette;
      expect(views.map((v) => v.view)).toEqual(['front', 'side', '3/4']);
      for (const v of views) expect(v.iou).toBeGreaterThanOrEqual(0.8);
      const far = compile(a, { lod: 2 });
      const tris = far.parts.reduce((s, p) => s + (p.mesh ? triangleCount(p.mesh) : 0), 0);
      expect(tris).toBeLessThan(300);
      expect(tris).toBeGreaterThanOrEqual(100);
      // The bole is there to see: the trunk part runs from the ground into the crown.
      const trunk = worldMeshes(far.parts).get('trunk');
      expect(trunk && boundsOf(trunk).min[2]).toBeCloseTo(0, 4);
    }, 120_000);

  it('the far crown is the near crown: same box, mean leaf colour within 10 %', () => {
    for (const species of ['oak', 'pine', 'palm', 'birch', 'willow'] as const) {
      const crown = (lod: Lod): Mesh[] => {
        const world = worldMeshes(compile(asset(species), { lod }).parts);
        const leaves = world.get('leaves');
        if (!leaves) throw new Error(`${species} LOD${lod} has no leaves`);
        const wood = world.get('branches');
        return wood ? [leaves, wood] : [leaves];
      };
      const [near, far] = [crown(0), crown(2)];
      const mean = (m: Mesh | undefined, k: number): number => {
        let s = 0;
        const c = m?.colors ?? new Float32Array();
        for (let i = k; i < c.length; i += 3) s += c[i] ?? 0;
        return s / (c.length / 3);
      };
      for (const k of [0, 1, 2])
        expect(Math.abs(mean(far[0], k) / mean(near[0], k) - 1)).toBeLessThan(0.1);
      // Clamped into LOD0's crown box and reaching it: the fit (height, spread) is the same.
      const [b0, b2] = [boundsOf(merge(near)), boundsOf(merge(far))];
      for (const k of [0, 1, 2] as const) {
        expect(b2.min[k]).toBeCloseTo(b0.min[k], 1);
        expect(b2.max[k]).toBeCloseTo(b0.max[k], 1);
      }
    }
  }, 120_000);
});
