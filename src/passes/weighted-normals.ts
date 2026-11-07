// Face-weighted vertex normals with a hard-edge split: the mid-poly hard-surface look. Each corner
// averages the face normals around its position, weighted by face area × corner angle, but only
// over faces within `hardAngle` of its own face. Big flat faces dominate, so a bevelled box keeps
// dead-flat sides while its bevels bend the light into soft highlights — no normal map needed.

import type { Mesh, Vec3 } from '../core/index.ts';

export interface WeightedNormalsOptions {
  /** Faces meeting at more than this many degrees keep a hard edge. Default 40. */
  readonly hardAngle?: number;
  /** Positions closer than this (metres) count as one point. Default 1e-5. */
  readonly epsilon?: number;
}

interface Corner {
  readonly n: Vec3;
  readonly w: number;
}

function faceData(m: Mesh, t: number): { n: Vec3; area: number; angles: Vec3 } {
  const p = (k: number): Vec3 => {
    const i = (m.indices[t * 3 + k] ?? 0) * 3;
    return [m.positions[i] ?? 0, m.positions[i + 1] ?? 0, m.positions[i + 2] ?? 0];
  };
  const v = [p(0), p(1), p(2)] as const;
  const e = (a: Vec3, b: Vec3): Vec3 => [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const u = e(v[0], v[1]);
  const w = e(v[0], v[2]);
  const g: Vec3 = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
  const len = Math.hypot(...g);
  const angle = (k: number): number => {
    const a = e(v[k] ?? v[0], v[(k + 1) % 3] ?? v[0]);
    const b = e(v[k] ?? v[0], v[(k + 2) % 3] ?? v[0]);
    const d = Math.hypot(...a) * Math.hypot(...b);
    return d
      ? Math.acos(Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / d)))
      : 0;
  };
  return {
    n: len ? [g[0] / len, g[1] / len, g[2] / len] : [0, 0, 0],
    area: len / 2,
    angles: [angle(0), angle(1), angle(2)],
  };
}

export function weightedNormals(m: Mesh, o: WeightedNormalsOptions = {}): Mesh {
  const cosHard = Math.cos(((o.hardAngle ?? 40) * Math.PI) / 180);
  const eps = o.epsilon ?? 1e-5;
  const tris = m.indices.length / 3;
  const corners: Corner[] = [];
  for (let t = 0; t < tris; t++) {
    const f = faceData(m, t);
    for (let k = 0; k < 3; k++) corners.push({ n: f.n, w: f.area * (f.angles[k] ?? 0) });
  }
  // Group corners by quantised position (insertion order — deterministic).
  const groups = new Map<string, number[]>();
  const keyOf = (i: number): string =>
    [0, 1, 2].map((k) => Math.round((m.positions[i * 3 + k] ?? 0) / eps)).join(',');
  for (let c = 0; c < corners.length; c++) {
    const key = keyOf(m.indices[c] ?? 0);
    const g = groups.get(key);
    if (g) g.push(c);
    else groups.set(key, [c]);
  }
  const normal = new Float32Array(corners.length * 3);
  for (const g of groups.values())
    for (const c of g) {
      const me = corners[c];
      if (!me) continue;
      let x = 0;
      let y = 0;
      let z = 0;
      for (const d of g) {
        const o2 = corners[d];
        if (!o2 || me.n[0] * o2.n[0] + me.n[1] * o2.n[1] + me.n[2] * o2.n[2] < cosHard) continue;
        x += o2.n[0] * o2.w;
        y += o2.n[1] * o2.w;
        z += o2.n[2] * o2.w;
      }
      const len = Math.hypot(x, y, z);
      // A degenerate face keeps its original normal.
      const src = (m.indices[c] ?? 0) * 3;
      normal.set(
        len > 1e-12
          ? [x / len, y / len, z / len]
          : [m.normals[src] ?? 0, m.normals[src + 1] ?? 0, m.normals[src + 2] ?? 0],
        c * 3,
      );
    }
  return splitByNormal(m, normal);
}

/** One output vertex per (input vertex, distinct new normal); first appearance order. */
function splitByNormal(m: Mesh, cornerNormals: Float32Array): Mesh {
  const seen = new Map<string, number>();
  const p: number[] = [];
  const n: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const idx = new Uint32Array(m.indices.length);
  for (let c = 0; c < m.indices.length; c++) {
    const v = m.indices[c] ?? 0;
    const nx = cornerNormals[c * 3] ?? 0;
    const ny = cornerNormals[c * 3 + 1] ?? 0;
    const nz = cornerNormals[c * 3 + 2] ?? 0;
    const key = `${v}:${Math.round(nx * 1e4)},${Math.round(ny * 1e4)},${Math.round(nz * 1e4)}`;
    let out = seen.get(key);
    if (out === undefined) {
      out = p.length / 3;
      seen.set(key, out);
      p.push(m.positions[v * 3] ?? 0, m.positions[v * 3 + 1] ?? 0, m.positions[v * 3 + 2] ?? 0);
      n.push(nx, ny, nz);
      uv.push(m.uvs[v * 2] ?? 0, m.uvs[v * 2 + 1] ?? 0);
      col.push(m.colors[v * 3] ?? 0, m.colors[v * 3 + 1] ?? 0, m.colors[v * 3 + 2] ?? 0);
    }
    idx[c] = out;
  }
  return {
    positions: new Float32Array(p),
    normals: new Float32Array(n),
    uvs: new Float32Array(uv),
    colors: new Float32Array(col),
    indices: idx,
  };
}
