import { afterAll, describe, expect, it } from 'bun:test';
import { compile, defineAsset, encodePng } from '../core/index.ts';
import { defineMaterial, NATURAL, provideTextures, resetMaterials } from '../material/index.ts';
import { box } from '../primitives/index.ts';
import { creditsOf } from './credits.ts';
import { toGlb } from './glb.ts';

resetMaterials();
afterAll(resetMaterials);

const png = encodePng(2, 2, new Uint8Array(16).fill(128));
const sha256 = new Bun.CryptoHasher('sha256').update(png).digest('hex');
provideTextures(new Map([[sha256, png]]));
const scan = defineMaterial({
  id: 'test_scan',
  roughness: 0.8,
  texture: {
    source: 'polyhaven',
    id: 'scan',
    license: 'CC0-1.0',
    page: 'https://polyhaven.com/a/scan',
    author: 'A. Scanner',
    metres: [1, 1],
    maps: { albedo: { url: 'https://example.org/scan.png', sha256 } },
  },
});

const asset = (strip: 'oak' | typeof scan) =>
  compile(
    defineAsset({
      name: 'crate',
      kind: 'prop',
      description: 'a crate',
      budget: { triangles: [100, 100, 100] },
      build(ctx) {
        ctx.part('body', box({ size: [1, 1, 1], color: NATURAL, strip }));
      },
    }),
  );

const json = (glb: Uint8Array): string =>
  new TextDecoder().decode(glb.subarray(20, 20 + new DataView(glb.buffer).getUint32(12, true)));

describe('texture credits', () => {
  it('stay out of procedural assets (bytes unchanged)', () => {
    expect(creditsOf(asset('oak'))).toEqual([]);
    expect(json(toGlb(asset('oak')))).not.toContain('dc:contributor');
  });

  it('name the CC0 set, author and licence when an image strip is sampled', () => {
    const [line] = creditsOf(asset(scan));
    expect(line).toContain('A. Scanner');
    expect(line).toContain('CC0-1.0');
    expect(json(toGlb(asset(scan)))).toContain('https://polyhaven.com/a/scan');
  });
});
