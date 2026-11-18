// QA `chain-cross`: one long limb may not pass through another during a clip (arm through arm, neck
// through neck). Each bone of a long chain is a capsule: its radius is the median distance of the
// skin it carries from the bone, or 3 % of the chain's length on an unskinned rig. Clips are
// posed at 15 fps. Bone pairs already close at rest (arms meeting at the hub) are exempt, and a
// contact shallower than PENETRATION_SHARE of the two radii is soft flesh pressing, not a crossing.
// Skeletons with fewer than two long chains (tanks, quadrupeds) cost nothing here.

import { type Armature, type CompiledAsset, SKIN_INFLUENCES, type Vec3 } from '../core/index.ts';
import { type BoneChain, boneEnd, longChains } from './chain-bones.ts';
import { clipPose, jointWorlds } from './clip-pose.ts';
import { skinned } from './deform.ts';
import type { Finding, Gate } from './types.ts';

export const CROSS_FPS = 15;
/** Interpenetration beyond this share of the two radii fails. */
export const PENETRATION_SHARE = 0.2;
/** Bones nearer than this many radii-sums at rest are neighbours by design: never compared. */
const REST_CLEARANCE = 1.5;
/** Capsule radius of an unskinned bone, share of its chain's length (so LODs with fewer, longer
 *  bones keep the same limb). An estimate: a slender limb; real radii come from the skin. */
const UNSKINNED_RADIUS = 0.03;

type Segment = readonly [Vec3, Vec3];

/** Shortest distance between two segments (Ericson, Real-Time Collision Detection 5.1.9). */
export function segmentDistance([p1, q1]: Segment, [p2, q2]: Segment): number {
  const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const clamp = (v: number): number => Math.max(0, Math.min(1, v));
  const d1 = sub(q1, p1);
  const d2 = sub(q2, p2);
  const r = sub(p1, p2);
  const a = dot(d1, d1);
  const e = dot(d2, d2);
  const f = dot(d2, r);
  let s = 0;
  let t = 0;
  if (a > 1e-12 || e > 1e-12) {
    if (a <= 1e-12) t = clamp(f / e);
    else {
      const c = dot(d1, r);
      if (e <= 1e-12) s = clamp(-c / a);
      else {
        const b = dot(d1, d2);
        const den = a * e - b * b;
        s = den > 1e-12 ? clamp((b * f - c * e) / den) : 0;
        t = (b * s + f) / e;
        if (t < 0) [s, t] = [clamp(-c / a), 0];
        else if (t > 1) [s, t] = [clamp((b - c) / a), 1];
      }
    }
  }
  const x = sub(
    [p1[0] + d1[0] * s, p1[1] + d1[1] * s, p1[2] + d1[2] * s],
    [p2[0] + d2[0] * t, p2[1] + d2[1] * t, p2[2] + d2[2] * t],
  );
  return Math.hypot(x[0], x[1], x[2]);
}

/** Capsule radius per bone name: median skin distance, or the unskinned estimate. */
function boneRadii(
  asset: CompiledAsset,
  sk: Armature,
  chains: readonly BoneChain[],
): Map<string, number> {
  const wanted = new Set(chains.flatMap((c) => c.bones.map((b) => b.name)));
  const dists = new Map<string, number[]>();
  for (const { mesh } of skinned(asset)) {
    const P = mesh.positions;
    for (let v = 0; v < P.length / 3; v++) {
      let top = -1;
      let weight = 0;
      for (let k = 0; k < SKIN_INFLUENCES; k++) {
        const w = mesh.weights?.[v * SKIN_INFLUENCES + k] ?? 0;
        if (w > weight) [top, weight] = [mesh.joints?.[v * SKIN_INFLUENCES + k] ?? -1, w];
      }
      const b = sk.bones[top];
      if (!b || !wanted.has(b.name)) continue;
      const p: Vec3 = [P[v * 3] ?? 0, P[v * 3 + 1] ?? 0, P[v * 3 + 2] ?? 0];
      const d = segmentDistance([p, p], [b.head, b.tail]);
      dists.set(b.name, [...(dists.get(b.name) ?? []), d]);
    }
  }
  const radii = new Map<string, number>();
  for (const c of chains)
    for (const b of c.bones) {
      const d = dists.get(b.name)?.sort((x, y) => x - y);
      const skin = d?.[Math.floor(d.length / 2)];
      radii.set(b.name, skin ?? c.length * UNSKINNED_RADIUS);
    }
  return radii;
}

