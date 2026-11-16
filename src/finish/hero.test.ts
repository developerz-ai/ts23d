import { describe, expect, test } from 'bun:test';
import { type Budget, compile, defineAsset, type Vec3 } from '../core/index.ts';
import { readGlbChunks } from '../export/index.ts';
import { withBakeSource } from '../passes/index.ts';
import { box, sdf } from '../primitives/index.ts';
import { heroGlb, heroTier } from './hero.ts';

const R = 0.12;
/** A ball with 1.5 mm ridges: the coarse mesh cannot hold them, the bake must. */
const ridged = (p: Vec3): number =>
  Math.hypot(p[0], p[1], p[2] - 0.2) - R - 0.0015 * Math.sin(p[2] * 180) * Math.cos(p[0] * 90);

function ballAsset(budget: Budget) {
  return defineAsset({
    name: 'ball',
    kind: 'prop',
    budget,
    build(ctx) {
      const mesh = sdf({
        field: (p) => Math.hypot(p[0], p[1], p[2] - 0.2) - R,
        bounds: [
          [-0.15, -0.15, 0.05],
          [0.15, 0.15, 0.35],
        ],
        resolution: 0.02,
        color: [0.7, 0.5, 0.3],
      });
      ctx.part('ball', withBakeSource(mesh, { field: ridged }));
      // An untagged part: atlas + vertex colour only, no rays to miss.
      ctx.part('base', box({ size: [0.3, 0.3, 0.05], at: [0, 0, 0.025], color: [0.3, 0.3, 0.3] }));
      // A fur card: cutout, on the shared sheet's alpha strip — never on the hero atlas.
      const card = box({ size: [0.002, 0.05, 0.08], at: [0, 0.13, 0.25], color: [0.4, 0.3, 0.2] });
      ctx.part('fur', card, { surface: 'cutout' });
    },
  });
}

const BUDGET: Budget = { triangles: [99999, 99999, 99999], heroTextures: { size: 1024 } };

describe('heroTier', () => {
  test('refuses LOD1', () => {
    expect(() => heroTier(compile(ballAsset(BUDGET), { lod: 1 }), { size: 1024 })).toThrow(
      'T3D_BAKE_INVALID',
    );
  });

  test('a cage too tight misses the ridges: T3D_BAKE_FAILED on the tagged part', () => {
    const r = heroTier(compile(ballAsset(BUDGET)), { size: 1024, cell: 0.001, cage: 0.0002 });
    const miss = r.findings.filter((f) => f.part === 'ball');
    expect(miss.length).toBeGreaterThan(0);
    expect(miss[0]?.code).toBe('T3D_BAKE_FAILED');
    expect(r.parts.find((p) => p.name === 'base')?.hitRate).toBeNull();
  });

  test('a size over budget.heroTextures fails', () => {
    const small: Budget = { ...BUDGET, heroTextures: { size: 1024 } };
    const r = heroTier(compile(ballAsset(small)), { size: 2048, cell: 0.002 });
    expect(r.findings.some((f) => f.message.includes('budget.heroTextures'))).toBe(true);
  }, 30000);

  test('bakes the ridges into the normal map; geometry, triangles and parts unchanged', () => {
    const lod0 = compile(ballAsset(BUDGET));
    const r = heroTier(lod0, { size: 1024, cell: 0.001 });
    expect(r.findings).toEqual([]);
    expect(r.parts.find((p) => p.name === 'ball')?.hitRate).toBeGreaterThan(0.99);
    // Ridges: the tangent-space normal leaves straight-up on a good share of the ball's texels.
    let tilted = 0;
    let n = 0;
    for (let i = 0; i < r.maps.size ** 2; i++) {
      const z = (r.maps.normal[i * 4 + 2] ?? 255) / 127.5 - 1;
      if (z < 0.9999) n++;
      if (z < 0.995) tilted++;
    }
    expect(tilted / n).toBeGreaterThan(0.2);
    for (const p of lod0.parts.filter((x) => r.parts.some((q) => q.name === x.name))) {
      const h = r.asset.parts.find((q) => q.name === p.name);
      expect(h?.mesh?.indices.length).toBe(p.mesh?.indices.length);
      expect([...(h?.mesh?.colors ?? [])].every((c) => c === 1)).toBe(true);
    }
  });

  test('GLB: hero material on LOD0 only, deterministic bytes', () => {
    const a = ballAsset(BUDGET);
    const lower = [compile(a, { lod: 1 }), compile(a, { lod: 2 })];
    const bake = () => heroTier(compile(a), { size: 1024, cell: 0.002 });
    const glb = heroGlb(bake(), lower);
    expect(Buffer.from(glb).equals(Buffer.from(heroGlb(bake(), lower)))).toBe(true);
    const { json } = readGlbChunks(glb);
    const mats = (json['materials'] as { name: string }[]).map((m) => m.name);
    expect(mats).toContain('ts23d_hero');
    expect((json['extras'] as { ts23d: { hero: { size: number } } }).ts23d.hero.size).toBe(1024);
  });

  test('heroGlb refuses a failed bake unless forced', () => {
    const r = heroTier(compile(ballAsset(BUDGET)), { size: 1024, cell: 0.001, cage: 0.0002 });
    expect(() => heroGlb(r, [])).toThrow('T3D_BAKE_FAILED');
  });

  test('cutout cards keep the shared sheet: own UVs, alphaMode MASK; only opaque parts go hero', () => {
    const a = ballAsset(BUDGET);
    const lod0 = compile(a);
    const r = heroTier(lod0, { size: 1024, cell: 0.002 });
    const card = (x: typeof lod0) => x.parts.find((p) => p.name === 'fur')?.mesh;
    expect(card(r.asset)).toBe(card(lod0));
    expect(r.parts.map((p) => p.name)).not.toContain('fur');
    const { json } = readGlbChunks(heroGlb(r, [compile(a, { lod: 1 }), compile(a, { lod: 2 })]));
    const mats = json['materials'] as { name: string; alphaMode?: string }[];
    const meshes = json['meshes'] as { primitives: { material: number }[] }[];
    const nodes = json['nodes'] as { mesh?: number; children?: number[] }[];
    const stack = [...((json['scenes'] as { nodes: number[] }[])[0]?.nodes ?? [])];
    const lod0Mats: ({ name: string; alphaMode?: string } | undefined)[] = [];
    while (stack.length) {
      const n = nodes[stack.pop() ?? -1];
      if (n?.mesh !== undefined)
        for (const p of meshes[n.mesh]?.primitives ?? []) lod0Mats.push(mats[p.material]);
      stack.push(...(n?.children ?? []));
    }
    const cut = lod0Mats.filter((m) => m?.alphaMode === 'MASK');
    expect(cut.length).toBeGreaterThan(0);
    expect(cut.every((m) => m?.name !== 'ts23d_hero')).toBe(true);
    expect(lod0Mats.some((m) => m?.name === 'ts23d_hero')).toBe(true);
  });
});
