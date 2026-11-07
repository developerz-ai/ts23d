import { describe, expect, it } from 'bun:test';
import {
  boundsOf,
  type CompiledAsset,
  compile,
  createRng,
  defineAsset,
  Ts23dError,
  worldMeshes,
} from '../core/index.ts';
import { HEAD_RES, type HeadOptions, head, headEdits, headParams } from './head.ts';
import { HEADS } from './head-presets.ts';

const fails = (f: () => unknown): Ts23dError => {
  try {
    f();
  } catch (e) {
    if (e instanceof Ts23dError) return e;
    throw e;
  }
  throw new Error('expected a Ts23dError');
};

const build = (o: HeadOptions, lod: 0 | 1 | 2 = 2): CompiledAsset =>
  compile(
    defineAsset({
      name: 'bust',
      kind: 'character',
      budget: { triangles: [1e6, 1e6, 1e6] },
      build: (ctx) => {
        head(ctx, o);
      },
    }),
    { lod },
  );

const span = (a: CompiledAsset, part: string, k: 0 | 1 | 2): number => {
  const m = worldMeshes(a.parts).get(part);
  if (!m) throw new Error(`no part ${part}`);
  const b = boundsOf(m);
  return (b.max[k] ?? 0) - (b.min[k] ?? 0);
};

