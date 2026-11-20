// `t3d finish`: bad flags fail with T3D_FINISH_INVALID before any work; a mock run writes the
// controls, model images, atlas maps, compare.png, the finished GLB and finish.json. `--hero`
// (heroFinishOne) refuses a bad atlas, flags an asset with no field, and writes the hero folder.

import { describe, expect, it } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cart } from '../finish/fixtures.ts';
import { memoryStore } from '../finish/index.ts';
import { DEFAULT_SHEET, paintTrimSheet } from '../material/index.ts';
import { parseArgs } from './args.ts';
import { finishOne, finishWarnings, heroFinishOne } from './finish-cmd.ts';

describe('t3d finish', () => {
  it('reports re-run QA findings under their own T3D_QA_* code', () => {
    const qa = [
      {
        gate: 'floating-parts',
        code: 'T3D_QA_FLOATING_PARTS',
        part: 'lid',
        message: 'floats',
        fix: 'sink it',
      },
    ];
    expect(finishWarnings({ findings: [], qa })).toEqual([
      { code: 'T3D_QA_FLOATING_PARTS', message: 'lid floats', fix: 'sink it' },
    ]);
  });

  it('rejects an unknown model, views out of range, and http without endpoint', async () => {
    expect(() => parseArgs(['finish', 'a.ts', '--model', 'dalle'])).toThrow('T3D_FINISH_INVALID');
    expect(() => parseArgs(['finish', 'a.ts', '--views', '99'])).toThrow('T3D_FINISH_INVALID');
    const args = parseArgs(['finish', 'a.ts', '--model', 'http', '--prompt', 'rust']);
    const sheet = paintTrimSheet({ ...DEFAULT_SHEET, size: 512 }, []);
    await expect(finishOne(cart, args, sheet, memoryStore())).rejects.toThrow('T3D_FINISH_INVALID');
  });

  it('writes the finish folder with a mock model', async () => {
    const out = await mkdtemp(join(tmpdir(), 't3d-finish-'));
    try {
      const args = parseArgs(['finish', 'a.ts', '--out', out, '--views', '4', '--atlas', '256']);
      expect(args.finish).toEqual({ model: 'mock', force: false, views: 4, atlas: 256 });
      const sheet = paintTrimSheet({ ...DEFAULT_SHEET, size: 512 }, []);
      const r = await finishOne(cart, args, sheet, memoryStore());
      expect(r.warnings).toEqual([]);
      const dir = join(out, 'cart', 'finish');
      const files = await readdir(dir);
      for (const f of [
        'compare.png',
        'cart_finish.glb',
        'finish.json',
        'finish_albedo.png',
        'controls',
        'model',
      ])
        expect(files).toContain(f);
      const report = (await Bun.file(join(dir, 'finish.json')).json()) as {
        accepted: boolean;
        cache: string;
      };
      expect([report.accepted, report.cache]).toEqual([true, 'miss']);
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  });

  it('hero: a bad atlas fails, an asset without a field warns, the folder is written', async () => {
    const out = await mkdtemp(join(tmpdir(), 't3d-hero-'));
    try {
      const sheet = paintTrimSheet({ ...DEFAULT_SHEET, size: 512 }, []);
      const bad = parseArgs(['finish', 'a.ts', '--out', out, '--atlas', '256']);
      await expect(heroFinishOne(cart, bad, sheet)).rejects.toThrow('T3D_BAKE_INVALID');
      const args = parseArgs(['finish', 'a.ts', '--out', out, '--atlas', '1024']);
      const r = await heroFinishOne(cart, args, sheet);
      expect(r.warnings.map((w) => w.code)).toEqual(['T3D_BAKE_FAILED']);
      const files = await readdir(join(out, 'cart', 'hero'));
      for (const f of ['cart_hero.glb', 'hero.json', 'hero_normal.png', 'hero_height.png'])
        expect(files).toContain(f);
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  });
});
