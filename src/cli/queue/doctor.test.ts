// The `queue` group of `t3d doctor`: a malformed queue.json, stale tickets and an unwritable
// folder each carry their fix; a healthy queue is all ok.

import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquire } from './acquire.ts';
import { queueChecks } from './doctor.ts';

const home = async (): Promise<Record<string, string>> => {
  const dir = await mkdtemp(join(tmpdir(), 't3d-queue-doctor-'));
  return { TS23D_HOME: dir, T3D_BLENDER_SESSIONS: join(dir, 'sessions') };
};
const byId = async (env: Record<string, string>) =>
  new Map((await queueChecks(env, { cores: 16 })).map((c) => [c.id, c]));

test('what is wrong carries its fix: bad queue.json, a stale ticket, a folder that is a file', async () => {
  const env = await home();
  await writeFile(join(env['TS23D_HOME'] ?? '', 'queue.json'), 'nope');
  await acquire('cpu', 2, {
    env: { ...env },
    self: { pid: 4194304 /* 2^22 */ + 9, start: 'gone' },
    alive: async () => true,
  });
  const c = await byId(env);
  expect(c.get('queue')).toMatchObject({ status: 'warn' });
  expect(c.get('queue')?.fix).toContain('queue.json');
  expect(c.get('queue-tickets')).toMatchObject({
    status: 'warn',
    detail: '0 live, 1 stale (a stale ticket holds nothing)',
    fix: 't3d queue clear --stale',
  });
  const blocked = await home();
  await writeFile(join(blocked['TS23D_HOME'] ?? '', 'queue'), 'a file');
  await mkdir(join(blocked['TS23D_HOME'] ?? '', 'sessions'));
  const b = await byId(blocked);
  expect(b.get('queue-dir')?.status).toBe('warn');
  expect(b.get('queue-dir')?.detail).toContain('commands run unqueued');
  expect([...b.values()].filter((x) => x.status !== 'ok').every((x) => x.fix)).toBe(true);
});

test('a fresh machine: every check ok, mode and capacities with where they come from', async () => {
  const env = await home();
  const c = await byId(env);
  expect([...c.values()].map((x) => [x.id, x.group, x.status])).toEqual([
    ['queue', 'queue', 'ok'],
    ['queue-dir', 'queue', 'ok'],
    ['queue-tickets', 'queue', 'ok'],
    ['queue-liveness', 'queue', process.platform === 'linux' ? 'ok' : 'info'],
    ['gpu-lease', 'queue', 'ok'],
    ['blender-sessions', 'queue', 'ok'],
  ]);
  expect(c.get('queue')?.detail).toBe(
    'mode wait (default); capacity cpu 12, blender 1, gpu 1 (default); max wait 1800 s',
  );
  const off = await byId({ ...env, CI: 'true' });
  expect(off.get('queue')).toMatchObject({ status: 'info' });
  expect(off.get('queue')?.detail).toContain('mode off (CI)');
});
