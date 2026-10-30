// Keep the local check aligned with CI verification and contact-sheet rendering.

import { expect, it } from 'bun:test';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { STEPS } from './verify.ts';

it('ci.yml runs the full local gate', async () => {
  const ci = await Bun.file('.github/workflows/ci.yml').text();
  expect(ci).toContain('bun run verify');
  expect(ci).not.toMatch(/bun run verify --only/);
});

it('every package.json gate script is a verify step', async () => {
  const pkg = (await Bun.file('package.json').json()) as { scripts: Record<string, string> };
  for (const s of [
    'lint',
    'typecheck',
    'boundaries',
    'determinism',
    'filesize',
    'test',
    'recipes',
    'build',
  ]) {
    expect(pkg.scripts[s]).toBeDefined();
    expect(STEPS.map((x) => x.name)).toContain(s as (typeof STEPS)[number]['name']);
  }
});

it.each([
  { name: 'runs verify before shots', verify: 0, shots: 0, expected: 0 },
  { name: 'stops when verify fails', verify: 23, shots: 0, expected: 23 },
  { name: 'propagates a shots failure', verify: 0, shots: 42, expected: 42 },
])('bin/check $name', ({ verify, shots, expected }) => {
  const root = resolve(import.meta.dir, '..');
  const fixture = mkdtempSync(join(tmpdir(), 'ts23d-ci-parity-'));
  try {
    const log = join(fixture, 'calls');
    const mise = join(fixture, 'mise');
    writeFileSync(
      mise,
      `#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$PWD" "$*" >> "$CHECK_LOG"
case "$*" in
  *' -- bun run verify') exit "$VERIFY_EXIT" ;;
  *' -- bun run shots') exit "$SHOTS_EXIT" ;;
  *) exit 99 ;;
esac
`,
    );
    chmodSync(mise, 0o755);
    const result = Bun.spawnSync(['bash', join(root, 'bin/check')], {
      cwd: fixture,
      env: {
        ...process.env,
        PATH: `${fixture}:${process.env['PATH'] ?? ''}`,
        CHECK_LOG: log,
        VERIFY_EXIT: String(verify),
        SHOTS_EXIT: String(shots),
      },
    });
    expect(result.stderr.toString()).toBe('');
    expect(result.exitCode).toBe(expected);
    const pin = readFileSync(join(root, '.bun-version'), 'utf8').trim();
    const calls = [root, `exec bun@${pin} -- bun run verify`];
    if (verify === 0) calls.push(root, `exec bun@${pin} -- bun run shots`);
    expect(readFileSync(log, 'utf8').trim().split('\n')).toEqual(calls);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

// No installation, real gate, network port or shared checkout state in these fixtures.
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'ts23d-wrappers-'));
  await mkdir(join(root, 'bin'));
  await mkdir(join(root, 'tools'));
  for (const name of ['setup', 'check', 'dev', 'stop']) {
    await writeFile(join(root, 'bin', name), await Bun.file(`bin/${name}`).text());
  }
  await writeFile(join(root, '.bun-version'), '9.8.7\n');
  const fake = join(root, 'tools', 'mise');
  await writeFile(
    fake,
    `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync('calls', JSON.stringify(args) + '\\n');
if (args[0] === 'install') process.exit(Number(process.env.INSTALL_EXIT || 0));
if (args.at(-1) !== 'site:dev') process.exit(Number(process.env.RUN_EXIT || 0));
if (process.env.FAIL_START) process.exit(23);
const child = Bun.spawn([process.execPath, '-e',
  "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"],
  { stdout: 'ignore', stderr: 'ignore' });
fs.writeFileSync('server-pids', process.pid + ' ' + child.pid);
setInterval(() => {}, 1000);
`,
  );
  await chmod(fake, 0o755);
  const processes: ReturnType<typeof Bun.spawn>[] = [];
  const run = (name: string, env: Record<string, string> = {}) => {
    const child = Bun.spawn(['bash', `bin/${name}`], {
      cwd: root,
      env: { ...process.env, PATH: `${join(root, 'tools')}:${process.env['PATH'] ?? ''}`, ...env },
      stdout: 'ignore',
      stderr: 'pipe',
    });
    processes.push(child);
    return child;
  };
  const pids = async () =>
    (await readFile(join(root, 'server-pids'), 'utf8')).split(' ').map(Number);
  return {
    root,
    run,
    pids,
    async dispose() {
      await finished(run('stop'));
      for (const child of processes) {
        if (child.exitCode === null) child.kill('SIGTERM');
        await finished(child);
      }
      await rm(root, { recursive: true, force: true });
    },
  };
}

