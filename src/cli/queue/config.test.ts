// Queue settings: bad values are usage errors, defaults follow the core count, queue.json
// overrides them, and a malformed queue.json falls back to defaults with the reason.

import { expect, test } from 'bun:test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultCpu, loadConfig } from './config.ts';

const home = (): Promise<string> => mkdtemp(join(tmpdir(), 't3d-queue-config-'));

test('bad T3D_QUEUE and T3D_QUEUE_MAX_WAIT values are T3D_CLI_USAGE with the valid forms', async () => {
  const TS23D_HOME = await home();
  await expect(loadConfig({ TS23D_HOME, T3D_QUEUE: 'on' }, 16)).rejects.toThrow('T3D_CLI_USAGE');
  for (const T3D_QUEUE_MAX_WAIT of ['0', '-3', 'soon'])
    await expect(loadConfig({ TS23D_HOME, T3D_QUEUE_MAX_WAIT }, 16)).rejects.toThrow(
      'T3D_QUEUE_MAX_WAIT',
    );
});

test('defaults: a quarter of the cores (at least one) stays free; path hero 8, verify 4', async () => {
  expect([1, 2, 4, 16, 64].map(defaultCpu)).toEqual([1, 1, 3, 12, 48]);
  const c = await loadConfig({ TS23D_HOME: await home() }, 16);
  expect(c.capacity).toEqual({ cpu: 12, blender: 1, gpu: 1 });
  expect(c.weights).toEqual({ pathHero: 8, verify: 4 });
  expect([c.mode, c.modeFrom, c.maxWaitMs, c.capacityFrom]).toEqual([
    'wait',
    'default',
    1_800_000,
    'default',
  ]);
  expect((await loadConfig({ TS23D_HOME: await home() }, 4)).weights).toEqual({
    pathHero: 3,
    verify: 3,
  });
});

test('queue.json sets mode, wait, capacities and weights; the environment wins over it', async () => {
  const TS23D_HOME = await home();
  await writeFile(
    join(TS23D_HOME, 'queue.json'),
    JSON.stringify({
      mode: 'fail',
      maxWaitSeconds: 60,
      capacity: { cpu: 6, gpu: 2 },
      weights: { pathHero: 4, verify: 9 },
    }),
  );
  const c = await loadConfig({ TS23D_HOME }, 16);
  expect([c.mode, c.modeFrom, c.maxWaitMs, c.capacityFrom]).toEqual([
    'fail',
    'queue.json',
    60_000,
    'queue.json',
  ]);
  expect(c.capacity).toEqual({ cpu: 6, blender: 1, gpu: 2 });
  expect(c.weights).toEqual({ pathHero: 4, verify: 6 });
  const e = await loadConfig({ TS23D_HOME, T3D_QUEUE: 'wait', T3D_QUEUE_MAX_WAIT: '5' }, 16);
  expect([e.mode, e.modeFrom, e.maxWaitMs]).toEqual(['wait', 'T3D_QUEUE', 5000]);
  expect((await loadConfig({ TS23D_HOME, CI: 'true' }, 16)).modeFrom).toBe('CI');
  expect((await loadConfig({ TS23D_HOME, CI: 'false' }, 16)).mode).toBe('fail');
});

test('a malformed queue.json: defaults, with the reason kept for doctor', async () => {
  const TS23D_HOME = await home();
  await writeFile(join(TS23D_HOME, 'queue.json'), '{ "mode": ');
  const c = await loadConfig({ TS23D_HOME }, 16);
  expect(c.mode).toBe('wait');
  expect(c.capacity.cpu).toBe(12);
  expect(c.warning).toContain('queue.json is not JSON');
});
