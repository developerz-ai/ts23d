// The default scene of a read GLB flattened to triangle lists: node transforms (matrix or TRS)
// baked into positions and normals (inverse-transpose; winding flipped under a mirror), strips and
// fans unrolled to triangles, COLOR_0 × baseColorFactor as vertex colour, the baseColor image
// kept for projection. Still in the FILE's frame (glTF Y up); import-glb converts axes.

import { type Mesh, Ts23dError } from '../core/index.ts';
import {
  at,
  type GlbDoc,
  type GltfJson,
  indices,
  list,
  num,
  readAccessor,
  readImage,
} from './glb-read.ts';

export interface ScenePrimitive {
  /** `<node name>` or `node_<i>`, with `_<k>` for a mesh's second+ primitive. */
  readonly name: string;
  readonly mesh: Mesh;
  /** Encoded baseColor image (PNG/JPEG), when the material has one. */
  readonly image?: { readonly bytes: Uint8Array; readonly mime: string };
  /** Normals were absent and must be computed. */
  readonly flatNormals: boolean;
}

type M4 = Float64Array;
const IDENTITY = (): M4 => new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

function mul(a: M4, b: M4): M4 {
  const o = new Float64Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += (a[k * 4 + r] ?? 0) * (b[c * 4 + k] ?? 0);
      o[c * 4 + r] = s;
    }
  return o;
}

const nums = (v: unknown, n: number, def: readonly number[]): number[] =>
  Array.isArray(v) && v.length === n && v.every((x) => typeof x === 'number')
    ? (v as number[])
    : [...def];

/** Column-major local matrix of a node. */
export function localMatrix(node: GltfJson): M4 {
  if (node['matrix'] !== undefined)
    return new Float64Array(nums(node['matrix'], 16, [...IDENTITY()]));
  const [tx, ty, tz] = nums(node['translation'], 3, [0, 0, 0]) as [number, number, number];
  const [x, y, z, w] = nums(node['rotation'], 4, [0, 0, 0, 1]) as [number, number, number, number];
  const [sx, sy, sz] = nums(node['scale'], 3, [1, 1, 1]) as [number, number, number];
  return new Float64Array([
    (1 - 2 * (y * y + z * z)) * sx,
    2 * (x * y + z * w) * sx,
    2 * (x * z - y * w) * sx,
    0,
    2 * (x * y - z * w) * sy,
    (1 - 2 * (x * x + z * z)) * sy,
    2 * (y * z + x * w) * sy,
    0,
    2 * (x * z + y * w) * sz,
    2 * (y * z - x * w) * sz,
    (1 - 2 * (x * x + y * y)) * sz,
    0,
    tx,
    ty,
    tz,
    1,
  ]);
}

/** Every triangle primitive in the default scene, transforms baked. */
export function scenePrimitives(doc: GlbDoc): ScenePrimitive[] {
  const scenes = list(doc.json, 'scenes');
  const sceneIdx = num(doc.json, 'scene', 0);
  const roots: number[] = scenes.length
    ? indices(at(doc, 'scenes', sceneIdx), 'nodes')
    : list(doc.json, 'nodes').map((_, i) => i);
  const out: ScenePrimitive[] = [];
  const seen = new Set<number>();
  const walk = (i: number, parent: M4): void => {
    if (seen.has(i))
      throw new Ts23dError('T3D_IMPORT_GLB', {
        cause: `node ${i} is reached twice (a cycle or a shared child)`,
        fix: 'export the file again; glTF nodes form a strict tree',
      });
    seen.add(i);
    const node = at(doc, 'nodes', i);
    const world = mul(parent, localMatrix(node));
    if (typeof node['mesh'] === 'number') {
      const name = typeof node['name'] === 'string' && node['name'] ? node['name'] : `node_${i}`;
      const prims = list(at(doc, 'meshes', node['mesh']), 'primitives');
      prims.forEach((p, k) => {
        const made = primitive(doc, p, world, k ? `${name}_${k}` : name);
        if (made) out.push(made);
      });
    }
    for (const c of indices(node, 'children')) walk(c, world);
  };
  for (const r of roots) walk(r, IDENTITY());
  return out;
}

function triangles(mode: number, idx: Uint32Array): Uint32Array | null {
  if (mode === 4) return idx;
  const out: number[] = [];
  if (mode === 5)
    for (let i = 2; i < idx.length; i++)
      out.push(
        ...(i % 2 ? [idx[i - 1], idx[i - 2], idx[i]] : [idx[i - 2], idx[i - 1], idx[i]]).map(
          (v) => v ?? 0,
        ),
      );
  else if (mode === 6)
    for (let i = 2; i < idx.length; i++) out.push(idx[0] ?? 0, idx[i - 1] ?? 0, idx[i] ?? 0);
  else return null;
  return Uint32Array.from(out);
}

