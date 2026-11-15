// Golden set, step 2: the degraded copies that anchor the low end of the calibrated scale and
// prove it monotone (a degraded asset must score below its original). Four defects a reviewer sees
// at 640×360: decimated (QEM to 8 % of the triangles), faceted (QEM to 25 %, one normal per face:
// flat shading only shows on a coarse mesh), desaturated (colour → luminance) and blurred (vertex
// colour averaged over its neighbours 40 times). Pure, seedless.

import type { Mesh } from '../src/core/index.ts';
import { simplify } from '../src/passes/index.ts';

export const VARIANTS = ['original', 'decimated', 'flat', 'desaturated', 'blurred'] as const;
export type Variant = (typeof VARIANTS)[number];

export function degrade(m: Mesh, v: Variant): Mesh {
  if (v === 'decimated') return decimate(m, 0.08);
  if (v === 'flat') return flatShade(decimate(m, 0.25));
  if (v === 'desaturated') return desaturate(m);
  if (v === 'blurred') return blurColours(m, 40);
  return m;
}

/** QEM to `share` of the triangles (never under 120). */
const decimate = (m: Mesh, share: number): Mesh =>
  simplify(m, { targetTris: Math.max(120, Math.round((m.indices.length / 3) * share)) }).mesh;

/** One vertex per triangle corner, every normal the face normal. */
export function flatShade(m: Mesh): Mesh {
  const n = m.indices.length;
  const P = new Float32Array(n * 3);
  const N = new Float32Array(n * 3);
  const U = new Float32Array(n * 2);
  const C = new Float32Array(n * 3);
  for (let t = 0; t < n; t += 3) {
    const corner = [m.indices[t] ?? 0, m.indices[t + 1] ?? 0, m.indices[t + 2] ?? 0];
    const p = corner.map((i) => [0, 1, 2].map((k) => m.positions[i * 3 + k] ?? 0));
    const [a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0]] = p;
    const u = [0, 1, 2].map((k) => (b[k] ?? 0) - (a[k] ?? 0));
    const w = [0, 1, 2].map((k) => (c[k] ?? 0) - (a[k] ?? 0));
    const f = [
      (u[1] ?? 0) * (w[2] ?? 0) - (u[2] ?? 0) * (w[1] ?? 0),
      (u[2] ?? 0) * (w[0] ?? 0) - (u[0] ?? 0) * (w[2] ?? 0),
      (u[0] ?? 0) * (w[1] ?? 0) - (u[1] ?? 0) * (w[0] ?? 0),
    ];
    const l = Math.hypot(f[0] ?? 0, f[1] ?? 0, f[2] ?? 0) || 1;
    corner.forEach((i, j) => {
      const o = t + j;
      for (let k = 0; k < 3; k++) {
        P[o * 3 + k] = p[j]?.[k] ?? 0;
        N[o * 3 + k] = (f[k] ?? 0) / l;
        C[o * 3 + k] = m.colors[i * 3 + k] ?? 1;
      }
      U[o * 2] = m.uvs[i * 2] ?? 0;
      U[o * 2 + 1] = m.uvs[i * 2 + 1] ?? 0;
    });
  }
  return {
    positions: P,
    normals: N,
    uvs: U,
    colors: C,
    indices: Uint32Array.from({ length: n }, (_, i) => i),
  };
}

/** Vertex colour → its Rec. 709 luminance in every channel. */
export function desaturate(m: Mesh): Mesh {
  const C = new Float32Array(m.colors.length);
  for (let i = 0; i < C.length; i += 3) {
    const y =
      0.2126 * (m.colors[i] ?? 1) +
      0.7152 * (m.colors[i + 1] ?? 1) +
      0.0722 * (m.colors[i + 2] ?? 1);
    C[i] = y;
    C[i + 1] = y;
    C[i + 2] = y;
  }
  return { ...m, colors: C };
}

/** `passes` rounds of averaging each vertex colour with its edge neighbours (welded by index). */
export function blurColours(m: Mesh, passes: number): Mesh {
  const nv = m.positions.length / 3;
  const nb: number[][] = Array.from({ length: nv }, () => []);
  for (let t = 0; t < m.indices.length; t += 3) {
    const tri = [m.indices[t] ?? 0, m.indices[t + 1] ?? 0, m.indices[t + 2] ?? 0];
    for (let j = 0; j < 3; j++) nb[tri[j] ?? 0]?.push(tri[(j + 1) % 3] ?? 0, tri[(j + 2) % 3] ?? 0);
  }
  let C = Float32Array.from(m.colors);
  for (let p = 0; p < passes; p++) {
    const next = new Float32Array(C.length);
    for (let v = 0; v < nv; v++) {
      const ns = nb[v] ?? [];
      for (let k = 0; k < 3; k++) {
        let s = C[v * 3 + k] ?? 1;
        for (const u of ns) s += C[u * 3 + k] ?? 1;
        next[v * 3 + k] = s / (ns.length + 1);
      }
    }
    C = next;
  }
  return { ...m, colors: C };
}
