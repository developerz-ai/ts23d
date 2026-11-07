import { expect, it } from 'bun:test';
import { Ts23dError } from '../core/index.ts';
import { checkBeautyOptions, parseSize } from './options.ts';

const codeOf = (f: () => unknown): string | undefined => {
  try {
    f();
  } catch (e) {
    if (e instanceof Ts23dError) return `${e.code}|${e.fix ? 'fix' : ''}`;
  }
  return undefined;
};

it('rejects malformed and out-of-range sizes with a code and a fix', () => {
  for (const bad of ['1600', '0x900', '1600x9', 'axb', '99999x10', ''])
    expect(codeOf(() => parseSize(bad))).toBe('T3D_RENDER_OPTIONS|fix');
});

it('rejects bad angles, fov and supersampling', () => {
  expect(codeOf(() => checkBeautyOptions({ elDeg: 95 }))).toBe('T3D_RENDER_OPTIONS|fix');
  expect(codeOf(() => checkBeautyOptions({ fovDeg: 1 }))).toBe('T3D_RENDER_OPTIONS|fix');
  expect(codeOf(() => checkBeautyOptions({ azDeg: Number.NaN }))).toBe('T3D_RENDER_OPTIONS|fix');
  expect(codeOf(() => checkBeautyOptions({ supersample: 5 }))).toBe('T3D_RENDER_OPTIONS|fix');
  expect(codeOf(() => checkBeautyOptions({ window: { x: 0.5, y: 0.5, zoom: 0.5 } }))).toBe(
    'T3D_RENDER_OPTIONS|fix',
  );
});

it('parses WxH and fills defaults', () => {
  expect(parseSize('800x450')).toEqual({ width: 800, height: 450 });
  expect(checkBeautyOptions({})).toEqual({
    width: 1600,
    height: 900,
    azDeg: -35,
    elDeg: 18,
    fovDeg: 30,
    supersample: 2,
  });
});
