// The GLB container written back (header + space-padded JSON + zero-padded BIN), and a tiny
// plain-mesh GLB writer for import fixtures and tests: one node per mesh with optional TRS, a
// baseColor image, and nothing else. The asset exporter lives in /export; this is the import
// side's own round-trip tool, so /neural (tier 2) needs nothing above it.

import type { Mesh } from '../core/index.ts';
import type { GltfJson } from './glb-read.ts';

export function packGlb(json: GltfJson, bin: Uint8Array): Uint8Array {
  let j = new TextEncoder().encode(JSON.stringify(json));
  const pad = (4 - (j.byteLength % 4)) % 4;
  if (pad) {
    const p = new Uint8Array(j.byteLength + pad).fill(0x20);
    p.set(j);
    j = p;
  }
  const binLen = Math.ceil(bin.byteLength / 4) * 4;
  const total = 12 + 8 + j.byteLength + (binLen ? 8 + binLen : 0);
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, j.byteLength, true);
  dv.setUint32(16, 0x4e4f534a, true);
  out.set(j, 20);
  if (binLen) {
    const at = 20 + j.byteLength;
    dv.setUint32(at, binLen, true);
    dv.setUint32(at + 4, 0x004e4942, true);
    out.set(bin, at + 8);
  }
  return out;
}

/** Appends typed arrays 4-byte aligned, recording bufferViews (+ accessors on demand). */
export class GlbBin {
  private parts: Uint8Array[] = [];
  length = 0;
  readonly views: GltfJson[] = [];
  readonly accessors: GltfJson[] = [];

  view(bytes: Uint8Array): number {
    const pad = (4 - (this.length % 4)) % 4;
    if (pad) this.parts.push(new Uint8Array(pad));
    this.length += pad;
    this.views.push({ buffer: 0, byteOffset: this.length, byteLength: bytes.byteLength });
    this.parts.push(bytes);
    this.length += bytes.byteLength;
    return this.views.length - 1;
  }

  accessor(data: Float32Array | Uint32Array, type: string, minMax = false): number {
    const w = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[type] ?? 1;
    const acc: GltfJson = {
      bufferView: this.view(new Uint8Array(data.buffer, data.byteOffset, data.byteLength)),
      componentType: data instanceof Uint32Array ? 5125 : 5126,
      count: data.length / w,
      type,
    };
    if (minMax) {
      const min = Array<number>(w).fill(Infinity);
      const max = Array<number>(w).fill(-Infinity);
      data.forEach((v, i) => {
        min[i % w] = Math.min(min[i % w] ?? 0, v);
        max[i % w] = Math.max(max[i % w] ?? 0, v);
      });
      Object.assign(acc, { min, max });
    }
    this.accessors.push(acc);
    return this.accessors.length - 1;
  }

  bytes(): Uint8Array {
    const out = new Uint8Array(Math.ceil(this.length / 4) * 4);
    let o = 0;
    for (const p of this.parts) {
      out.set(p, o);
      o += p.byteLength;
    }
    return out;
  }
}

export interface FixtureNode {
  readonly name: string;
  readonly mesh: Mesh;
  readonly translation?: readonly [number, number, number];
  readonly rotation?: readonly [number, number, number, number];
  readonly scale?: readonly [number, number, number];
  /** PNG bytes bound as baseColorTexture. */
  readonly png?: Uint8Array;
}

/** A plain GLB (glTF frame as given: the caller supplies Y-up data) with one node per mesh. */
export function writeMeshGlb(nodes: readonly FixtureNode[], extras: GltfJson = {}): Uint8Array {
  const bin = new GlbBin();
  const meshes: GltfJson[] = [];
  const materials: GltfJson[] = [];
  const images: GltfJson[] = [];
  const textures: GltfJson[] = [];
  nodes.forEach((n) => {
    const m = n.mesh;
    const colors = new Float32Array((m.colors.length / 3) * 4);
    for (let i = 0; i < m.colors.length / 3; i++)
      colors.set(
        [m.colors[i * 3] ?? 1, m.colors[i * 3 + 1] ?? 1, m.colors[i * 3 + 2] ?? 1, 1],
        i * 4,
      );
    const pbr: GltfJson = { metallicFactor: 0, roughnessFactor: 0.6 };
    if (n.png) {
      images.push({ bufferView: bin.view(n.png), mimeType: 'image/png' });
      textures.push({ source: images.length - 1 });
      pbr['baseColorTexture'] = { index: textures.length - 1 };
    }
    materials.push({ pbrMetallicRoughness: pbr });
    meshes.push({
      primitives: [
        {
          attributes: {
            POSITION: bin.accessor(m.positions, 'VEC3', true),
            NORMAL: bin.accessor(m.normals, 'VEC3'),
            TEXCOORD_0: bin.accessor(m.uvs, 'VEC2'),
            COLOR_0: bin.accessor(colors, 'VEC4'),
          },
          indices: bin.accessor(m.indices, 'SCALAR'),
          material: materials.length - 1,
        },
      ],
    });
  });
  const body = bin.bytes();
  const json: GltfJson = {
    asset: { version: '2.0', generator: 'ts23d import fixture' },
    ...(Object.keys(extras).length ? { extras } : {}),
    scene: 0,
    scenes: [{ nodes: nodes.map((_, i) => i) }],
    nodes: nodes.map((n, i) => ({
      name: n.name,
      mesh: i,
      ...(n.translation ? { translation: n.translation } : {}),
      ...(n.rotation ? { rotation: n.rotation } : {}),
      ...(n.scale ? { scale: n.scale } : {}),
    })),
    meshes,
    materials,
    ...(images.length ? { images, textures } : {}),
    buffers: [{ byteLength: body.byteLength }],
    bufferViews: bin.views,
    accessors: bin.accessors,
  };
  return packGlb(json, body);
}
