// Keep the local check aligned with CI verification and contact-sheet rendering.

import { expect, it } from 'bun:test';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { alive, eventually, finished, fixture, ready } from './lib/wrapper-fixture.ts';
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

it('concurrent stale starts publish exactly one owner and launch one server', async () => {
  const f = await fixture();
  try {
    const boot = (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim();
    await mkdir(join(f.root, 'tmp/dev-session'), { recursive: true });
    await writeFile(join(f.root, 'tmp/dev-session/owner'), `999999 0 0 0 ${boot}\n`);
    // Delay each reclaimer differently after validation, exposing the old unlink race.
    await writeFile(
      join(f.root, 'tools/rm'),
      '#!/usr/bin/env bash\nif mkdir reclaim-first 2>/dev/null; then sleep 0.1; else sleep 0.3; fi\nexec /bin/rm "$@"\n',
      { mode: 0o755 },
    );
    const starts = [f.run('dev'), f.run('dev')];
    await ready(f);
    await eventually(async () => starts.some((child) => child.exitCode !== null));
    expect(starts.filter((child) => child.exitCode === 1)).toHaveLength(1);
    expect((await readFile(join(f.root, 'calls'), 'utf8')).trim().split('\n')).toHaveLength(1);
    const owner = (await readFile(join(f.root, 'tmp/dev-session/owner'), 'utf8')).split(' ')[0];
    expect(starts.find((child) => child.exitCode === null)?.pid).toBe(Number(owner));
  } finally {
    await f.dispose();
  }
});

it('status publication stays atomic even when printf is delayed after opening its file', async () => {
  const f = await fixture();
  try {
    const env = join(f.root, 'slow-printf');
    await writeFile(
      env,
      'printf() { case "$(readlink /proc/$$/fd/1)" in *dev-session/result*) sleep 0.2 ;; esac; builtin printf "$@"; }\n',
    );
    expect(await finished(f.run('dev', { FAIL_START: '1', BASH_ENV: env }))).toBe(23);
  } finally {
    await f.dispose();
  }
});

it('forced disposal kills the group even when stop hangs', async () => {
  const f = await fixture();
  const dev = f.run('dev');
  const pids = await ready(f);
  await writeFile(join(f.root, 'bin/stop'), 'while :; do :; done\n');
  await expect(f.dispose()).rejects.toThrow('wrapper did not exit');
  expect(await finished(dev)).not.toBeNull();
  await eventually(async () => (await Promise.all(pids.map(alive))).every((x) => !x));
}, 10000);

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
