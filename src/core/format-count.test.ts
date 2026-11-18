// Counts as people read them: three significant digits with k, M, B or T.

import { describe, expect, it } from 'bun:test';
import { formatCount, Ts23dError } from './index.ts';

describe('formatCount', () => {
  it('refuses what is not a count', () => {
    expect(() => formatCount(Number.NaN)).toThrow(Ts23dError);
    expect(() => formatCount(Number.POSITIVE_INFINITY)).toThrow(/not a finite number/);
  });

  it('shortens the numbers of a triangle budget', () => {
    expect([188016, 21860, 1062].map(formatCount)).toEqual(['188k', '21.9k', '1.06k']);
  });

  it('leaves small counts whole and drops trailing zeros', () => {
    expect([0, 7, 999, 1000, 1500, 30000].map(formatCount)).toEqual([
      '0',
      '7',
      '999',
      '1k',
      '1.5k',
      '30k',
    ]);
  });

  it('moves to the next unit when rounding reaches it', () => {
    expect(formatCount(999_950)).toBe('1M');
    expect(formatCount(1_234_567)).toBe('1.23M');
    expect(formatCount(2_000_000_000)).toBe('2B');
    expect(formatCount(3.4e12)).toBe('3.4T');
  });

  it('keeps the sign', () => {
    expect(formatCount(-21860)).toBe('-21.9k');
  });
});
