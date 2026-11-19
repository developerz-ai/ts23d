import { describe, expect, test } from 'bun:test';
import { byCodeUnit } from './compare.ts';

describe('byCodeUnit', () => {
  test('underscores and digits sort by code unit, where a locale collation disagrees', () => {
    const names = ['t34_1941', 't34', 'T34', 'tiger_1', 't_rex', 'ä_wing', 'z_last'];
    const sorted = [...names].sort(byCodeUnit);
    expect(sorted).toEqual(['T34', 't34', 't34_1941', 't_rex', 'tiger_1', 'z_last', 'ä_wing']);
    // The defect: a locale-aware sort puts these in another order (and one that varies by locale).
    expect([...names].sort((a, b) => a.localeCompare(b, 'en'))).not.toEqual(sorted);
  });

  test('equal strings compare 0, and the order is antisymmetric', () => {
    expect(byCodeUnit('wolf', 'wolf')).toBe(0);
    expect(byCodeUnit('a', 'b')).toBe(-1);
    expect(byCodeUnit('b', 'a')).toBe(1);
  });
});
