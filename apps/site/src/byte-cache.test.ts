import { describe, expect, test } from 'bun:test';
import { ByteCache } from './byte-cache.ts';

const MB = 1024 * 1024;
const sheet = (mb: number) => () => Promise.resolve(new Uint8Array(mb * MB));

describe('ByteCache', () => {
  test('D341: browsing many sheets keeps only what fits the byte cap', async () => {
    const cache = new ByteCache<Uint8Array>(100 * MB, (v) => v.length);
    for (let i = 0; i < 5; i++) await cache.get(`asset${i}`, sheet(48));
    // 2 × 48 MiB fit under 100 MiB; the three oldest were let go.
    expect(cache.keys()).toEqual(['asset3', 'asset4']);
  });

  test('asks once per key while cached, and keeps the most recently asked', async () => {
    const cache = new ByteCache<Uint8Array>(100 * MB, (v) => v.length);
    let made = 0;
    const counted = () => {
      made++;
      return sheet(48)();
    };
    const a = cache.get('a', counted);
    expect(cache.get('a', counted)).toBe(a);
    await a;
    await cache.get('b', counted);
    await cache.get('a', counted);
    await cache.get('c', counted);
    expect(cache.keys()).toEqual(['a', 'c']);
    expect(made).toBe(3);
  });

  test('keeps the newest even when it alone is over the cap, and drops a failure', async () => {
    const cache = new ByteCache<Uint8Array>(10 * MB, (v) => v.length);
    await cache.get('big', sheet(48));
    expect(cache.keys()).toEqual(['big']);
    await expect(
      cache.get('bad', () => Promise.reject(new Error('worker died'))),
    ).rejects.toThrow();
    expect(cache.keys()).toEqual(['big']);
  });
});
