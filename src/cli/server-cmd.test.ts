import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  profileFile,
  serverCommand,
  serverMain,
  serverStart,
  serverStatus,
  serverStop,
} from './server-cmd.ts';
import { type Host, realHost, serverDir, tierPaths } from './tier-probe.ts';

function host(o: { files?: string[]; fetch?: Host['fetch'] } = {}): Host {
  const home = mkdtempSync(join(tmpdir(), 't3d-server-'));
  return {
    ...realHost(),
    env: { TS23D_HOME: home, PATH: '/usr/bin' },
    exists: (p) => (o.files ?? []).includes(p),
    fetch: o.fetch ?? (() => Promise.reject(new Error('refused'))),
  };
}

describe('t3d server', () => {
  test('profile: a name under profiles/, a .toml path, setup’s server.toml, else dummy', () => {
    const h = host();
    const p = tierPaths(h.env);
    expect(profileFile(h, p, '/srv')).toBe('/srv/profiles/dummy.toml');
    expect(profileFile(h, p, '/srv', 'rtx3090')).toBe('/srv/profiles/rtx3090.toml');
    expect(profileFile(h, p, '/srv', '/x/mine.toml')).toBe('/x/mine.toml');
    const withSetup = host();
    const ps = tierPaths(withSetup.env);
    expect(profileFile({ ...withSetup, exists: (f) => f === ps.serverToml }, ps, '/srv')).toBe(
      ps.serverToml,
    );
  });

  test('command: the setup venv when present (with its CUDA toolkit), else uv run in the server env', () => {
    const h = host();
    const p = tierPaths(h.env);
    const bare = serverCommand(h, p, '/srv', '/srv/profiles/dummy.toml', 8190);
    expect(bare.cmd.slice(0, 4)).toEqual(['uv', 'run', '--project', '/srv']);
    expect(bare.cmd.slice(-5)).toEqual([
      '/srv/server.py',
      '--profile',
      '/srv/profiles/dummy.toml',
      '--port',
      '8190',
    ]);
    expect(bare.env['HF_HOME']).toBe(join(p.home, 'hf'));
    expect(bare.env['CUDA_HOME']).toBeUndefined();
    const venv = serverCommand(host({ files: [p.python, p.cudaHome] }), p, '/srv', 'x.toml', 9000);
    expect(venv.cmd[0]).toBe(p.python);
    expect(venv.env['CUDA_HOME']).toBe(p.cudaHome);
    expect(venv.env['PATH']?.startsWith(`${p.toolchain}:${p.cudaHome}/bin:`)).toBe(true);
  });

  test('status: stopped when nothing answers; a server t3d did not start is reported as foreign', async () => {
    const h = host();
    const p = tierPaths(h.env);
    expect((await serverStatus(h, p)).running).toBe(false);
    const other = host({
      fetch: () => Promise.resolve(Response.json([{ id: 'dummy-mesh', task: 'mesh' }])),
    });
    const s = await serverStatus(other, tierPaths(other.env));
    expect(s).toMatchObject({
      running: true,
      foreign: true,
      models: [{ id: 'dummy-mesh', task: 'mesh' }],
    });
  });

  test('stop when not running is a no-op', async () => {
    expect(await serverStop(tierPaths(host().env))).toEqual({ stopped: false });
  });

  test('usage errors exit 2', async () => {
    expect(await serverMain(['restart'], true, host())).toBe(2);
    expect(await serverMain(['start', '--port', 'abc'], true, host())).toBe(2);
    expect(await serverMain(['status', '--colour'], true, host())).toBe(2);
  });

  test('start with a missing profile is a usage error naming the profiles', async () => {
    const real = {
      ...realHost(),
      env: { ...process.env, TS23D_HOME: mkdtempSync(join(tmpdir(), 't3d-s-')) },
    };
    const e = await serverStart(real, tierPaths(real.env), {
      profile: 'nope',
      port: 8299,
      timeoutMs: 1000,
    }).catch((x: unknown) => x as Error);
    expect(String(e)).toContain('profiles/nope.toml does not exist');
  });
});

// The real reference server on the dummy profile (needs uv; the server env syncs from uv.lock).
const hasUv = spawnSync('uv', ['--version']).status === 0;
describe.skipIf(!hasUv || serverDir(realHost()) === undefined)(
  'server start/status/stop (dummy)',
  () => {
    test('start answers /v1/models, a second start is a no-op, stop ends it', async () => {
      const home = mkdtempSync(join(tmpdir(), 't3d-srv-'));
      const env = { ...process.env, TS23D_HOME: home, TS23D_NEURAL_VENV: join(home, 'none') };
      const h: Host = { ...realHost(), env };
      const p = tierPaths(env);
      const port = 8300 + (process.pid % 200);
      try {
        const a = await serverStart(h, p, { profile: 'dummy', port, timeoutMs: 90_000 });
        expect(a.already).toBe(false);
        expect(a.models?.map((m) => m.id).sort()).toEqual([
          'dummy-image',
          'dummy-mesh',
          'dummy-score',
        ]);
        const b = await serverStart(h, p, { profile: 'dummy', port, timeoutMs: 5000 });
        expect(b.already).toBe(true);
        expect((await serverStatus(h, p)).pid).toBe(a.pid);
      } finally {
        const s = await serverStop(p);
        expect(s.stopped).toBe(true);
      }
      expect((await serverStatus(h, p, port)).running).toBe(false);
    }, 120_000);
  },
);
