// Paired legs keep to their own side (D72). The creature's weights fall off with distance from
// each bone's flesh capsule, so where two legs stand close (a deer's hocks and hooves) a hoof
// took some of the other leg: in the walk the hooves dragged each other (QA `skin`,
// `T3D_SKIN_CROSSED`). Below a paired limb's joint 2 (wrist, hock) a vertex left of the midline
// hands the share it had of that limb's right-side bones to its own leg above the joint
// (`hind_l_1`) and the reverse. That share never bent with this leg's hock before and still does
// not: the fold at the joint stays as the falloff made it (handing it to the mirror bones or
// renormalising made the share bend and thinned the deer's LOD2 hock past the `deform` volume
// limit, 52 % of ≥ 60 %); it only follows the right leg now. Higher up the two legs' skin really meets (brisket, groin) and keeps its shared
// weights. Code-built legs stand apart, so the midline tells the sides apart; a model's
// touching paws need the mesh cut instead (Blender `unweb`).

import { type Bone, limbPairs, type Mesh, SKIN_INFLUENCES, type Vec3 } from '../core/index.ts';

/** Per paired limb and side: the index of its joint-1 bone (above the wrist or hock). */
function uppers(bones: readonly Bone[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of limbPairs(bones))
    for (const s of ['l', 'r'] as const) {
      const i = bones.findIndex((b) => b.name === `${p.limb}_${s}_1`);
      if (i >= 0) out.set(`${p.limb}_${s}`, i);
    }
  return out;
}

/** `mesh` (at `offset` in the asset frame) with each paired limb's lower skin on its own side. */
export function ownSides(mesh: Mesh, bones: readonly Bone[], offset: Vec3 = [0, 0, 0]): Mesh {
  const J = mesh.joints;
  const W = mesh.weights;
  const pairs = limbPairs(bones);
  if (!J || !W || pairs.length === 0) return mesh;
  const upper = uppers(bones);
  const joints = new Uint16Array(J);
  const weights = new Float32Array(W);
  const n = mesh.positions.length / 3;
  for (let v = 0; v < n; v++) {
    const y = (mesh.positions[v * 3 + 1] ?? 0) + offset[1];
    const z = (mesh.positions[v * 3 + 2] ?? 0) + offset[2];
    if (y === 0) continue;
    const base = v * SKIN_INFLUENCES;
    for (const p of pairs) {
      if (z >= p.below) continue;
      const other = y > 0 ? p.r : p.l;
      const m = upper.get(`${p.limb}_${y > 0 ? 'l' : 'r'}`);
      if (m === undefined) continue;
      for (let s = 0; s < SKIN_INFLUENCES; s++) {
        const j = joints[base + s] ?? 0;
        const w = weights[base + s] ?? 0;
        if (w <= 0 || !other.has(j)) continue;
        // The upper bone already in another slot takes the share; else this slot becomes it.
        let into = s;
        for (let t = 0; t < SKIN_INFLUENCES; t++)
          if (t !== s && joints[base + t] === m && (weights[base + t] ?? 0) > 0) into = t;
        if (into === s) joints[base + s] = m;
        else {
          weights[base + into] = (weights[base + into] ?? 0) + w;
          weights[base + s] = 0;
        }
      }
    }
  }
  return { ...mesh, joints, weights };
}
