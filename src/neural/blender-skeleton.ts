// An `Armature` as the `t3d-skeleton/1` JSON the `blender` task's `bind` step builds its armature
// from: `{ contract, frame: 'gltf', bones: [{ name, parent, head, tail }] }`, parents before
// children, canonical bytes. Frame: the FILE is in the glTF frame of the mesh GLB it travels with
// (metres, Y up, +Z front, +X left); ts23d bones are in the asset frame (Z up, +X front, +Y left),
// so each point is turned (x, y, z) → (y, z, x), the same turn every ts23d GLB gets at its root.
// Blender reads glTF as (x, y, z) → (x, −z, y). The exported skin's joints carry the bone names.

import { type Armature, type Bone, checkSkeleton, type Vec3 } from '../core/index.ts';
import { canonicalJson } from './adapter.ts';

export const BLENDER_SKELETON_CONTRACT = 't3d-skeleton/1';

/** Asset frame → glTF frame. */
const yUp = (p: Vec3): Vec3 => [p[1], p[2], p[0]];

/** Parents first; siblings and roots keep the armature's order. */
function parentsFirst(bones: readonly Bone[]): Bone[] {
  const out: Bone[] = [];
  const done = new Set<string>();
  const byName = new Map(bones.map((b) => [b.name, b]));
  const visit = (b: Bone): void => {
    if (done.has(b.name)) return;
    const parent = b.parent === undefined ? undefined : byName.get(b.parent);
    if (parent) visit(parent);
    done.add(b.name);
    out.push(b);
  };
  for (const b of bones) visit(b);
  return out;
}

/** Canonical `t3d-skeleton/1` bytes of a checked skeleton (T3D_RECIPE_INVALID when it is not one). */
export function skeletonJson(armature: Armature, asset = 'skeleton'): Uint8Array {
  const bones = parentsFirst(checkSkeleton(asset, armature).bones).map((b) => ({
    name: b.name,
    parent: b.parent ?? null,
    head: yUp(b.head),
    tail: yUp(b.tail),
  }));
  const doc = { contract: BLENDER_SKELETON_CONTRACT, frame: 'gltf', bones };
  return new TextEncoder().encode(canonicalJson(doc));
}
