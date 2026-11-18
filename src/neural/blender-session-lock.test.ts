// The session name lock under contention, and how long waiting for a hung session may take.
import { afterEach, describe, expect, test } from 'bun:test';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startBlenderSession, stopBlenderSession } from './blender-session.ts';
import {
  endSession,
  procStartTime,
  takeSessionLock,
  waitForExit,
} from './blender-session-process.ts';
import { type FakeTool, fakeBlenderSession } from './fake-tool.ts';

let roots: string[] = [];
let fakes: FakeTool[] = [];
let live: { root: string }[] = [];
const home = process.cwd();

const room = (): string => {
  const root = mkdtempSync(join(tmpdir(), 't3dk-'));
  chmodSync(root, 0o700);
  roots.push(root);
  writeFileSync(join(root, 'm.glb'), 'mesh');
  return root;
};
const startedIn = async (root: string) => {
  const at = { root: join(root, 's') };
  live.push(at);
  const f = fakeBlenderSession();
  fakes.push(f);
  const info = await startBlenderSession({ ...at, exe: f.exe, mesh: join(root, 'm.glb') });
  return { at, dir: String(info['dir']) };
};
const message = async (p: Promise<unknown>): Promise<string> =>
  String(
    await p.then(
      () => 'no error',
      (e: unknown) => e,
    ),
  );

afterEach(async () => {
  for (const at of live)
    await stopBlenderSession({ ...at, stopGraceMs: 300 }).catch(() => undefined);
  for (const f of fakes) f.dispose();
  for (const r of roots) rmSync(r, { recursive: true, force: true });
  roots = [];
  fakes = [];
  live = [];
});

const DEAD = { token: 'dead', pid: process.pid, startTime: 'long-ago' };
const gate = () => {
  let open: () => void = () => undefined;
  let arrived: () => void = () => undefined;
  const opened = new Promise<void>((r) => {
    open = r;
  });
  const reached = new Promise<void>((r) => {
    arrived = r;
  });
  return {
    open,
    reached,
    pause: (): Promise<void> => {
      arrived();
      return opened;
    },
  };
};
const lockRoom = (): { dir: string; root: string } => {
  const root = join(room(), 's');
  mkdirSync(root, { mode: 0o700 });
  return { root, dir: join(root, 'n') };
};

describe('the name lock under contention', () => {
  test('a delayed contender cannot take or disturb a new live owner; a third is refused', async () => {
    const { dir } = lockRoom();
    writeFileSync(`${dir}.lock.1`, JSON.stringify(DEAD));
    const g = gate();
    const late = takeSessionLock(dir, 'n', g.pause);
    await g.reached; // it has judged generation 1 dead, and now stalls
    const owner = await takeSessionLock(dir, 'n');
    expect(await message(takeSessionLock(dir, 'n'))).toContain('being started or stopped');
    g.open();
    expect(await message(late)).toContain('being started or stopped');
    expect(await owner.holds()).toBe(true);
    await owner.release();
    expect(await owner.holds()).toBe(true); // released, still the top of the chain
    const next = await takeSessionLock(dir, 'n');
    expect(await next.holds()).toBe(true);
    expect(await owner.holds()).toBe(false);
    await owner.release(); // a late release must not free the new owner's generation
    expect(await message(takeSessionLock(dir, 'n'))).toContain('being started or stopped');
    await next.release();
  });

  test('a contender delayed across several generations does not fork the chain', async () => {
    const { dir } = lockRoom();
    writeFileSync(`${dir}.lock.1`, JSON.stringify(DEAD));
    const g = gate();
    const late = takeSessionLock(dir, 'n', g.pause);
    await g.reached;
    for (let i = 0; i < 3; i++) await (await takeSessionLock(dir, 'n')).release();
    const owner = await takeSessionLock(dir, 'n'); // generation 2 is long tidied away
    g.open();
    expect(await message(late)).toContain('being started or stopped');
    expect(await owner.holds()).toBe(true);
  });

  test('real processes racing, some dying with the lock: never two holders', async () => {
    const { root, dir } = lockRoom();
    writeFileSync(`${dir}.lock.1`, JSON.stringify(DEAD));
    const script = join(root, '..', 'contender.ts');
    const module = join(home, 'src/neural/blender-session-process.ts');
    writeFileSync(
      script,
      `import { appendFileSync, openSync, closeSync, rmSync } from 'node:fs';
import { takeSessionLock } from '${module}';
const [dir, role] = process.argv.slice(2);
const held = dir + '.held';
for (;;) {
  let lock;
  try { lock = await takeSessionLock(dir, 'n'); }
  catch (e) { if (String(e).includes('being started')) { await Bun.sleep(5); continue; } throw e; }
  try { closeSync(openSync(held, 'wx')); } catch { appendFileSync(dir + '.log', 'OVERLAP\\n'); }
  await Bun.sleep(15);
  if (!(await lock.holds())) appendFileSync(dir + '.log', 'LOST\\n');
  rmSync(held, { force: true });
  appendFileSync(dir + '.log', 'done ' + role + '\\n');
  if (role === 'dies') process.kill(process.pid, 'SIGKILL');
  await lock.release();
  process.exit(0);
}
`,
    );
    const roles = ['lives', 'dies', 'lives', 'dies', 'lives', 'lives', 'dies', 'lives'];
    const procs = roles.map((role) =>
      Bun.spawn([process.execPath, script, dir, role], { stdout: 'ignore', stderr: 'inherit' }),
    );
    await Promise.all(procs.map((p) => p.exited));
    const log = readFileSync(`${dir}.log`, 'utf8').trim().split('\n');
    expect(log.filter((l) => !l.startsWith('done'))).toEqual([]);
    expect(log).toHaveLength(roles.length);
  }, 20_000);

  test('stop deletes nothing once it no longer holds the name', async () => {
    const { at, dir } = await startedIn(room());
    const stopping = stopBlenderSession({ ...at, stopGraceMs: 2_000 });
    while (!existsSync(join(at.root, 'default.lock.2'))) await Bun.sleep(1); // stop holds it now
    const startTime = await procStartTime(process.pid);
    const other = { token: 'other', pid: process.pid, startTime };
    writeFileSync(join(at.root, 'default.lock.3'), JSON.stringify(other));
    expect(await message(stopping)).toContain('lost the lock');
    expect(existsSync(dir)).toBe(true);
    rmSync(join(at.root, 'default.lock.3'));
  });
});

describe('waiting for a hung session without /proc', () => {
  /** Runs `check` against a socket that never answers, and always closes it. */
  const withHungSession = async (check: (dir: string) => Promise<void>): Promise<void> => {
    const dir = room();
    const server = createServer(() => undefined);
    await new Promise<void>((r) => server.listen(join(dir, 'sock'), r));
    try {
      await check(dir);
    } finally {
      server.close();
    }
  };
  const id = { pid: process.pid, token: 't', job: 'j' };

  test('the grace is a deadline, however slow each probe is', async () => {
    await withHungSession(async (dir) => {
      const t0 = performance.now();
      expect(await waitForExit(id, dir, 300, '/nonexistent')).toBe(false);
      const took = performance.now() - t0;
      expect(took).toBeGreaterThanOrEqual(250);
      expect(took).toBeLessThan(900); // six full probes would take six seconds
    });
  });

  test('a session that cannot be proven is reported, not signalled', async () => {
    await withHungSession(async (dir) => {
      const t0 = performance.now();
      expect(await message(endSession(id, dir, 200, '/nonexistent'))).toContain('cannot be proven');
      expect(performance.now() - t0).toBeLessThan(1500);
    });
  });
});
