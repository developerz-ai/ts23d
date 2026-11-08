// The own-texture path for the import demo (ADR 011): compile the recipe's 'own' build (the head
// keeps the scan's UVs), bake the cleaned high-poly scan onto the LOD0 head — tangent-space normal
// map + albedo — and post-process the single-file LOD GLB so `head` (on every LOD) carries that
// texture set as its own material: one extra draw call, recorded in extras.ts23d.ownMaterials.
// Writes <out>/import_demo_textured.glb, head_albedo.png, head_normal.png, bake.json.

import { join } from 'node:path';
import { buildImportDemo } from '../recipes/import_demo/build.ts';
import { headLod, scan } from '../recipes/import_demo/source.ts';
import { compile, defineAsset, encodePng, type Lod } from '../src/core/index.ts';
import { toLodGlb, withOwnTextures } from '../src/export/index.ts';
import { bakeNormals } from '../src/passes/index.ts';

export interface TexturedReport {
  readonly glb: string;
  readonly size: number;
  readonly hitRate: number;
  readonly bytes: number;
}

export async function texturedDemo(out: string, size = 1024): Promise<TexturedReport> {
  const asset = defineAsset({
    name: 'import_demo',
    kind: 'prop',
    finishes: { cornea: { clearcoat: 1, clearcoatRoughness: 0.04 } },
    budget: { triangles: [64000, 20000, 4800] },
    build: (ctx) => buildImportDemo(ctx, 'own'),
  });
  const lods = ([0, 1, 2] as Lod[]).map((lod) => compile(asset, { lod }));
  const high = scan();
  const bake = bakeNormals(high.mesh, headLod(0), {
    size,
    // Just above the LOD0 simplification error (≈ 1 mm), well under the head's thinnest feature.
    cage: 0.004,
    // Albedo: the scan's colour at the hit (vertex colour, its texture already projected).
  });
  const albedo = encodePng(size, size, bake.albedo);
  const normal = encodePng(size, size, bake.normal);
  const glb = withOwnTextures(toLodGlb(lods, { keepParts: true }), [
    { part: 'head', albedo, normal, roughness: 0.55 },
  ]);
  const file = join(out, 'import_demo_textured.glb');
  await Bun.write(file, glb);
  await Bun.write(join(out, 'head_albedo.png'), albedo);
  await Bun.write(join(out, 'head_normal.png'), normal);
  const report = { glb: file, size, hitRate: bake.hitRate, bytes: glb.byteLength };
  await Bun.write(join(out, 'bake.json'), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}
