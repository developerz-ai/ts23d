import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BLENDER_SCRIPTS_FIX, blenderScriptsDir, defaultScripts } from './blender-scripts.ts';

describe('where the Blender scripts are', () => {
  test('a given directory without the dispatcher is refused', async () => {
    const e = await blenderScriptsDir('/nonexistent/scripts').catch((x: unknown) => x);
    expect(String(e)).toContain('T3D_NEURAL_FAILED');
    expect(String(e)).toContain('/nonexistent/scripts');
    expect((e as { fix: string }).fix).toContain('examples/blender of a ts23d checkout');
  });

  test('the fix for an npm install names what a CLI user can do', () => {
    expect(BLENDER_SCRIPTS_FIX).toContain('not in the npm package');
    expect(BLENDER_SCRIPTS_FIX).toContain('--scripts');
    expect(BLENDER_SCRIPTS_FIX).toContain('T3D_BLENDER_SCRIPTS');
  });

  test('a directory with the dispatcher is used, without its trailing slash', async () => {
    const dir = mkdtempSync(join(tmpdir(), 't3d-scripts-'));
    writeFileSync(join(dir, 'ts23d_job.py'), '# job\n');
    expect(await blenderScriptsDir(`${dir}/`)).toBe(dir);
    rmSync(dir, { recursive: true, force: true });
  });

  test('this checkout has them at the default place', async () => {
    expect(await blenderScriptsDir()).toBe((await defaultScripts()).replace(/\/+$/, ''));
  });
});
