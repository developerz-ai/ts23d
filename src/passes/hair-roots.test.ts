import { describe, expect, test } from 'bun:test';
import { createRng, Ts23dError } from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { poissonRoots } from './hair-roots.ts';

describe('poissonRoots at high density', () => {
  // 600 m² × 300 /m² × 2 darts: far more than a spread call's argument limit.
  const big = box({ size: [10, 10, 10], color: [1, 1, 1] });

  test('fails with the card cap, not a stack overflow, when a zone asks for too many roots', () => {
    let caught: unknown;
    try {
      poissonRoots(big, () => 300, createRng(1), 5000);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Ts23dError);
    expect((caught as Ts23dError).code).toBe('T3D_RECIPE_INVALID');
    expect((caught as Ts23dError).message).toMatch(/cap 5000/);
  }, 60000);

  test('the cap leaves a zone under it untouched', () => {
    const small = box({ size: [1, 1, 1], color: [1, 1, 1] });
    const free = poissonRoots(small, () => 300, createRng(1));
    expect(free.length).toBeGreaterThan(600);
    expect(poissonRoots(small, () => 300, createRng(1), 20000)).toEqual(free);
  });
});
