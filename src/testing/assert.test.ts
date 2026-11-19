import { describe, expect, it } from 'bun:test';
import { defineAsset, Ts23dError } from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { touches } from '../qa/index.ts';
import {
  assertBudget,
  assertDeterministic,
  assertMeasure,
  assertMotionClear,
  assertParts,
  assertQaPass,
  hashBytes,
  snapshotHash,
} from './index.ts';

const c: [number, number, number] = [0.5, 0.5, 0.5];
const crate = defineAsset({
  name: 'crate',
  kind: 'prop',
  budget: { triangles: [24, 24, 24] },
  build: (ctx) => {
    ctx.part('body', box({ size: [1, 1, 1], color: c }));
    ctx.group('lid', { at: [0, 0, 1] });
    ctx.part('lid_panel', box({ size: [1, 1, 0.05], color: c }), { parent: 'lid' });
  },
});
let calls = 0;
const flaky = defineAsset({
  name: 'flaky',
  kind: 'prop',
  budget: { triangles: [99, 99, 99] },
  build: (ctx) => {
    calls++;
    ctx.part('body', box({ size: [1, 1, 1 + calls * 0.01], color: c }));
  },
});
// Same geometry every build; only the clip differs (an rps from ambient state, like Math.random).
let spins = 0;
const restless = defineAsset({
  name: 'restless',
  kind: 'prop',
  budget: { triangles: [99, 99, 99] },
  build: (ctx) => {
    spins++;
    ctx.part('turntable', box({ size: [1, 1, 1], color: c }), {
      motion: { kind: 'spin', axis: [0, 0, 1], rps: spins },
    });
  },
});
const floating = defineAsset({
  name: 'floating',
  kind: 'prop',
  budget: { triangles: [12, 12, 12] },
  build: (ctx) => {
    ctx.part('body', box({ size: [1, 1, 1], color: c }));
    ctx.part('ghost', box({ size: [1, 1, 1], color: c }), { at: [0, 0, 5] });
  },
});
const spinner = defineAsset({
  name: 'spinner',
  kind: 'prop',
  budget: { triangles: [99, 99, 99] },
  build: (ctx) => {
    ctx.part('post', box({ size: [0.2, 0.2, 2], color: c }));
    ctx.part('blade', box({ size: [2, 0.1, 0.1], color: c }), {
      at: [0.6, 0, 1],
      motion: { kind: 'spin', axis: [1, 0, 0], rps: 1 },
    });
  },
});

const code = (f: () => unknown): string => {
  try {
    f();
  } catch (e) {
    return e instanceof Ts23dError ? `${e.code} ${e.message}` : 'non-ts23d error';
  }
  return 'passed';
};

// Two spinning rotors on a base need three draws; the budget allows one.
const fan = (draws: number) =>
  defineAsset({
    name: 'fan',
    kind: 'prop',
    budget: { triangles: [999, 999, 999], draws },
    build: (ctx) => {
      ctx.part('base', box({ size: [1, 1, 0.5], color: c }));
      for (const [name, x] of [
        ['rotor_a', 0.3],
        ['rotor_b', -0.3],
      ] as const)
        ctx.part(name, box({ size: [0.3, 0.3, 0.1], color: c }), {
          at: [x, 0, 0.5],
          motion: { kind: 'spin', axis: [0, 0, 1], rps: 1 },
        });
    },
  });

describe('testing assertions', () => {
  it('assertQaPass runs the LOD-chain gates on one LOD too: a check selector typo fails at LOD0', () => {
    const lamp = defineAsset({
      name: 'lamp',
      kind: 'prop',
      budget: { triangles: [99, 99, 99] },
      checks: [touches('lanturn', 'pole')],
      build: (ctx) => {
        ctx.part('pole', box({ size: [0.1, 0.1, 2], color: c }));
        ctx.part('lantern', box({ size: [0.3, 0.3, 0.2], at: [0, 0, 2], color: c }));
      },
    });
    for (const lods of [undefined, [0] as const]) {
      const qa = code(() => assertQaPass(lamp, lods ? { lods } : {}));
      expect(qa).toContain("T3D_QA_CHECK check: check selector 'lanturn' matches no part");
    }
    // Without LOD0 the selector gate has too little to judge by, and says nothing.
    expect(code(() => assertQaPass(lamp, { lods: [1] }))).toBe('passed');
  });

  it('assertQaPass fails budget.draws like `t3d build` does', () => {
    const qa = code(() => assertQaPass(fan(1)));
    expect(qa).toContain('T3D_QA_FAILED');
    expect(qa).toContain(
      'T3D_QA_DRAW_CALLS draw-calls: LOD0 needs 3 draw calls, budget.draws is 1',
    );
    expect(code(() => assertQaPass(fan(3)))).toBe('passed');
  });

  it('throw T3D_QA_FAILED with every finding when the asset is wrong', () => {
    const qa = code(() => assertQaPass(floating));
    expect(qa).toContain('T3D_QA_FAILED');
    expect(qa).toContain('floating-parts [ghost]');
    expect(qa).toContain('triangle-budget');
    expect(code(() => assertBudget(crate, [12, 12, 12]))).toContain('24 triangles > 12');
    expect(code(() => assertParts(crate, ['lid', 'hinge_*']))).toContain("'hinge_*'");
    expect(
      code(() =>
        assertMeasure(crate, { label: 'height', axis: 'z', value: 1.2, parts: ['body', 'lid'] }),
      ),
    ).toContain('height: 1.050 m');
    expect(code(() => assertDeterministic(flaky, { lods: [0] }))).toContain(
      'not byte-deterministic',
    );
    expect(code(() => assertMotionClear(spinner, { lods: [0] }))).toContain('T3D_QA_FAILED');
    expect(code(() => assertDeterministic(restless, { lods: [0] }))).toContain(
      'not byte-deterministic',
    );
  });

  it('return quietly when the asset is right', () => {
    expect(code(() => assertQaPass(crate))).toBe('passed');
    expect(code(() => assertBudget(crate))).toBe('passed');
    expect(code(() => assertParts(crate, ['body', 'lid*']))).toBe('passed');
    expect(
      assertMeasure(crate, { label: 'height', axis: 'z', value: 1.05, parts: ['body', 'lid'] }),
    ).toBeCloseTo(1.05, 5);
    expect(code(() => assertDeterministic(crate))).toBe('passed');
    expect(snapshotHash(crate)).toMatch(/^[0-9a-f]{16}$/);
    expect(snapshotHash(crate)).not.toBe(
      snapshotHash(crate, { lod: 0, glb: { optimize: false, keepParts: true } }),
    );
  });

  it('hashBytes is stable and sensitive', () => {
    expect(hashBytes(new Uint8Array([1, 2, 3]))).toBe(hashBytes(new Uint8Array([1, 2, 3])));
    expect(hashBytes(new Uint8Array([1, 2, 3]))).not.toBe(hashBytes(new Uint8Array([1, 2, 4])));
  });
});
