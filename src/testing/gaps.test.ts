import { describe, expect, it } from 'bun:test';
import { defineAsset, Ts23dError } from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { assertFlush, assertNoGaps, assertTouches } from './index.ts';

const grey: [number, number, number] = [0.5, 0.5, 0.5];

/** A frame (posts + header + sill) with a panel in its opening: `slot` under the header, `proud`
 *  standing the panel out of the frame face (+X). */
const framed = (slot: number, proud: number) =>
  defineAsset({
    name: 'framed',
    kind: 'prop',
    budget: { triangles: [999, 999, 999] },
    build: (ctx) => {
      ctx.part('sill', box({ size: [0.2, 2, 0.2], color: grey }));
      ctx.part('header', box({ size: [0.2, 2, 0.2], at: [0, 0, 1.8], color: grey }));
      ctx.part('post_l', box({ size: [0.2, 0.2, 1.6], at: [0, 0.9, 0.2], color: grey }));
      ctx.part('post_r', box({ size: [0.2, 0.2, 1.6], at: [0, -0.9, 0.2], color: grey }));
      ctx.part('back', box({ size: [0.05, 2, 2], at: [-1, 0, 0], color: grey }));
      ctx.part('floor', box({ size: [1, 2, 0.05], at: [-0.5, 0, 0], color: grey }));
      ctx.part('panel', box({ size: [0.05, 1.6, 1.6 - slot], color: grey }), {
        at: [0.075 + proud, 0, 0.2],
      });
    },
  });

const run = (f: () => unknown): string => {
  try {
    f();
  } catch (e) {
    return e instanceof Ts23dError ? `${e.code} ${e.message}` : `non-ts23d ${String(e)}`;
  }
  return 'passed';
};

describe('gap assertions', () => {
  it('fail on a 1 cm slot, a panel standing proud, and parts that only nearly touch', () => {
    const slot = run(() => assertNoGaps(framed(0.01, 0)));
    expect(slot).toContain('T3D_QA_FAILED');
    expect(slot).toContain("'panel'");
    expect(slot).toContain("'header'");
    expect(run(() => assertTouches(framed(0.01, 0), 'panel', 'header'))).toContain(
      "'panel' is 1.0 cm from 'header'",
    );
    const proud = run(() => assertFlush(framed(0, 0.05), 'panel', 'post_*', { view: '+X' }));
    expect(proud).toContain('stands 5.0 cm proud of');
    expect(run(() => assertFlush(framed(0, 0), 'panel', 'back', { view: '+Y' }))).toContain(
      'never meet',
    );
    expect(run(() => assertTouches(framed(0, 0), 'hinge_*', 'header'))).toContain(
      "no part matches 'hinge_*'",
    );
  });

  it('pass when the panel fills its frame, level with it', () => {
    const good = framed(0, 0);
    expect(run(() => assertNoGaps(good))).toBe('passed');
    expect(assertTouches(good, 'panel', 'header')).toBeLessThan(0.002);
    expect(assertFlush(good, 'panel', 'post_*', { view: '+X' })).toBeLessThan(0.003);
  });
});
