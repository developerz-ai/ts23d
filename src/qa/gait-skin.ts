// QA `gait`, in-place clips on skinned feet: the root does not travel, so there is no ground speed
// to hold a planted foot against (gait.ts reads slide only on travelling clips), but the floor is
// still there. The skin of each foot (the vertices a low leaf bone moves, with the heel-to-ball
// bone above a toe bone) is posed at every 30 fps frame of the clip; its lowest vertex may not go
// more than SKIN_SINK_LIMIT under the floor. The floor is z = 0, or the lowest foot vertex at
// rest when the asset stands a little under it (the rest stance is QA `model`'s to judge).

import type { Armature, Bone, Clip, CompiledAsset, Mesh } from '../core/index.ts';
import { quatRotate, SKIN_INFLUENCES, toWorld, worldTransforms } from '../core/index.ts';
import { inverseBind, type Mat4, skinPositions } from '../passes/index.ts';
import { clipPose, jointWorlds } from './clip-pose.ts';

/** How far the skin of a foot may dip under the floor in an in-place clip, metres. */
export const SKIN_SINK_LIMIT = 0.003;
/** A vertex belongs to a foot when the foot's bones carry more than this share of it. */
const FOOT_SHARE = 0.5;
const FPS = 30;

export interface SoleSink {
  readonly foot: string;
  /** Metres under the floor at the worst frame (positive = under). */
  readonly sink: number;
  readonly frame: number;
}

/** The foot's skin as a small mesh of its own (asset frame): only these vertices are posed. */
function footSkin(asset: CompiledAsset, sk: Armature, foot: Bone, low: number): Mesh | null {
  const index = new Map(sk.bones.map((b, i) => [b.name, i]));
  const parent = sk.bones.find((b) => b.name === foot.parent);
  const own = new Set([index.get(foot.name) ?? -1]);
  // A toe bone's parent runs heel to ball: the sole is under both.
  if (parent && parent.tail[2] < low) own.add(index.get(parent.name) ?? -1);
  const xf = worldTransforms(asset.parts);
  const pos: number[] = [];
  const joints: number[] = [];
  const weights: number[] = [];
  for (const p of asset.parts) {
    const m = p.mesh;
    const t = xf.get(p.name);
    if (!m?.joints || !m.weights || !t) continue;
    for (let v = 0; v < m.positions.length / 3; v++) {
      const at = v * SKIN_INFLUENCES;
      let share = 0;
      for (let s = 0; s < SKIN_INFLUENCES; s++)
        if (own.has(m.joints[at + s] ?? -1)) share += m.weights[at + s] ?? 0;
      if (share <= FOOT_SHARE) continue;
      pos.push(
        ...toWorld(t, [
          m.positions[v * 3] ?? 0,
          m.positions[v * 3 + 1] ?? 0,
          m.positions[v * 3 + 2] ?? 0,
        ]),
      );
      joints.push(...m.joints.subarray(at, at + SKIN_INFLUENCES));
      weights.push(...m.weights.subarray(at, at + SKIN_INFLUENCES));
    }
  }
  if (!pos.length) return null;
  const none = new Float32Array(0);
  return {
    positions: Float32Array.from(pos),
    normals: none,
    uvs: none,
    colors: none,
    indices: new Uint32Array(0),
    joints: Uint16Array.from(joints),
    weights: Float32Array.from(weights),
  };
}

const lowest = (positions: Float32Array): number => {
  let z = Infinity;
  for (let i = 2; i < positions.length; i += 3) z = Math.min(z, positions[i] ?? 0);
  return z;
};

/** Joint world matrices (column-major) of the clip at `time`: rotation about the posed head. */
function jointMatrices(sk: Armature, c: Clip, time: number): Mat4[] {
  const w = jointWorlds(sk, clipPose(c, time));
  return sk.bones.map((b) => {
    const j = w.get(b.name) ?? { head: b.head, rot: [0, 0, 0, 1] as const };
    return Float64Array.from([
      ...quatRotate(j.rot, [1, 0, 0]),
      0,
      ...quatRotate(j.rot, [0, 1, 0]),
      0,
      ...quatRotate(j.rot, [0, 0, 1]),
      0,
      ...j.head,
      1,
    ]);
  });
}

/**
 * For each foot with skin, the deepest its lowest vertex goes under the floor in each clip
 * (clips in the given order; a foot with no skin is left out).
 */
export function soleSinks(
  asset: CompiledAsset,
  sk: Armature,
  feet: readonly Bone[],
  clips: readonly Clip[],
): Map<string, SoleSink[]> {
  const top = Math.max(...sk.bones.map((b) => Math.max(b.head[2], b.tail[2])));
  const skins = feet.flatMap((foot) => {
    const mesh = footSkin(asset, sk, foot, top * 0.08);
    return mesh ? [{ foot: foot.name, mesh }] : [];
  });
  const floor = Math.min(0, ...skins.map((s) => lowest(s.mesh.positions)));
  const ibm = inverseBind(sk);
  const out = new Map<string, SoleSink[]>();
  for (const c of clips) {
    const frames = Math.max(1, Math.round(c.seconds * FPS));
    const worst = skins.map((s) => ({ foot: s.foot, sink: -Infinity, frame: 0 }));
    for (let f = 0; f <= frames; f++) {
      const joints = jointMatrices(sk, c, (f * c.seconds) / frames);
      skins.forEach((s, i) => {
        const sink = floor - lowest(skinPositions(s.mesh, joints, ibm));
        const w = worst[i];
        if (w && sink > w.sink) [w.sink, w.frame] = [sink, f];
      });
    }
    out.set(c.name, worst);
  }
  return out;
}
