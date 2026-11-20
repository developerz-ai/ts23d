// Half-angle helper bones (plan 101 slice 10): linear-blend skinning averages a joint's two
// matrices, so a vertex weighted half to each sinks toward the hinge as the joint bends (cos θ/2:
// 71 % at 90°). A helper `<bone>_mid` sits at the joint, child of the bone's parent, and always
// turns half as far as `<bone>`; the shared weight m = min(w_parent, w_bone) of every blend-band
// vertex moves onto it (2m, on the same 1/255 grid), so the band follows θ/2 instead of collapsing.
// Clips key it as half the joint's rotation; QA `deform` poses it the same way (the `_mid` naming
// is the contract).

import {
  type Bone,
  type Clip,
  dmath,
  type Mesh,
  type Quat,
  SKIN_INFLUENCES,
  type Track,
} from '../core/index.ts';

/** Helper suffix: `<bone>_mid` turns half as far as `<bone>`. */
export const MID = '_mid';

/** Leg joints that get a helper: shoulder / hip, elbow / stifle, carpus / hock. */
const HELPED = /^(fore|hind)_[lr]_[012]$/;

/** One helper per helped joint, under the joint's parent, a quarter of the bone long. */
export function midBones(bones: readonly Bone[], prefix: string): Bone[] {
  return bones.flatMap((b) => {
    if (!HELPED.test(b.name.slice(prefix.length)) || b.parent === undefined) return [];
    const tail: [number, number, number] = [0, 1, 2].map(
      (k) => (b.head[k] ?? 0) + ((b.tail[k] ?? 0) - (b.head[k] ?? 0)) * 0.25,
    ) as [number, number, number];
    return [{ name: `${b.name}${MID}`, parent: b.parent, head: b.head, tail }];
  });
}

/** Indices [parent, bone, helper] for every helper in the armature. */
export function midTriples(bones: readonly Bone[]): [number, number, number][] {
  const index = new Map(bones.map((b, i) => [b.name, i]));
  return bones.flatMap((h, k): [number, number, number][] => {
    if (!h.name.endsWith(MID)) return [];
    const j = index.get(h.name.slice(0, -MID.length));
    const p = h.parent === undefined ? undefined : index.get(h.parent);
    return j === undefined || p === undefined ? [] : [[p, j, k]];
  });
}

/** Moves each vertex's shared parent/bone weight onto the helper (sums and the grid unchanged). */
export function splitMid(mesh: Mesh, triples: readonly [number, number, number][]): Mesh {
  const J = mesh.joints;
  const W = mesh.weights;
  if (!J || !W || triples.length === 0) return mesh;
  const joints = Uint16Array.from(J);
  const weights = Float32Array.from(W);
  const n = joints.length / SKIN_INFLUENCES;
  for (let v = 0; v < n; v++)
    for (const [p, j, h] of triples) {
      const slot = (bone: number): number => {
        for (let s = 0; s < SKIN_INFLUENCES; s++)
          if (
            joints[v * SKIN_INFLUENCES + s] === bone &&
            (weights[v * SKIN_INFLUENCES + s] ?? 0) > 0
          )
            return s;
        return -1;
      };
      const sp = slot(p);
      const sj = slot(j);
      if (sp < 0 || sj < 0) continue;
      const ip = v * SKIN_INFLUENCES + sp;
      const ij = v * SKIN_INFLUENCES + sj;
      const wp = weights[ip] ?? 0;
      const wj = weights[ij] ?? 0;
      // The bone keeps one step where it would empty and a slot is free: it still drives a vertex.
      const free = [0, 1, 2, 3].find((k) => (weights[v * SKIN_INFLUENCES + k] ?? 0) === 0);
      const keep = wj <= wp && free !== undefined && wj > 1.5 / 255 ? 1 / 255 : 0;
      const m = Math.min(wp, wj) - keep;
      const into = keep > 0 && free !== undefined ? v * SKIN_INFLUENCES + free : wp <= wj ? ip : ij;
      weights[ip] = wp - m;
      weights[ij] = wj - m;
      joints[into] = h;
      weights[into] = Math.round(2 * m * 255) / 255;
    }
  return { ...mesh, joints, weights };
}

/** Half of a rotation (same axis, half the angle), short way round. */
export function halfTurn(q: Quat): Quat {
  const s = q[3] < 0 ? -1 : 1;
  const w = q[3] * s + 1;
  const l = dmath.hypot(q[0], q[1], q[2], w);
  return [(q[0] * s) / l, (q[1] * s) / l, (q[2] * s) / l, w / l];
}

/** Every clip with each helped joint's rotation track mirrored at half angle onto its helper. */
export function withMidTracks(clips: readonly Clip[], bones: readonly Bone[]): Clip[] {
  const helpers = new Set(bones.filter((b) => b.name.endsWith(MID)).map((b) => b.name));
  return clips.map((c) => {
    const extra = c.tracks.flatMap((t): Track[] => {
      if (!('bone' in t) || t.path !== 'rotation' || !helpers.has(`${t.bone}${MID}`)) return [];
      const values = new Float32Array(t.values.length);
      for (let i = 0; i < values.length; i += 4) {
        const [x = 0, y = 0, z = 0, w = 1] = t.values.subarray(i, i + 4);
        values.set(halfTurn([x, y, z, w]), i);
      }
      return [{ bone: `${t.bone}${MID}`, path: 'rotation', times: t.times, values }];
    });
    return extra.length ? { ...c, tracks: [...c.tracks, ...extra] } : c;
  });
}
