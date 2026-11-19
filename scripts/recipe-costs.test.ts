import { describe, expect, it } from 'bun:test';
import { mergeCosts, plan, SHARD1_STEPS } from './recipe-costs.ts';

describe('recipe costs', () => {
  const old = { shard1: 40, seconds: { 'recipes/a': 10, 'recipes/gone': 5 } };

  it('drops units that no longer exist only on a full run', () => {
    const full = mergeCosts(old, { 'recipes/b': 1.23456 }, 50, ['recipes/a', 'recipes/b']);
    expect(full).toEqual({ shard1: 50, seconds: { 'recipes/a': 10, 'recipes/b': 1.2 } });
    const partial = mergeCosts(old, { 'recipes/a': 12 }, undefined);
    expect(partial).toEqual({ shard1: 40, seconds: { 'recipes/a': 12, 'recipes/gone': 5 } });
  });

  it('writes keys sorted so a refresh diffs cleanly', () => {
    const m = mergeCosts({ shard1: 0, seconds: {} }, { 'recipes/z': 1, 'recipes/a': 2 }, 0);
    expect(Object.keys(m.seconds)).toEqual(['recipes/a', 'recipes/z']);
  });

  it('predicts a shard as its units plus an even share of the tests', () => {
    const costs = { shard1: 10, seconds: { a: 30, b: 20 } };
    expect(plan(costs, ['a', 'b'], 40, 2)).toEqual([10 + 20 + 20, 30 + 20]);
  });

  it('times only the steps shard 1 runs alone', () => {
    expect(SHARD1_STEPS).not.toContain('test');
    expect(SHARD1_STEPS).not.toContain('recipes');
    expect(SHARD1_STEPS).toContain('lint');
    expect(SHARD1_STEPS).toContain('pack');
  });
});