/** A posed bone: its axis, radius and the sphere round it that spares most distance tests. */
interface Posed {
  readonly segment: Segment;
  readonly radius: number;
  readonly mid: Vec3;
  readonly bound: number;
}

function capsule(p: Vec3, q: Vec3, radius: number): Posed {
  const half = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) / 2;
  const mid: Vec3 = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
  return { segment: [p, q], radius, mid, bound: half + radius };
}

interface Hit {
  readonly a: string;
  readonly b: string;
  readonly depth: number;
  readonly share: number;
  readonly frame: number;
}

/** Index pairs of two chains' bones that are apart at rest, the only ones allowed to be judged. */
function judged(a: BoneChain, b: BoneChain, r: ReadonlyMap<string, number>): [number, number][] {
  const out: [number, number][] = [];
  a.bones.forEach((x, i) => {
    b.bones.forEach((y, j) => {
      const sum = (r.get(x.name) ?? 0) + (r.get(y.name) ?? 0);
      const rest = segmentDistance([x.head, x.tail], [y.head, y.tail]);
      if (rest >= sum * REST_CLEARANCE) out.push([i, j]);
    });
  });
  return out;
}

export function chainCrossFindings(asset: CompiledAsset): Finding[] {
  const sk = asset.skeleton;
  const clips = asset.clips ?? [];
  if (!sk || clips.length === 0) return [];
  const chains = longChains(sk);
  if (chains.length < 2) return [];
  const radii = boneRadii(asset, sk, chains);
  const pairs = chains.flatMap((a, i) =>
    chains.slice(i + 1).map((b) => ({ a, b, bones: judged(a, b, radii) })),
  );
  const out: Finding[] = [];
  for (const clip of clips) {
    const frames = Math.max(1, Math.round(clip.seconds * CROSS_FPS));
    let worst: Hit | null = null;
    const crossing = new Set<string>();
    for (let f = 0; f <= frames; f++) {
      const w = jointWorlds(sk, clipPose(clip, (f * clip.seconds) / frames));
      const posed = new Map<string, Posed>();
      for (const c of chains)
        for (const b of c.bones) {
          const j = w.get(b.name);
          if (j) posed.set(b.name, capsule(j.head, boneEnd(b, j), radii.get(b.name) ?? 0));
        }
      for (const { a, b, bones } of pairs)
        for (const [i, j] of bones) {
          const x = a.bones[i]?.name ?? '';
          const y = b.bones[j]?.name ?? '';
          const p = posed.get(x);
          const q = posed.get(y);
          if (!p || !q) continue;
          const reach = p.bound + q.bound;
          const [dx, dy, dz] = [p.mid[0] - q.mid[0], p.mid[1] - q.mid[1], p.mid[2] - q.mid[2]];
          if (dx * dx + dy * dy + dz * dz > reach * reach) continue;
          const sum = p.radius + q.radius;
          const depth = sum - segmentDistance(p.segment, q.segment);
          if (depth <= sum * PENETRATION_SHARE) continue;
          crossing.add(`${x}|${y}`);
          if (!worst || depth / sum > worst.share)
            worst = { a: x, b: y, depth, share: depth / sum, frame: f };
        }
    }
    if (worst)
      out.push({
        gate: 'chain-cross',
        code: 'T3D_QA_CHAIN_CROSS',
        message: `T3D_QA_CHAIN_CROSS clip '${clip.name}': '${worst.a}' passes ${(worst.depth * 100).toFixed(1)} cm into '${worst.b}' at frame ${worst.frame} (${CROSS_FPS} fps), ${crossing.size} bone pair(s) in all`,
        fix: "spread the chains' phases or targets so their paths stay apart, or give each limb its own sector round the body",
      });
  }
  return out;
}

export const chainCross: Gate = (asset) => chainCrossFindings(asset);
