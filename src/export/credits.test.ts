import { afterAll, describe, expect, it } from 'bun:test';
import { compile, defineAsset, encodePng, MeshBuilder } from '../core/index.ts';
import {
  builtinMaterialsOnly,
  defineMaterial,
  NATURAL,
  provideTextures,
} from '../material/index.ts';
import { box } from '../primitives/index.ts';
import { creditsOf } from './credits.ts';
import { toGlb } from './glb.ts';

// Start from the built-ins; put back what other test files' recipes defined at import after.
afterAll(builtinMaterialsOnly());

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

describe('an asset exports the same whatever else the process defined (D532)', () => {
  // Hand-written UVs over the whole sheet, no `mappedOnto`: the asset names no project material.
  const sloppy = defineAsset({
    name: 'credits_sloppy',
    kind: 'prop',
    budget: { triangles: [12, 12, 12] },
    build(ctx) {
      const b = new MeshBuilder();
      const at = (x: number, z: number) =>
        b.vertex({ p: [x, 0, z], n: [0, -1, 0], uv: [x, z], color: [1, 1, 1] });
      ctx.part('sheet', b.quad(at(0, 0), at(1, 0), at(1, 1), at(0, 1)).build());
    },
  });

  it('fails before D532: two materials of other recipes on one custom row made it T3D_MATERIAL_UNKNOWN', () => {
    const glb = toGlb(compile(sloppy));
    // What a test run, the MCP server or a gallery worker has after loading two more recipes.
    defineMaterial({ id: 'credits_rival_a', roughness: 0.4, row: 0 });
    defineMaterial({ id: 'credits_rival_b', roughness: 0.6, row: 0 });
    const c = compile(sloppy);
    expect(creditsOf(c)).toEqual([]);
    expect(toGlb(c)).toEqual(glb);
  });
});
