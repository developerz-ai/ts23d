import { afterAll, describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodePng } from '../src/core/index.ts';
import type { TextureSource } from '../src/material/index.ts';
import { fetchTextures, loadTextureCache } from './textures.ts';

const dir = await mkdtemp(join(tmpdir(), 't3d-tex-'));
afterAll(() => rm(dir, { recursive: true, force: true }));

const png = encodePng(2, 2, new Uint8Array(16).fill(200));
const file = join(dir, 'albedo.png');
await Bun.write(file, png);
const hash = new Bun.CryptoHasher('sha256').update(png).digest('hex');
const src = (sha256: string): TextureSource => ({
  source: 'file',
  id: 'test',
  license: 'CC0-1.0',
  page: 'local',
  metres: [1, 1],
  maps: { albedo: { url: file, sha256 } },
});

describe('fetchTextures', () => {
  it('refuses a file whose sha256 does not match, and caches nothing', async () => {
    const cache = join(dir, 'bad');
    await expect(fetchTextures([src('0'.repeat(64))], cache)).rejects.toThrow('sha256');
    expect((await loadTextureCache(cache)).size).toBe(0);
  });

  it('caches a verified file by hash, once', async () => {
    const cache = join(dir, 'good');
    expect(await fetchTextures([src(hash)], cache)).toBe(1);
    expect(await fetchTextures([src(hash)], cache)).toBe(0);
    const loaded = await loadTextureCache(cache);
    expect([...(loaded.get(hash) ?? [])]).toEqual([...png]);
  });
});
