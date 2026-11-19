// The IR: a triangle mesh with per-vertex normal, UV (into the shared trim sheet) and colour.
// Every primitive emits one; passes and back ends consume one. Nothing else crosses stages.
// Skinned bodies add 4 joint/weight influences per vertex and morph targets (ADR 013).

import { Ts23dError } from './errors.ts';
import { type MappedMaterial, mappedOf } from './material-use.ts';
import type { Vec2, Vec3 } from './vec.ts';

export interface Bounds {
  readonly min: Vec3;
  readonly max: Vec3;
}

export interface Mesh {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly colors: Float32Array;
  readonly indices: Uint32Array;
  /** Skin: 4 bone indices per vertex (into the asset skeleton). Present iff `weights` is. */
  readonly joints?: Uint16Array;
  /** Skin: 4 weights per vertex matching `joints`. Present iff `joints` is. */
  readonly weights?: Float32Array;
  /** Morph targets: per-vertex displacements from `positions` (glTF targets), same length. */
  readonly morphs?: readonly Morph[];
  /**
   * Project materials (custom trim-sheet strips) the UVs were mapped onto, in row order: set by
   * whatever maps the UVs, carried by everything that makes a mesh from meshes, and recorded by
   * the compile the mesh is added to (core/material-use.ts). Never exported.
   */
  readonly mapped?: readonly MappedMaterial[];
}

export interface Morph {
  readonly name: string;
  /** Displacement (delta, metres) per vertex, length = positions.length. */
  readonly positions: Float32Array;
}

/** Influences per skinned vertex (glTF JOINTS_0 / WEIGHTS_0). */
export const SKIN_INFLUENCES = 4;

/**
 * Skin and morph attributes line up with the vertices: joints and weights both or neither, 4 per
 * vertex; morph names unique, one delta per vertex. Weight sums are the skinning pass's check.
 */
export function checkMeshAttributes(m: Mesh, label: string): Mesh {
  const verts = m.positions.length / 3;
  const skin = (cause: string, fix: string): never => {
    throw new Ts23dError('T3D_SKIN_INVALID', { cause: `${label}: ${cause}`, fix });
  };
  if ((m.joints === undefined) !== (m.weights === undefined))
    skin(
      `has ${m.joints ? 'joints without weights' : 'weights without joints'}`,
      'set both joints (Uint16Array) and weights (Float32Array), 4 per vertex, or neither',
    );
  if (m.joints && m.weights) {
    const want = verts * SKIN_INFLUENCES;
    if (m.joints.length !== want || m.weights.length !== want)
      skin(
        `${verts} vertices but ${m.joints.length} joints / ${m.weights.length} weights`,
        `give exactly ${SKIN_INFLUENCES} influences per vertex (${want} values); pad with weight 0`,
      );
  }
  const names = new Set<string>();
  for (const t of m.morphs ?? []) {
    const where = `${label}: morph '${t.name}'`;
    if (names.has(t.name))
      throw new Ts23dError('T3D_RECIPE_INVALID', {
        cause: `${where} is declared twice`,
        fix: 'give each morph target a unique name: blink_l, jaw_open',
      });
    names.add(t.name);
    if (t.positions.length !== m.positions.length)
      throw new Ts23dError('T3D_RECIPE_INVALID', {
        cause: `${where} has ${t.positions.length / 3} deltas for ${verts} vertices`,
        fix: 'build the morph from the same mesh: one displacement per vertex, zero where still',
      });
  }
  return m;
}

export interface Vertex {
  readonly p: Vec3;
  readonly n: Vec3;
  readonly uv: Vec2;
  readonly color: Vec3;
}

export class MeshBuilder {
  private readonly p: number[] = [];
  private readonly n: number[] = [];
  private readonly uv: number[] = [];
  private readonly c: number[] = [];
  private readonly idx: number[] = [];

  vertex(v: Vertex): number {
    this.p.push(...v.p);
    this.n.push(...v.n);
    this.uv.push(...v.uv);
    this.c.push(...v.color);
    return this.p.length / 3 - 1;
  }

  tri(a: number, b: number, c: number): this {
    this.idx.push(a, b, c);
    return this;
  }

  /** Counter-clockwise quad a-b-c-d as seen from the side its normal faces. */
  quad(a: number, b: number, c: number, d: number): this {
    return this.tri(a, b, c).tri(a, c, d);
  }

