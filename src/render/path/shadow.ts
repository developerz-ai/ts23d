// Shadow rays: how much of the sun or sky reaches a point along a direction, per channel. Opaque
// surfaces block it; thin see-through surfaces let it by (their own tint is the path's business).
// A hair or fur card passes the light its fibres scatter forward, (1 − F₀)² · √albedo per channel
// (hair.ts's TT lobe at normal incidence), where its strands are: a card stands for a clump of
// translucent fibres, not a sheet of card. Its strands are alpha-tested at the finest mip, as
// drawn: the camera footprint's coverage-preserving mip thickens thin strands into a solid card
// (or drops them), so a shadow changed with the camera's distance. Fully opaque, card-sized shadows were dark specks
// all over a sparse coat once the noise-aware denoiser kept lighting detail (D475).

import { ALPHA_CUT } from '../alpha-mips.ts';
import type { Scene } from '../scene.ts';
import { type SheetTextures, sample } from '../texture.ts';
import { SRGB_LUT, sampleSet } from '../texture-sets.ts';
import type { HitFilter, PathBvh } from './bvh.ts';
import { CLS } from './classes.ts';

/** Hair's F₀ (hair.ts: schlick(0.046, …)): the share each fibre wall reflects instead of passing. */
const FIBRE = (1 - 0.046) * (1 - 0.046);
/** Below this in every channel a shadow ray counts as blocked (stop walking the BVH). */
const DARK = 1e-3;

/**
 * Multiplies the transmittance from `o` along unit `d` into `t` (3 channels, start it at 1).
 * Returns false when an opaque surface blocks the light outright (`t` is then meaningless).
 */
export type ShadowPass = (o: ArrayLike<number>, d: ArrayLike<number>, t: Float64Array) => boolean;

/** Albedo texel × vertex colour of a cutout card at (u, v), alpha-tested at mip 0, into `c`. */
function strandAt(
  scene: Scene,
  tex: SheetTextures,
  t: number,
  b1: number,
  b2: number,
  c: Float32Array,
): boolean {
  const I = scene.indices;
  const U = scene.uvs;
  const C = scene.colors;
  const b0 = 1 - b1 - b2;
  const ia = I[t * 3] ?? 0;
  const ib = I[t * 3 + 1] ?? 0;
  const ic = I[t * 3 + 2] ?? 0;
  const u = (U[ia * 2] ?? 0) * b0 + (U[ib * 2] ?? 0) * b1 + (U[ic * 2] ?? 0) * b2;
  const v = (U[ia * 2 + 1] ?? 0) * b0 + (U[ib * 2 + 1] ?? 0) * b1 + (U[ic * 2 + 1] ?? 0) * b2;
  const set = scene.sets[(scene.texSet[t] ?? 0) - 1];
  if (set) sampleSet(set.albedo, 0, u, v, SRGB_LUT, c);
  else sample(tex.albedo, 0, u, v, c);
  if ((c[3] ?? 1) < ALPHA_CUT) return false;
  for (let k = 0; k < 3; k++)
    c[k] =
      (c[k] ?? 1) *
      ((C[ia * 3 + k] ?? 1) * b0 + (C[ib * 3 + k] ?? 1) * b1 + (C[ic * 3 + k] ?? 1) * b2);
  return true;
}

/**
 * The shadow-ray query of a world. `opaqueAt` is the camera's alpha test (foliage cards keep it:
 * leaves are opaque to light). Deterministic: the BVH visits a ray's triangles in a fixed order.
 */
export function shadowPass(
  bvh: PathBvh,
  scene: Scene,
  tex: SheetTextures,
  cls: Uint8Array,
  opaqueAt: HitFilter,
): ShadowPass {
  const c = new Float32Array(4);
  let tr: Float64Array = new Float64Array(3);
  const stops: HitFilter = (t, b1, b2) => {
    const k = cls[t];
    if (k === CLS.thin) return false;
    if (k !== CLS.hair) return opaqueAt(t, b1, b2);
    if (!strandAt(scene, tex, t, b1, b2, c)) return false;
    let left = 0;
    for (let i = 0; i < 3; i++) {
      const a = Math.max(0, Math.min(1, c[i] ?? 0));
      tr[i] = (tr[i] ?? 0) * FIBRE * Math.sqrt(a);
      left = Math.max(left, tr[i] ?? 0);
    }
    return left < DARK;
  };
  return (o, d, t) => {
    tr = t;
    return !bvh.occluded(o, d, Infinity, stops);
  };
}
