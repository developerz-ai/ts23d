// Skeleton → wood meshes: stems as tapered sweeps (LOD sets radial and path resolution), the
// trunk with a bark gradient and marks, the buttressed root flare as a lobed `loft`. Plus the
// fit that scales the finished tree onto its real height and crown spread.

import { boundsOf, type Mesh, merge, type Rng, type Vec3 } from '../core/index.ts';
import { loft, ringXY, sweep } from '../primitives/index.ts';
import type { TreeParams } from './vegetation-params.ts';
import type { Stem } from './vegetation-skeleton.ts';

/** Radial segments per [level][lod]. The trunk's 8 keeps ring vertices on ±Y (exact DBH). */
const RADIAL = [
  [8, 6, 5],
  [6, 4, 4],
  [4, 3, 3],
  [3, 3, 3],
];
export const radialSegments = (level: number, lod: number): number =>
  RADIAL[Math.min(3, level)]?.[lod] ?? 3;

/** Every `step`-th path point (always keeping both ends): LOD1 halves path resolution. */
export function coarsen(st: Stem, step: number): { pts: Vec3[]; radii: number[] } {
  const pts: Vec3[] = [];
  const radii: number[] = [];
  const last = st.pts.length - 1;
  for (let i = 0; i <= last; i += step) {
    pts.push(st.pts[i] ?? [0, 0, 0]);
    radii.push(st.radii[i] ?? 0);
  }
  if (last % step !== 0) {
    pts.push(st.pts[last] ?? [0, 0, 0]);
    radii.push(st.radii[last] ?? 0);
  }
  return { pts, radii };
}

/** All stems with level in [lo, hi], merged. */
export function stemsMesh(
  stems: readonly Stem[],
  lo: number,
  hi: number,
  lod: number,
  color: Vec3,
): Mesh {
  const out: Mesh[] = [];
  for (const st of stems) {
    if (st.level < lo || st.level > hi) continue;
    const { pts, radii } = coarsen(st, lod === 0 ? 1 : 2);
    out.push(
      sweep({
        section: { radius: 1, segments: radialSegments(st.level, lod) },
        path: pts,
        scale: radii,
        color,
        strip: 'wood',
      }),
    );
  }
  return merge(out);
}

const mix = (a: Vec3, b: Vec3, t: number): [number, number, number] => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** Bark colour by height (bark → barkTop) with seeded marks; rewrites the mesh's colours. */
export function barkTint(m: Mesh, p: TreeParams, top: number, rng: Rng): Mesh {
  const hi = p.barkTop ?? p.bark;
  for (let i = 0; i < m.colors.length / 3; i++) {
    const z = m.positions[i * 3 + 2] ?? 0;
    const t = Math.min(1, Math.max(0, (z / Math.max(0.1, top) - 0.3) / 0.4));
    let c = mix(p.bark, hi, t * t * (3 - 2 * t));
    if (p.barkMarks && rng.next() < p.barkMarks.amount) c = mix(c, p.barkMarks.color, 0.85);
    const k = 1 + rng.range(-0.06, 0.06);
    m.colors.set([c[0] * k, c[1] * k, c[2] * k], i * 3);
  }
  return m;
}

/** The trunk, radius scaled by `radiusScale` (the fit's 1/sy keeps DBH exact after scaling). */
export function trunkMesh(
  trunk: Stem,
  p: TreeParams,
  lod: number,
  radiusScale: number,
  rng: Rng,
): Mesh {
  const { pts, radii } = coarsen(trunk, lod === 0 ? 1 : 2);
  const m = sweep({
    section: { radius: 1, segments: radialSegments(0, lod) },
    path: pts,
    scale: radii.map((r) => r * radiusScale),
    color: p.bark,
    strip: 'wood',
    caps: p.impostor === 'cards' ? 'end' : false,
  });
  return barkTint(m, p, pts[pts.length - 1]?.[2] ?? 1, rng);
}

/** Trunk axis point at height z (linear between path points). */
function axisAt(trunk: Stem, z: number): Vec3 {
  for (let i = 1; i < trunk.pts.length; i++) {
    const a = trunk.pts[i - 1] ?? [0, 0, 0];
    const b = trunk.pts[i] ?? a;
    if (b[2] >= z || i === trunk.pts.length - 1) {
      const f = Math.min(1, Math.max(0, (z - a[2]) / (b[2] - a[2] || 1)));
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, z];
    }
  }
  return [0, 0, z];
}

/** Buttressed flare: `p.roots` lobes, wide at the ground, melting into the trunk by ~2·DBH. */
export function rootsMesh(
  trunk: Stem,
  p: TreeParams,
  lod: number,
  radiusScale: number,
  rng: Rng,
): Mesh {
  const r0 = (trunk.radii[0] ?? 0.2) * radiusScale;
  const lobes = p.roots ?? 0;
  const phase = rng.range(0, Math.PI * 2);
  const levels = [
    { z: -0.1, k: 1.7, amp: 0.7 },
    { z: 0.5 * r0, k: 1.3, amp: 0.4 },
    { z: 1.3 * r0, k: 1.04, amp: 0.15 },
    { z: 2.4 * r0, k: 0.9, amp: 0 },
  ];
  const segs = lod === 0 ? 16 : 10;
  const rings = levels.map(({ z, k, amp }) => {
    const c = axisAt(trunk, z);
    const lobe = (a: number): number => 1 + amp * Math.max(0, Math.cos(lobes * (a - phase))) ** 2;
    return ringXY(c, r0 * k, r0 * k, segs, lobe);
  });
  const m = loft({ rings, color: p.bark, strip: 'wood' });
  return barkTint(m, p, trunk.pts[trunk.pts.length - 1]?.[2] ?? 1, rng);
}

/** Per-axis factors that bring the union of `meshes` to `target` = [X, Y, Z] spans. */
export function fitFactors(meshes: readonly Mesh[], target: Vec3): Vec3 {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const m of meshes) {
    if (m.indices.length === 0) continue;
    const b = boundsOf(m);
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k] ?? 0, b.min[k] ?? 0);
      hi[k] = Math.max(hi[k] ?? 0, b.max[k] ?? 0);
    }
  }
  const f = (k: 0 | 1 | 2): number => target[k] / Math.max(1e-6, (hi[k] ?? 1) - (lo[k] ?? 0));
  return [f(0), f(1), f(2)];
}

/** Non-uniform scale about the origin; normals by the inverse transpose, renormalised. */
export function scaleMesh(m: Mesh, s: Vec3): Mesh {
  const positions = new Float32Array(m.positions.length);
  const normals = new Float32Array(m.normals.length);
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = (m.positions[i] ?? 0) * s[0];
    positions[i + 1] = (m.positions[i + 1] ?? 0) * s[1];
    positions[i + 2] = (m.positions[i + 2] ?? 0) * s[2];
    const nx = (m.normals[i] ?? 0) / s[0];
    const ny = (m.normals[i + 1] ?? 0) / s[1];
    const nz = (m.normals[i + 2] ?? 0) / s[2];
    const l = Math.hypot(nx, ny, nz) || 1;
    normals[i] = nx / l;
    normals[i + 1] = ny / l;
    normals[i + 2] = nz / l;
  }
  return { ...m, positions, normals };
}
