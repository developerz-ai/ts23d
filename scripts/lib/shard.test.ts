import { describe, expect, it } from 'bun:test';
import { recipeFolders, tsFiles } from './files.ts';
import {
  balance,
  COSTS,
  type Costs,
  defaultCost,
  gateKey,
  inShard,
  parseShard,
  recipeShard,
  shardLoads,
  shotsKey,
} from './shard.ts';

const id = (s: string): string => s;

describe('shard', () => {
  it('rejects a malformed or out-of-range shard', () => {
    for (const bad of ['0/4', '5/4', '1/0', 'one/4', '1-4'])
      expect(() => parseShard(bad)).toThrow(/fix:/);
  });

  it('splits a list so every item lands in exactly one shard, in input order', () => {
    const items = Array.from({ length: 23 }, (_, i) => `u${String(i).padStart(2, '0')}`);
    const parts = [1, 2, 3, 4].map((k) => inShard(items, parseShard(`${k}/4`), id));
    expect(parts.flat().sort()).toEqual(items);
    for (const p of parts) expect(p).toEqual([...p].sort());
    expect(inShard(items, parseShard(undefined), id)).toEqual(items);
  });

  it('balances by cost, longest first, with shard 1 preloaded by its own checks', () => {
    const costs: Costs = { shard1: 10, seconds: { a: 9, b: 7, c: 5, d: 4, e: 2 } };
    // Round-robin would give shard 1 a + d = 13 on top of its 10; greedy evens the three out.
    const at = balance(['a', 'b', 'c', 'd', 'e'], 3, costs);
    expect([...at].sort()).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 2],
      ['d', 1],
      ['e', 0],
    ]);
    expect(shardLoads(['a', 'b', 'c', 'd', 'e'], 3, costs)).toEqual([12, 13, 12]);
  });

  it('is deterministic whatever the input order, and ties break by name', () => {
    const costs: Costs = { shard1: 0, seconds: { a: 1, b: 1, c: 1, d: 1 } };
    const one = balance(['d', 'c', 'b', 'a'], 2, costs);
    const two = balance(['a', 'b', 'c', 'd'], 2, costs);
    expect([...one].sort()).toEqual([...two].sort());
    expect(one.get('a')).toBe(0);
  });

  it('costs an unmeasured unit at the median measured cost', () => {
    expect(defaultCost({ shard1: 0, seconds: { a: 1, b: 10, c: 3 } })).toBe(3);
    expect(defaultCost({ shard1: 0, seconds: { a: 1, b: 3 } })).toBe(2);
    expect(defaultCost({ shard1: 0, seconds: {} })).toBe(0);
    const costs: Costs = { shard1: 0, seconds: { a: 10, b: 10, c: 1 } };
    expect(shardLoads(['a', 'b', 'c', 'new'], 2, costs)).toEqual([20, 11]);
  });

  it('gives one shard everything, preload or not', () => {
    const costs: Costs = { shard1: 99, seconds: { a: 1 } };
    expect(inShard(['a', 'b'], parseShard('1/1'), id, costs)).toEqual(['a', 'b']);
  });

  it('places every real recipe folder and shared test in exactly one shard', async () => {
    const { folders } = await recipeFolders();
    const shared = (await tsFiles('recipes')).filter(
      (t) => t.split('/')[1]?.startsWith('_') && t.endsWith('.test.ts'),
    );
    for (const n of [1, 5, 8, 12]) {
      const parts = Array.from({ length: n }, (_, i) =>
        recipeShard(folders, shared, parseShard(`${i + 1}/${n}`)),
      );
      const dirs = folders.map((f) => f.dir).sort();
      expect(parts.flatMap((p) => p.gate.map((f) => f.dir)).sort()).toEqual(dirs);
      expect(parts.flatMap((p) => p.shots.map((f) => f.dir)).sort()).toEqual(dirs);
      expect(parts.flatMap((p) => p.sharedTests).sort()).toEqual([...shared].sort());
    }
  });

  it("has a measured cost for every committed recipe folder's gate and renders", async () => {
    const { folders } = await recipeFolders();
    const keys = folders.flatMap((f) => [gateKey(f.dir), shotsKey(f.dir)]);
    expect(keys.filter((k) => COSTS.seconds[k] === undefined)).toEqual([]);
  });
});
