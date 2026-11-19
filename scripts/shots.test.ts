import { afterAll, describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { compileOnce } from '../src/cli/compile-cache.ts';
import { box, defineAsset } from '../src/index.ts';
import { HERO_FLAGS, type Runner, refresh } from './shots.ts';
import { type Cli, renderArgv, renderFolder } from './shots-folder.ts';

const root = join(import.meta.dir, '../tmp/shots-test');
afterAll(() => rm(root, { recursive: true, force: true }));

/** A fake renderer: writes <tmp>/a/{shot,hero,blueprint}.png + manifest, or fails half-way. */
const fake =
  (fail = false): Runner =>
  async (_file, tmp) => {
    await Bun.write(join(tmp, 'a', 'shot.png'), 'x');
    if (fail) return false;
    for (const f of ['hero', 'blueprint']) await Bun.write(join(tmp, 'a', `${f}.png`), 'x');
    await Bun.write(join(tmp, 'a', 'manifest.json'), '{"sheet":"sheet.png"}');
    return true;
  };

describe('shots refresh', () => {
  it('keeps the old out/ and drops the temp dir when a step fails', async () => {
    const dir = join(root, 'keep');
    await mkdir(join(dir, 'out', 'a'), { recursive: true });
    await Bun.write(join(dir, 'out', 'a', 'old.png'), 'old');
    expect(await refresh(dir, 'x.ts', fake(true))).toBe(false);
    expect(await Bun.file(join(dir, 'out', 'a', 'old.png')).exists()).toBe(true);
    expect(existsSync(join(dir, '.out-tmp'))).toBe(false);
  });

  it('replaces out/ wholesale on success', async () => {
    const dir = join(root, 'swap');
    await mkdir(join(dir, 'out', 'gone'), { recursive: true });
    expect(await refresh(dir, 'x.ts', fake())).toBe(true);
    for (const f of ['shot', 'hero', 'blueprint'])
      expect(await Bun.file(join(dir, 'out', 'a', `${f}.png`)).exists()).toBe(true);
    expect(existsSync(join(dir, 'out', 'gone'))).toBe(false);
    // Manifest paths are relative to the asset folder, so the swap moves them untouched.
    expect(await Bun.file(join(dir, 'out', 'a', 'manifest.json')).text()).toBe(
      '{"sheet":"sheet.png"}',
    );
    expect(existsSync(join(dir, '.out-tmp'))).toBe(false);
  });

  it('path traces the committed hero at the measured CI size and sample count', () => {
    expect(HERO_FLAGS).toEqual(['--quality', 'path', '--size', '960x540', '--spp', '16']);
  });
});

describe('shots in one process per folder', () => {
  it('renders shot, path-traced hero, blueprint and icon from one recipe file, in order', () => {
    expect(renderArgv('r/x.ts', 'r/.out-tmp')).toEqual([
      ['shot', 'r/x.ts', '--out', 'r/.out-tmp'],
      ['hero', 'r/x.ts', '--out', 'r/.out-tmp', ...HERO_FLAGS],
      ['blueprint', 'r/x.ts', '--out', 'r/.out-tmp'],
      ['icon', 'r/x.ts', '--out', 'r/.out-tmp'],
    ]);
  });

  it('stops at the first failing render and returns its exit code', async () => {
    const seen: string[] = [];
    const cli: Cli = async ([cmd]) => {
      seen.push(cmd ?? '');
      return cmd === 'hero' ? 1 : 0;
    };
    expect(await renderFolder('x.ts', 'o', cli)).toBe(1);
    expect(seen).toEqual(['shot', 'hero']);
    expect(await renderFolder('x.ts', 'o', async () => 0)).toBe(0);
  });

  it('shares one compile between the renders, and none once the folder is done', async () => {
    let builds = 0;
    const asset = defineAsset({
      name: 'shared_by_shots',
      kind: 'prop',
      budget: { triangles: [100, 100, 100], draws: 1 },
      build(ctx) {
        builds++;
        ctx.part('b', box({ size: [1, 1, 1], color: [1, 1, 1] }));
      },
    });
    const cli: Cli = async ([cmd]) => {
      compileOnce(asset, { lod: 0 });
      return cmd === 'blueprint' ? 1 : 0;
    };
    expect(await renderFolder('x.ts', 'o', cli)).toBe(1);
    expect(builds).toBe(1);
    // Off again, also after a failed render: every call compiles.
    compileOnce(asset, { lod: 0 });
    compileOnce(asset, { lod: 0 });
    expect(builds).toBe(3);
  });
});
