import { describe, expect, test } from 'bun:test';
import { RETRY_MS, retryAfter } from './retry.ts';

describe('retryAfter', () => {
  test('a whole cycle of failures stops the showcase: it never spins', () => {
    expect(retryAfter(3, 3)).toBeNull();
    expect(retryAfter(4, 3)).toBeNull();
    expect(retryAfter(1, 1)).toBeNull();
    expect(retryAfter(1, 0)).toBeNull();
  });

  test('the first failed compile is retried on the next asset after a short pause', () => {
    expect(retryAfter(1, 3)).toBe(RETRY_MS);
    expect(retryAfter(2, 3)).toBe(RETRY_MS);
    expect(RETRY_MS).toBeGreaterThan(0);
  });
});
