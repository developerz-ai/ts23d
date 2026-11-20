import { describe, expect, it } from 'bun:test';
import { dmath } from '../core/index.ts';
import { hex } from '../material/index.ts';
import { creaturePlan } from './creature.ts';
import {
  FAMILY_PRESETS,
  type FamilyMember,
  familyMember,
  memberHead,
} from './creature-families.ts';
import type { CreatureSpec } from './creature-spec.ts';

const C = {
  coat: hex('#888888'),
  nose: hex('#111111'),
  iris: hex('#aa8822'),
  keratin: hex('#222222'),
};
const WOLF: CreatureSpec = {
  skeleton: 'quadruped',
  family: 'canid',
  stance: 'digitigrade',
  mass: 40,
  length: 1.15,
  height: 0.8,
  head: 0.265,
  neck: 0.28,
  tail: 0.42,
  build: { depth: 0.5, width: 0.55, ruff: 0.04 },
  face: { preset: 'canid', ears: 'erect' },
  coat: 0.03,
  colours: C,
  pattern: { kind: 'agouti', scale: 0.012 },
};
const FOX: FamilyMember = {
  family: 'canid',
  mass: 6,
  length: 0.68,
  height: 0.4,
  tail: 0.42,
  colours: C,
};
const BEAR: FamilyMember = {
  family: 'ursid',
  mass: 400,
  length: 2.1,
  height: 1.15,
  tail: 0.12,
  colours: C,
};

describe('familyMember', () => {
  it('refuses a mass in grams, a shoulder above the body and a non-quadruped base', () => {
    expect(() => familyMember(WOLF, { ...FOX, mass: 6000 })).toThrow('bulk');
    expect(() => familyMember(WOLF, { ...FOX, height: 0.9 })).toThrow('shoulder');
    expect(() => familyMember({ ...WOLF, skeleton: 'biped' }, FOX)).toThrow("skeleton is 'biped'");
    expect(() => familyMember(WOLF, { ...FOX, mass: Number.NaN })).toThrow('mass');
  });

  it('a same-family member keeps the base build and scales the head with negative allometry', () => {
    const fox = familyMember(WOLF, FOX);
    expect(fox.stance).toBe('digitigrade');
    expect(fox.face?.ears).toBe('erect');
    expect(fox.pattern).toBeUndefined();
    const k = FOX.length / WOLF.length;
    // Relatively larger head than a linear scale (small carnivores), smaller than the wolf's.
    expect(fox.head ?? 0).toBeGreaterThan(0.265 * k);
    expect(fox.head ?? 0).toBeLessThan(0.265);
    expect(fox.neck ?? 0).toBeCloseTo(0.28 * k, 6);
    expect(fox.coat ?? 0).toBeLessThan(0.03);
  });

  it('a member of another family takes its preset: the bear is plantigrade with round ears', () => {
    const bear = familyMember(WOLF, BEAR);
    expect(bear.stance).toBe('plantigrade');
    expect(bear.family).toBe('ursid');
    expect(bear.face?.preset).toBe('ursid');
    expect(bear.face?.ears).toBe('round');
    expect(bear.head ?? 0).toBeCloseTo(FAMILY_PRESETS.ursid.head * 2.1, 6);
    expect(memberHead(WOLF, { ...BEAR, head: 0.4 })).toBe(0.4);
  });

  it('both members plan on the wolf skeleton (same landmarks, own numbers)', () => {
    for (const m of [FOX, BEAR]) {
      const { bones } = creaturePlan(familyMember(WOLF, m));
      const len = dmath.hypot(
        bones.nose[0] - bones.tailRoot[0],
        bones.nose[1] - bones.tailRoot[1],
        bones.nose[2] - bones.tailRoot[2],
      );
      expect(Math.abs(len - m.length) / m.length).toBeLessThan(0.03);
      expect(bones.legs.map((l) => l.name)).toEqual(
        creaturePlan(WOLF).bones.legs.map((l) => l.name),
      );
    }
  });
});
