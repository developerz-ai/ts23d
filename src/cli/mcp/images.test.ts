import { afterAll, expect, it } from 'bun:test';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { encodePng } from '../../core/index.ts';
import { decodePng } from '../../material/index.ts';
import { fitPng, imageBlocks } from './images.ts';

const dir = join(import.meta.dir, '../../../tmp/mcp-images-test');
afterAll(() => rm(dir, { recursive: true, force: true }));

const png = (w: number, h: number): Uint8Array => {
  const rgba = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) rgba.set([(i * 7) % 256, (i * 13) % 256, 90, 255], i * 4);
  return encodePng(w, h, rgba);
};

it('lists a file that is not a PNG instead of failing the result', async () => {
  const bad = join(dir, 'bad.png');
  await Bun.write(bad, 'not a png');
  const r = await imageBlocks([bad]);
  expect(r.blocks).toHaveLength(0);
  expect(r.listed[0]?.path).toBe(bad);
  expect(r.listed[0]?.why).toContain('T3D_RENDER_OPTIONS');
});

it('downscales an image over the cap to the long edge, keeping the aspect', () => {
  const small = decodePng(fitPng(png(400, 100), 200));
  expect([small.width, small.height]).toEqual([200, 50]);
  const tall = decodePng(fitPng(png(60, 300), 150));
  expect([tall.width, tall.height]).toEqual([30, 150]);
});

it('returns an image that fits unchanged, and the same bytes every time', () => {
  const p = png(64, 32);
  expect(fitPng(p, 1024)).toBe(p);
  expect(fitPng(png(400, 100), 200)).toEqual(fitPng(png(400, 100), 200));
});

it('lists images past the byte budget by path and keeps the order', async () => {
  const a = join(dir, 'a.png');
  const b = join(dir, 'b.png');
  await Bun.write(a, png(100, 100));
  await Bun.write(b, png(100, 100));
  const size = png(100, 100).length;
  const r = await imageBlocks([a, b], { maxEdge: 1024, maxBytes: size + 10 });
  expect(r.blocks).toHaveLength(1);
  expect(r.blocks[0]?.mimeType).toBe('image/png');
  expect(Buffer.from(r.blocks[0]?.data ?? '', 'base64').length).toBe(size);
  expect(r.listed.map((l) => l.path)).toEqual([b]);
});
