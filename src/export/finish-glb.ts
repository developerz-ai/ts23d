// The AI finish as a GLB layer: takes a GLB written by exportLodGlb (LOD0 = the finished asset,
// whose finishable parts carry atlas UVs) and adds ONE material, `ts23d_finish`, with the finish's
// own texture set (albedo sRGB, ORM, detail normal when the primitives have tangents). Only LOD0
// primitives on the plain trim material switch to it; LOD1/2, glass, cutout, painted (liveries),
// named finishes and glow keep theirs. Nodes, meshes' geometry accessors, animations, physics and
// audio are untouched; provenance goes to `extras.ts23d.finish`. Byte-deterministic.

import { Ts23dError } from '../core/index.ts';
import type { Json } from './bin-writer.ts';
import { concat, packGlb } from './container.ts';

export interface FinishLayer {
  /** PNG bytes. */
  readonly albedo: Uint8Array;
  readonly orm: Uint8Array;
  readonly normal?: Uint8Array;
  /** Model, prompt, seed, cache key, licence… (JSON-safe). */
  readonly provenance: Readonly<Record<string, unknown>>;
}

export const FINISH_MATERIAL = 'ts23d_finish';

const LINEAR = 9729;
const LINEAR_MIPMAP_LINEAR = 9987;
const CLAMP_TO_EDGE = 33071;

const invalid = (cause: string): never => {
  throw new Ts23dError('T3D_FINISH_INVALID', {
    cause,
    fix: 'pass exportLodGlb([finished.asset, lod1, lod2]).glb: LOD0 must be the finished asset with opaque trim parts',
  });
};

/** Split a GLB into its JSON and BIN chunks. */
export function readGlbChunks(glb: Uint8Array): { json: Json; bin: Uint8Array } {
  const dv = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  if (glb.byteLength < 20 || dv.getUint32(0, true) !== 0x46546c67) invalid('not a GLB');
  const jsonLen = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLen))) as Json;
  const at = 20 + jsonLen;
  const bin =
    at + 8 <= glb.byteLength
      ? glb.subarray(at + 8, at + 8 + dv.getUint32(at, true))
      : new Uint8Array();
  return { json, bin };
}

const arr = (v: unknown): Json[] => (Array.isArray(v) ? (v as Json[]) : []);

/** Mesh indices reachable from the scene's root nodes (LOD0; MSFT_lod alternates sit outside). */
function lod0Meshes(json: Json): Set<number> {
  const nodes = arr(json['nodes']);
  const scene = arr(json['scenes'])[0];
  const stack = [...((scene?.['nodes'] as number[] | undefined) ?? [])];
  const meshes = new Set<number>();
  while (stack.length) {
    const n = nodes[stack.pop() ?? 0];
    if (!n) continue;
    if (typeof n['mesh'] === 'number') meshes.add(n['mesh']);
    stack.push(...((n['children'] as number[] | undefined) ?? []));
  }
  return meshes;
}

export function withFinishLayer(glb: Uint8Array, layer: FinishLayer): Uint8Array {
  const { json, bin } = readGlbChunks(glb);
  const materials = arr(json['materials']);
  const trim = materials.findIndex((m) => m['name'] === 'ts23d_trim');
  if (trim < 0) invalid('the GLB has no ts23d_trim material');
  const prims = [...lod0Meshes(json)]
    .sort((a, b) => a - b)
    .flatMap((m) => arr(arr(json['meshes'])[m]?.['primitives']))
    .filter((p) => p['material'] === trim);
  if (prims.length === 0) invalid('no LOD0 primitive uses the trim material');
  const tangents = prims.every(
    (p) => (p['attributes'] as Json | undefined)?.['TANGENT'] !== undefined,
  );
  const images = arr(json['images']);
  const textures = arr(json['textures']);
  const samplers = arr(json['samplers']);
  const views = arr(json['bufferViews']);
  const sampler = samplers.length;
  samplers.push({
    magFilter: LINEAR,
    minFilter: LINEAR_MIPMAP_LINEAR,
    wrapS: CLAMP_TO_EDGE,
    wrapT: CLAMP_TO_EDGE,
  });
  const maps: [string, Uint8Array][] = [
    ['albedo', layer.albedo],
    ['orm', layer.orm],
    ...(tangents && layer.normal ? [['normal', layer.normal] as [string, Uint8Array]] : []),
  ];
  let body = bin;
  const index: Record<string, number> = {};
  for (const [name, png] of maps) {
    const offset = body.byteLength + ((4 - (body.byteLength % 4)) % 4);
    body = concat(concat(body, new Uint8Array(offset - body.byteLength)), png);
    views.push({ buffer: 0, byteOffset: offset, byteLength: png.byteLength });
    images.push({ name: `finish_${name}`, bufferView: views.length - 1, mimeType: 'image/png' });
    textures.push({ sampler, source: images.length - 1 });
    index[name] = textures.length - 1;
  }
  body = concat(body, new Uint8Array((4 - (body.byteLength % 4)) % 4));
  materials.push({
    name: FINISH_MATERIAL,
    pbrMetallicRoughness: {
      baseColorTexture: { index: index['albedo'] },
      metallicRoughnessTexture: { index: index['orm'] },
      metallicFactor: 1,
      roughnessFactor: 1,
    },
    occlusionTexture: { index: index['orm'] },
    ...(index['normal'] !== undefined ? { normalTexture: { index: index['normal'] } } : {}),
  });
  for (const p of prims) p['material'] = materials.length - 1;
  const extras = (json['extras'] as Json | undefined) ?? {};
  const ts = (extras['ts23d'] as Json | undefined) ?? {};
  const out: Json = {
    ...json,
    extras: { ...extras, ts23d: { ...ts, finish: layer.provenance } },
    materials,
    images,
    textures,
    samplers,
    bufferViews: views,
    buffers: [{ byteLength: body.byteLength }],
  };
  return packGlb(out, body);
}
