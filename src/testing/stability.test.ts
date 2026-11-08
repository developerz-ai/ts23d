import { describe, expect, it } from 'bun:test';
import { defineAsset, Ts23dError, type Vec3 } from '../core/index.ts';
import { box, cylinder } from '../primitives/index.ts';
import { assertCentreOfMassInside, assertPartMotionClear, assertUprightOnGround } from './index.ts';

const grey: Vec3 = [0.5, 0.5, 0.5];

const run = (f: () => unknown): string => {
  try {
    f();
  } catch (e) {
    return e instanceof Ts23dError ? `${e.code} ${e.message} fix: ${e.fix}` : `non-ts23d ${e}`;
  }
  return 'passed';
};

/** A block lifted by `lift` metres, with an optional peg sunk below it. */
const block = (lift: number, peg = 0) =>
  defineAsset({
    name: 'block',
    kind: 'prop',
    budget: { triangles: [99, 99, 99] },
    build: (ctx) => {
      ctx.part('body', box({ size: [1, 1, 1], at: [0, 0, lift], color: grey }));
      if (peg) ctx.part('peg', box({ size: [0.1, 0.1, peg + 0.1], at: [0, 0, -peg], color: grey }));
    },
  });

/** A T: thin post, and a top bar `offset` metres to one side of it. */
const tee = (offset: number) =>
  defineAsset({
    name: 'tee',
    kind: 'prop',
    budget: { triangles: [99, 99, 99] },
    build: (ctx) => {
      ctx.part('post', box({ size: [0.2, 0.2, 2], color: grey }));
      ctx.part('bar', box({ size: [2, 0.4, 0.4], at: [offset, 0, 2], color: grey }));
    },
  });

/** A wheel spinning about Y under a fender `clearance` metres above its top. */
const wheel = (clearance: number) =>
  defineAsset({
    name: 'wheel',
    kind: 'prop',
    budget: { triangles: [999, 999, 999] },
    build: (ctx) => {
      ctx.part('fender', box({ size: [1.2, 0.4, 0.05], at: [0, 0, 1 + clearance], color: grey }));
      ctx.part(
        'wheel',
        cylinder({ radius: 0.5, length: 0.2, axis: 'y', segments: 24, color: grey }),
        {
          at: [0, 0, 0.5],
          motion: { kind: 'spin', axis: [0, 1, 0], rps: 1 },
        },
      );
    },
  });

describe('stability — failure cases first', () => {
  it('a floating asset and a part sunk below the ground both fail, with the distance', () => {
    expect(run(() => assertUprightOnGround(block(0.1)))).toContain('10.0 cm above the ground');
    expect(run(() => assertUprightOnGround(block(0, 0.05)))).toContain(
      "'peg' reaches 5.0 cm below",
    );
  });

  it('a T whose bar overhangs its post tips over', () => {
    const r = run(() => assertCentreOfMassInside(tee(0.9)));
    expect(r).toContain('outside the');
    expect(r).toContain('tips over');
  });

  it('a wheel spinning into its fender fails; an unknown or still part fails too', () => {
    expect(run(() => assertPartMotionClear(wheel(-0.1), 'wheel'))).toContain(
      "'fender' cuts into the swept spin of 'wheel'",
    );
    expect(run(() => assertPartMotionClear(wheel(0.05), 'track_*'))).toContain(
      "no part matches 'track_*'",
    );
    expect(run(() => assertPartMotionClear(wheel(0.05), 'fender'))).toContain('has no motion');
  });
});

describe('stability — passing cases', () => {
  it('a grounded block stands; a centred T balances', () => {
    expect(assertUprightOnGround(block(0))).toBeCloseTo(0, 5);
    const { com, outside } = assertCentreOfMassInside(tee(0));
    expect(outside).toBeLessThan(0);
    expect(Math.abs(com[0])).toBeLessThan(1e-6);
  });

  it('a wheel with 5 cm clearance spins clear', () => {
    expect(run(() => assertPartMotionClear(wheel(0.05), 'wheel'))).toBe('passed');
  });
});
