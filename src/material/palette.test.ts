import { expect, it } from 'bun:test';
import { hex } from './palette.ts';

it('converts sRGB hex to linear', () => {
  expect(hex('#ffffff')).toEqual([1, 1, 1]);
  expect(hex('#000000')).toEqual([0, 0, 0]);
  expect(hex('#808080')[0]).toBeCloseTo(0.2158, 3);
});
