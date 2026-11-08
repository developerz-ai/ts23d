import { describe, expect, it } from 'bun:test';
import { defineAsset } from '../core/index.ts';
import { box, cylinder } from '../primitives/index.ts';
import { assertBetween, assertJointsFit, assertSize } from './measure.ts';

const C: [number, number, number] = [1, 1, 1];
const arm = (hand: number) =>
  defineAsset({
    name: 'arm',
    kind: 'character',
    budget: { triangles: [9999, 9999, 9999] },
    build(ctx) {
      ctx.part(
        'forearm',
        cylinder({
          radius: 0.04,
          length: 0.3,
          segments: 24,
          axis: 'x',
          color: C,
          at: [0.15, 0, 1],
        }),
      );
      ctx.part('hand', box({ size: [0.1, hand, hand], at: [0.35, 0, 1 - hand / 2], color: C }));
      ctx.joint('wrist', { from: 'forearm', to: 'hand', at: [0.3, 0, 1], axis: [1, 0, 0] });
    },
  });

describe('assertJointsFit', () => {
  it('throws T3D_QA_FAILED for an oversized hand', () => {
    expect(() => assertJointsFit(arm(0.14))).toThrow('T3D_JOINT_MISMATCH');
  });
  it('passes a hand that fits', () => {
    expect(() => assertJointsFit(arm(0.085))).not.toThrow();
  });
});

describe('assertSize', () => {
  it('throws with the measured length and the range', () => {
    expect(() => assertSize(arm(0.085), { length: [0.5, 0.6] })).toThrow('length 0.400 m');
  });
  it('returns the size when in range', () => {
    expect(
      assertSize(arm(0.085), { length: [0.39, 0.41], height: [0.08, 0.09] }).length,
    ).toBeCloseTo(0.4, 5);
  });
});

describe('assertBetween', () => {
  it('throws for unknown parts and out-of-range distances', () => {
    expect(() => assertBetween(arm(0.085), 'forearm', 'sword', [0, 1])).toThrow('no part matches');
    expect(() => assertBetween(arm(0.085), 'forearm', 'hand', [0.5, 1])).toThrow('want [0.5, 1] m');
  });
  it('measures centre and closest distances', () => {
    expect(assertBetween(arm(0.085), 'forearm', 'hand', [0.19, 0.21])).toBeCloseTo(0.2, 3);
    expect(
      assertBetween(arm(0.085), 'forearm', 'hand', [0, 0.005], { mode: 'closest' }),
    ).toBeLessThan(0.005);
  });
});
