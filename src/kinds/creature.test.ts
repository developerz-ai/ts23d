import { describe, expect, it } from 'bun:test';
import { Ts23dError, type Vec3 } from '../core/index.ts';
import { creaturePlan } from './creature.ts';
import { biology, effectiveDensity, limbMass } from './creature-biology.ts';
import { allometricLimbR, boneCircumference, eyeRadius, massFromBones } from './creature-bones.ts';
import { creatureCreases } from './creature-creases.ts';
import { pathLength, v3 } from './creature-curve.ts';
import { bonesOf } from './creature-skeleton.ts';
import { type CreatureSpec, checkCreature } from './creature-spec.ts';

const C: CreatureSpec['colours'] = {
  coat: [0.3, 0.28, 0.25],
  nose: [0.02, 0.02, 0.02],
  iris: [0.6, 0.4, 0.1],
  keratin: [0.1, 0.09, 0.08],
};
const wolf: CreatureSpec = {
  skeleton: 'quadruped',
  mass: 40,
  length: 1.15,
  height: 0.8,
  colours: C,
};

const codeOf = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    if (e instanceof Ts23dError) return `${e.code} ${e.message} ${e.fix}`;
    throw e;
  }
  return 'no error';
};

describe('creature spec: refuses the impossible first', () => {
  it('names the field and the fix for a bad spec (T3D_RECIPE_INVALID)', () => {
    const bad: [Partial<CreatureSpec>, string][] = [
      [{ skeleton: 'centaur' as CreatureSpec['skeleton'] }, "unknown skeleton 'centaur'"],
      [{ mass: -3 }, 'mass is -3'],
      [{ length: 0 }, 'length is 0'],
      [{ skeleton: 'fish', stance: 'digitigrade' }, 'no legs'],
      [{ wingspan: 3 }, 'has no wings'],
      [{ face: { muzzle: 2 } }, 'face.muzzle is 2'],
      [{ height: 5 }, 'over 1.6× length'],
      [{ colours: { ...C, iris: undefined as unknown as Vec3 } }, 'colours.iris is missing'],
    ];
    for (const [patch, says] of bad) {
      const msg = codeOf(() => checkCreature({ ...wolf, ...patch }));
      expect(msg).toContain('T3D_RECIPE_INVALID');
      expect(msg).toContain(says);
    }
    expect(checkCreature(wolf)).toBe(wolf);
  });
});

describe('allometry (Campione & Evans 2012)', () => {
  it('a stick-legged elephant is refused, naming how much thicker the legs must be', () => {
    const elephant: CreatureSpec = {
      skeleton: 'quadruped',
      stance: 'unguligrade',
      mass: 5000,
      length: 6,
      height: 3,
      colours: C,
      build: { limbs: 0.25 },
    };
    const msg = codeOf(() => creaturePlan(elephant));
    expect(msg).toContain('T3D_RECIPE_INVALID');
    expect(msg).toContain('allometry');
    expect(msg).toContain('thicken the limbs');
    // The same elephant on columnar (allometric) legs is fine.
    expect(codeOf(() => creaturePlan({ ...elephant, build: {} }))).toBe('no error');
  });

  it('limb radius grows faster than length: an elephant limb is ~6× a wolf limb', () => {
    expect(massFromBones(boneCircumference(40))).toBeCloseTo(40, 6);
    const k = allometricLimbR(5000) / allometricLimbR(40);
    // Isometry would give (5000/40)^(1/3) = 5.0; C&E's exponent 1/2.749 gives 5.8.
    expect(k).toBeGreaterThan(5.5);
    expect(limbMass(bonesOf(wolf)) ?? 0).toBeCloseTo(40, 0);
  });

  it('a creature that claims to fly needs the wing area for it', () => {
    const dragon: CreatureSpec = {
      skeleton: 'winged',
      mass: 400,
      length: 4,
      height: 1.4,
      colours: C,
    };
    expect(codeOf(() => creaturePlan({ ...dragon, wingspan: 4, flies: true }))).toContain(
      'wing loading',
    );
    const b = biology({ ...dragon, wingspan: 16 }, bonesOf({ ...dragon, wingspan: 16 }));
    expect(b.wingLoading ?? Infinity).toBeLessThan(250);
  });
});

describe('skeleton from proportions', () => {
  it('nose → tail root equals the declared head-body length (±2%)', () => {
    for (const s of [
      wolf,
      { ...wolf, mass: 243, length: 1.95, height: 1.0, face: { muzzle: 0.3 } },
    ]) {
      const b = bonesOf(s);
      expect(Math.abs(v3.len(v3.sub(b.nose, b.tailRoot)) / s.length - 1)).toBeLessThan(0.02);
    }
  });

  it('stance sets the lower joint: hock high on a horse, heel on the ground on a bear', () => {
    const hock = (stance: NonNullable<CreatureSpec['stance']>): number =>
      bonesOf({ ...wolf, stance }).legs.find((l) => l.name === 'hind')?.joints[2]?.[2] ?? 0;
    expect(hock('plantigrade')).toBeLessThan(0.1 * wolf.height);
    expect(hock('digitigrade')).toBeGreaterThan(0.2 * wolf.height);
    expect(hock('unguligrade')).toBeGreaterThan(hock('digitigrade'));
  });

  it('a serpent is as long as declared, along its S', () => {
    const s: CreatureSpec = { skeleton: 'serpent', mass: 3, length: 2, height: 0.07, colours: C };
    const b = bonesOf(s);
    const body = pathLength(b.chain.map((n) => n.at));
    expect(body + b.head.length).toBeCloseTo(2, 1);
  });
});

describe('biology numbers', () => {
  it('fur makes the visible volume lighter than flesh; scales do not', () => {
    expect(effectiveDensity({ ...wolf, coat: 0.03 })).toBeLessThan(700);
    expect(effectiveDensity({ ...wolf, surface: 'scales' })).toBe(1050);
    expect(eyeRadius(40)).toBeCloseTo(0.0115, 3);
  });

  it('declares creases for the folds it sculpts (mouth, eyelids, legs, groin)', () => {
    const names = creatureCreases(wolf).map((c) => c.name);
    for (const n of ['mouth_line', 'eyelids_l', 'eyelids_r', 'axilla_l', 'groin', 'hind_low_r'])
      expect(names).toContain(n);
  });
});
