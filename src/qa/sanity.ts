// Gates: per-part mesh sanity a reviewer would spot at once — non-finite numbers (NaN from a
// zero-length normalize), vertex colours outside [0,1], shading normals that point against the
// face winding (black or inside-out lighting), and wasted zero-area triangles.

import type { CompiledAsset, Mesh, Part } from '../core/index.ts';
import type { Finding, Gate } from './types.ts';

const parts = (asset: CompiledAsset): Array<[Part, Mesh]> =>
  asset.parts.flatMap((p): Array<[Part, Mesh]> => (p.mesh ? [[p, p.mesh]] : []));

const finite = (a: Float32Array): boolean => {
  for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i] ?? 0)) return false;
  return true;
};

export const nonFinite: Gate = (asset) =>
  parts(asset).flatMap(([p, m]): Finding[] => {
    const bad = (
      [
        ['positions', m.positions],
        ['normals', m.normals],
        ['uvs', m.uvs],
        ['colors', m.colors],
      ] as const
    )
      .filter(([, a]) => !finite(a))
      .map(([n]) => n);
    const maxIndex = m.positions.length / 3;
    const outOfRange = m.indices.some((i) => i >= maxIndex);
    if (outOfRange) bad.push('indices' as never);
    return bad.length
      ? [
          {
            gate: 'non-finite',
            part: p.name,
            message: `'${p.name}' has NaN/Infinity or out-of-range data in ${bad.join(', ')}`,
            fix: 'look for a zero-length normalize, a divide by a zero count or segment, or an index past the vertex count',
          },
        ]
      : [];
  });

export const vertexColors: Gate = (asset) =>
  parts(asset).flatMap(([p, m]): Finding[] => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const c of m.colors) {
      if (c < lo) lo = c;
      if (c > hi) hi = c;
    }
    return lo < -1e-6 || hi > 1 + 1e-6
      ? [
          {
            gate: 'vertex-colors',
            part: p.name,
            message: `'${p.name}' vertex colour spans ${lo.toFixed(3)}…${hi.toFixed(3)}, outside linear [0,1]`,
            fix: 'colours are linear 0–1 (use the palette / material helpers); clamp after grime or livery maths',
          },
        ]
      : [];
  });

/** Per triangle: geometric normal (from winding) vs the mean of its three vertex normals. */
function windingStats(m: Mesh): {
  flipped: number;
  area: number;
  flippedArea: number;
  counted: number;
} {
  const P = m.positions;
  const N = m.normals;
  let flipped = 0;
  let area = 0;
  let flippedArea = 0;
  let counted = 0;
  for (let t = 0; t < m.indices.length; t += 3) {
    const a = (m.indices[t] ?? 0) * 3;
    const b = (m.indices[t + 1] ?? 0) * 3;
    const c = (m.indices[t + 2] ?? 0) * 3;
    const ux = (P[b] ?? 0) - (P[a] ?? 0);
    const uy = (P[b + 1] ?? 0) - (P[a + 1] ?? 0);
    const uz = (P[b + 2] ?? 0) - (P[a + 2] ?? 0);
    const vx = (P[c] ?? 0) - (P[a] ?? 0);
    const vy = (P[c + 1] ?? 0) - (P[a + 1] ?? 0);
    const vz = (P[c + 2] ?? 0) - (P[a + 2] ?? 0);
    const gx = uy * vz - uz * vy;
    const gy = uz * vx - ux * vz;
    const gz = ux * vy - uy * vx;
    const len = Math.hypot(gx, gy, gz);
    if (len < 1e-12) continue;
    counted++;
    const nx = (N[a] ?? 0) + (N[b] ?? 0) + (N[c] ?? 0);
    const ny = (N[a + 1] ?? 0) + (N[b + 1] ?? 0) + (N[c + 1] ?? 0);
    const nz = (N[a + 2] ?? 0) + (N[b + 2] ?? 0) + (N[c + 2] ?? 0);
    area += len;
    // Against the face by more than ~95°: the lighting is inside out, not just smoothed.
    if ((gx * nx + gy * ny + gz * nz) / (len * (Math.hypot(nx, ny, nz) || 1)) < -0.1) {
      flipped++;
      flippedArea += len;
    }
  }
  return { flipped, area, flippedArea, counted };
}

/** Shading normals must agree with the winding (the side a renderer culls/lights). */
export const normalsMatchWinding: Gate = (asset) =>
  parts(asset).flatMap(([p, m]): Finding[] => {
    const s = windingStats(m);
    // 1% of a part's area tolerates a few pinched poles on smooth caps.
    return s.flipped > 0 && s.flippedArea > s.area * 0.01
      ? [
          {
            gate: 'normals-winding',
            part: p.name,
            message: `'${p.name}': ${s.flipped} triangle(s) (${((100 * s.flippedArea) / s.area).toFixed(1)}% of its area) have vertex normals opposing their face — inverted winding, or normals smoothed across a hard crease`,
            fix: 'split normals at creases (lathe crease angle / weightedNormals hardAngle), or fix the mirrored piece: a negative-scale place() flips winding but not normals',
          },
        ]
      : [];
  });

/** Zero-area triangles: invisible, but they cost index bandwidth and skew QA sampling. */
export const degenerateTriangles: Gate = (asset) =>
  parts(asset).flatMap(([p, m]): Finding[] => {
    const tris = m.indices.length / 3;
    const zero = tris - windingStats(m).counted;
    return zero > tris * 0.05
      ? [
          {
            gate: 'degenerate-triangles',
            part: p.name,
            message: `'${p.name}': ${zero} of ${tris} triangles have zero area`,
            fix: 'a ring/lathe with a zero radius emits fans of slivers: cap it with a point instead, or skip the segment',
          },
        ]
      : [];
  });
