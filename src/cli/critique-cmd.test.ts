import { afterAll, expect, it } from 'bun:test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compile, defineAsset, dmath } from '../core/index.ts';
import { DEFAULT_SHEET, defineMaterial, materialSnapshot } from '../material/index.ts';
import { box } from '../primitives/index.ts';
import { METRICS } from '../qa/index.ts';
import { contactSheet, previewSheet } from '../render/index.ts';
import { committedHashes, critiqueImages, measureVector, RAKING, sha256 } from './critique-cmd.ts';

// Put back the material registry as it was before this file defined one (D334/D527).
afterAll(materialSnapshot());

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
  // Fails before D532: two other recipes' materials on one row made the comparison sheet (every
  // defined material) T3D_MATERIAL_CONFLICT; the pack never depended on them.
  defineMaterial({ id: 'critique_rival_a', roughness: 0.4, row: 0 });
  defineMaterial({ id: 'critique_rival_b', roughness: 0.6, row: 0 });
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
    // The sheet `t3d shot` paints for the asset's own materials (build-one.ts), whatever else is defined.
    sha256(contactSheet(lod0, { far: lod2, sheet: previewSheet([lod0, lod2]) })),
  );
  // The raking camera is not the hero camera: a different image.
  expect(RAKING.azDeg).not.toBe(-35);
  expect(sha256(images.get('raking.png') ?? new Uint8Array())).not.toBe(
    sha256(images.get('hero.png') ?? new Uint8Array()),
  );
});

it('D528: paints the far-LOD images a sheet that holds the material only LOD2 maps', () => {
  // A bust's far hair cards in miniature: LOD0 on a built-in strip, LOD2 on a material of its own.
  const far = defineMaterial({ id: 'critique_far_cards', roughness: 0.8 });
  const bust = defineAsset({
    name: 'critique_far_bust',
    kind: 'prop',
    budget: { triangles: [12, 12, 12] },
    build: (ctx) =>
      ctx.part(
        'body',
        box({ size: [1, 1, 1], color: [1, 1, 1], strip: ctx.lod === 2 ? far : 'oak' }),
      ),
  });
  const { images } = critiqueImages(
    bust,
    { width: 96, height: 54 },
    { ...DEFAULT_SHEET, size: 512 },
  );
  for (const f of ['hero.png', 'lods.png', 'silhouette.png', 'value.png', 'detail.png'])
    expect(images.has(f)).toBe(true);
});

it('measures the calibration vector the same way twice (golden set, CLI and gate share it)', () => {
  const lod0 = compile(crate);
  const v = measureVector(lod0);
  expect(Object.keys(v)).toEqual([...METRICS]);
  expect(v.tris).toBeCloseTo(dmath.log10(13), 3);
  expect(measureVector(lod0)).toEqual(v);
});
