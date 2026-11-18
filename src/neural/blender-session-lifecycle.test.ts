// Who may start, who may be signalled, and paths: the session client on a fake Blender process.
import { afterEach, describe, expect, test } from 'bun:test';
import { type ChildProcess, spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import {
  blenderSessionStatus,
  runBlenderBatch,
  startBlenderSession,
  stopBlenderSession,
} from './blender-session.ts';
import { procStartTime, provenSession, sessionAlive } from './blender-session-process.ts';
import { encodeFrame, FrameReader, sessionRequest } from './blender-session-wire.ts';
import { type FakeTool, fakeBlenderSession, fakeTool } from './fake-tool.ts';

let roots: string[] = [];
let fakes: FakeTool[] = [];
let decoys: ChildProcess[] = [];
let live: { root: string; name?: string }[] = [];
const home = process.cwd();

const room = (): string => {
  const root = mkdtempSync(join(tmpdir(), 't3dl-'));
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
const decoy = (arg: string): ChildProcess => {
  const c = spawn('sh', ['-c', 'sleep 60', arg], { stdio: 'ignore' });
  decoys.push(c);
  return c;
};
const running = (c: ChildProcess): boolean => c.exitCode === null && c.signalCode === null;
const startedIn = async (root: string, name?: string) => {
  const at = { root: join(root, 's'), ...(name ? { name } : {}) };
  live.push(at);
  const info = await startBlenderSession({ ...at, exe: blender().exe, mesh: join(root, 'm.glb') });
  return { at, dir: String(info['dir']), pid: Number(info['pid']) };
};
const message = async (p: Promise<unknown>): Promise<string> =>
  String(
    await p.then(
      () => 'no error',
      (e: unknown) => e,
    ),
  );
const editMeta = (dir: string, change: Record<string, unknown>): void => {
  const file = join(dir, 'session.json');
  writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), ...change }));
};
const killAndWait = async (pid: number, dir: string): Promise<void> => {
  const meta = JSON.parse(readFileSync(join(dir, 'session.json'), 'utf8'));
  process.kill(pid, 'SIGKILL');
  while (await provenSession(meta)) await Bun.sleep(10);
};

afterEach(async () => {
  process.chdir(home);
  for (const at of live)
    await stopBlenderSession({ ...at, stopGraceMs: 300 }).catch(() => undefined);
  for (const c of decoys) c.kill('SIGKILL');
  for (const f of fakes) f.dispose();
  for (const r of roots) rmSync(r, { recursive: true, force: true });
  roots = [];
  fakes = [];
  decoys = [];
  live = [];
});