describe('head', () => {
  it('throws T3D_RECIPE_INVALID with a fix on unusable params', () => {
    const race = fails(() => headParams({ race: 'troll' as 'orc' }));
    expect(race.code).toBe('T3D_RECIPE_INVALID');
    expect(race.fix).toContain('orc');
    expect(fails(() => headParams({ params: { height: 0 } })).fix).toContain('metres');
    expect(fails(() => headParams({ params: { eyes: { spacing: 0.01 } } })).fix).toContain(
      'eyes.spacing',
    );
    expect(fails(() => headParams({ params: { nose: { tip: -0.01 } } })).fix).toContain('nose.tip');
    expect(fails(() => headParams({ params: { mouth: { grin: 2 } } })).fix).toContain('grin');
    expect(fails(() => headParams({ params: { eyes: { lid: -40 } } })).fix).toContain('lid');
    expect(fails(() => headParams({ params: { jaw: { width: Number.NaN } } })).code).toBe(
      'T3D_RECIPE_INVALID',
    );
    expect(fails(() => headParams({ params: { bust: { mass: -0.5 } } })).fix).toContain(
      'bust.mass',
    );
    expect(fails(() => headParams({ params: { wrinkles: -1 } })).fix).toContain('wrinkles');
  });

  it('merges overrides one level deep and keeps the preset untouched', () => {
    const p = headParams({ race: 'orc', params: { jaw: { underbite: 0.2 }, tusks: null } });
    expect(p.jaw.underbite).toBe(0.2);
    expect(p.jaw.width).toBe(HEADS.orc.jaw.width);
    expect(p.tusks).toBeNull();
    expect(HEADS.orc.jaw.underbite).not.toBe(0.2);
  });

  it('emits the engine contract: bust on the ground, jaw pivoted at the hinge, mirrored eyes', () => {
    const a = build({ race: 'human', prefix: 'hero' });
    expect(a.parts.map((p) => p.name)).toEqual([
      'hero_bust',
      'hero_head',
      'hero_jaw',
      'hero_eye_l',
      'hero_eye_r',
    ]);
    const bust = worldMeshes(a.parts).get('hero_bust');
    expect(bust && boundsOf(bust).min[2]).toBeCloseTo(0, 2);
    const [l, r] = ['hero_eye_l', 'hero_eye_r'].map((n) => a.parts.find((p) => p.name === n)?.at);
    expect(l?.[1]).toBeGreaterThan(0);
    expect(l?.[0]).toBeCloseTo(r?.[0] ?? 0, 6);
    expect(l?.[1]).toBeCloseTo(-(r?.[1] ?? 0), 6);
    const jaw = a.parts.find((p) => p.name === 'hero_jaw');
    expect(jaw?.at[2]).toBeGreaterThan(0.1);
    expect(jaw?.motion).toBeNull();
    const moving = build({ race: 'human', jawSway: 4 }).parts.find((p) => p.name === 'jaw');
    expect(moving?.motion).toEqual({ kind: 'sway', axis: [0, 1, 0], degrees: 4, hz: 0.5 });
    expect(moving?.clearOf).toEqual(['head']);
  });

  it('is mirror-symmetric across Y (without asymmetric gear), to within one sculpt cell', () => {
    const a = build({ race: 'goblin', params: { warts: 0, hair: 'none' } }, 1);
    const cell = HEAD_RES[1] * HEADS.goblin.height;
    for (const part of ['head', 'jaw']) {
      const m = worldMeshes(a.parts).get(part);
      if (!m) throw new Error(part);
      const b = boundsOf(m);
      expect(Math.abs((b.min[1] ?? 0) + (b.max[1] ?? 0))).toBeLessThan(cell);
      expect(b.max[1]).toBeGreaterThan(cell * 3);
    }
  });

  // LOD0 runs in the recipes gate (QA floating-parts); here the coarse LODs, where a thin plinth
  // would vanish first.
  it('stands every bust on its plinth at the coarse LODs, the head seated on it', () => {
    for (const race of ['orc', 'goblin', 'human'] as const)
      for (const lod of [1, 2] as const) {
        const parts = worldMeshes(build({ race }, lod).parts);
        const bust = parts.get('bust');
        const head = parts.get('head');
        if (!bust || !head) throw new Error(`${race} LOD${lod}: missing part`);
        const b = boundsOf(bust);
        expect([race, lod, Math.abs(b.min[2] ?? 1) < 0.002]).toEqual([race, lod, true]);
        // The neck sinks into the bust: the head starts below the bust's top.
        expect(boundsOf(head).min[2] ?? 1).toBeLessThan(b.max[2] ?? 0);
      }
  }, 30000);

  it('is deterministic: same params + seed → same vertices', () => {
    const a = build({ race: 'orc' });
    const b = build({ race: 'orc' });
    for (const [i, p] of a.parts.entries()) {
      expect(p.mesh?.positions).toEqual(b.parts[i]?.mesh?.positions ?? new Float32Array());
      expect(p.mesh?.colors).toEqual(b.parts[i]?.mesh?.colors ?? new Float32Array());
    }
    const e1 = headEdits(HEADS.orc, createRng(7));
    const e2 = headEdits(HEADS.orc, createRng(7));
    expect(e1.skull).toEqual(e2.skull);
  });

  it('every preset (dwarf, elf too) builds its five parts at the far LOD', () => {
    for (const race of Object.keys(HEADS) as (keyof typeof HEADS)[]) {
      const a = build({ race });
      expect([race, a.parts.filter((p) => (p.mesh?.indices.length ?? 0) > 0).length]).toEqual([
        race,
        5,
      ]);
    }
  });

  it('presets differ in silhouette: orc biggest jaw, goblin widest ears, human in between', () => {
    const orc = build({ race: 'orc' });
    const gob = build({ race: 'goblin' });
    const hum = build({ race: 'human' });
    const tall = (a: CompiledAsset): number => span(a, 'head', 2);
    expect(tall(orc)).toBeGreaterThan(tall(hum));
    expect(tall(hum)).toBeGreaterThan(tall(gob));
    // Ears span relative to head height: goblin leaf ears stick far out.
    const earRatio = (a: CompiledAsset): number => span(a, 'head', 1) / tall(a);
    expect(earRatio(gob)).toBeGreaterThan(earRatio(hum) * 1.5);
    // Jaw width relative to head height: the orc's is the heaviest.
    const jawRatio = (a: CompiledAsset): number => span(a, 'jaw', 1) / tall(a);
    expect(jawRatio(orc)).toBeGreaterThan(jawRatio(hum));
    // Only the orc has tusks: its jaw rises above the mouth line.
    expect(span(orc, 'jaw', 2) / tall(orc)).toBeGreaterThan(span(hum, 'jaw', 2) / tall(hum));
  });
});
