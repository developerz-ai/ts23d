import { describe, expect, it } from 'bun:test';
import { createRng } from '../core/index.ts';
import { hydraulicErosion } from './erosion.ts';
import { arrayMemo } from './erosion-memo.ts';
import { terrainGrid } from './terrain-grid.ts';

const grid = (lift = 0) =>
  terrainGrid({
    rect: [0, 0, 320, 320],
    cells: 32,
    height: (x, y) => lift + Math.max(0, 200 - Math.hypot(x - 160, y - 160) * 0.9),
  });
const hashOf = (a: Float64Array): string => Array.from(a, (v) => v.toFixed(9)).join(',');

describe('erosion memo', () => {
  it('a different seed or grid is simulated, never served from the memo', () => {
    const a = hydraulicErosion(grid(), createRng(1), { droplets: 500 });
    const b = hydraulicErosion(grid(), createRng(2), { droplets: 500 });
    const c = hydraulicErosion(grid(5), createRng(1), { droplets: 500 });
    expect(hashOf(b.z)).not.toBe(hashOf(a.z));
    expect(hashOf(c.z)).not.toBe(hashOf(a.z));
  });
  it('a repeat run is bit-identical and leaves the Rng where a full run would', () => {
    const r1 = createRng(7);
    const first = hydraulicErosion(grid(), r1, { droplets: 400 });
    const r2 = createRng(7);
    const again = hydraulicErosion(grid(), r2, { droplets: 400 });
    expect(Buffer.from(again.z.buffer).equals(Buffer.from(first.z.buffer))).toBe(true);
    expect(r2.next()).toBe(r1.next());
  });
  it('hands out copies: mutating a result cannot poison the next hit', () => {
    const memo = arrayMemo();
    const key = { scalars: [1], arrays: [new Float64Array([1, 2])] };
    const out = memo(key, () => [new Float64Array([3])]);
    out[0]?.fill(9);
    expect([...(memo(key, () => [new Float64Array([0])])[0] ?? [])]).toEqual([3]);
  });
});
