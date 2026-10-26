// The IR: a triangle mesh with per-vertex normal, UV (into the shared trim sheet) and colour.
// Every primitive emits one; passes and back ends consume one. Nothing else crosses stages.

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

export function boundsOf(m: Mesh): Bounds {
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
  return { positions, normals, uvs, colors, indices };
}
