// Carries a mesh's per-vertex skin (joints + weights) and morph deltas onto a new vertex list in
// which every vertex is a copy of one source vertex: the passes that split or drop vertices
// (weighted normals, simplify) keep a rigged, morphed mesh rigged instead of silently unskinning it.

import { type Mesh, SKIN_INFLUENCES } from '../core/index.ts';

/** `src[i]` is the source vertex output vertex i copies. Absent attributes stay absent. */
export function carrySkin(
  m: Mesh,
  src: ArrayLike<number>,
): Pick<Mesh, 'joints' | 'weights' | 'morphs'> {
  const fill = <T extends Float32Array | Uint16Array>(out: T, from: T, k: number): T => {
    for (let i = 0; i < src.length; i++)
      for (let j = 0; j < k; j++) out[i * k + j] = from[(src[i] ?? 0) * k + j] ?? 0;
    return out;
  };
  const n = src.length;
  return {
    ...(m.joints && m.weights
      ? {
          joints: fill(new Uint16Array(n * SKIN_INFLUENCES), m.joints, SKIN_INFLUENCES),
          weights: fill(new Float32Array(n * SKIN_INFLUENCES), m.weights, SKIN_INFLUENCES),
        }
      : {}),
    ...(m.morphs
      ? {
          morphs: m.morphs.map((t) => ({
            name: t.name,
            positions: fill(new Float32Array(n * 3), t.positions, 3),
          })),
        }
      : {}),
  };
}
