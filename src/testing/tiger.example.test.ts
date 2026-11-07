// Worked example: how a user tests their own recipe with @developerz-ai/ts23d/testing. Copy this
// shape next to your recipe: QA, budget, the names engine code binds to, spec numbers, motion.

import { describe, expect, it } from 'bun:test';
import { tiger_1 } from '../../recipes/tiger_1/tiger_1.ts';
import { Ts23dError } from '../core/index.ts';
import { lodPivots } from '../qa/index.ts';
import {
  assertBudget,
  assertDeterministic,
  assertMeasure,
  assertMotionClear,
  assertParts,
  assertQaPass,
} from './index.ts';

describe('tiger_1 (example recipe test)', () => {
  it('fails loudly on a wrong spec number — the failure case first', () => {
    expect(() =>
      assertMeasure(tiger_1, { label: 'hull length', axis: 'x', value: 7, parts: ['hull'] }),
    ).toThrow(Ts23dError);
    // An opt-in gate it does not pass yet: LOD2 drops the wheel pivots (game code breaks there).
    expect(() => assertQaPass(tiger_1, { lodGates: [lodPivots], gates: [] })).toThrow(
      /LOD2 drops pivot/,
    );
  });

  it('passes the build QA at every LOD', () => assertQaPass(tiger_1));

  it('stays in budget', () => assertBudget(tiger_1));

  it('keeps the pivots an engine drives', () =>
    assertParts(tiger_1, ['turret', 'gun'], { lods: [0, 1, 2] }));

  it('matches its spec sheet', () => {
    expect(
      assertMeasure(tiger_1, { label: 'hull length', axis: 'x', value: 6.316, parts: ['hull'] }),
    ).toBeGreaterThan(6.1);
  });

  it('turret and wheels turn without cutting anything', () =>
    assertMotionClear(tiger_1, { lods: [1] }));

  it('compiles to the same bytes every time', () => assertDeterministic(tiger_1, { lods: [1, 2] }));
});
