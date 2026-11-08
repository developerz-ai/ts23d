// What the mesh assertions accept: a bare Mesh, a compiled asset, or an Asset (compiled at the
// LOD asked for). Resolves to named world-space meshes, one per part, plus the shared helpers the
// mesh checks need (triangle corners, welded vertex keys).

import {
  type Asset,
  type CompiledAsset,
  compile,
  isAsset,
  type Lod,
  type Mesh,
  Ts23dError,
  type Vec3,
  worldMeshes,
} from '../core/index.ts';
import { glob } from '../qa/index.ts';

export type MeshInput = Mesh | Asset | CompiledAsset;

export interface MeshScope {
  /** LOD to compile an Asset at. Default 0. */
  readonly lod?: Lod;
  /** Part names or globs to check (default all with geometry). */
  readonly parts?: string | readonly string[];
}

export interface NamedMesh {
  readonly name: string;
  readonly mesh: Mesh;
}

const isMesh = (v: MeshInput): v is Mesh => 'positions' in v && 'indices' in v;

/** The compiled asset behind an input (Asset → compiled at `lod`), or null for a bare Mesh. */
export function compiledOf(input: MeshInput, lod: Lod = 0): CompiledAsset | null {
  if (isMesh(input)) return null;
  return isAsset(input) ? compile(input, { lod }) : (input as CompiledAsset);
}

/** Named world meshes for an input; throws T3D_ASSERT_INPUT when a part filter matches nothing. */
export function meshesOf(input: MeshInput, o: MeshScope = {}): NamedMesh[] {
  const c = compiledOf(input, o.lod);
  if (!c) return [{ name: 'mesh', mesh: input as Mesh }];
  const want = o.parts === undefined ? null : typeof o.parts === 'string' ? [o.parts] : o.parts;
  const world = worldMeshes(c.parts);
  const out = c.parts.flatMap((p) => {
    const mesh = world.get(p.name);
    if (!mesh || mesh.indices.length === 0) return [];
    if (want && !want.some((s) => glob(s).test(p.name))) return [];
    return [{ name: p.name, mesh }];
  });
  if (want && out.length === 0)
    throw new Ts23dError('T3D_ASSERT_INPUT', {
      cause: `no part with geometry matches ${JSON.stringify(want)} in '${c.name}'`,
      fix: 'name the parts (exact or glob, e.g. "hull" or "wheel_*") — t3d build lists them',
    });
  return out;
}

export const vertex = (m: Mesh, i: number): Vec3 => [
  m.positions[i * 3] ?? 0,
  m.positions[i * 3 + 1] ?? 0,
  m.positions[i * 3 + 2] ?? 0,
];

export const corners = (m: Mesh, t: number): [Vec3, Vec3, Vec3] => [
  vertex(m, m.indices[t * 3] ?? 0),
  vertex(m, m.indices[t * 3 + 1] ?? 0),
  vertex(m, m.indices[t * 3 + 2] ?? 0),
];

/** Weld ids by position (0.1 mm grid): flat-shaded faces own their vertices, edges share places. */
export function weldIds(m: Mesh): Int32Array {
  const ids = new Int32Array(m.positions.length / 3);
  const seen = new Map<string, number>();
  for (let i = 0; i < ids.length; i++) {
    const k = `${Math.round((m.positions[i * 3] ?? 0) * 1e4)},${Math.round((m.positions[i * 3 + 1] ?? 0) * 1e4)},${Math.round((m.positions[i * 3 + 2] ?? 0) * 1e4)}`;
    const hit = seen.get(k);
    if (hit !== undefined) ids[i] = hit;
    else {
      ids[i] = seen.size;
      seen.set(k, seen.size);
    }
  }
  return ids;
}

export const cross3 = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const dot3 = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Unit face normal by winding (b − a) × (c − a); zero for a degenerate triangle. */
export function faceNormal(tri: readonly [Vec3, Vec3, Vec3]): Vec3 {
  const n = cross3(sub3(tri[1], tri[0]), sub3(tri[2], tri[0]));
  const l = Math.hypot(n[0], n[1], n[2]);
  return l > 0 ? [n[0] / l, n[1] / l, n[2] / l] : [0, 0, 0];
}

/** Every `stride`-th triangle so at most `max` are probed (deterministic, spread over the mesh). */
export function sampleTriangles(m: Mesh, max: number): number[] {
  const n = m.indices.length / 3;
  const stride = Math.max(1, Math.ceil(n / max));
  const out: number[] = [];
  for (let t = 0; t < n; t += stride) out.push(t);
  return out;
}
