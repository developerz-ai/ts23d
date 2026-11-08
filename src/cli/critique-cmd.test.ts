import { expect, it } from 'bun:test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineAsset } from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { contactSheet } from '../render/index.ts';
import { committedHashes, critiqueImages, RAKING, sha256 } from './critique-cmd.ts';

const crate = defineAsset({
  name: 'crate',
  kind: 'prop',
  budget: { triangles: [12, 12, 12] },
  build: (ctx) => ctx.part('body', box({ size: [2, 1, 1], color: [0.5, 0.35, 0.2] })),
});

it('hashes only the bound renders that are committed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ts23d-critique-cmd-'));
  expect(await committedHashes(dir)).toEqual({});
  await writeFile(join(dir, 'hero.png'), 'x');
  await writeFile(join(dir, 'thumb.png'), 'y');
  expect(Object.keys(await committedHashes(dir))).toEqual(['hero.png']);
});

it('renders the pack; sheet.png is byte-identical to the committed contact sheet', () => {
  const { images, lods, metrics } = critiqueImages(crate, { width: 96, height: 54 });
  for (const f of ['hero.png', 'sheet.png', 'raking.png', 'raking_detail.png', 'lods.png'])
    expect(images.has(f)).toBe(true);
  // The measured art metrics come with their pictures; a crate's LOD2 is its LOD0.
  for (const f of ['silhouette.png', 'value.png', 'detail.png']) expect(images.has(f)).toBe(true);
  expect(metrics.silhouette.map((s) => s.iou)).toEqual([1, 1, 1]);
  expect(metrics.shape.shape).toBe('stable');
  const [lod0, , lod2] = lods;
  if (!lod0 || !lod2) throw new Error('three LODs expected');
  expect(sha256(images.get('sheet.png') ?? new Uint8Array())).toBe(
    sha256(contactSheet(lod0, { far: lod2 })),
  );
  // The raking camera is not the hero camera: a different image.
  expect(RAKING.azDeg).not.toBe(-35);
  expect(sha256(images.get('raking.png') ?? new Uint8Array())).not.toBe(
    sha256(images.get('hero.png') ?? new Uint8Array()),
  );
}, 30_000); // paints the default trim sheet and the 800×450 metrics render
