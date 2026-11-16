import { afterAll, describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { HERO_FLAGS, type Runner, refresh } from './shots.ts';

const root = join(import.meta.dir, '../tmp/shots-test');
afterAll(() => rm(root, { recursive: true, force: true }));

/** A fake t3d: writes <out>/a/<cmd>.png, fails on `fail`. */
const fake =
  (fail?: string): Runner =>
  async ([cmd, , , out]) => {
    if (cmd === fail) return false;
    await Bun.write(join(out ?? '', 'a', `${cmd}.png`), 'x');
    await Bun.write(join(out ?? '', 'a', 'manifest.json'), '{"sheet":"sheet.png"}');
    return true;
  };

describe('shots refresh', () => {
  it('keeps the old out/ and drops the temp dir when a step fails', async () => {
    const dir = join(root, 'keep');
    await mkdir(join(dir, 'out', 'a'), { recursive: true });
    await Bun.write(join(dir, 'out', 'a', 'old.png'), 'old');
    expect(await refresh(dir, 'x.ts', fake('blueprint'))).toBe(false);
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

  it('path traces the committed hero at the measured CI size and sample count', async () => {
    const seen: string[][] = [];
    const record: Runner = async (cmd) => {
      seen.push([...cmd]);
      return fake()(cmd);
    };
    expect(await refresh(join(root, 'flags'), 'x.ts', record)).toBe(true);
    const hero = seen.find((c) => c[0] === 'hero') ?? [];
    expect(hero.slice(4)).toEqual([...HERO_FLAGS]);
    expect(HERO_FLAGS).toEqual(['--quality', 'path', '--size', '960x540', '--spp', '16']);
    expect(seen.find((c) => c[0] === 'shot')?.length).toBe(4);
  });
});
