import { describe, expect, it } from 'bun:test';
import { mergeCosts, pickShards, plan, SHARD1_STEPS, worstJob } from './recipe-costs.ts';

describe('recipe costs', () => {
  const old = { shard1: 40, seconds: { 'recipes/a': 10, 'recipes/gone': 5 } };

  it('drops units that no longer exist only on a full run', () => {
    const full = mergeCosts(old, { 'recipes/b': 1.23456 }, 50, ['recipes/a', 'recipes/b']);
    expect(full).toEqual({ shard1: 50, seconds: { 'recipes/a': 10, 'recipes/b': 1.2 } });
    const partial = mergeCosts(old, { 'recipes/a': 12 }, undefined);
    expect(partial).toEqual({ shard1: 40, seconds: { 'recipes/a': 12, 'recipes/gone': 5 } });
  });

  it('writes keys sorted so a refresh diffs cleanly, and keeps the overhead it did not measure', () => {
    const m = mergeCosts(
      { shard1: 0, overhead: 16, seconds: {} },
      { 'recipes/z': 1, 'recipes/a': 2 },
      0,
    );
    expect(Object.keys(m.seconds)).toEqual(['recipes/a', 'recipes/z']);
    expect(m.overhead).toBe(16);
  });

  it('predicts a job as the overhead, its units and an even share of the tests', () => {
    const costs = { shard1: 10, seconds: { a: 30, b: 20 } };
    expect(plan(costs, ['a', 'b'], 40, 2)).toEqual([10 + 20 + 20, 30 + 20]);
    expect(plan({ ...costs, overhead: 5 }, ['a', 'b'], 40, 2)).toEqual([55, 55]);
  });

  it('times only the steps shard 1 runs alone', () => {
    expect(SHARD1_STEPS).not.toContain('test');
    expect(SHARD1_STEPS).not.toContain('recipes');
    expect(SHARD1_STEPS).toContain('lint');
    expect(SHARD1_STEPS).toContain('pack');
  });
});

describe('shard count', () => {
  const costs = { shard1: 0, overhead: 10, seconds: { a: 100, b: 100, c: 100, d: 100 } };
  const units = ['a', 'b', 'c', 'd'];

  it('counts the longest test file against the heaviest shard', () => {
    expect(worstJob([110, 110], [30, 10], 2)).toBe(110 - 20 + 30);
  });

  it('picks the fewest shards whose worst job fits, or none', () => {
    expect(pickShards(costs, units, [20, 20], 240)).toBe(2); // 10 + 200 + 20
    // Three shards do not help: one of them still holds two units.
    expect(pickShards(costs, units, [20, 20], 229)).toBe(4);
    expect(pickShards(costs, units, [20, 20], 100)).toBeUndefined(); // one unit + overhead = 110
  });
});
