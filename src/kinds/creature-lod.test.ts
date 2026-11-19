// Sculpt cell multipliers (`CreatureOptions.cells`): the author sets body and head density
// directly instead of through limb thickness; nonsense is refused first.

import { describe, expect, it } from 'bun:test';
import { compile, Ts23dError } from '../core/index.ts';
import { defineCreature } from './creature.ts';
import { creatureCells } from './creature-lod.ts';
import { bonesOf } from './creature-skeleton.ts';
import type { CreatureSpec } from './creature-spec.ts';

const FOX: CreatureSpec = {
  skeleton: 'quadruped',
  family: 'canid',
  mass: 6,
  length: 0.68,
  height: 0.425,
  cards: false,
  colours: {
    coat: [0.5, 0.2, 0.1],
    nose: [0.02, 0.02, 0.02],
    iris: [0.6, 0.4, 0.1],
    keratin: [0.1, 0.09, 0.08],
  },
};

describe('creature cells', () => {
  const b = bonesOf(FOX);

  it('refuses a multiplier that is not a sane positive number, naming the knob', () => {
    for (const bad of [0, -1, Number.NaN, 9])
      for (const cells of [{ body: bad }, { head: bad }, { body: [1, bad, 1] as const }]) {
        let msg = 'no error';
        try {
          creatureCells(b, 0, false, cells);
        } catch (e) {
          if (!(e instanceof Ts23dError)) throw e;
          msg = `${e.code} ${e.message} ${e.fix}`;
        }
        expect(msg).toContain('T3D_RECIPE_INVALID');
        expect(msg).toContain('cells.');
      }
  });

  it('multiplies the body and head cells, per LOD when given a triple; default is unchanged', () => {
    const base = creatureCells(b, 0, false);
    expect(creatureCells(b, 0, false, {})).toEqual(base);
    const c = creatureCells(b, 0, false, { body: 1.3, head: 1.2 });
    expect(c.res).toBeCloseTo(base.res * 1.3, 9);
    expect(c.res0).toBeCloseTo(base.res0 * 1.3, 9);
    expect(c.hres).toBeCloseTo(base.hres * 1.2, 9);
    const far = creatureCells(b, 2, false, { body: [1.3, 1, 0.8] });
    expect(far.res).toBeCloseTo(creatureCells(b, 2, false).res * 0.8, 9);
  });

  it('a coarser body cell meshes fewer body triangles (≈ 1 ÷ k²) and leaves the head alone', () => {
    const tris = (cells: { body?: number }): Map<string, number> => {
      const c = compile(defineCreature({ name: 'cells', spec: FOX, options: { cells } }), {
        lod: 1,
      });
      return new Map(c.parts.map((p) => [p.name, (p.mesh?.indices.length ?? 0) / 3]));
    };
    const a = tris({});
    const k = tris({ body: 1.5 });
    const ratio = (k.get('body') ?? 0) / (a.get('body') ?? 1);
    expect(ratio).toBeLessThan(0.6);
    expect(ratio).toBeGreaterThan(0.3);
    expect(k.get('head')).toBe(a.get('head') ?? -1);
  }, 120_000);
});
