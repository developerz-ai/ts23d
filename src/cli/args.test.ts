import { expect, it } from 'bun:test';
import { Ts23dError } from '../core/index.ts';
import { parseArgs } from './args.ts';

const code = (argv: string[]): string | undefined => {
  try {
    parseArgs(argv);
  } catch (e) {
    if (e instanceof Ts23dError) return e.code;
  }
  return undefined;
};

it('rejects bad render flags with T3D_RENDER_OPTIONS', () => {
  expect(code(['hero', 'a.ts', '--size', '1600'])).toBe('T3D_RENDER_OPTIONS');
  expect(code(['hero', 'a.ts', '--size', '10x10'])).toBe('T3D_RENDER_OPTIONS');
  expect(code(['hero', 'a.ts', '--el', 'high'])).toBe('T3D_RENDER_OPTIONS');
  expect(code(['hero', 'a.ts', '--el', '120'])).toBe('T3D_RENDER_OPTIONS');
  expect(code(['hero', 'a.ts', '--fov'])).toBe('T3D_RENDER_OPTIONS');
});

it('parses the render camera and size', () => {
  const a = parseArgs([
    'hero',
    'a.ts',
    '--size',
    '800x450',
    '--az',
    '-120',
    '--el',
    '30',
    '--fov',
    '40',
  ]);
  expect(a.cmd).toBe('hero');
  expect(a.files).toEqual(['a.ts']);
  expect(a.render).toEqual({ width: 800, height: 450, azDeg: -120, elDeg: 30, fovDeg: 40 });
  expect(parseArgs(['build', 'a.ts']).render).toEqual({});
});

it('reads --lods as a level list OR a file mode, never mixing them up', () => {
  const mode = parseArgs(['build', 'a.ts', '--lods', 'single']);
  expect(mode.lods).toEqual([0, 1, 2]);
  expect(mode.lodFiles).toBe('single');
  expect(mode.files).toEqual(['a.ts']);
  const both = parseArgs(['build', 'a.ts', '--lods', '0,2', '--lods', 'split']);
  expect(both.lods).toEqual([0, 2]);
  expect(both.lodFiles).toBe('split');
  expect(parseArgs(['build', 'a.ts']).lodFiles).toBe('both');
});
