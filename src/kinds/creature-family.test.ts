// Family biology held as numbers (docs/research/animal-anatomy.md): eye openings face the orbit
// angle (Heesy 2004), feet carry the family's digits (dewclaw on a dog's fore paw, five toes on a
// bear, a cloven hoof on cattle and deer, one on a horse), tails default to sourced ratios, and the
// fore-share QA check fails a rear-heavy quadruped.

import { describe, expect, it } from 'bun:test';
import { compile, Ts23dError } from '../core/index.ts';
import { runQa } from '../qa/index.ts';
import { defineCreature } from './creature.ts';
import { foreShareCheck } from './creature-biology.ts';
import type { Limb } from './creature-bones.ts';
import { pathLength } from './creature-curve.ts';
import { clawMesh, dewclaws, footEdits } from './creature-feet.ts';
import { headLayout } from './creature-head.ts';
import { bonesOf } from './creature-skeleton.ts';
import { type CreatureSpec, checkCreature } from './creature-spec.ts';

const C: CreatureSpec['colours'] = {
  coat: [0.3, 0.28, 0.25],
  nose: [0.02, 0.02, 0.02],
  iris: [0.6, 0.4, 0.1],
  keratin: [0.1, 0.09, 0.08],
};
const DOG: CreatureSpec = {
  skeleton: 'quadruped',
  family: 'canid',
  mass: 40,
  length: 1.15,
  height: 0.8,
  colours: C,
};
const HORSE: CreatureSpec = {
  skeleton: 'quadruped',
  family: 'equid',
  stance: 'unguligrade',
  mass: 500,
  length: 2.4,
  height: 1.55,
  colours: C,
};
const DEER: CreatureSpec = { ...HORSE, family: 'cervid', mass: 180, length: 2.0, height: 1.2 };
const BEAR: CreatureSpec = {
  skeleton: 'quadruped',
  family: 'ursid',
  stance: 'plantigrade',
  mass: 180,
  length: 1.9,
  height: 1.0,
  colours: C,
};

const legOf = (s: CreatureSpec, name: 'fore' | 'hind'): Limb => {
  const l = bonesOf(s).legs.find((g) => g.name === name);
  if (!l) throw new Error(`no ${name} leg`);
  return l;
};

/** Yaw of the left eye's rest gaze off +X, degrees. */
const gazeYaw = (s: CreatureSpec): number => {
  const e = headLayout(bonesOf(s), s).eye;
  const g = e.gaze ?? [0, 0, 0];
  return (Math.atan2(g[1] - e.centre[1], g[0] - e.centre[0]) * 180) / Math.PI;
};

describe('family spec: refuses nonsense first', () => {
  it('names the field: unknown family, digits past five, a hoof on a paw, an orbit past 90°', () => {
    const bad: [Partial<CreatureSpec>, string][] = [
      [{ family: 'dragon' as 'canid' }, "unknown family 'dragon'"],
      [{ digits: { fore: 6 } }, 'digits.fore is 6'],
      [{ digits: { hind: 2.5 } }, 'digits.hind is 2.5'],
      [{ hoof: 'cloven' }, 'a hoof needs an unguligrade stance'],
      [{ face: { orbit: 120 } }, 'face.orbit is 120'],
      [{ foreShare: [0.7, 0.5] }, 'foreShare is [0.7, 0.5]'],
    ];
    for (const [patch, says] of bad) {
      expect(() => checkCreature({ ...DOG, ...patch })).toThrow(Ts23dError);
      expect(() => checkCreature({ ...DOG, ...patch })).toThrow(says);
    }
    expect(checkCreature({ ...DEER, hoof: 'single' })).toBeTruthy();
  });
});

describe('eyes face the family orbit angle (Heesy 2004)', () => {
  it('lid opening and rest gaze turn 90° − convergence off +X: cat 25°, dog 40°, horse 66°', () => {
    const cat: CreatureSpec = { ...DOG, family: 'felid', mass: 5, length: 0.46, height: 0.24 };
    for (const [s, want] of [
      [cat, 90 - 65.4],
      [DOG, 90 - 50.4],
      [HORSE, 90 - 24.4],
    ] as const) {
      expect(Math.abs(gazeYaw(s) - want)).toBeLessThan(1);
      expect(headLayout(bonesOf(s), s).eye.aperture).toBeCloseTo(want, 6);
    }
  });

  it('a prey animal does not get a predator forward hint: the horse eye sits further out', () => {
    const horse = headLayout(bonesOf(HORSE), HORSE);
    const forward = headLayout(bonesOf({ ...HORSE, face: { orbit: 65 } }), {
      ...HORSE,
      face: { orbit: 65 },
    });
    expect(horse.eye.centre[1] / horse.W).toBeGreaterThan(forward.eye.centre[1] / forward.W);
    // An explicit face.orbit overrides the family.
    expect(Math.abs(gazeYaw({ ...HORSE, face: { orbit: 65 } }) - 25)).toBeLessThan(1);
  });
});

