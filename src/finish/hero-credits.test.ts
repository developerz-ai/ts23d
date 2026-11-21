// The hero bake paints an image strip's pixels into its own albedo (vertex colour × trim), so the
// baked GLB still credits that texture though the part's UVs now address the hero atlas (D535).

import { afterAll, describe, expect, test } from 'bun:test';
import { compile, defineAsset, encodePng } from '../core/index.ts';
import { readGlbChunks } from '../export/index.ts';
import {
  builtinMaterialsOnly,
  defineMaterial,
  NATURAL,
  provideTextures,
} from '../material/index.ts';
import { box } from '../primitives/index.ts';
import { heroGlb, heroTier } from './hero.ts';

afterAll(builtinMaterialsOnly());

const png = encodePng(2, 2, new Uint8Array(16).fill(128));
const sha256 = new Bun.CryptoHasher('sha256').update(png).digest('hex');
provideTextures(new Map([[sha256, png]]));
const scan = defineMaterial({
  id: 'hero_scan',
  roughness: 0.8,
  texture: {
    source: 'polyhaven',
    id: 'hero_scan',
    license: 'CC0-1.0',
    page: 'https://polyhaven.com/a/hero_scan',
    author: 'A. Scanner',
    metres: [1, 1],
    maps: { albedo: { url: 'https://example.org/hero_scan.png', sha256 } },
  },
});

const crate = defineAsset({
  name: 'scan_crate',
  kind: 'prop',
  budget: { triangles: [100, 100, 100], heroTextures: { size: 1024 } },
  build(ctx) {
    ctx.part('body', box({ size: [0.4, 0.4, 0.4], at: [0, 0, 0.2], color: NATURAL, strip: scan }));
  },
});

describe('hero bake credits', () => {
  test('fails before D535: the baked export dropped the credit of the image strip in its albedo', () => {
    const r = heroTier(compile(crate), { size: 1024, cell: 0.01 });
    expect(r.asset.parts.find((p) => p.name === 'body')?.atlas).toBe('hero');
    const { json } = readGlbChunks(heroGlb(r, [], { force: true }));
    expect(JSON.stringify(json)).toContain('https://polyhaven.com/a/hero_scan');
  });
});
