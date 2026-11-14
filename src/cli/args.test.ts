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

it('rejects --variant without a snake_case name, parses one', () => {
  expect(code(['hero', 'a.ts', '--variant'])).toBe('T3D_RECIPE_INVALID');
  expect(code(['hero', 'a.ts', '--variant', 'Oxide Red'])).toBe('T3D_RECIPE_INVALID');
  expect(parseArgs(['hero', 'a.ts', '--variant', 'oxide_red']).variant).toBe('oxide_red');
  expect(parseArgs(['hero', 'a.ts']).variant).toBeUndefined();
});

it('--physics is off unless asked, and is not taken for a file', () => {
  expect(parseArgs(['build', 'a.ts']).physics).toBe(false);
  const on = parseArgs(['build', 'a.ts', '--physics']);
  expect(on.physics).toBe(true);
  expect(on.files).toEqual(['a.ts']);
});

it('--profile rejects an unknown engine, sets its defaults, and explicit flags win', () => {
  expect(code(['build', 'a.ts', '--profile', 'cryengine'])).toBe('T3D_RECIPE_INVALID');
  expect(code(['build', 'a.ts', '--profile'])).toBe('T3D_RECIPE_INVALID');
  const web = parseArgs(['build', 'a.ts', '--profile', 'web']);
  expect([web.profile, web.lodFiles, web.sheetSize]).toEqual(['web', 'single', 2048]);
  const ue = parseArgs(['build', 'a.ts', '--profile', 'unreal']);
  expect([ue.lodFiles, ue.sheetSize, ue.files]).toEqual(['split', 4096, ['a.ts']]);
  const mine = parseArgs([
    'build',
    'a.ts',
    '--lods',
    'both',
    '--sheet-size',
    '1024',
    '--profile',
    'unreal',
  ]);
  expect([mine.lodFiles, mine.sheetSize]).toEqual(['both', 1024]);
  expect(parseArgs(['build', 'a.ts']).profile).toBeUndefined();
});

it('--no-sounds turns sound files off and is not taken for a file', () => {
  expect(parseArgs(['build', 'a.ts']).sounds).toBe(true);
  const off = parseArgs(['build', 'a.ts', '--no-sounds']);
  expect(off.sounds).toBe(false);
  expect(off.files).toEqual(['a.ts']);
});

it('is strict: unknown flags, values outside their set and a valueless --out are T3D_CLI_USAGE', () => {
  expect(code(['build', 'a.ts', '--nope'])).toBe('T3D_CLI_USAGE');
  expect(code(['build', 'a.ts', '--lods', '7'])).toBe('T3D_CLI_USAGE');
  expect(code(['build', 'a.ts', '--lods', '0,3'])).toBe('T3D_CLI_USAGE');
  expect(code(['build', 'a.ts', '--lods'])).toBe('T3D_CLI_USAGE');
  expect(code(['build', 'a.ts', '--sheet', 'png'])).toBe('T3D_CLI_USAGE');
  expect(code(['build', 'a.ts', '--sheet-size', '3000'])).toBe('T3D_CLI_USAGE');
  expect(code(['build', 'a.ts', '--out'])).toBe('T3D_CLI_USAGE');
  expect(code(['build', 'a.ts', '--out', '--json'])).toBe('T3D_CLI_USAGE');
  expect(code(['build'])).toBe('T3D_CLI_USAGE');
  expect(parseArgs(['build', 'a.ts', '--sheet', 'embed', '--sheet-size', '512']).sheetSize).toBe(
    512,
  );
});

it('names the closest command and flag in a usage error', () => {
  const fixOf = (argv: string[]): string => {
    try {
      parseArgs(argv);
    } catch (e) {
      if (e instanceof Ts23dError) return e.fix;
    }
    return '';
  };
  expect(fixOf(['biuld', 'a.ts'])).toContain('t3d build');
  expect(fixOf(['build', 'a.ts', '--sheet-szie', '512'])).toContain('--sheet-size');
});

it('reads --help / -h / help <cmd> and --version before anything else', () => {
  expect(parseArgs([]).cmd).toBe('help');
  expect(parseArgs(['--help']).cmd).toBe('help');
  expect(parseArgs(['build', '--help'])).toMatchObject({ cmd: 'help', topic: 'build' });
  expect(parseArgs(['help', 'icon'])).toMatchObject({ cmd: 'help', topic: 'icon' });
  expect(parseArgs(['build', 'a.ts', '-h']).topic).toBe('build');
  expect(parseArgs(['--version']).cmd).toBe('version');
});

it('--timeout gives the http finish model seconds → ms, refuses ≤ 0', () => {
  expect(parseArgs(['finish', 'a.ts', '--timeout', '600']).finish?.timeoutMs).toBe(600_000);
  expect(code(['finish', 'a.ts', '--timeout', '0'])).toBe('T3D_FINISH_INVALID');
  expect(code(['finish', 'a.ts', '--timeout'])).toBe('T3D_FINISH_INVALID');
});
