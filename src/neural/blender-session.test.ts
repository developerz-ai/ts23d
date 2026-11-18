// The session client against a fake Blender process on a real Unix socket: never the real Blender.
import { afterEach, describe, expect, test } from 'bun:test';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  blenderSessionStatus,
  finishBlenderSession,
  runBlenderBatch,
  SESSION_REPLAY_NOTE,
  startBlenderSession,
  stopBlenderSession,
  undoBlenderBatch,
} from './blender-session.ts';
import { isSessionProcess } from './blender-session-start.ts';
import { decodeFrame, encodeFrame } from './blender-session-wire.ts';
import { type BlenderStep, blenderProgram } from './blender-steps.ts';
import { type FakeTool, fakeBlenderSession, fakeTool } from './fake-tool.ts';

const RETOPO: BlenderStep = { op: 'retopo', triangles: 900 };
const UV: BlenderStep = { op: 'uv' };
const fail = (why: string): BlenderStep => ({ op: 'script', python: 'pass', why });

let roots: string[] = [];
let fakes: FakeTool[] = [];
let live: { root: string; name?: string }[] = [];

const room = (): string => {
  const root = mkdtempSync(join(tmpdir(), 't3ds-'));
  chmodSync(root, 0o700);
  roots.push(root);
  writeFileSync(join(root, 'm.glb'), 'mesh');
  return root;
};
const blender = (): FakeTool => {
  const f = fakeBlenderSession();
  fakes.push(f);
  return f;
};
async function started(name?: string) {
  const root = room();
  const at = { root: join(root, 's'), ...(name ? { name } : {}) };
  live.push(at);
  const info = await startBlenderSession({ ...at, exe: blender().exe, mesh: join(root, 'm.glb') });
  return { root, at, info, dir: String(info['dir']), pid: Number(info['pid']) };
}
const error = async (p: Promise<unknown>): Promise<{ message: string; fix: string }> => {
  const e = await p.then(
    () => undefined,
    (x: unknown) => x,
  );
  expect(String(e)).toContain('T3D_');
  return e as { message: string; fix: string };
};

afterEach(async () => {
  for (const at of live) await stopBlenderSession(at).catch(() => undefined);
  for (const f of fakes) f.dispose();
  for (const r of roots) rmSync(r, { recursive: true, force: true });
  roots = [];
  fakes = [];
  live = [];
});

