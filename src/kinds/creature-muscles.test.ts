// The muscle layer: a quadruped gets 15–25 fibre-aligned forms (muscles + bony landmarks) that
// lie along origin → insertion, sit on the masses at their declared rise, leave no fold at the
// midline, and scale with `build.muscle`.

import { describe, expect, it } from 'bun:test';
import type { Vec3 } from '../core/index.ts';
import { sculptField } from '../primitives/index.ts';
import { blockOut } from './creature-body.ts';
import { trunkMuscles } from './creature-muscle-map.ts';
import {
  bellyOf,
  type FibreMuscle,
  muscleDefinition,
  muscleEdit,
  muscleEdits,
  pairedEdit,
  seat,
} from './creature-muscles.ts';
import { bonesOf } from './creature-skeleton.ts';
import type { CreatureSpec } from './creature-spec.ts';

const C: CreatureSpec['colours'] = {
  coat: [0.5, 0.45, 0.4],
  nose: [0.02, 0.02, 0.02],
  iris: [0.6, 0.4, 0.1],
  keratin: [0.1, 0.09, 0.08],
};
const WOLF: CreatureSpec = {
  skeleton: 'quadruped',
  family: 'canid',
  mass: 40,
  length: 1.15,
  height: 0.8,
  tail: 0.42,
  build: { depth: 0.5, width: 0.55 },
  colours: C,
};
const field = (m: FibreMuscle) => sculptField([muscleEdit(m, 1)], { color: [0, 0, 0] }).field;
const strap: FibreMuscle = {
  name: 'strap',
  from: [0, 0.2, 0],
  to: [0.4, 0.2, 0.3],
  width: 0.04,
  thick: 0.03,
  out: [0, 1, 0],
};

describe('fibre muscles', () => {
  it('a muscle lies along origin → insertion, not across it', () => {
    const f = field(strap);
    const at = (t: number): Vec3 => [0.4 * t, 0.2, 0.3 * t];
    expect(f(at(0.15))).toBeLessThan(0);
    expect(f(at(0.85))).toBeLessThan(0);
    // Across the fibres, a belly-length away, is outside.
    expect(f([0.2 - 0.15, 0.2, 0.15 + 0.2])).toBeGreaterThan(0);
  });

  it('thin as a sliver is refused: bellies keep ≥ 0.35 × width of thickness', () => {
    const [w, t] = bellyOf({ ...strap, thick: 0.001 }, 1);
    expect(t).toBeGreaterThanOrEqual(0.35 * w - 1e-12);
  });

  it('a one-sided shape crossing the midline would crease the mirror fold; the pair is symmetric', () => {
    const mid: FibreMuscle = { ...strap, from: [0, 0.01, 0], to: [0.3, 0.01, 0] };
    const f = sculptField([pairedEdit(mid, 1)], { color: [0, 0, 0] }).field;
    for (const p of [
      [0.1, 0.03, 0.02],
      [0.2, 0.05, -0.01],
    ] as Vec3[])
      expect(f(p)).toBeCloseTo(f([p[0], -p[1], p[2]]), 9);
  });

  it('seats a muscle guessed 5 cm off so its belly rises `rise` × its thickness above the mass', () => {
    const ball = sculptField([{ shape: 'sphere', at: [0, 0, 0], size: 0.2 }], {
      color: [0, 0, 0],
    }).field;
    const off: FibreMuscle = { ...strap, from: [-0.05, 0.3, 0], to: [0.05, 0.3, 0], rise: 0.5 };
    const s = seat(off, ball, 1);
    const top = (s.from[1] + s.to[1]) / 2 + bellyOf(s, 1)[1];
    expect(top - 0.2).toBeCloseTo(0.5 * bellyOf(s, 1)[1], 2);
  });
});

describe('the quadruped muscle map', () => {
  const b = bonesOf(WOLF);
  const ms = trunkMuscles(b);

  it('15–25 forms: shoulder, neck, chest, hip and thigh muscles plus bony landmarks', () => {
    expect(ms.length).toBeGreaterThanOrEqual(15);
    expect(ms.length).toBeLessThanOrEqual(25);
    for (const n of ['triceps_long', 'latissimus', 'brachiocephalicus', 'biceps_femoris'])
      expect(ms.map((m) => m.name)).toContain(n);
    expect(ms.filter((m) => m.bone).map((m) => m.name)).toContain('scapula');
  });

  it('none for a body plan without the landmarks (a serpent)', () => {
    const { family: _f, ...plain } = WOLF;
    expect(trunkMuscles(bonesOf({ ...plain, skeleton: 'serpent' }))).toEqual([]);
  });

  it('build.muscle 0 keeps only the bones; the canid default is lean (0.85)', () => {
    const base = blockOut(b);
    const none = muscleEdits(b, { ...WOLF, build: { ...WOLF.build, muscle: 0 } }, base);
    expect(none.length).toBe(ms.filter((m) => m.bone).length);
    expect(muscleDefinition(WOLF)).toBe(0.85);
  });
});
