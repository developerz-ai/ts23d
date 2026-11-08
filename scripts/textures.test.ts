import { afterAll, describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodePng } from '../src/core/index.ts';
import type { TextureSource } from '../src/material/index.ts';
import { catalogue, fetchTextures, loadTextureCache } from './textures.ts';
import { makeZip } from './textures-zip.test.ts';

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

describe('texture catalogue (fake network)', () => {
  const png2 = encodePng(1, 1, new Uint8Array([10, 20, 30, 255]));
  const sha = (b: Uint8Array): string => new Bun.CryptoHasher('sha256').update(b).digest('hex');
  const zip = makeZip([
    { name: 'Rock1_1K-PNG_Color.png', data: png, deflate: true },
    { name: 'Rock1_1K-PNG_Roughness.png', data: png2 },
  ]);
  const json = (v: unknown): Response => new Response(JSON.stringify(v));
  const fake = async (url: string): Promise<Response> => {
    if (url.includes('api.polyhaven.com/assets'))
      return json({
        red_sand: {
          name: 'Red Sand',
          tags: ['desert'],
          categories: ['sand'],
          dimensions: [2000, 2000],
        },
        brick_wall: { name: 'Brick Wall', tags: ['wall'], categories: ['brick'] },
      });
    if (url.includes('api.polyhaven.com/info/red_sand'))
      return json({ name: 'Red Sand', dimensions: [2000, 2000], authors: { 'A. Person': 'All' } });
    if (url.includes('api.polyhaven.com/files/red_sand'))
      return json({ Diffuse: { '1k': { png: { url: 'https://dl/red_sand_diff_1k.png' } } } });
    if (url === 'https://dl/red_sand_diff_1k.png') return new Response(png.slice().buffer);
    if (url.includes('ambientcg.com/api'))
      return json({
        foundAssets: [
          { assetId: 'Rock1', displayName: 'Rock 1', dimensionX: 150, dimensionY: 150 },
        ],
      });
    if (url === 'https://ambientcg.com/get?file=Rock1_1K-PNG.zip')
      return new Response(zip.slice().buffer);
    return new Response('nope', { status: 404 });
  };

  it('rejects an unknown source and a missing id, with a fix', async () => {
    await expect(catalogue(['search', 'x', '--source', 'gettyimages'], fake)).rejects.toThrow(
      'fix:',
    );
    await expect(catalogue(['add'], fake)).rejects.toThrow('fix:');
  });

  it('searches Poly Haven by words over id, name, tags and categories', async () => {
    const out = await catalogue(['search', 'sand', 'desert'], fake);
    expect(out[0]).toContain('red_sand');
    expect(out[0]).toContain('2×2 m');
    expect(out.join('\n')).not.toContain('brick_wall');
  });

  it('pins a Poly Haven set: snippet with sha256, bytes cached', async () => {
    const cache = join(dir, 'ph');
    const out = (await catalogue(['add', 'red_sand'], fake, cache)).join('\n');
    expect(out).toContain(`sha256: '${hash}'`);
    expect(out).toContain("author: 'A. Person'");
    expect((await loadTextureCache(cache)).has(hash)).toBe(true);
  });

  it('pins an ambientCG zip by entry and fetchTextures re-extracts it', async () => {
    const cache = join(dir, 'acg');
    const out = (
      await catalogue(['add', 'Rock1', '--source', 'ambientcg'], fake, join(dir, 'tmp'))
    ).join('\n');
    expect(out).toContain('Rock1_1K-PNG.zip#Rock1_1K-PNG_Roughness.png');
    expect(out).toContain(`sha256: '${sha(png2)}'`);
    const src: TextureSource = {
      source: 'ambientcg',
      id: 'Rock1',
      license: 'CC0-1.0',
      page: 'p',
      metres: [1.5, 1.5],
      maps: {
        albedo: {
          url: 'https://ambientcg.com/get?file=Rock1_1K-PNG.zip#Rock1_1K-PNG_Color.png',
          sha256: hash,
        },
      },
    };
    expect(await fetchTextures([src], cache, () => {}, fake)).toBe(1);
  });
});