describe('Blender session: failures first', () => {
  test('frames: a partial frame waits, an oversized one is refused', () => {
    const frame = encodeFrame({ a: 1 });
    expect(decodeFrame(frame.subarray(0, 5))).toBeUndefined();
    expect(decodeFrame(frame)).toEqual({ a: 1 });
    const huge = new Uint8Array(4);
    new DataView(huge.buffer).setUint32(0, 0xffffffff);
    expect(() => decodeFrame(huge)).toThrow(/over the limit/);
  });

  test('a command without a session says how to start one', async () => {
    const at = { root: join(room(), 's') };
    for (const command of [blenderSessionStatus, undoBlenderBatch]) {
      const e = await error(command(at));
      expect(e.message).toContain("no Blender session 'default'");
      expect(e.fix).toContain('session start');
    }
    expect((await error(finishBlenderSession({ ...at, out: '/tmp/x.json' }))).fix).toContain(
      'start',
    );
    expect(await stopBlenderSession(at)).toMatchObject({ stopped: 'not running', removed: false });
  });

  test('bad names, loose directories and over-long socket paths are refused', async () => {
    const root = room();
    const mesh = join(root, 'm.glb');
    const exe = blender().exe;
    expect((await error(startBlenderSession({ root, name: '../x', exe, mesh }))).message).toContain(
      'is not a session name',
    );
    const loose = join(root, 'loose');
    mkdirSync(loose, { mode: 0o777 });
    chmodSync(loose, 0o777);
    expect((await error(startBlenderSession({ root: loose, exe, mesh }))).fix).toContain(
      'chmod 700',
    );
    const deep = join(root, 'd'.repeat(120));
    expect((await error(startBlenderSession({ root: deep, exe, mesh }))).message).toContain(
      '107 bytes',
    );
  });

  test('no Blender, no mesh, a Blender that dies while starting', async () => {
    const root = room();
    const at = { root: join(root, 's') };
    const mesh = join(root, 'm.glb');
    const none = await error(startBlenderSession({ ...at, exe: '/nonexistent/blender', mesh }));
    expect(none.fix).toContain('t3d setup tools');
    const exe = blender().exe;
    expect(
      (await error(startBlenderSession({ ...at, exe, mesh: '/nonexistent.glb' }))).message,
    ).toContain('does not exist');
    const dies = fakeTool(
      'blender',
      'case "$*" in *--version*) echo "Blender 5.3.0"; exit 0;; esac\necho "cannot load the mesh" >&2\nexit 3',
    );
    fakes.push(dies);
    const e = await error(startBlenderSession({ ...at, exe: dies.exe, mesh }));
    expect(e.message).toContain('did not start (exited 3)');
    expect(e.message).toContain('cannot load the mesh');
  });

  test('scripts that are not there are named before anything starts', async () => {
    const root = room();
    const e = await error(
      startBlenderSession({
        root: join(root, 's'),
        exe: blender().exe,
        mesh: join(root, 'm.glb'),
        scriptsDir: '/nonexistent/scripts',
      }),
    );
    expect(e.message).toContain('/nonexistent/scripts');
  });

  test('a batch is checked with the kept steps, before Blender sees it', async () => {
    const { at } = await started();
    expect((await error(runBlenderBatch(at, []))).message).toContain('no steps');
    expect((await error(runBlenderBatch(at, [{ op: 'export' }]))).fix).toContain('session finish');
    expect((await error(runBlenderBatch(at, [{ op: 'metaballs' }]))).message).toContain('--mesh');
    expect((await error(runBlenderBatch(at, [{ op: 'nope' }]))).message).toContain(
      "unknown op 'nope'",
    );
    await runBlenderBatch(at, [RETOPO, UV]);
    const twice = await error(runBlenderBatch(at, [UV]));
    expect(twice.message).toContain("'uv' appears twice");
    expect(twice.message).toContain('kept steps');
    const late = await error(
      runBlenderBatch(at, [
        { op: 'stroke', brush: 'draw', path: [[0, 0, 0]], radius: 1, strength: 1 },
      ]),
    );
    expect(late.message).toContain("comes after 'uv'");
  });

  test('a failed step: its index, its fix, and the session goes on', async () => {
    const { at } = await started();
    await runBlenderBatch(at, [RETOPO]);
    const e = await error(runBlenderBatch(at, [UV, fail('boom')]));
    expect(e.message).toContain('batch step 1 (script)');
    expect(e.message).toContain('back where it was');
    expect(e.fix).toBe('do not break it');
    expect(await blenderSessionStatus(at)).toMatchObject({ kept: ['retopo'], busy: false });
  });

  test('a batch checked against an old revision is refused', async () => {
    const { at, dir } = await started();
    const kept = JSON.parse(readFileSync(join(dir, 'kept.json'), 'utf8')) as object;
    writeFileSync(join(dir, 'kept.json'), JSON.stringify({ ...kept, revision: 41 }));
    expect((await error(runBlenderBatch(at, [RETOPO]))).fix).toContain('run it again');
  });

  test('a dead Blender is detected, its socket cleaned, its kept steps still usable', async () => {
    const { root, at, dir, pid } = await started();
    await runBlenderBatch(at, [RETOPO]);
    writeFileSync(join(dir, 'checkpoint-1.blend'), 'large');
    const crash = await error(runBlenderBatch(at, [fail('crash')]));
    expect(crash.message).toContain('died while running script');
    expect(crash.fix).toContain('finish --out');
    expect(await isSessionProcess(pid, dir)).toBe(false);
    expect(existsSync(join(dir, 'sock'))).toBe(false);
    expect(existsSync(join(dir, 'checkpoint-1.blend'))).toBe(false);
    expect((await error(blenderSessionStatus(at))).message).toContain('died');
    const out = join(root, 'p.json');
    expect(await finishBlenderSession({ ...at, out })).toMatchObject({ steps: ['retopo'] });
    expect(readFileSync(out).equals(blenderProgram([RETOPO, { op: 'export' }]))).toBe(true);
  });

  test('a crash during a review points at the graphics driver', async () => {
    const { at } = await started();
    const e = await error(runBlenderBatch(at, [{ op: 'review', views: ['clay'], size: 77 }]));
    expect(e.message).toContain('died while running review');
    expect(e.fix).toContain('mesa-vulkan-drivers');
    expect(e.fix).toContain('finish --out');
  });

  test('the same name cannot start twice', async () => {
    const { root, at } = await started();
    const e = await error(
      startBlenderSession({ ...at, exe: blender().exe, mesh: join(root, 'm.glb') }),
    );
    expect(e.message).toContain('already running');
    expect(e.fix).toContain('session stop');
  });
});

describe('Blender session: the loop', () => {
  test('start, batches, review, undo, finish, stop', async () => {
    const { root, at, dir, pid } = await started('work');
    expect(statSync(dir).mode & 0o777).toBe(0o700);
    expect(statSync(at.root).mode & 0o777).toBe(0o700);
    const first = await runBlenderBatch(at, [{ op: 'clean' }, RETOPO]);
    expect(first).toMatchObject({ ok: true, kept: ['clean', 'retopo'] });
    const look = await runBlenderBatch(at, [{ op: 'review', views: ['clay'] }]);
    const sheet = (look['reviews'] as { file: string }[])[0]?.file ?? '';
    expect(sheet.startsWith(dir)).toBe(true);
    expect(existsSync(sheet)).toBe(true);
    expect(look['kept']).toEqual(['clean', 'retopo']); // a look changes nothing
    await runBlenderBatch(at, [UV]);
    expect(await undoBlenderBatch(at)).toMatchObject({ kept: ['clean', 'retopo'] });
    const out = join(root, 'deep', 'program.json');
    const done = await finishBlenderSession({ ...at, out, export: { normalSize: 512 } });
    const want = blenderProgram([{ op: 'clean' }, RETOPO, { op: 'export', normalSize: 512 }]);
    expect(readFileSync(out).equals(want)).toBe(true);
    expect(done).toMatchObject({ note: SESSION_REPLAY_NOTE, steps: ['clean', 'retopo'] });
    expect(SESSION_REPLAY_NOTE).toContain('t3d neural run');
    expect(await stopBlenderSession(at)).toMatchObject({ stopped: 'stopped', removed: true });
    expect(existsSync(dir)).toBe(false);
    expect(await isSessionProcess(pid, dir)).toBe(false);
  });

  test('a stopped session can start again under its name', async () => {
    const { root, at } = await started();
    await stopBlenderSession(at);
    const again = await startBlenderSession({
      ...at,
      exe: blender().exe,
      mesh: join(root, 'm.glb'),
    });
    expect(again['kept']).toEqual([]);
  });
});
