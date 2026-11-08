// Imported parts with their OWN texture set (ADR 011): a written GLB post-processed so named parts
// leave the trim-sheet material for one of their own — baked albedo (sRGB) + tangent-space normal
// map, TANGENT computed with the bake's frame (passes/uvTangents), COLOR_0 dropped so vertex colour
// cannot tint the albedo. Every LOD tree's node of that name gets it. The extra material = one
// extra draw call per part, recorded in `extras.ts23d.ownMaterials` so QA, the manifest and engine
// importers can see the rule was broken on purpose. Byte-deterministic.

import { Ts23dError } from '../core/index.ts';
import { GlbBin, type GltfJson, packGlb, readAccessor, readGlb } from '../neural/index.ts';
import { uvTangents } from '../passes/index.ts';

export interface OwnTextureSet {
  /** Part (node) name, exactly as compiled: every LOD tree's node of this name. */
  readonly part: string;
  /** PNG bytes: sRGB base colour. */
  readonly albedo: Uint8Array;
  /** PNG bytes: tangent-space normal map, glTF green-up. */
  readonly normal: Uint8Array;
  readonly roughness?: number;
}

export function withOwnTextures(glb: Uint8Array, sets: readonly OwnTextureSet[]): Uint8Array {
  const doc = readGlb(glb);
  const json: GltfJson = structuredClone(doc.json);
  const bin = new GlbBin();
  bin.view(doc.bin ?? new Uint8Array());
  const views = (json['bufferViews'] as GltfJson[] | undefined) ?? [];
  const accessors = (json['accessors'] as GltfJson[] | undefined) ?? [];
  const nodes = (json['nodes'] as GltfJson[] | undefined) ?? [];
  const meshes = (json['meshes'] as GltfJson[] | undefined) ?? [];
  const materials = (json['materials'] as GltfJson[] | undefined) ?? [];
  const images = (json['images'] as GltfJson[] | undefined) ?? [];
  const textures = (json['textures'] as GltfJson[] | undefined) ?? [];
  const samplers = (json['samplers'] as GltfJson[] | undefined) ?? [];
  const base = { views: views.length };
  samplers.push({ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 });
  const sampler = samplers.length - 1;
  const own: GltfJson[] = [];
  for (const set of sets) {
    const hits = nodes.filter((n) => n['name'] === set.part && typeof n['mesh'] === 'number');
    if (!hits.length)
      throw new Ts23dError('T3D_RECIPE_INVALID', {
        cause: `withOwnTextures: no node named '${set.part}' with a mesh`,
        fix: "export with { keepParts: true } so parts are not merged into their pivot, and use the part's compiled name",
      });
    const tex = (png: Uint8Array): number => {
      images.push({ bufferView: base.views + bin.view(png) - 1, mimeType: 'image/png' });
      textures.push({ sampler, source: images.length - 1 });
      return textures.length - 1;
    };
    materials.push({
      name: `${set.part}_own`,
      pbrMetallicRoughness: {
        baseColorTexture: { index: tex(set.albedo) },
        metallicFactor: 0,
        roughnessFactor: set.roughness ?? 0.6,
      },
      normalTexture: { index: tex(set.normal) },
    });
    const material = materials.length - 1;
    for (const node of hits) {
      const mesh = meshes[node['mesh'] as number] ?? {};
      for (const prim of (mesh['primitives'] as GltfJson[] | undefined) ?? []) {
        const attrs = { ...((prim['attributes'] ?? {}) as Record<string, number>) };
        const pos = readAccessor(doc, attrs['POSITION'] ?? -1).data;
        const nrm = readAccessor(doc, attrs['NORMAL'] ?? -1).data;
        const uv = readAccessor(doc, attrs['TEXCOORD_0'] ?? -1).data;
        const idx =
          typeof prim['indices'] === 'number'
            ? Uint32Array.from(readAccessor(doc, prim['indices']).data)
            : Uint32Array.from({ length: pos.length / 3 }, (_, i) => i);
        const tangents = uvTangents({
          positions: pos,
          normals: nrm,
          uvs: uv,
          colors: pos,
          indices: idx,
        });
        bin.accessor(tangents, 'VEC4');
        const acc = bin.accessors[bin.accessors.length - 1] ?? {};
        acc['bufferView'] = base.views + (acc['bufferView'] as number) - 1;
        accessors.push(acc);
        attrs['TANGENT'] = accessors.length - 1;
        delete attrs['COLOR_0'];
        prim['attributes'] = attrs;
        prim['material'] = material;
        delete prim['extensions'];
      }
    }
    own.push({ part: set.part, material: `${set.part}_own`, nodes: hits.length });
  }
  // bin.views[0] is the original BIN (offset 0); later views shift by the base count.
  for (const v of bin.views.slice(1)) views.push(v);
  const body = bin.bytes();
  const extras = (json['extras'] as GltfJson | undefined) ?? {};
  const ts23d = (extras['ts23d'] as GltfJson | undefined) ?? {};
  Object.assign(json, {
    extras: { ...extras, ts23d: { ...ts23d, ownMaterials: own } },
    materials,
    images,
    textures,
    samplers,
    bufferViews: views,
    accessors,
    buffers: [{ byteLength: body.byteLength }],
  });
  return packGlb(json, body);
}
