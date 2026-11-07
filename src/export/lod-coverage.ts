// View-distance hints for the single-file GLB: MSFT_lod (vendor extension, node level) on the
// LOD0 root lists the LOD1/LOD2 roots, and `extras.MSFT_screencoverage` holds, per LOD, the
// screen-height fraction below which the next LOD (or nothing) takes over — Unity LODGroup's
// "screen relative transition height". Spec: KhronosGroup/glTF extensions/2.0/Vendor/MSFT_lod.
//
// Default thresholds match screen-space triangle density: a LOD with r × the triangles looks as
// dense at √r × the size on screen (triangles per pixel ∝ tris / coverage²). Landmarks (≥ 10 m)
// cull later than props, so a building stays on the skyline.

import type { CompiledAsset } from '../core/index.ts';
import { Ts23dError, worldMeshes } from '../core/index.ts';

export const MSFT_LOD = 'MSFT_lod';
export const SCREEN_COVERAGE = 'MSFT_screencoverage';

export type LodCoverage = readonly [number, number, number];

const tris = (a: CompiledAsset): number =>
  a.parts.reduce((s, p) => s + (p.mesh ? p.mesh.indices.length / 3 : 0), 0);

/** Largest extent in metres: `real` when declared, else the LOD0 world bounds. */
function extent(a: CompiledAsset): number {
  if (a.real) return Math.max(a.real.length, a.real.width, a.real.height);
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const mesh of worldMeshes(a.parts).values()) {
    const p = mesh.positions;
    for (let i = 0; i < p.length; i++) {
      const k = i % 3;
      const v = p[i] ?? 0;
      lo[k] = Math.min(lo[k] ?? 0, v);
      hi[k] = Math.max(hi[k] ?? 0, v);
    }
  }
  return Math.max(0, ...hi.map((h, k) => h - (lo[k] ?? 0)));
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const round = (v: number): number => Math.round(v * 1000) / 1000;

/** Default [LOD0→1, LOD1→2, cull] for an asset from its compiled LODs (any subset, LOD0 first). */
export function defaultCoverage(lods: readonly CompiledAsset[]): LodCoverage {
  const byLod = new Map<number, number>(lods.map((a) => [a.lod, tris(a)]));
  const top = lods[0];
  const t0 = Math.max(1, top ? tris(top) : 1);
  const ratio = (lod: number): number => (byLod.get(lod) ?? t0) / t0;
  const c1 = round(clamp(Math.sqrt(ratio(1)), 0.1, 0.6));
  const c2 = round(clamp(Math.sqrt(ratio(2)), 0.02, c1 / 2));
  const cull = top && extent(top) >= 10 ? 0.002 : 0.01;
  return [c1, c2, Math.min(cull, round(c2 / 2))];
}

export function checkCoverage(c: readonly number[], asset: string): void {
  const [a = -1, b = -1, cull = -1] = c;
  if (c.length !== 3 || !(a < 1 && a > b && b > cull && cull >= 0))
    throw new Ts23dError('T3D_RECIPE_INVALID', {
      cause: `lodCoverage ${JSON.stringify(c)} on '${asset}' is not strictly descending in [0, 1)`,
      fix: 'give [LOD0→LOD1, LOD1→LOD2, cull] screen-height fractions, e.g. [0.5, 0.2, 0.01]; 0 = never cull',
    });
}

/**
 * MSFT_screencoverage for the LODs actually written (e.g. [0, 2]): entry j is the coverage where
 * LOD j hands over — to the next included LOD's switch point, or to nothing (cull) for the last.
 */
export function coverageFor(levels: readonly number[], c: LodCoverage): number[] {
  return levels.map((_, j) => {
    const next = levels[j + 1];
    return next === undefined ? c[2] : (c[next - 1] ?? c[2]);
  });
}