async function eventually(check: () => Promise<boolean>) {
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await Bun.sleep(20);
  }
  throw new Error('wrapper fixture timed out');
}

async function finished(child: ReturnType<typeof Bun.spawn>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      child.exited,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('wrapper did not exit')), 4500);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function alive(pid: number) {
  try {
    const stat = await readFile(`/proc/${pid}/stat`, 'utf8');
    return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[0] !== 'Z';
  } catch {
    return false;
  }
}

async function ready(f: Awaited<ReturnType<typeof fixture>>) {
  await eventually(async () => Bun.file(join(f.root, 'server-pids')).exists());
  return f.pids();
}

it('setup and check forward the Bun pin and propagate failures without running real gates', async () => {
  const f = await fixture();
  try {
    expect(await finished(f.run('setup'))).toBe(0);
    expect(await finished(f.run('check', { RUN_EXIT: '17' }))).toBe(17);
    expect(await finished(f.run('setup', { RUN_EXIT: '19' }))).toBe(19);
    expect(await finished(f.run('setup', { INSTALL_EXIT: '21' }))).toBe(21);
    const calls = (await readFile(join(f.root, 'calls'), 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as string[]);
    expect(calls).toEqual([
      ['install', 'bun@9.8.7'],
      ['exec', 'bun@9.8.7', '--', 'bun', 'run', 'setup'],
      ['exec', 'bun@9.8.7', '--', 'bun', 'run', 'verify'],
      ['install', 'bun@9.8.7'],
      ['exec', 'bun@9.8.7', '--', 'bun', 'run', 'setup'],
      ['install', 'bun@9.8.7'],
    ]);
  } finally {
    await f.dispose();
  }
});

it('dev rejects duplicates; stop removes the server and TERM-resistant descendant idempotently', async () => {
  const f = await fixture();
  try {
    const dev = f.run('dev');
    const pids = await ready(f);
    expect(await finished(f.run('dev'))).toBe(1);
    expect(await finished(f.run('stop'))).toBe(0);
    expect(await finished(dev)).toBe(143);
    await eventually(async () => (await Promise.all(pids.map(alive))).every((x) => !x));
    expect(await finished(f.run('stop'))).toBe(0);
    expect(await Bun.file(join(f.root, 'tmp/dev-session/owner')).exists()).toBe(false);
    const calls = await readFile(join(f.root, 'calls'), 'utf8');
    expect(JSON.parse(calls.trim())).toEqual(['exec', 'bun@9.8.7', '--', 'bun', 'run', 'site:dev']);
  } finally {
    await f.dispose();
  }
});

it('startup failure propagates and releases the managed session', async () => {
  const f = await fixture();
  try {
    expect(await finished(f.run('dev', { FAIL_START: '1' }))).toBe(23);
    expect(await Bun.file(join(f.root, 'tmp/dev-session/owner')).exists()).toBe(false);
    const dev = f.run('dev');
    const pids = await ready(f);
    dev.kill('SIGTERM');
    expect(await finished(dev)).toBe(143);
    await eventually(async () => (await Promise.all(pids.map(alive))).every((x) => !x));
  } finally {
    await f.dispose();
  }
});

it('signals clean up descendants and state', async () => {
  const f = await fixture();
  try {
    const dev = f.run('dev');
    const pids = await ready(f);
    dev.kill('SIGINT');
    expect(await finished(dev)).toBe(130);
    await eventually(async () => (await Promise.all(pids.map(alive))).every((x) => !x));
    expect(await Bun.file(join(f.root, 'tmp/dev-session/owner')).exists()).toBe(false);
  } finally {
    await f.dispose();
  }
});

it('stale identities never signal unrelated live PIDs, and allow a new start', async () => {
  const f = await fixture();
  try {
    const boot = (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim();
    await mkdir(join(f.root, 'tmp/dev-session'), { recursive: true });
    // An existing PID with a different birth time is not our process.
    await writeFile(
      join(f.root, 'tmp/dev-session/owner'),
      `${process.pid} 0 ${process.pid} 0 ${boot}\n`,
    );
    expect(await finished(f.run('stop'))).toBe(0);
    expect(await alive(process.pid)).toBe(true);
    await mkdir(join(f.root, 'tmp/dev-session'), { recursive: true });
    await writeFile(
      join(f.root, 'tmp/dev-session/owner'),
      `${process.pid} 0 ${process.pid} 0 ${boot}\n`,
    );
    const dev = f.run('dev');
    const pids = await ready(f);
    expect(await finished(f.run('stop'))).toBe(0);
    await finished(dev);
    await eventually(async () => (await Promise.all(pids.map(alive))).every((x) => !x));
  } finally {
    await f.dispose();
  }
});