  build(): Mesh {
    return {
      positions: new Float32Array(this.p),
      normals: new Float32Array(this.n),
      uvs: new Float32Array(this.uv),
      colors: new Float32Array(this.c),
      indices: new Uint32Array(this.idx),
    };
  }
}

export const triangleCount = (m: Mesh): number => m.indices.length / 3;

/**
 * Axis-aligned bounds of a mesh. An empty mesh (no positions) has zero-size bounds at the origin
 * (min = max = [0, 0, 0]), never ±Infinity; callers that union boxes should skip empty meshes.
 */
export function boundsOf(m: Mesh): Bounds {
  if (m.positions.length < 3) return { min: [0, 0, 0], max: [0, 0, 0] };
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = m.positions[i + k] ?? 0;
      if (v < (min[k] ?? 0)) min[k] = v;
      if (v > (max[k] ?? 0)) max[k] = v;
    }
  }
  return {
    min: [min[0] ?? 0, min[1] ?? 0, min[2] ?? 0],
    max: [max[0] ?? 0, max[1] ?? 0, max[2] ?? 0],
  };
}

/** Bake a translation into a mesh (parts are authored in parent space, then offset). */
export function translate(m: Mesh, by: Vec3): Mesh {
  const positions = new Float32Array(m.positions);
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = (positions[i] ?? 0) + by[0];
    positions[i + 1] = (positions[i + 1] ?? 0) + by[1];
    positions[i + 2] = (positions[i + 2] ?? 0) + by[2];
  }
  return { ...m, positions };
}

export function merge(meshes: readonly Mesh[]): Mesh {
  // Preallocated from summed lengths: no intermediate arrays, no spread (which overflows the
  // call stack on very large inputs).
  const sum = (f: (m: Mesh) => number): number => meshes.reduce((t, m) => t + f(m), 0);
  const positions = new Float32Array(sum((m) => m.positions.length));
  const normals = new Float32Array(sum((m) => m.normals.length));
  const uvs = new Float32Array(sum((m) => m.uvs.length));
  const colors = new Float32Array(sum((m) => m.colors.length));
  const indices = new Uint32Array(sum((m) => m.indices.length));
  let v = 0;
  let uv = 0;
  let ix = 0;
  for (const m of meshes) {
    positions.set(m.positions, v * 3);
    normals.set(m.normals, v * 3);
    colors.set(m.colors, v * 3);
    uvs.set(m.uvs, uv);
    for (let i = 0; i < m.indices.length; i++) indices[ix + i] = (m.indices[i] ?? 0) + v;
    v += m.positions.length / 3;
    uv += m.uvs.length;
    ix += m.indices.length;
  }
  return {
    positions,
    normals,
    uvs,
    colors,
    indices,
    ...mergeSkin(meshes),
    ...mergeMorphs(meshes),
    ...mappedOf(...meshes),
  };
}

/** Skins concatenate when every input is skinned; a mix would silently unbind the rigid pieces. */
function mergeSkin(meshes: readonly Mesh[]): Pick<Mesh, 'joints' | 'weights'> {
  const skinned = meshes.filter((m) => m.joints && m.weights).length;
  if (skinned === 0) return {};
  if (skinned < meshes.length)
    throw new Ts23dError('T3D_SKIN_INVALID', {
      cause: `merge of ${meshes.length} meshes where only ${skinned} are skinned`,
      fix: 'weight the rigid pieces fully to one bone (joints [b,0,0,0], weights [1,0,0,0]) before merging',
    });
  const joints = new Uint16Array(meshes.reduce((t, m) => t + (m.joints?.length ?? 0), 0));
  const weights = new Float32Array(joints.length);
  let at = 0;
  for (const m of meshes) {
    if (m.joints) joints.set(m.joints, at);
    if (m.weights) weights.set(m.weights, at);
    at += m.joints?.length ?? 0;
  }
  return { joints, weights };
}

/** Morph targets merge by name; a mesh without one stays still under it (zero deltas). */
function mergeMorphs(meshes: readonly Mesh[]): Pick<Mesh, 'morphs'> {
  const names = [...new Set(meshes.flatMap((m) => (m.morphs ?? []).map((t) => t.name)))];
  if (names.length === 0) return {};
  const total = meshes.reduce((t, m) => t + m.positions.length, 0);
  const morphs = names.map((name) => {
    const positions = new Float32Array(total);
    let at = 0;
    for (const m of meshes) {
      const t = m.morphs?.find((x) => x.name === name);
      if (t) positions.set(t.positions, at);
      at += m.positions.length;
    }
    return { name, positions };
  });
  return { morphs };
}