describe('starting: one name, one Blender', () => {
  test('two simultaneous starts: one wins, one Blender was launched, it works', async () => {
    const root = room();
    const at = { root: join(root, 's') };
    live.push(at);
    const f = blender();
    const go = () => startBlenderSession({ ...at, exe: f.exe, mesh: join(root, 'm.glb') });
    const both = await Promise.allSettled([go(), go()]);
    expect(both.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const lost = both.find((r) => r.status === 'rejected');
    expect(String(lost?.status === 'rejected' && lost.reason)).toContain(
      'being started or stopped',
    );
    expect(f.calls().filter((c) => c.includes('ts23d_job.py'))).toHaveLength(1);
    expect(await runBlenderBatch(at, [{ op: 'clean' }])).toMatchObject({ kept: ['clean'] });
  });

  test('a lock held by a live process refuses start and stop; a dead owner is taken over', async () => {
    const root = room();
    const at = { root: join(root, 's') };
    live.push(at);
    const go = () => startBlenderSession({ ...at, exe: blender().exe, mesh: join(root, 'm.glb') });
    await stopBlenderSession(at); // makes the root
    const lock = join(at.root, 'default.lock.5');
    const holder = decoy('holder');
    await Bun.sleep(20);
    const owner = { token: 'x', pid: holder.pid, startTime: await procStartTime(holder.pid ?? 0) };
    writeFileSync(lock, JSON.stringify(owner));
    expect(await message(go())).toContain('being started or stopped');
    expect(await message(stopBlenderSession(at))).toContain('being started or stopped');
    writeFileSync(lock, JSON.stringify({ ...owner, startTime: 'long-ago' })); // pid reused since
    expect(await go()).toMatchObject({ kept: [] });
    expect(existsSync(lock)).toBe(false); // superseded by generation 6, released after the start
    expect(JSON.parse(readFileSync(join(at.root, 'default.lock.6'), 'utf8')).released).toBe(true);
  });

  test('a start that times out kills its own child and frees the name', async () => {
    const root = room();
    const at = { root: join(root, 's') };
    live.push(at);
    const pidFile = join(root, 'pid');
    const hung = fakeTool(
      'blender',
      `case "$*" in *--version*) echo "Blender 5.3.0"; exit 0;; esac\necho $$ > '${pidFile}'\nexec sleep 60`,
    );
    fakes.push(hung);
    const mesh = join(root, 'm.glb');
    const e = await message(
      startBlenderSession({ ...at, exe: hung.exe, mesh, startTimeoutMs: 300 }),
    );
    expect(e).toContain('not ready within');
    const pid = Number(readFileSync(pidFile, 'utf8'));
    await Bun.sleep(100);
    const stat = existsSync(`/proc/${pid}/stat`)
      ? readFileSync(`/proc/${pid}/stat`, 'utf8')
      : ') Z';
    expect(stat.slice(stat.lastIndexOf(')') + 2, stat.lastIndexOf(')') + 3)).toBe('Z'); // dead
    expect(await startBlenderSession({ ...at, exe: blender().exe, mesh })).toMatchObject({
      kept: [],
    });
  });
});

describe('signals: only to the proven Blender of this session', () => {
  test('a reused pid whose command line merely names the directory is left alone', async () => {
    const { at, dir, pid } = await startedIn(room());
    await killAndWait(pid, dir);
    const other = decoy(join(dir, 'job.json'));
    await Bun.sleep(20);
    editMeta(dir, { pid: other.pid });
    expect(await message(blenderSessionStatus(at))).toContain('died');
    expect(await stopBlenderSession(at)).toMatchObject({ stopped: 'not running' });
    await Bun.sleep(50);
    expect(running(other)).toBe(true);
  });

  test("session 'a' never touches the Blender of session 'a2'", async () => {
    const root = room();
    const a = await startedIn(root, 'a');
    const a2 = await startedIn(root, 'a2');
    await killAndWait(a.pid, a.dir);
    editMeta(a.dir, { pid: a2.pid });
    expect(await stopBlenderSession({ ...a.at, stopGraceMs: 200 })).toMatchObject({
      stopped: 'not running',
    });
    expect(await blenderSessionStatus(a2.at)).toMatchObject({ ok: true, name: 'a2' });
  });

  test('a hung Blender that is proven ours is ended by signal', async () => {
    const { at, dir, pid } = await startedIn(room());
    process.kill(pid, 'SIGSTOP');
    expect(await stopBlenderSession({ ...at, stopGraceMs: 200 })).toMatchObject({
      stopped: 'killed',
    });
    expect(existsSync(dir)).toBe(false);
  });

  test('identity needs the start time, the exact job argument, and a socket token off Linux', async () => {
    const { dir } = await startedIn(room());
    const meta = JSON.parse(readFileSync(join(dir, 'session.json'), 'utf8'));
    expect(await provenSession(meta)).toBe(true);
    expect(await provenSession({ ...meta, startTime: '1' })).toBe(false);
    expect(await provenSession({ ...meta, job: `${meta.job}x` })).toBe(false);
    expect(await provenSession(meta, '/nonexistent')).toBe(false);
    expect(await sessionAlive(meta, dir, '/nonexistent')).toBe(true);
    expect(await sessionAlive({ ...meta, token: 'other' }, dir, '/nonexistent')).toBe(false);
  });
});

describe('relative paths', () => {
  test('root, mesh, scripts and Blender given relative to the caller all work', async () => {
    const root = room();
    const f = blender();
    const scripts = relative(root, join(home, 'examples/blender'));
    process.chdir(root);
    const at = { root: 'sessions' };
    live.push({ root: join(root, 'sessions') });
    const info = await startBlenderSession({
      ...at,
      mesh: 'm.glb',
      exe: relative(root, f.exe),
      scriptsDir: scripts,
    });
    expect(String(info['dir'])).toBe(join(root, 'sessions', 'default'));
    const meta = JSON.parse(readFileSync(join(root, 'sessions/default/session.json'), 'utf8'));
    expect(meta.mesh).toBe(join(root, 'm.glb'));
    expect(meta.scripts).toBe(join(home, 'examples/blender'));
    expect(await blenderSessionStatus(at)).toMatchObject({ ok: true });
  });
});

describe('frames', () => {
  test('a frame split anywhere arrives whole, into one buffer of its own size', () => {
    const value = { text: 'x'.repeat(1000) };
    const bytes = encodeFrame(value);
    for (const cut of [1, 3, 4, 5, 500]) {
      const r = new FrameReader();
      expect(r.push(bytes.subarray(0, cut))).toBeUndefined();
      expect(r.push(bytes.subarray(cut))).toEqual(value);
    }
  });

  test('32 MiB in 4 KiB chunks is linear', () => {
    const bytes = encodeFrame({ text: 'y'.repeat(32 * 1024 * 1024) });
    const r = new FrameReader();
    let out: unknown;
    const t0 = performance.now();
    for (let at = 0; at < bytes.length; at += 4096) out = r.push(bytes.subarray(at, at + 4096));
    expect(performance.now() - t0).toBeLessThan(2000); // recopying would move 128 GiB
    expect((out as { text: string }).text.length).toBe(32 * 1024 * 1024);
  });

  test('an oversized or broken reply rejects the request instead of throwing in a callback', async () => {
    const dir = room();
    const sock = join(dir, 'x');
    const huge = new Uint8Array(4);
    new DataView(huge.buffer).setUint32(0, 0xffffffff);
    let reply = huge;
    const server = createServer((c) => c.write(reply));
    await new Promise<void>((r) => server.listen(sock, r));
    expect(await message(sessionRequest(sock, {}, 1000))).toContain('over the limit');
    reply = new Uint8Array([0, 0, 0, 1, 123]);
    expect(await message(sessionRequest(sock, {}, 1000))).toContain('not JSON');
    server.close();
  });
});
