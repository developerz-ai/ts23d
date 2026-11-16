// Per-vertex masks of the hybrid blend over a code part: how much of the model's silhouette a
// vertex takes (by its skin weights: head yes, paws no), how buried it is in another part (a neck
// stub inside the body stays hidden), and a part's enclosed volume (the mass stays the code's).

import type { Mesh, Vec3 } from '@developerz.ai/ts23d';
import { triBvh } from '@developerz.ai/ts23d';
import { BLEND } from './surface.ts';
import { smoothOver, weld } from './wrap.ts';

/** Per-vertex share of the silhouette move from the skin weights (`bones`: joint index → name;
 *  `under`: none on down-facing skin;
 *  sides and twist bones folded: fore_l_0_mid → fore_0), BLEND.share per bone, 0 for bones it
 *  does not list. */
export function shareOf(mesh: Mesh, bones: readonly string[], under: boolean): Float64Array {
  const n = mesh.positions.length / 3;
  const J = mesh.joints;
  const W = mesh.weights;
  const table: Readonly<Record<string, number>> = BLEND.share;
  const of = (name: string): number =>
    table[name.replace(/_mid$/, '').replace(/_[lr](?=_|$)/, '')] ?? 0;
  if (!J || !W) return new Float64Array(n).fill(BLEND.share.spine_1);
  const N = mesh.normals;
  const raw = Float64Array.from({ length: n }, (_, v) => {
    let s = 0;
    for (let k = 0; k < 4; k++) s += (W[v * 4 + k] ?? 0) * of(bones[J[v * 4 + k] ?? 0] ?? '');
    if (!under) return s;
    // `under`: faces turned down keep the code's surface — the photo never showed the belly, so
    // the model's underside is invented (and lumpy).
    const nz =
      (N[v * 3 + 2] ?? 0) / (Math.hypot(N[v * 3] ?? 0, N[v * 3 + 1] ?? 0, N[v * 3 + 2] ?? 0) || 1);
    const t = Math.max(0, Math.min(1, (-nz - BLEND.under[0]) / (BLEND.under[1] - BLEND.under[0])));
    return s * (1 - t * t * (3 - 2 * t));
  });
  // Smoothed over the mesh: a share that steps where the skin weights do creases the skin.
  return smoothOver(weld(mesh), raw, BLEND.shareSmooth);
}

/** Enclosed volume of a closed mesh (divergence theorem), m³. */
export function volume(mesh: Mesh): number {
  const P = mesh.positions;
  const I = mesh.indices;
  let v = 0;
  for (let t = 0; t < I.length; t += 3) {
    const [a, b, c] = [(I[t] ?? 0) * 3, (I[t + 1] ?? 0) * 3, (I[t + 2] ?? 0) * 3];
    const g = (i: number): number => P[i] ?? 0;
    v +=
      (g(a) * (g(b + 1) * g(c + 2) - g(b + 2) * g(c + 1)) -
        g(a + 1) * (g(b) * g(c + 2) - g(b + 2) * g(c)) +
        g(a + 2) * (g(b) * g(c + 1) - g(b + 1) * g(c))) /
      6;
  }
  return v;
}

/** How buried each vertex is in another solid part (`others`, world), 0–1, smoothed over the
 *  mesh (a hard mask leaves a sawtooth where the part leaves the other). A buried vertex may move
 *  in onto the model surface (so it stays hidden: a jaw inside a slimmer head) but not out (a
 *  head's neck stub inside the body must not be pulled out onto the model's back). */
export function buriedIn(mesh: Mesh, at: Vec3, others: readonly Mesh[]): Float64Array {
  const bvhs = others.map(triBvh);
  const P = mesh.positions;
  const hard = Float64Array.from({ length: P.length / 3 }, (_, v) => {
    const p: Vec3 = [
      (P[v * 3] ?? 0) + at[0],
      (P[v * 3 + 1] ?? 0) + at[1],
      (P[v * 3 + 2] ?? 0) + at[2],
    ];
    return bvhs.some((b) => b.winding(p) > 0.5) ? 1 : 0;
  });
  return smoothOver(weld(mesh), hard, BLEND.buried).map((b) => Math.min(1, 1.5 * b));
}
