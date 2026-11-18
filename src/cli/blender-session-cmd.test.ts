// `t3d blender session` argument handling and output, on a fake Blender process.
import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Ts23dError } from '../core/index.ts';
import { type FakeTool, fakeBlenderSession } from '../neural/fake-tool.ts';
import { blenderSession, blenderSessionMain } from './blender-session-cmd.ts';
import { run } from './run.ts';

let root = '';
let fake: FakeTool;
const before = { ...process.env };

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 't3dc-'));
  chmodSync(root, 0o700);
  writeFileSync(join(root, 'm.glb'), 'mesh');
  process.env['T3D_BLENDER_SESSIONS'] = join(root, 's');
  fake = fakeBlenderSession();
});
afterEach(async () => {
  await blenderSession(['stop']).catch(() => undefined);
  fake.dispose();
  rmSync(root, { recursive: true, force: true });
  process.env = { ...before };
});

const start = (): Promise<Record<string, unknown>> =>
  blenderSession(['start', '--mesh', join(root, 'm.glb'), '--blender', fake.exe]);
const usageOf = async (argv: string[]): Promise<Ts23dError> => {
  const e = await blenderSession(argv).catch((x: unknown) => x);
  expect(e).toBeInstanceOf(Ts23dError);
  expect((e as Ts23dError).code).toBe('T3D_CLI_USAGE');
  return e as Ts23dError;
};

describe('t3d blender session: usage first', () => {
  test('unknown commands and flags, missing values', async () => {
    expect((await usageOf(['frobnicate'])).message).toContain('unknown session command');
    expect((await usageOf(['status', '--mesh', 'x'])).message).toContain('unknown flag --mesh');
    expect((await usageOf(['start'])).message).toContain('needs --mesh');
    expect((await usageOf(['start', '--mesh'])).message).toContain('--mesh needs a value');
    expect((await usageOf(['run'])).message).toContain('needs a batch file');
    expect((await usageOf(['run', '/nonexistent.json'])).message).toContain('does not exist');
    expect((await usageOf(['finish'])).message).toContain('needs --out');
    expect((await usageOf(['start', '--mesh', 'm', '--idle', '0'])).message).toContain('--idle 0');
    expect((await usageOf(['status', 'extra'])).message).toContain('unexpected argument');
  });

  test('a batch file must hold steps', async () => {
    const bad = join(root, 'bad.json');
    writeFileSync(bad, '{ not json');
    expect((await usageOf(['run', bad])).message).toContain('is not JSON');
    writeFileSync(bad, '{"a":1}');
    expect((await usageOf(['run', bad])).message).toContain('holds no steps');
  });

  test('T3D_BLENDER_SCRIPTS is honoured, and a wrong value is named', async () => {
    process.env['T3D_BLENDER_SCRIPTS'] = '/nonexistent/scripts';
    const e = await start().catch((x: unknown) => x);
    expect(String(e)).toContain('/nonexistent/scripts');
  });

  test('a failure exits 1 with the envelope under --json', async () => {
    const lines: string[] = [];
    const log = spyOn(console, 'log').mockImplementation((l: string) => void lines.push(l));
    const err = spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(await blenderSessionMain(['status', '--json'], true)).toBe(1);
      expect(await blenderSessionMain(['nope'], false)).toBe(2);
    } finally {
      log.mockRestore();
      err.mockRestore();
    }
    expect(JSON.parse(lines[0] ?? '')).toMatchObject({
      ok: false,
      error: { code: 'T3D_NEURAL_FAILED' },
    });
  });
});

describe('t3d blender session', () => {
  test('through the real dispatcher: start, run, finish, stop', async () => {
    const out = join(root, 'out.json');
    const batch = join(root, 'batch.json');
    writeFileSync(batch, JSON.stringify([{ op: 'retopo', triangles: 900 }, { op: 'review' }]));
    const log = spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      expect(
        await run([
          'blender',
          'session',
          'start',
          '--mesh',
          join(root, 'm.glb'),
          '--blender',
          fake.exe,
        ]),
      ).toBe(0);
      expect(await run(['blender', 'session', 'run', batch])).toBe(0);
      expect(
        await run(['blender', 'session', 'finish', '--out', out, '--normal-size', '512']),
      ).toBe(0);
      expect(await run(['blender', 'session', 'stop'])).toBe(0);
    } finally {
      log.mockRestore();
    }
    const doc = JSON.parse(readFileSync(out, 'utf8')) as {
      steps: { op: string; normalSize?: number }[];
    };
    expect(doc.steps.map((s) => s.op)).toEqual(['retopo', 'export']);
    expect(doc.steps[1]?.normalSize).toBe(512);
    expect(existsSync(join(root, 's', 'default'))).toBe(false);
  });

  test('--name keeps sessions apart', async () => {
    await start();
    await blenderSession([
      'start',
      '--name',
      'b',
      '--mesh',
      join(root, 'm.glb'),
      '--blender',
      fake.exe,
    ]);
    expect(await blenderSession(['status', '--name', 'b'])).toMatchObject({ name: 'b', ok: true });
    await blenderSession(['stop', '--name', 'b']);
    expect(await blenderSession(['status'])).toMatchObject({ name: 'default' });
  });
});
