// Broad wear, measured on the mesh: does colour vary across a surface at a scale that reads with
// the whole asset in frame? The calibrated vector's levers (texel density, per-edge colour detail,
// high-frequency energy) answer to speckle; a hand-wide mud band, soot fan or sun-faded roof moves
// none of them, and reviewers score exactly that. Two numbers from LOD0 vertex colours:
//   wearBroad  — RMS distance (sRGB, 0–1) between each patch of a surface and that surface's own
//                mean colour. A surface is one index-connected piece (a box face, a hull skin), so
//                parts painted different colours by design count nothing; a patch is a cell of
//                1/40 of the asset's diagonal (a hand on a crate, 20 cm on a tank), so chips and
//                grain average out inside it.
//   wearPlaced — the share (0–1) of that variation explained by exposure: height above the
//                ground and how squarely the patch faces the sky. Mud low and dust on top score
//                high; camouflage and random blotches score low.
// Not yet a calibration column: critique-golden.json has no panel scores for it (see
// docs/idea/16-art-as-text.md, "Broad wear"). A surface tinted evenly all over (a whole roof
// faded) scores nothing, and textured parts (TextureSet) carry no vertex colour: both read as
// clean here.

import type { CompiledAsset, Mesh } from '../core/index.ts';

export interface WearMetrics {
  readonly wearBroad: number;
  readonly wearPlaced: number;
}

/** Patches per bounding diagonal: what still reads with the asset filling a hero frame. */
export const WEAR_PATCHES = 40;

const srgb = (v: number): number => Math.min(1, Math.max(0, v)) ** (1 / 2.2);

interface Patch {
  area: number;
  rgb: [number, number, number];
  z: number;
  up: number;
  piece: number;
}

/** Index-connected pieces of a mesh: root id per vertex (union-find over its triangles). */
function pieces(m: Mesh): Int32Array {
  const root = new Int32Array(m.positions.length / 3).map((_, i) => i);
  const find = (v: number): number => {
    let r = v;
    while ((root[r] ?? r) !== r) r = root[r] ?? r;
    while ((root[v] ?? v) !== r) [root[v], v] = [r, root[v] ?? v];
    return r;
  };
  for (let t = 0; t < m.indices.length; t += 3) {
    const a = find(m.indices[t] ?? 0);
    for (const k of [1, 2]) {
      const b = find(m.indices[t + k] ?? 0);
      if (a !== b) root[b] = a;
    }
  }
  return root.map((_, i) => find(i));
}

