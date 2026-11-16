import { describe, expect, test } from 'bun:test';
import { encodePng } from '../core/index.ts';
import { fitPng } from './png-fit.ts';
import { readPng } from './png-read.ts';

describe('fitPng', () => {
  test('bytes that are not a PNG → T3D_NEURAL_OUTPUT_INVALID', () => {
    expect(() => fitPng(new Uint8Array(40), 4, 4, 'x')).toThrow('T3D_NEURAL_OUTPUT_INVALID');
  });
  test('centre-crops to the aspect, then area-averages to the size; same size passes through', () => {
    // 8×4: left half red, middle 4 columns green, right half blue.
    const px = new Uint8Array(8 * 4 * 4);
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 8; x++)
        px.set(
          x < 2 ? [255, 0, 0, 255] : x < 6 ? [0, 255, 0, 255] : [0, 0, 255, 255],
          (y * 8 + x) * 4,
        );
    const src = encodePng(8, 4, px);
    const out = readPng(fitPng(src, 2, 2, 'x'), 'x');
    expect([out.width, out.height]).toEqual([2, 2]);
    expect([...out.data.subarray(0, 4)]).toEqual([0, 255, 0, 255]);
    expect(fitPng(src, 8, 4, 'x')).toBe(src);
  });
});
