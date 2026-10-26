// glTF 2.0 binary writer. One material (the trim sheet) for the whole asset, one node per part
// with its pivot as translation, and each part's motion baked as a looping animation clip.
// Zero dependencies and byte-deterministic: same CompiledAsset in, same bytes out.

import type { CompiledAsset, Part } from '../core/index.ts';
import { quatFromAxisAngle } from '../core/index.ts';
import { ARRAY_BUFFER, BinWriter, ELEMENT_ARRAY_BUFFER, type Json } from './bin-writer.ts';
import { materialsFor } from './materials.ts';
import { mergeToPivots } from './merge-pivots.ts';
import { motionChannel } from './motion.ts';
import { tangentsOf } from './tangents.ts';
import { type SheetBinding, sheetGltf } from './textures.ts';

// Viewers auto-play the FIRST clip and glTF has no "paused" flag, so the first clip is `rest`: two
// keys holding the root's rest rotation. The file opens still; pick `run` to play it.
// Authoring frame: Z up, +X front. glTF: Y up, +Z front, +X = the asset's left. This root
// rotation maps +X→+Z, +Z→+Y, +Y→+X (verified numerically), so assets face forward in engines.
const Z_UP_TO_Y_UP = [-0.5, -0.5, -0.5, 0.5];
function restClip(bin: BinWriter): Json {
  const input = bin.accessor(new Float32Array([0, 1]), 'SCALAR', undefined, true);
  const output = bin.accessor(new Float32Array([...Z_UP_TO_Y_UP, ...Z_UP_TO_Y_UP]), 'VEC4');
  return {
    name: 'rest',
    samplers: [{ input, output, interpolation: 'STEP' }],
    channels: [{ sampler: 0, target: { node: 0, path: 'rotation' } }],
  };
}

export interface GlbOptions {
  /** Keep every part as its own node (debugging, per-part picking). Default merges to pivots. */
  readonly keepParts?: boolean;
  /**
   * Bake each part's `motion` into a looping `run` clip. Off by default: glTF has no autoplay
   * flag and most viewers play the first clip, while engines usually drive the named pivots
   * from game code. Turn it on for previews, cutscenes and ambient props.
   */
  readonly animations?: boolean;
  /**
   * Bind the painted trim sheet to every material: a `PaintedSheet` embeds the three PNGs (one
   * self-contained file); `{ external: true, prefix? }` references shared `trim_sheet_*.png` by
   * URI. Omitted: no textures, byte-identical to the untextured output.
   */
  readonly sheet?: SheetBinding;
}

export function toGlb(input: CompiledAsset, o: GlbOptions = {}): Uint8Array {
  const asset = o.keepParts ? input : mergeToPivots(input);
  const mats = materialsFor(
    new Set(asset.parts.flatMap((p) => (p.surface ? [p.surface] : []))),
    o.sheet !== undefined,
  );
  const bin = new BinWriter();
  const meshes: Json[] = [];
  const nodes: Json[] = [{ name: asset.name, children: [] as number[] }];
  const index = new Map<string, number>();
  const samplers: Json[] = [];
  const channels: Json[] = [];

  asset.parts.forEach((part: Part) => {
    const node: Json = { name: part.name, translation: [...part.at] };
    if (part.yaw) node['rotation'] = [...quatFromAxisAngle([0, 0, 1], part.yaw)];
    if (part.emitter || part.socket) {
      node['extras'] = {
        ts23d: {
          ...(part.emitter ? { emitter: part.emitter } : {}),
          ...(part.socket ? { socket: part.socket } : {}),
        },
      };
    }
    if (part.mesh && part.mesh.indices.length > 0) {
      const m = part.mesh;
      // COLOR_0 as normalised unsigned short RGBA: 8 bytes/vertex instead of 16, no banding in
      // darks (8-bit would). VEC4 because vertex attributes must be 4-byte aligned.
      const colors = new Uint16Array((m.colors.length / 3) * 4);
      const q = (v: number): number => Math.round(Math.min(1, Math.max(0, v)) * 65535);
      for (let i = 0; i < m.colors.length / 3; i++)
        colors.set(
          [
            q(m.colors[i * 3] ?? 1),
            q(m.colors[i * 3 + 1] ?? 1),
            q(m.colors[i * 3 + 2] ?? 1),
            65535,
          ],
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
              COLOR_0: bin.accessor(colors, 'VEC4', ARRAY_BUFFER, false, true),
              // A bound normal map needs a tangent space (validator S10 / G15).
              ...(o.sheet ? { TANGENT: bin.accessor(tangentsOf(m), 'VEC4', ARRAY_BUFFER) } : {}),
            },
            // 16-bit indices whenever the primitive allows: half the bytes, every engine reads them.
            indices: bin.accessor(
              m.positions.length / 3 <= 65535 ? Uint16Array.from(m.indices) : m.indices,
              'SCALAR',
              ELEMENT_ARRAY_BUFFER,
            ),
            material: mats.index.get(part.surface ?? 'opaque') ?? 0,
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
    if (part.motion && o.animations) {
      const { sampler, channel } = motionChannel(bin, part.motion, id, part.at);
      samplers.push(sampler);
      channels.push({ ...channel, sampler: samplers.length - 1 });
    }
  });

  // Every accessor — the rest clip's included — must be written BEFORE the buffer is sealed.
  const animations = channels.length ? [restClip(bin), { name: 'run', samplers, channels }] : [];
  const geometry = bin.bytes();
  const tex = o.sheet ? sheetGltf(o.sheet, bin.views, geometry.byteLength) : null;
  const body = tex?.tail.byteLength ? concat(geometry, tex.tail) : geometry;
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
    materials: mats.materials,
    ...(tex ? tex.json : {}),
    ...(mats.extensionsUsed.length ? { extensionsUsed: mats.extensionsUsed } : {}),
    buffers: [{ byteLength: body.byteLength }],
    bufferViews: bin.views,
    accessors: bin.accessors,
    ...(animations.length ? { animations } : {}),
  };
  const root = nodes[0];
  if (root) root['rotation'] = Z_UP_TO_Y_UP;

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

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.byteLength + b.byteLength);
  out.set(a);
  out.set(b, a.byteLength);
  return out;
}
