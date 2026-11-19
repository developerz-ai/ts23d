// glTF skins (ADR 013): one joint node per bone under the LOD root (rest = translation only, so
// inverse bind matrices are pure translations), `skins[]` with float32 inverse bind matrices, and
// JOINTS_0 (u16) / WEIGHTS_0 (unorm16 on the 1/255 grid: every sum is exactly 65535) on skinned
// primitives. A skinned mesh node's world is made identity (it sits on the Z-up root with the
// inverse rotation): the spec ignores it and three.js applies it, and both then agree. A socket
// with `data.bone` rides that joint (a saddle on `spine_3`, a sword in `hand_r`).

import {
  type Armature,
  type CompiledAsset,
  checkMeshAttributes,
  type Mesh,
  Ts23dError,
  type Vec3,
  worldTransforms,
} from '../core/index.ts';
import { bindRigid, capsuleDistance, inverseBind, jointLocals } from '../passes/index.ts';
import { ARRAY_BUFFER, type BinWriter, type Json } from './bin-writer.ts';
import type { GltfDoc } from './hierarchy.ts';

/** Inverse of the root's Z-up → Y-up turn: a child carrying it sits at world identity. */
export const Y_UP_TO_Z_UP = [0.5, 0.5, 0.5, 0.5];

/**
 * One vertex's 4 weights in 255ths summing to exactly 255: largest-remainder rounding (ties to the
 * lower slot), slots kept in place. An all-zero vertex stays zero (the skin gate reports it).
 * passes/skin-weights `quantise` does the same but reorders slots, so this is its in-place twin.
 */
function quantise255(w: readonly number[]): number[] {
  const sum = w.reduce((s, v) => s + Math.max(0, v), 0);
  if (!(sum > 0)) return [0, 0, 0, 0];
  const raw = w.map((v) => (Math.max(0, v) / sum) * 255);
  const q = raw.map(Math.floor);
  let left = 255 - q.reduce((s, v) => s + v, 0);
  const order = raw.map((v, i) => [v - Math.floor(v), i] as const).sort((x, y) => y[0] - x[0]);
  for (const [, i] of order) {
    if (left <= 0) break;
    q[i] = (q[i] ?? 0) + 1;
    left--;
  }
  return q;
}

/** JOINTS_0 + WEIGHTS_0 of a skinned mesh (none for a rigid one). */
export function skinAttributes(bin: BinWriter, m: Mesh): Json {
  if (!m.joints || !m.weights) return {};
  checkMeshAttributes(m, 'skinned mesh');
  const weights = new Uint16Array(m.weights.length);
  for (let i = 0; i < weights.length; i += 4)
    weights.set(
      quantise255([0, 1, 2, 3].map((k) => m.weights?.[i + k] ?? 0)).map((q) => q * 257),
      i,
    );
  return {
    JOINTS_0: bin.accessor(Uint16Array.from(m.joints), 'VEC4', ARRAY_BUFFER),
    WEIGHTS_0: bin.accessor(weights, 'VEC4', ARRAY_BUFFER, false, true),
  };
}

function attach(doc: GltfDoc, parent: number, id: number): void {
  const n = doc.nodes[parent];
  if (n) n['children'] = [...((n['children'] as number[] | undefined) ?? []), id];
}

function detach(doc: GltfDoc, parent: number, id: number): void {
  const n = doc.nodes[parent];
  if (n) n['children'] = ((n['children'] as number[] | undefined) ?? []).filter((c) => c !== id);
}

const parentOf = (doc: GltfDoc, id: number): number =>
  doc.nodes.findIndex((n) => ((n['children'] as number[] | undefined) ?? []).includes(id));

/**
 * Joint nodes + one skin for the LOD tree under `root` (parts already written, `parts` = their
 * nodes from writeHierarchy). Returns bone → joint node, empty when the asset has no skeleton.
 * Pushes the skin onto `skins`.
 */
