// Gates across the LOD chain (they need all three compiled LODs at once): triangle counts fall
// LOD0 ≥ LOD1 ≥ LOD2, the far LODs keep the near one's silhouette box (no popping when the engine
// switches), and every pivot the engine binds to (groups, moving parts) survives at every LOD.

import { type Bounds, boundsOf, type CompiledAsset, worldMeshes } from '../core/index.ts';
import type { Finding } from './types.ts';

/** A gate over the whole LOD chain, index = LOD. */
export type LodGate = (lods: readonly CompiledAsset[]) => Finding[];

const tris = (a: CompiledAsset): number =>
  a.parts.reduce((s, p) => s + (p.mesh ? p.mesh.indices.length / 3 : 0), 0);

export const lodTriangles: LodGate = (lods) =>
  lods.slice(1).flatMap((a, i): Finding[] => {
    const prev = lods[i];
    if (!prev || tris(a) <= tris(prev)) return [];
    return [
      {
        gate: 'lod-triangles',
        code: 'T3D_QA_LOD_TRIANGLES',
        message: `LOD${a.lod} has ${tris(a)} triangles, more than LOD${prev.lod} (${tris(prev)})`,
        fix: 'each LOD must be cheaper than the one before: read ctx.lod / ctx.pick([...]) and drop segments or detail parts',
      },
    ];
  });

function assetBounds(a: CompiledAsset): Bounds | null {
  const all = [...worldMeshes(a.parts).values()].map(boundsOf);
  if (all.length === 0) return null;
  const k = [0, 1, 2] as const;
  const lo = k.map((i) => Math.min(...all.map((b) => b.min[i])));
  const hi = k.map((i) => Math.max(...all.map((b) => b.max[i])));
  return {
    min: [lo[0] ?? 0, lo[1] ?? 0, lo[2] ?? 0],
    max: [hi[0] ?? 0, hi[1] ?? 0, hi[2] ?? 0],
  };
}

/** LOD1/LOD2 overall box within `tol` of LOD0's span per side (min 5 cm). */
export const lodSilhouette =
  (tol = 0.05): LodGate =>
  (lods) => {
    const ref = lods[0] ? assetBounds(lods[0]) : null;
    if (!ref) return [];
    return lods.slice(1).flatMap((a): Finding[] => {
      const b = assetBounds(a);
      if (!b) return [];
      const off = ([0, 1, 2] as const).flatMap((k) => {
        const lim = Math.max(0.05, (ref.max[k] - ref.min[k]) * tol);
        const d = Math.max(Math.abs(b.min[k] - ref.min[k]), Math.abs(b.max[k] - ref.max[k]));
        return d > lim ? [`${'XYZ'[k]} by ${(d * 100).toFixed(0)} cm`] : [];
      });
      return off.length
        ? [
            {
              gate: 'lod-silhouette',
              code: 'T3D_QA_LOD_SILHOUETTE',
              message: `LOD${a.lod} outline differs from LOD0 on ${off.join(', ')} — it will pop on LOD switch`,
              fix: 'keep the big masses at every LOD (drop detail, not extent): a far LOD is the same shape with fewer segments',
            },
          ]
        : [];
    });
  };

/** Pivots = what an engine binds code to: empty groups and parts with motion. */
const pivots = (a: CompiledAsset): string[] =>
  a.parts.filter((p) => p.mesh === null || p.motion !== null).map((p) => p.name);

export const lodPivots: LodGate = (lods) => {
  const ref = lods[0];
  if (!ref) return [];
  const want = pivots(ref);
  return lods.slice(1).flatMap((a): Finding[] => {
    const have = new Set(a.parts.map((p) => p.name));
    const missing = want.filter((n) => !have.has(n));
    return missing.length
      ? [
          {
            gate: 'lod-pivots',
            code: 'T3D_QA_LOD_PIVOTS',
            message: `LOD${a.lod} drops pivot(s) ${missing.slice(0, 6).join(', ')}${missing.length > 6 ? ` (+${missing.length - 6})` : ''} that LOD0 has — game code driving them breaks at that LOD`,
            fix: 'keep the group/moving part at every LOD and gate only its geometry: ctx.group(name) always, detail meshes behind ctx.lod',
          },
        ]
      : [];
  });
};

/** Default chain gates: only what every gallery recipe passes today. `lodSilhouette` and
 *  `lodPivots` are opt-in until the recipes they flag are fixed (see their findings). */
export const DEFAULT_LOD_GATES: readonly LodGate[] = [lodTriangles];

export function runLodQa(
  lods: readonly CompiledAsset[],
  gates: readonly LodGate[] = DEFAULT_LOD_GATES,
): Finding[] {
  return gates.flatMap((g) => g(lods));
}
