// assertFollows fails a coupling rod animated as an up-and-down slide (it leaves the crank pin
// for most of the turn: the loco_440 bug, D42) and passes the same rod as an orbit.
import { describe, expect, it } from 'bun:test';
import { defineAsset, type Motion } from '../core/index.ts';
import { box, cylinder } from '../primitives/index.ts';
import { assertFollows } from './follows.ts';

const c: [number, number, number] = [1, 1, 1];
const wheelAndRod = (rod: Motion) =>
  defineAsset({
    name: 'wheel_and_rod',
    kind: 'prop',
    budget: { triangles: [9999, 9999, 9999] },
    build(ctx) {
      ctx.part('wheel', cylinder({ radius: 0.8, length: 0.1, segments: 16, axis: 'y', color: c }), {
        at: [0, 0, 0.8],
        motion: { kind: 'spin', axis: [0, 1, 0], rps: 0.78 },
      });
      // Rod resting on a crank pin 0.3 m straight above the axle.
      ctx.part('rod', box({ size: [2, 0.05, 0.1], at: [-1, 0, 0], color: c }), {
        at: [0, 0.2, 1.1],
        motion: rod,
        clearOf: ['wheel'],
      });
    },
  });
const pin = { part: 'rod', follows: 'wheel', point: [0, 0.2, 1.1] as const, lods: [0] as const };

describe('assertFollows', () => {
  it('fails a rod that slides up and down while its pin goes round', () => {
    const slid = wheelAndRod({ kind: 'slide', offset: [0, 0, 0.3], hz: 0.78 });
    expect(() => assertFollows(slid, pin)).toThrow(/drifts .* mm between 'rod' and 'wheel'/);
  });

  it('fails a missing part by name', () => {
    const asset = wheelAndRod({ kind: 'orbit', axis: [0, 1, 0], arm: [0, 0, 0.3], hz: 0.78 });
    expect(() => assertFollows(asset, { ...pin, follows: 'nope' })).toThrow(/no part 'nope'/);
  });

  it('passes the same rod as an orbit on the wheel axis and rate', () => {
    const asset = wheelAndRod({ kind: 'orbit', axis: [0, 1, 0], arm: [0, 0, 0.3], hz: 0.78 });
    expect(assertFollows(asset, pin)).toBeLessThan(1e-9);
  });
});
