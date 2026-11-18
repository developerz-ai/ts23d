import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findLavapipe, looksCrashed, softwareGpuEnv, softwareGpuExec } from './blender-gpu.ts';
import type { ToolExec } from './tool-spawn.ts';

describe('software rendering', () => {
  test('no lavapipe: refused with how to install it', async () => {
    const e = await findLavapipe(['/nonexistent/lvp.json']).catch((x: unknown) => x);
    expect(String(e)).toContain('T3D_NEURAL_FAILED');
    expect((e as { fix: string }).fix).toContain('mesa-vulkan-drivers');
  });

  test('the first manifest present wins', async () => {
    const dir = mkdtempSync(join(tmpdir(), 't3d-lvp-'));
    const file = join(dir, 'lvp_icd.json');
    writeFileSync(file, '{}');
    expect(await findLavapipe(['/nonexistent/a.json', file])).toBe(file);
    rmSync(dir, { recursive: true, force: true });
  });

  test('a crashed Blender is told apart from one that reported an error', () => {
    expect(looksCrashed('blender exited null')).toBe(true);
    expect(looksCrashed('blender exited 139: x')).toBe(true);
    expect(looksCrashed('blender exited 3: step 1')).toBe(false);
  });

  test('the wrapper selects Vulkan and lavapipe alone', async () => {
    const seen: string[][] = [];
    const base: ToolExec = async (exe, args) => {
      seen.push([exe, ...args]);
      return { code: 0, stdout: '', stderr: '', timedOut: false, missing: false };
    };
    await softwareGpuExec(base, '/x/lvp.json')('blender', ['-b'], { timeoutMs: 1, maxBytes: 1 });
    expect(seen[0]).toEqual([
      'env',
      'VK_DRIVER_FILES=/x/lvp.json',
      'VK_ICD_FILENAMES=/x/lvp.json',
      'blender',
      '--gpu-backend',
      'vulkan',
      '-b',
    ]);
    expect(Object.keys(softwareGpuEnv('/x'))).toHaveLength(2);
  });
});
