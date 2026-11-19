// WEIGHTS_0 is unorm16 on the 1/255 grid: each vertex's four weights must sum to exactly 65535.
// Rounding each weight alone turned [0.5, 0.25, 0.25, 0] into 128 + 64 + 64 = 256/255.
import { expect, it } from 'bun:test';
import { box } from '../primitives/index.ts';
import { BinWriter } from './bin-writer.ts';
import { skinAttributes } from './skin.ts';

const sums = (weights: readonly number[]): number[] => {
  const m = box({ size: [1, 1, 1], color: [1, 1, 1] });
  const n = m.positions.length / 3;
  const w = new Float32Array(n * 4);
  for (let v = 0; v < n; v++) w.set(weights, v * 4);
  const bin = new BinWriter();
  skinAttributes(bin, { ...m, joints: new Uint16Array(n * 4), weights: w });
  const out = new Uint16Array(bin.bytes().buffer).subarray(n * 4, n * 8);
  return [0, 1, 2, 3]
    .map((k) => out[k] ?? 0)
    .concat([out.subarray(0, 4).reduce((s, x) => s + x, 0)]);
};

it('quantises each vertex with largest remainder so the weights sum to 65535', () => {
  expect(sums([0.5, 0.25, 0.25, 0])).toEqual([127 * 257, 64 * 257, 64 * 257, 0, 65535]);
  expect(sums([1 / 3, 1 / 3, 1 / 3, 0])[4]).toBe(65535);
});

it('keeps weights already on the 1/255 grid exactly', () => {
  expect(sums([200 / 255, 55 / 255, 0, 0])).toEqual([200 * 257, 55 * 257, 0, 0, 65535]);
});
