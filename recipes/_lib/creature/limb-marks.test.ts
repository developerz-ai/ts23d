// limb-marks.ts: the leg landmarks a creature-kind recipe passes as `options.body`. Nothing on the
// far LOD (its legs are tubes outside the sculpt, an edit there floats), grooves and hollows only
// where the cell is fine enough (LOD0), a groove between every pair of neighbouring toes.

import { describe, expect, it } from 'bun:test';
import { type CreatureSpec, creaturePlan, type SculptEdit } from '@developerz.ai/ts23d';
import { knuckles, limbMarks } from './limb-marks.ts';

const SPEC: CreatureSpec = {
  skeleton: 'quadruped',
  family: 'canid',
  stance: 'digitigrade',
  mass: 40,
  length: 1.15,
  height: 0.8,
  colours: {
    coat: [0.4, 0.35, 0.3],
    nose: [0.02, 0.02, 0.02],
    iris: [0.6, 0.4, 0.1],
    keratin: [0.1, 0.09, 0.08],
  },
};
const bones = creaturePlan(SPEC).bones;
const cuts = (e: readonly SculptEdit[]): number =>
  e.filter((x) => 'op' in x && x.op === 'subtract').length;

describe('limbMarks', () => {
  it('emits nothing at LOD2, where the kind’s legs are tubes', () => {
    expect(limbMarks()(bones, 2)).toEqual([]);
  });

  it('cuts toe grooves and hollows at LOD0 only, one groove per pair of toes', () => {
    const toes = bones.legs.reduce((n, l) => n + Math.max(0, l.toes - 1), 0);
    const hollows = 2; // above the wrist, before the hock
    expect(cuts(limbMarks()(bones, 0))).toBe(toes + hollows);
    expect(cuts(limbMarks()(bones, 1))).toBe(0);
    expect(cuts(limbMarks({ toes: 0, hollow: 0 })(bones, 0))).toBe(0);
  });

  it('lays the knuckles where the kind does: an arc, the middle toes leading', () => {
    const fore = bones.legs.find((l) => l.name === 'fore');
    if (!fore) throw new Error('no fore leg');
    const k = knuckles(fore);
    expect(k.length).toBe(fore.toes);
    const mid = k[Math.floor(k.length / 2)]?.[0] ?? 0;
    expect(mid).toBeGreaterThan(k[0]?.[0] ?? Infinity);
  });

  it('scales the landmarks with `bone`', () => {
    const size = (e: readonly SculptEdit[]): number => {
      const first = e[0];
      return first && 'size' in first && Array.isArray(first.size) ? (first.size[0] ?? 0) : 0;
    };
    expect(size(limbMarks({ bone: 1.5 })(bones, 1))).toBeCloseTo(
      size(limbMarks()(bones, 1)) * 1.5,
      9,
    );
  });
});
