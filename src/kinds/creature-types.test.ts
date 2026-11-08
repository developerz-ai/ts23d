import { describe, expect, it } from 'bun:test';
import { boundsOf, compile, worldMeshes } from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { assertClosed, assertUprightOnGround } from '../testing/index.ts';
import { defineCreature } from './creature.ts';
import { balanced } from './creature-biology.ts';
import { bonesOf } from './creature-skeleton.ts';
import type { CreatureSpec, Skeleton } from './creature-spec.ts';

const C: CreatureSpec['colours'] = {
  coat: [0.3, 0.28, 0.25],
  nose: [0.02, 0.02, 0.02],
  iris: [0.6, 0.4, 0.1],
  keratin: [0.1, 0.09, 0.08],
};

/** One plausible animal per skeleton type (sizes of a wolf, wyvern, ape, hen, trout, snake). */
const SPECS: Record<Skeleton, CreatureSpec> = {
  quadruped: { skeleton: 'quadruped', mass: 40, length: 1.15, height: 0.8, colours: C },
  winged: { skeleton: 'winged', mass: 60, length: 1.6, height: 0.7, surface: 'scales', colours: C },
  biped: { skeleton: 'biped', mass: 70, length: 0.9, height: 1.4, colours: C },
  bird: {
    skeleton: 'bird',
    mass: 2.5,
    length: 0.45,
    height: 0.38,
    surface: 'feathers',
    colours: C,
  },
  fish: { skeleton: 'fish', mass: 1.2, length: 0.45, height: 0.12, surface: 'scales', colours: C },
  serpent: { skeleton: 'serpent', mass: 3, length: 2, height: 0.07, surface: 'scales', colours: C },
};

describe('every skeleton type compiles closed and standing', () => {
  for (const [k, spec] of Object.entries(SPECS)) {
    it(`${k}: watertight parts on z = 0, centre of mass over its contacts (LOD2)`, () => {
      const a = defineCreature({ name: `test_${k}`, spec });
      const c = compile(a, { lod: 2 });
      expect(c.parts.map((p) => p.name)).toContain('body');
      expect(c.parts.map((p) => p.name)).toContain('head');
      assertClosed(c);
      assertUprightOnGround(a, { lods: [2] });
      expect(balanced(c)).toEqual([]);
    });
  }

  it('the balance check fails a creature whose mass hangs past its feet', () => {
    // A heavy load carried 1.5 m ahead of the fore paws: the centre of mass leaves the feet.
    const a = defineCreature({
      name: 'tipping',
      spec: SPECS.quadruped,
      extra: (ctx) => {
        ctx.part('load', box({ size: [0.4, 0.4, 0.4], color: [0.5, 0.5, 0.5], at: [2, 0, 0.3] }));
      },
    });
    const found = balanced(compile(a, { lod: 2 }));
    expect(found[0]?.message).toContain('outside the support polygon');
  });
});

describe('the kind reproduces a big cat in a few lines', () => {
  // Amur-tiger-like numbers (recipes/amur_tiger README): 1.95 m head-body, 1.0 m shoulder, 243 kg.
  const cat: CreatureSpec = {
    skeleton: 'quadruped',
    mass: 243,
    length: 1.95,
    height: 1.0,
    tail: 0.99,
    head: 0.4,
    face: { muzzle: 0.3, ears: 'round', forward: 0.85 },
    build: { depth: 0.5, width: 0.6 },
    pose: { neck: 22, head: 15 },
    colours: {
      ...C,
      coat: [0.64, 0.2, 0.03],
      belly: [0.83, 0.77, 0.66],
      mark: [0.01, 0.006, 0.004],
    },
    pattern: { kind: 'stripes', scale: 0.11, coverage: 0.4, seed: 1931 },
  };

  it('stands at the sourced size with stripes on the flank and a pale belly', () => {
    const b = bonesOf(cat);
    expect(b.legs.find((l) => l.name === 'fore')?.radii[0]).toBeGreaterThan(0.08);
    const c = compile(defineCreature({ name: 'big_cat', spec: cat }), { lod: 1 });
    const body = worldMeshes(c.parts).get('body');
    expect(body).toBeDefined();
    if (!body) return;
    const bb = boundsOf(body);
    expect(bb.max[2]).toBeGreaterThan(0.95);
    expect(bb.max[2]).toBeLessThan(1.15);
    // Dark stripe vertices on the upper flank, light ones on the belly.
    let dark = 0;
    let flank = 0;
    let pale = 0;
    for (let i = 0; i < body.positions.length; i += 3) {
      const z = body.positions[i + 2] ?? 0;
      const lum = (body.colors[i] ?? 0) + (body.colors[i + 1] ?? 0) + (body.colors[i + 2] ?? 0);
      if (z > 0.7 && z < 0.85 && Math.abs(body.positions[i] ?? 0) < 0.5) {
        flank++;
        if (lum < 0.25) dark++;
      }
      if (z > 0.45 && z < 0.55 && lum > 1.2) pale++;
    }
    expect(dark / flank).toBeGreaterThan(0.08);
    expect(pale).toBeGreaterThan(20);
  });
});