export function writeSkin(
  doc: GltfDoc,
  skins: Json[],
  asset: CompiledAsset,
  root: number,
  parts: ReadonlyMap<string, number>,
): Map<string, number> {
  const sk = asset.skeleton;
  const joints = new Map<string, number>();
  if (!sk) return joints;
  const locals = jointLocals(sk);
  sk.bones.forEach((b, i) => {
    doc.nodes.push({ name: b.name, translation: locals[i] });
    const id = doc.nodes.length - 1;
    attach(doc, b.parent === undefined ? root : (joints.get(b.parent) ?? root), id);
    joints.set(b.name, id);
  });
  const skin = skins.length;
  skins.push({
    name: `${doc.nodes[root]?.['name'] ?? asset.name}_skin`,
    inverseBindMatrices: doc.bin.accessor(inverseBind(sk), 'MAT4'),
    joints: sk.bones.map((b) => joints.get(b.name) ?? 0),
    skeleton: root,
  });
  const world = worldTransforms(asset.parts);
  for (const p of asset.parts) {
    const id = parts.get(p.name);
    if (id === undefined) continue;
    if (p.mesh?.joints) {
      if (parentOf(doc, id) !== root || p.motion || p.at.some((v) => v !== 0) || p.yaw !== 0)
        throw new Ts23dError('T3D_SKIN_INVALID', {
          cause: `skinned part '${p.name}' in '${asset.name}' is moved or parented (at ${p.at}, parent ${p.parent})`,
          fix: 'keep skinned meshes static at the asset root: bones move them, not pivots',
        });
      const node = doc.nodes[id] as Json;
      node['skin'] = skin;
      node['rotation'] = Y_UP_TO_Z_UP;
      delete node['translation'];
    }
    const bone = p.socket?.data?.['bone'];
    if (typeof bone === 'string') {
      const j = joints.get(bone);
      const b = sk.bones.find((x) => x.name === bone);
      if (j === undefined || !b)
        throw new Ts23dError('T3D_RECIPE_INVALID', {
          cause: `socket '${p.name}' in '${asset.name}' rides bone '${bone}', which the skeleton lacks`,
          fix: `name a bone: ${sk.bones.map((x) => x.name).join(', ')}`,
        });
      const w = world.get(p.name)?.origin ?? p.at;
      detach(doc, parentOf(doc, id), id);
      (doc.nodes[id] as Json)['translation'] = [0, 1, 2].map((k) => (w[k] ?? 0) - (b.head[k] ?? 0));
      attach(doc, j, id);
    }
  }
  return joints;
}

/**
 * Unskinned meshes about to merge with skinned ones (a recipe's saddle on a creature body) bind
 * rigidly to the bone nearest their centre, so the merged body stays one valid skin. Material
 * layers split a pivot into several meshes: `force` binds a layer with no skinned mesh of its own
 * (a trim-sheet saddle beside a textured skinned body), so it still rides its bone.
 */
export function bindLoose(
  meshes: readonly Mesh[],
  sk: Armature | undefined,
  /** Bind even when none of `meshes` is skinned: another material layer of the pivot is. */
  force = false,
): readonly Mesh[] {
  if (!sk || meshes.every((m) => m.joints) || !(force || meshes.some((m) => m.joints)))
    return meshes;
  return meshes.map((m) => {
    if (m.joints) return m;
    const n = m.positions.length / 3;
    const mean = (k: number): number => {
      let s = 0;
      for (let v = 0; v < n; v++) s += m.positions[v * 3 + k] ?? 0;
      return n ? s / n : 0;
    };
    const c: Vec3 = [mean(0), mean(1), mean(2)];
    let best = 0;
    sk.bones.forEach((b, i) => {
      const bb = sk.bones[best];
      if (
        bb &&
        capsuleDistance(c, { a: b.head, b: b.tail }) <
          capsuleDistance(c, { a: bb.head, b: bb.tail })
      )
        best = i;
    });
    return bindRigid(m, best);
  });
}

/** Manifest `skeleton`: bone names and parents, in joint order. */
export const skeletonOf = (asset: CompiledAsset): { name: string; parent: string | null }[] =>
  (asset.skeleton?.bones ?? []).map((b) => ({ name: b.name, parent: b.parent ?? null }));