describe('digits per family', () => {
  it('canid: 4 toes + a dewclaw on the fore paw, 4 toes behind', () => {
    expect([legOf(DOG, 'fore').toes, legOf(DOG, 'fore').dewclaws]).toEqual([4, 1]);
    expect([legOf(DOG, 'hind').toes, legOf(DOG, 'hind').dewclaws]).toEqual([4, 0]);
    expect(legOf({ ...DOG, digits: { fore: 4 } }, 'fore').dewclaws).toBe(0);
  });

  it('the dewclaw sits on the inside of the pastern, off the ground, on the leg', () => {
    const fore = legOf(DOG, 'fore');
    const [d] = dewclaws(fore);
    const carpus = fore.joints[2] ?? [0, 0, 0];
    expect(d).toBeDefined();
    if (!d) return;
    expect(d.at[1]).toBeLessThan(fore.foot[1]);
    expect(d.at[2]).toBeGreaterThan(fore.footSize[2]);
    expect(d.at[2]).toBeLessThan(carpus[2]);
  });

  it('dewclaw claws exist at LOD0 and LOD1 and are gated away at LOD2', () => {
    const b = bonesOf(DOG);
    const four = bonesOf({ ...DOG, digits: { fore: 4 } });
    const K = [C.keratin, C.keratin, C.keratin] as const;
    const tris = (m: ReturnType<typeof clawMesh>): number => (m?.indices.length ?? 0) / 3;
    expect(tris(clawMesh(b, 0, K))).toBeGreaterThan(tris(clawMesh(four, 0, K)));
    expect(tris(clawMesh(b, 1, K))).toBeGreaterThan(tris(clawMesh(four, 1, K)));
    expect(clawMesh(b, 2, K)).toBeNull();
  });

  it('bear: five toes on every plantigrade foot', () => {
    expect([legOf(BEAR, 'fore').toes, legOf(BEAR, 'hind').toes]).toEqual([5, 5]);
  });

  it('cloven: deer stand on two hoofed digits with two dewclaws; the horse on one hoof', () => {
    const deer = legOf(DEER, 'hind');
    expect([deer.hoof, deer.toes, deer.dewclaws]).toEqual(['cloven', 0, 2]);
    const edits = footEdits(bonesOf(DEER), deer, 0, C.keratin);
    const cones = edits.filter((e) => 'shape' in e && e.shape === 'cone');
    expect(cones.length).toBe(2);
    const horse = legOf(HORSE, 'fore');
    expect([horse.hoof, horse.dewclaws]).toEqual(['single', 0]);
    expect(clawMesh(bonesOf(DEER), 0, [C.keratin, C.keratin, C.keratin])).toBeNull();
  });

  it('a cloven-hoofed deer compiles closed and standing at every LOD', () => {
    const a = defineCreature({ name: 'test_deer', spec: DEER });
    for (const lod of [0, 1, 2] as const) {
      const c = compile(a, { lod });
      expect(c.parts.map((p) => p.name)).toContain('body');
      expect(runQa(c).map((f) => `${f.gate}: ${f.message}`)).toEqual([]);
    }
  });
});

describe('tail defaults per family', () => {
  const tailOf = (s: CreatureSpec): number => pathLength(bonesOf(s).tail.map((n) => n.at));
  it('bear 0.07, deer 0.075, tiger-like felid 0.51 of head-body; explicit tail wins', () => {
    expect(tailOf(BEAR) / BEAR.length).toBeLessThan(0.1);
    expect(tailOf(DEER) / DEER.length).toBeLessThan(0.1);
    const big: CreatureSpec = { ...DOG, family: 'felid', mass: 200, length: 1.95, height: 1 };
    expect(tailOf(big) / big.length).toBeGreaterThan(0.45);
    expect(tailOf({ ...BEAR, tail: 0.5 })).toBeGreaterThan(0.45);
  });
});

describe('fore share (dog 60 %, horse 57–60 %)', () => {
  // Deliberately rear-heavy: a heavy, level 1.1 m tail on a wolf-sized body.
  const REAR: CreatureSpec = {
    ...DOG,
    tail: 1.1,
    build: { tailGirth: 4 },
    pose: { tail: 'level' },
  };

  it('fails a rear-heavy quadruped, naming the share and where to move the mass', () => {
    const [check] = foreShareCheck(REAR, bonesOf(REAR));
    expect(check).toBeDefined();
    if (!check) return;
    const found = check(compile(defineCreature({ name: 'rear', spec: REAR }), { lod: 2 }));
    expect(found[0]?.message).toContain('fore share');
    expect(found[0]?.message).toMatch(/carry \d+ %/);
    expect(found[0]?.fix).toContain('forward');
  });

  it('a wolf-built quadruped passes; legless and two-legged types are not judged', () => {
    const [check] = foreShareCheck(DOG, bonesOf(DOG));
    expect(check?.(compile(defineCreature({ name: 'dog', spec: DOG }), { lod: 2 }))).toEqual([]);
    const { family: _, ...rest } = DOG;
    const wyvern: CreatureSpec = { ...rest, skeleton: 'winged' };
    expect(foreShareCheck(wyvern, bonesOf(wyvern))).toEqual([]);
  });

  it('defineCreature runs it as a QA check', () => {
    const a = defineCreature({ name: 'rear_qa', spec: REAR });
    const findings = (a.checks ?? []).flatMap((c) => [...c(compile(a, { lod: 2 }))]);
    expect(findings.some((f) => f.message.startsWith('fore share'))).toBe(true);
  });
});