/** Broad wear of a set of meshes in one frame (LOD0's parts). */
export function wearMetrics(meshes: readonly Mesh[]): WearMetrics {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const m of meshes)
    for (let i = 0; i < m.positions.length; i++) {
      const v = m.positions[i] ?? 0;
      lo[i % 3] = Math.min(lo[i % 3] ?? v, v);
      hi[i % 3] = Math.max(hi[i % 3] ?? v, v);
    }
  const diag = Math.hypot(...[0, 1, 2].map((k) => (hi[k] ?? 0) - (lo[k] ?? 0)));
  if (!(diag > 0)) return { wearBroad: 0, wearPlaced: 0 };
  const cell = diag / WEAR_PATCHES;
  const height = Math.max(1e-9, (hi[2] ?? 0) - (lo[2] ?? 0));
  const patches = new Map<string, Patch>();
  meshes.forEach((m, mi) => {
    const piece = pieces(m);
    for (let t = 0; t < m.indices.length; t += 3) {
      const ids = [m.indices[t] ?? 0, m.indices[t + 1] ?? 0, m.indices[t + 2] ?? 0];
      const P = (v: number, k: number): number => m.positions[(ids[v] ?? 0) * 3 + k] ?? 0;
      const e = [0, 1, 2].map((k) => P(1, k) - P(0, k));
      const f = [0, 1, 2].map((k) => P(2, k) - P(0, k));
      const n = [0, 1, 2].map((k) => {
        const [i, j] = [(k + 1) % 3, (k + 2) % 3];
        return (e[i] ?? 0) * (f[j] ?? 0) - (e[j] ?? 0) * (f[i] ?? 0);
      });
      const twice = Math.hypot(n[0] ?? 0, n[1] ?? 0, n[2] ?? 0);
      if (!(twice > 0)) continue;
      // A third of the triangle to each corner's patch.
      for (const v of ids) {
        const p = [0, 1, 2].map((k) => m.positions[v * 3 + k] ?? 0);
        const key = `${mi}:${piece[v]}:${p.map((x) => Math.floor(x / cell)).join(',')}`;
        let q = patches.get(key);
        if (!q) {
          q = { area: 0, rgb: [0, 0, 0], z: 0, up: 0, piece: mi * 1e9 + (piece[v] ?? 0) };
          patches.set(key, q);
        }
        const a = twice / 6;
        q.area += a;
        for (let k = 0; k < 3; k++) q.rgb[k as 0 | 1 | 2] += a * srgb(m.colors[v * 3 + k] ?? 1);
        q.z += (a * ((p[2] ?? 0) - (lo[2] ?? 0))) / height;
        q.up += (a * Math.max(0, n[2] ?? 0)) / twice;
      }
    }
  });
  // Each surface's own mean (colour, height, sky-facing): the reference its patches differ from.
  const mean = new Map<number, { area: number; v: number[] }>();
  for (const q of patches.values()) {
    const s = mean.get(q.piece) ?? { area: 0, v: [0, 0, 0, 0, 0] };
    s.area += q.area;
    [...q.rgb, q.z, q.up].forEach((x, k) => {
      s.v[k] = (s.v[k] ?? 0) + x;
    });
    mean.set(q.piece, s);
  }
  let total = 0;
  // The deviation (each channel) against the two exposure terms: weighted least squares.
  let [syy, szz, suu, szu] = [0, 0, 0, 0];
  const szy = [0, 0, 0];
  const suy = [0, 0, 0];
  for (const q of patches.values()) {
    const s = mean.get(q.piece);
    if (!s || !(q.area > 0)) continue;
    const d = [...q.rgb, q.z, q.up].map((x, k) => x / q.area - (s.v[k] ?? 0) / s.area);
    const [z = 0, u = 0] = [d[3], d[4]];
    total += q.area;
    szz += q.area * z * z;
    suu += q.area * u * u;
    szu += q.area * z * u;
    for (let k = 0; k < 3; k++) {
      const y = d[k] ?? 0;
      syy += q.area * y * y;
      szy[k] = (szy[k] ?? 0) + q.area * z * y;
      suy[k] = (suy[k] ?? 0) + q.area * u * y;
    }
  }
  if (!(total > 0)) return { wearBroad: 0, wearPlaced: 0 };
  const det = szz * suu - szu * szu;
  // One regressor when the other is constant or they are collinear (a flat face, a wall).
  const two = det > 1e-9 * szz * suu;
  let explained = 0;
  for (let k = 0; k < 3; k++) {
    const [a = 0, b = 0] = [szy[k], suy[k]];
    if (two) explained += (a * (suu * a - szu * b) + b * (szz * b - szu * a)) / det;
    else if (szz >= suu && szz > 0) explained += (a * a) / szz;
    else if (suu > 0) explained += (b * b) / suu;
  }
  const r4 = (v: number): number => Math.round(v * 1e4) / 1e4;
  return {
    wearBroad: r4(Math.sqrt(syy / (3 * total))),
    wearPlaced: r4(syy > 1e-12 * total ? Math.min(1, Math.max(0, explained / syy)) : 0),
  };
}

/** Broad wear of a compiled LOD0. */
export const wearOf = (lod0: CompiledAsset): WearMetrics =>
  wearMetrics(lod0.parts.flatMap((p) => (p.mesh?.indices.length ? [p.mesh] : [])));
