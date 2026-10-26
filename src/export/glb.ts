// glTF 2.0 binary writer. One material (the trim sheet) for the whole asset, one node per part
// with its pivot as translation, and each part's motion baked as a looping animation clip.
// Zero dependencies and byte-deterministic: same CompiledAsset in, same bytes out.

import type { CompiledAsset, Part } from '../core/index.ts';
import { quatFromAxisAngle } from '../core/index.ts';
import { ARRAY_BUFFER, BinWriter, ELEMENT_ARRAY_BUFFER, type Json } from './bin-writer.ts';
import { motionChannel } from './motion.ts';

export function toGlb(asset: CompiledAsset): Uint8Array {
  const bin = new BinWriter();
  const meshes: Json[] = [];
  const nodes: Json[] = [{ name: asset.name, children: [] as number[] }];
  const index = new Map<string, number>();
  const samplers: Json[] = [];
  const channels: Json[] = [];

  asset.parts.forEach((part: Part) => {
    const node: Json = { name: part.name, translation: [...part.at] };
    if (part.yaw) node['rotation'] = [...quatFromAxisAngle([0, 0, 1], part.yaw)];
    if (part.mesh && part.mesh.indices.length > 0) {
      const m = part.mesh;
      const colors = new Float32Array((m.colors.length / 3) * 4);
      for (let i = 0; i < m.colors.length / 3; i++)
        colors.set(
          [m.colors[i * 3] ?? 1, m.colors[i * 3 + 1] ?? 1, m.colors[i * 3 + 2] ?? 1, 1],
          i * 4,
        );
      meshes.push({
        name: part.name,
        primitives: [
          {
            attributes: {
              POSITION: bin.accessor(m.positions, 'VEC3', ARRAY_BUFFER, true),
              NORMAL: bin.accessor(m.normals, 'VEC3', ARRAY_BUFFER),
              TEXCOORD_0: bin.accessor(m.uvs, 'VEC2', ARRAY_BUFFER),
              COLOR_0: bin.accessor(colors, 'VEC4', ARRAY_BUFFER),
            },
            indices: bin.accessor(m.indices, 'SCALAR', ELEMENT_ARRAY_BUFFER),
            material: 0,
          },
        ],
      });
      node['mesh'] = meshes.length - 1;
    }
    nodes.push(node);
    const id = nodes.length - 1;
    index.set(part.name, id);
    const parent = nodes[part.parent === null ? 0 : (index.get(part.parent) ?? 0)];
    const kids = (parent?.['children'] as number[] | undefined) ?? [];
    kids.push(id);
    if (parent) parent['children'] = kids;
    if (part.motion) {
      const { sampler, channel } = motionChannel(bin, part.motion, id, part.at);
      samplers.push(sampler);
      channels.push({ ...channel, sampler: samplers.length - 1 });
    }
  });

  const body = bin.bytes();
  const gltf: Json = {
    asset: { version: '2.0', generator: '@developerz-ai/ts23d' },
    extras: {
      kind: asset.kind,
      lod: asset.lod,
      units: 'metres',
      up: 'Z (rotated to glTF Y-up at the root)',
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes,
    meshes,
    // Shared trim-sheet material. Texture binding lands with the sheet painter (roadmap M2);
    // until then vertex colour carries the look.
    materials: [
      {
        name: 'ts23d_trim',
        pbrMetallicRoughness: {
          baseColorFactor: [1, 1, 1, 1],
          metallicFactor: 0,
          roughnessFactor: 0.8,
        },
      },
    ],
    buffers: [{ byteLength: body.byteLength }],
    bufferViews: bin.views,
    accessors: bin.accessors,
    ...(channels.length ? { animations: [{ name: 'run', samplers, channels }] } : {}),
  };
  // Authoring is Z-up; glTF is Y-up. One rotation on the root keeps every part's numbers readable.
  const root = nodes[0];
  if (root) root['rotation'] = [-Math.SQRT1_2, 0, 0, Math.SQRT1_2];

  let json = new TextEncoder().encode(JSON.stringify(gltf));
  const jsonPad = (4 - (json.byteLength % 4)) % 4;
  if (jsonPad) {
    const padded = new Uint8Array(json.byteLength + jsonPad).fill(0x20);
    padded.set(json);
    json = padded;
  }
  const total = 12 + 8 + json.byteLength + 8 + body.byteLength;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, json.byteLength, true);
  dv.setUint32(16, 0x4e4f534a, true);
  out.set(json, 20);
  const binAt = 20 + json.byteLength;
  dv.setUint32(binAt, body.byteLength, true);
  dv.setUint32(binAt + 4, 0x004e4942, true);
  out.set(body, binAt + 8);
  return out;
}
