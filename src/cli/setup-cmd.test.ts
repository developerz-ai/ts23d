import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Ts23dError } from '../core/index.ts';
import type { ToolProc } from '../neural/index.ts';
import { setup, setupMain } from './setup-cmd.ts';
import { type LineRunner, parseProgress } from './setup-progress.ts';
import { type Host, realHost, serverDir } from './tier-probe.ts';

const ok = (stdout: string): ToolProc => ({
  code: 0,
  stdout,
  stderr: '',
  timedOut: false,
  missing: false,
});
const MISSING: ToolProc = { code: null, stdout: '', stderr: '', timedOut: false, missing: true };

function host(cmds: Record<string, string>, platform: NodeJS.Platform = 'linux'): Host {
  const real = realHost();
  return {
    ...real,
    env: { ...process.env, TS23D_HOME: mkdtempSync(join(tmpdir(), 't3d-setup-')) },
    platform,
    exec: (exe, args) => {
      const out = cmds[`${exe} ${args[0] ?? ''}`.trim()];
      return Promise.resolve(out === undefined ? MISSING : ok(out));
    },
  };
}
const GPU6 = {
  'nvidia-smi --query-gpu=name,memory.total,driver_version': 'GTX 1060 6GB, 6144, 560.35.03',
};
const GPU24 = {
  'nvidia-smi --query-gpu=name,memory.total,driver_version': 'RTX 3090, 24576, 615.71.09',
};
const UV = { 'uv --version': 'uv 0.13.8' };

const PLAN = `@t3d ${JSON.stringify({
  event: 'plan',
  profile: 'tools',
  home: '/h',
  log: '/h/logs/setup-tools.log',
  steps: [
    {
      id: 'gltfpack',
      kind: 'download',
      title: 'gltfpack',
      done: false,
      optional: false,
      cmds: ['download x'],
    },
  ],
  gated: [],
  notes: [],
})}`;

/** Records the command it was given and replays `lines`. */
const replay = (lines: string[], code = 0): { run: LineRunner; cmds: string[][] } => {
  const cmds: string[][] = [];
  return {
    cmds,
    run: (cmd, _env, onLine) => {
      cmds.push([...cmd]);
      for (const l of lines) onLine(l);
      return Promise.resolve(code);
    },
  };
};

const cwd = (): string => mkdtempSync(join(tmpdir(), 't3d-proj-'));

describe('t3d setup', () => {
  test('a 6 GB card: gpu-full is refused with the reason, before anything runs', async () => {
    const r = replay([]);
    const e = await setup(
      'gpu-full',
      { dryRun: true, cwd: cwd(), run: r.run },
      host({ ...GPU6, ...UV }),
    ).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(Ts23dError);
    expect((e as Ts23dError).message).toContain(
      'needs ≥ 24 GB of VRAM; nvidia-smi reports GTX 1060 6GB with 6.0 GB',
    );
    expect((e as Ts23dError).fix).toContain('kubeez');
    expect(r.cmds).toEqual([]);
  });

  test('macOS / Windows: refused with the plan named', async () => {
    const e = await setup(
      'tools',
      { dryRun: true, cwd: cwd(), run: replay([]).run },
      host(UV, 'darwin'),
    ).catch((x: unknown) => x as Ts23dError);
    expect((e as Ts23dError).message).toContain('darwin is planned');
  });

  test('--dry-run runs install.py --dry-run and returns its exact plan; writes nothing', async () => {
    const r = replay([PLAN, 'noise line']);
    const dir = cwd();
    const res = await setup(
      'gpu-full',
      { dryRun: true, cwd: dir, run: r.run },
      host({ ...GPU24, ...UV }),
    );
    const cmd = r.cmds[0] ?? [];
    expect(cmd.slice(0, 5)).toEqual(['uv', 'run', '--no-project', '--python', '3.12']);
    expect(cmd.at(-1)).toBe('--dry-run');
    expect(cmd.some((a) => a.endsWith('profiles/install-gpu-full.toml'))).toBe(true);
    expect(res.plan?.steps[0]?.cmds).toEqual(['download x']);
    expect(res.config?.written).toBe(false);
    expect(existsSync(join(dir, 't3d.config.ts'))).toBe(false);
  });

  test('no uv: the plan starts with the pinned uv installer into $TS23D_HOME/bin', async () => {
    const r = replay([]);
    const res = await setup('tools', { dryRun: true, cwd: cwd(), run: r.run }, host({}));
    expect(res.uv.installed).toBe(true);
    expect(res.uv.cmd?.join(' ')).toContain('https://astral.sh/uv/0.13.8/install.sh');
    expect(res.uv.cmd?.join(' ')).toContain(`UV_INSTALL_DIR='${res.home}/bin'`);
    expect(r.cmds).toEqual([]);
  });

  test('a failed step is T3D_NEURAL_FAILED carrying the step fix', async () => {
    const fail = `@t3d ${JSON.stringify({ event: 'step', id: 'basisu', status: 'fail', detail: 'cmake exited 1', fix: 'install a C++ compiler' })}`;
    const end = `@t3d ${JSON.stringify({ event: 'end', ok: false, done: 0, skipped: 3, failed: ['basisu'] })}`;
    const e = await setup(
      'tools',
      { dryRun: false, cwd: cwd(), run: replay([PLAN, fail, end], 1).run },
      host(UV),
    ).catch((x: unknown) => x as Ts23dError);
    expect((e as Ts23dError).message).toContain('step basisu failed: cmake exited 1');
    expect((e as Ts23dError).fix).toBe('install a C++ compiler');
  });

  test('a GPU profile writes t3d.config.ts once, never over an existing one', async () => {
    const end = `@t3d ${JSON.stringify({ event: 'end', ok: true, done: 1, skipped: 0, failed: [] })}`;
    const dir = cwd();
    const h = host({ ...GPU24, ...UV });
    const a = await setup('gpu-full', { dryRun: false, cwd: dir, run: replay([PLAN, end]).run }, h);
    expect(a.config?.written).toBe(true);
    expect(a.config?.text).toContain("http('http://127.0.0.1:8190', 'trellis2'");
    writeFileSync(join(dir, 't3d.config.ts'), '// mine\n');
    const b = await setup('gpu-full', { dryRun: false, cwd: dir, run: replay([PLAN, end]).run }, h);
    expect(b.config?.written).toBe(false);
  });

  test('usage: no profile or an unknown one exits 2', async () => {
    expect(await setupMain([], true, host(UV))).toBe(2);
    expect(await setupMain(['gpu-max'], true, host(UV))).toBe(2);
  });
});