function primitive(doc: GlbDoc, p: GltfJson, world: M4, name: string): ScenePrimitive | null {
  const attrs = (p['attributes'] ?? {}) as Record<string, unknown>;
  if (typeof attrs['POSITION'] !== 'number') return null;
  const pos = readAccessor(doc, attrs['POSITION']);
  const n = pos.count;
  const raw =
    typeof p['indices'] === 'number'
      ? Uint32Array.from(readAccessor(doc, p['indices']).data)
      : Uint32Array.from({ length: n }, (_, i) => i);
  const tri = triangles(num(p, 'mode', 4), raw);
  if (!tri) return null;
  if (tri.some((v) => v >= n))
    throw new Ts23dError('T3D_IMPORT_GLB', {
      cause: `primitive '${name}' indexes vertex ≥ ${n}`,
      fix: 'export the file again; its index buffer is corrupt',
    });
  const nrm = typeof attrs['NORMAL'] === 'number' ? readAccessor(doc, attrs['NORMAL']) : null;
  const uv =
    typeof attrs['TEXCOORD_0'] === 'number' ? readAccessor(doc, attrs['TEXCOORD_0']) : null;
  const col = typeof attrs['COLOR_0'] === 'number' ? readAccessor(doc, attrs['COLOR_0']) : null;
  const mat = typeof p['material'] === 'number' ? at(doc, 'materials', p['material']) : {};
  const pbr = (mat['pbrMetallicRoughness'] ?? {}) as GltfJson;
  const factor = nums(pbr['baseColorFactor'], 4, [1, 1, 1, 1]);
  const texRef = pbr['baseColorTexture'] as GltfJson | undefined;
  const texIdx = typeof texRef?.['index'] === 'number' ? texRef['index'] : -1;
  const src = texIdx >= 0 ? at(doc, 'textures', texIdx)['source'] : undefined;
  const image = typeof src === 'number' ? readImage(doc, src) : undefined;

  const positions = new Float32Array(n * 3);
  const normals = new Float32Array(n * 3);
  const w = world;
  // Normal matrix = inverse-transpose of the upper 3×3 (cofactors; scale cancels on normalise).
  const m = (r: number, c: number): number => w[c * 4 + r] ?? 0;
  const cof = (r: number, c: number): number => {
    const r1 = (r + 1) % 3;
    const r2 = (r + 2) % 3;
    const c1 = (c + 1) % 3;
    const c2 = (c + 2) % 3;
    return m(r1, c1) * m(r2, c2) - m(r1, c2) * m(r2, c1);
  };
  const det = m(0, 0) * cof(0, 0) + m(0, 1) * cof(0, 1) + m(0, 2) * cof(0, 2);
  for (let i = 0; i < n; i++) {
    const x = pos.data[i * 3] ?? 0;
    const y = pos.data[i * 3 + 1] ?? 0;
    const z = pos.data[i * 3 + 2] ?? 0;
    for (let r = 0; r < 3; r++)
      positions[i * 3 + r] = m(r, 0) * x + m(r, 1) * y + m(r, 2) * z + m(r, 3);
    if (!nrm) continue;
    const a = nrm.data[i * 3] ?? 0;
    const b = nrm.data[i * 3 + 1] ?? 0;
    const c = nrm.data[i * 3 + 2] ?? 0;
    const v = [0, 1, 2].map((r) => cof(r, 0) * a + cof(r, 1) * b + cof(r, 2) * c);
    const l = Math.hypot(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0) * Math.sign(det || 1) || 1;
    for (let r = 0; r < 3; r++) normals[i * 3 + r] = (v[r] ?? 0) / l;
  }
  const indices = new Uint32Array(tri);
  if (det < 0)
    for (let t = 0; t < indices.length; t += 3) {
      const b = indices[t + 1] ?? 0;
      indices[t + 1] = indices[t + 2] ?? 0;
      indices[t + 2] = b;
    }
  const uvs = new Float32Array(n * 2);
  if (uv) uvs.set(uv.data.subarray(0, n * 2));
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++)
    for (let k = 0; k < 3; k++)
      colors[i * 3 + k] = (factor[k] ?? 1) * (col ? (col.data[i * col.width + k] ?? 1) : 1);
  return {
    name,
    mesh: { positions, normals, uvs, colors, indices },
    ...(image ? { image } : {}),
    flatNormals: !nrm,
  };
}
