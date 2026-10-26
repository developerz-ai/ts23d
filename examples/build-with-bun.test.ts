// The documented no-CLI path must keep working: run the example exactly as a user would.

import { afterAll, expect, it } from 'bun:test';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';

const out = join(import.meta.dir, '../tmp/example-test');
afterAll(() => rm(out, { recursive: true, force: true }));

it('builds GLBs and a contact sheet with nothing but bun and the library', async () => {
  const p = Bun.spawnSync(['bun', join(import.meta.dir, 'build-with-bun.ts'), out], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  expect(p.stderr.toString()).toBe('');
  expect(p.exitCode).toBe(0);
  for (const f of ['tiger_1.lod0.glb', 'tiger_1.lod2.glb', 'tiger_1.png'])
    expect(await Bun.file(join(out, f)).exists()).toBe(true);
}, 60_000);