describe('installer progress', () => {
  test('parseProgress keeps @t3d events and drops everything else', () => {
    expect(parseProgress('@t3d {"event":"step","id":"godot","status":"skip"}')).toEqual({
      event: 'step',
      id: 'godot',
      status: 'skip',
    });
    expect(parseProgress('@t3d {"event":"other"}')).toBeUndefined();
    expect(parseProgress('@t3d {not json')).toBeUndefined();
    expect(parseProgress('Downloading bpy (384 MiB)')).toBeUndefined();
  });
});

// The real install.py (stdlib only): a re-run is a no-op, and every shipped profile plans.
const python = ['python3', 'python'].find((p) => {
  const r = spawnSync(p, [
    '-c',
    'import sys, tomllib; sys.exit(0 if sys.version_info >= (3, 11) else 1)',
  ]);
  return r.status === 0;
});
const dir = serverDir(realHost());

describe.skipIf(python === undefined || dir === undefined)('install.py', () => {
  const runPy = (args: string[]): string[] => {
    const r = spawnSync(python ?? '', [join(dir ?? '', 'install.py'), ...args], {
      encoding: 'utf8',
    });
    expect(r.stderr).toBe('');
    return r.stdout.split('\n').filter((l) => l.startsWith('@t3d '));
  };

  test('idempotent: the second run skips every step', () => {
    const tmp = mkdtempSync(join(tmpdir(), 't3d-install-'));
    writeFileSync(join(tmp, 'blob.bin'), 'tool bytes');
    const sha = new Bun.CryptoHasher('sha256').update('tool bytes').digest('hex');
    const profile = join(tmp, 'p.toml');
    writeFileSync(
      profile,
      `[profile]\nname = "t"\n[[step]]\nid = "cfg"\nkind = "write"\ndest = "x/cfg.toml"\ntext = "home = '{home}'"\n` +
        `[[step]]\nid = "tool"\nkind = "download"\nurl = "file://${tmp}/blob.bin"\nsha256 = "${sha}"\ndest = "tools/bin/tool"\nexecutable = true\n`,
    );
    const home = join(tmp, 'home');
    const first = runPy(['--profile', profile, '--home', home]).map((l) => parseProgress(l));
    expect(first.at(-1)).toEqual({ event: 'end', ok: true, done: 2, skipped: 0, failed: [] });
    const again = runPy(['--profile', profile, '--home', home]).map((l) => parseProgress(l));
    expect(again.at(-1)).toEqual({ event: 'end', ok: true, done: 0, skipped: 2, failed: [] });
  });

  test('a sha256 mismatch fails the step with a fix', () => {
    const tmp = mkdtempSync(join(tmpdir(), 't3d-install-'));
    writeFileSync(join(tmp, 'blob.bin'), 'changed upstream');
    const profile = join(tmp, 'p.toml');
    writeFileSync(
      profile,
      `[profile]\nname = "t"\n[[step]]\nid = "tool"\nkind = "download"\nurl = "file://${tmp}/blob.bin"\nsha256 = "${'0'.repeat(64)}"\ndest = "tool"\n`,
    );
    const evs = runPy(['--profile', profile, '--home', join(tmp, 'h')]).map((l) =>
      parseProgress(l),
    );
    const fail = evs.find((e) => e?.event === 'step' && e.status === 'fail');
    expect(fail).toMatchObject({ id: 'tool', fix: expect.stringContaining('pin') });
  });

  for (const p of ['tools', 'gpu-min', 'gpu-full'])
    test(`profiles/install-${p}.toml plans (dry run)`, () => {
      const home = mkdtempSync(join(tmpdir(), 't3d-plan-'));
      const lines = runPy([
        '--profile',
        join(dir ?? '', 'profiles', `install-${p}.toml`),
        '--home',
        home,
        '--dry-run',
      ]);
      const plan = parseProgress(lines[0] ?? '');
      expect(plan?.event).toBe('plan');
      if (plan?.event === 'plan') {
        expect(plan.steps.length).toBeGreaterThan(5);
        for (const s of plan.steps) expect(s.cmds.length).toBeGreaterThan(0);
      }
      expect(existsSync(join(home, 'logs'))).toBe(false);
    });
});
