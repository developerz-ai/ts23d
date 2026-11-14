import { expect, it } from 'bun:test';
import { Ts23dError } from '../core/index.ts';
import { hex } from './palette.ts';

const code = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    if (e instanceof Ts23dError) return e.code;
    throw e;
  }
  return 'no error';
};

it('refuses anything but #rgb and #rrggbb with T3D_MATERIAL_INVALID', () => {
  for (const bad of ['#ff000080', 'zzz', '', 'ffffff', '#ffff', '#gggggg', ' #ffffff', '#fff '])
    expect(code(() => hex(bad))).toBe('T3D_MATERIAL_INVALID');
});

it('converts sRGB hex to linear', () => {
  expect(hex('#ffffff')).toEqual([1, 1, 1]);
  expect(hex('#000000')).toEqual([0, 0, 0]);
  expect(hex('#808080')[0]).toBeCloseTo(0.2158, 3);
});

it('reads #rgb as #rrggbb and ignores case', () => {
  expect(hex('#fff')).toEqual([1, 1, 1]);
  expect(hex('#f80')).toEqual(hex('#ff8800'));
  expect(hex('#ABCDEF')).toEqual(hex('#abcdef'));
});
