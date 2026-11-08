import { describe, expect, it } from 'bun:test';
import { inShard, parseShard } from './shard.ts';

describe('shard', () => {
  it('rejects a malformed or out-of-range shard', () => {
    for (const bad of ['0/4', '5/4', '1/0', 'one/4', '1-4'])
      expect(() => parseShard(bad)).toThrow(/fix:/);
  });

  it('splits a list so every item lands in exactly one shard', () => {
    const items = Array.from({ length: 23 }, (_, i) => i);
    const parts = [1, 2, 3, 4].map((k) => inShard(items, parseShard(`${k}/4`)));
    expect(parts.flat().sort((a, b) => a - b)).toEqual(items);
    expect(inShard(items, parseShard(undefined))).toEqual(items);
  });
});
