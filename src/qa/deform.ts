// QA `deform` (ADR 013, plan 101 slice 10): a skinned body keeps its shape at every joint limit.
// For each bone with a `limit`, the rest pose is turned to `min` and to `max` about the limit axis
// (a `<bone>_mid` helper to half) and every opaque skinned part is linear-blend skinned on the CPU
// (what every engine evaluates). Round the joint, the blend band (triangles whose vertices straddle
// the 2–98 % share the bone moves: a smooth blend's ring, or the seam of a hard 0/1 split):
//   volume  — Σ signed tetrahedra (band triangle + joint centre) posed ÷ rest ≥ 0.6
//             (T3D_DEFORM_VOLUME; a rigid split or an unhelped 120° fold drops below ½)
//   stretch — the 99th-percentile band edge posed ÷ rest ≤ 4 (T3D_DEFORM_STRETCH; a vertex on the
//             wrong bone tears 10×+, a smooth blend smears ≤ 3.5× at a limb root), or ≤ the
//             limit's declared `stretch` (core limit-tolerance.ts: ≤ ×6, with a `why`)
//   surface — triangles within 1.5 band radii of the joint that newly cross ≤ 6 % of them
//             (T3D_DEFORM_INTERSECT; a limb swung through the body crosses far more)
// Thresholds were set on the wolf's working range (worst: shoulder 0.63, hip ×3.5, hip 5 % at
// LOD2) and the failing fixtures in deform.test.ts. A `limit.twist` is posed both ways about the
// bone; twist along chains is held to its own limit (chain-twist.ts, T3D_DEFORM_TWIST).

import {
  type Armature,
  type CompiledAsset,
  type Mesh,
  type Quat,
  quatFromAxisAngle,
  SKIN_INFLUENCES,
  STRETCH_TOLERANCE,
  toWorld,
  type Vec3,
  worldTransforms,
} from '../core/index.ts';
import { inverseBind, poseJoints, skinPositions } from '../passes/index.ts';
import { boneLength, MID_SUFFIX } from './chain-bones.ts';
import { chainTwistFindings } from './chain-twist.ts';
import { crossingPairs, weldIds } from './self-intersect.ts';
import type { Finding, Gate } from './types.ts';

export const VOLUME_MIN = 0.6;
/** Least |Σ signed| ÷ Σ |tetrahedra| for the band's volume to be read at all. */
export const READABLE = 0.25;
export const STRETCH_MAX = STRETCH_TOLERANCE.default;
/** Which band edge the stretch is read at (sorted by stretch). */
export const STRETCH_PERCENTILE = 0.99;
export const INTERSECT_SHARE = 0.06;
/** Band: share of a vertex the posed bone moves. */
const BAND: readonly [number, number] = [0.02, 0.98];

export interface RomPose {
  readonly bone: string;
  readonly label: string;
  readonly degrees: number;
  readonly rotation: ReadonlyMap<string, Quat>;
  /** The limit's stretch tolerance, and its `why` when it was raised. */
  readonly stretch: number;
  readonly why?: string;
}

export { MID_SUFFIX };

/** One pose per joint-limit extreme (zero extremes skipped), bone order; helpers at half. */
export function romPoses(sk: Armature): RomPose[] {
  const names = new Set(sk.bones.map((b) => b.name));
  return sk.bones.flatMap((b) => {
    const l = b.limit;
    if (!l) return [];
    const mid = `${b.name}${MID_SUFFIX}`;
    const pose = (axis: Vec3, d: number, label: string): RomPose => {
      const rad = (d * Math.PI) / 180;
      const rotation = new Map([[b.name, quatFromAxisAngle(axis, rad)]]);
      if (names.has(mid)) rotation.set(mid, quatFromAxisAngle(axis, rad / 2));
      const why = (l.stretch ?? STRETCH_MAX) > STRETCH_MAX ? { why: l.why ?? '' } : {};
      return {
        bone: b.name,
        label,
        degrees: d,
        rotation,
        stretch: l.stretch ?? STRETCH_MAX,
        ...why,
      };
    };
    const sign = (d: number): string => `${d > 0 ? '+' : ''}${d}°`;
    const hinge = [l.min, l.max]
      .filter((d) => d !== 0)
      .map((d) => pose(l.axis, d, `${b.name} ${sign(d)}`));
    const len = boneLength(b);
    if (!l.twist || len === 0) return hinge;
    const along: Vec3 = [
      (b.tail[0] - b.head[0]) / len,
      (b.tail[1] - b.head[1]) / len,
      (b.tail[2] - b.head[2]) / len,
    ];
    return [
      ...hinge,
      ...[l.twist, -l.twist].map((d) => pose(along, d, `${b.name} twist ${sign(d)}`)),
    ];
  });
}

/** Share of each vertex `bone` moves: its subtree's weight, plus half its helper's. */
function moved(m: Mesh, sk: Armature, bone: string): Float32Array {
  const parent = new Map(sk.bones.map((b) => [b.name, b.parent]));
  const share = sk.bones.map((b) => {
    if (b.name === `${bone}${MID_SUFFIX}`) return 0.5;
    for (let n: string | undefined = b.name; n !== undefined; n = parent.get(n))
      if (n === bone) return 1;
    return 0;
  });
  const n = m.positions.length / 3;
  const out = new Float32Array(n);
  for (let v = 0; v < n; v++)
    for (let s = 0; s < SKIN_INFLUENCES; s++) {
      const k = share[m.joints?.[v * SKIN_INFLUENCES + s] ?? -1] ?? 0;
      out[v] = (out[v] ?? 0) + k * (m.weights?.[v * SKIN_INFLUENCES + s] ?? 0);
    }
  return out;
}

const tet = (P: ArrayLike<number>, a: number, b: number, c: number, o: Vec3): number => {
  const x = (i: number, k: number): number => (P[i * 3 + k] ?? 0) - (o[k] ?? 0);
  return (
    (x(a, 0) * (x(b, 1) * x(c, 2) - x(b, 2) * x(c, 1)) -
      x(a, 1) * (x(b, 0) * x(c, 2) - x(b, 2) * x(c, 0)) +
      x(a, 2) * (x(b, 0) * x(c, 1) - x(b, 1) * x(c, 0))) /
    6
  );
};

const dist = (P: ArrayLike<number>, a: number, b: number): number =>
  Math.hypot(
    (P[a * 3] ?? 0) - (P[b * 3] ?? 0),
    (P[a * 3 + 1] ?? 0) - (P[b * 3 + 1] ?? 0),
    (P[a * 3 + 2] ?? 0) - (P[b * 3 + 2] ?? 0),
  );

export interface PoseDeform {
  readonly volume: number;
  readonly stretch: number;
  readonly crossings: number;
  readonly zone: number;
}

/** Measures of one pose on one mesh (rest positions in the asset frame). */
export function poseDeform(
  m: Mesh,
  sk: Armature,
  pose: RomPose,
  weld: Int32Array,
): PoseDeform | null {
  const w = moved(m, sk, pose.bone);
  const centre = sk.bones.find((b) => b.name === pose.bone)?.head ?? [0, 0, 0];
  const R = m.positions;
  const posed = skinPositions(m, poseJoints(sk, pose.rotation), inverseBind(sk));
  const T = m.indices;
  let rest = 0;
  let now = 0;
  let gross = 0;
  const ratios: number[] = [];
  let reach = 0;
  for (let t = 0; t < T.length; t += 3) {
    const [a, b, c] = [T[t] ?? 0, T[t + 1] ?? 0, T[t + 2] ?? 0];
    // Straddles the band: also the seam triangle of a hard 0/1 split, which has no vertex in it.
    const [lo, hi] = [
      Math.min(w[a] ?? 0, w[b] ?? 0, w[c] ?? 0),
      Math.max(w[a] ?? 0, w[b] ?? 0, w[c] ?? 0),
    ];
    if (!(lo < BAND[1] && hi > BAND[0])) continue;
    const t0 = tet(R, a, b, c, centre);
    rest += t0;
    gross += Math.abs(t0);
    now += tet(posed, a, b, c, centre);
    for (const [p, q] of [
      [a, b],
      [b, c],
      [c, a],
    ] as const) {
      const r0 = dist(R, p, q);
      if (r0 > 1e-6) ratios.push(dist(posed, p, q) / r0);
      reach = Math.max(
        reach,
        Math.hypot(...[0, 1, 2].map((k) => (R[p * 3 + k] ?? 0) - (centre[k] ?? 0))),
      );
    }
  }
  // No triangle joins what the bone moves to what it leaves: nothing deforms (shells it moves
  // whole are rigid; whether they clear each other is the clip gates' question).
  if (ratios.length === 0) return null;
  // A band that wraps the joint centre (a single ring round a coarse tube's knee) has a signed
  // volume made of cancelling halves: its ratio says nothing. Read volume only where the band
  // encloses at least a quarter of its gross volume.
  const readable = Math.abs(rest) >= gross * READABLE;
  const zone: number[] = [];
  for (let t = 0; t < T.length / 3; t++) {
    const v = T[t * 3] ?? 0;
    if (Math.hypot(...[0, 1, 2].map((k) => (R[v * 3 + k] ?? 0) - (centre[k] ?? 0))) < reach * 1.5)
      zone.push(t);
  }
  const crossings = Math.max(
    0,
    crossingPairs(posed, T, zone, weld) - crossingPairs(R, T, zone, weld),
  );
  // The 99th percentile: a sliver edge the sculpt mesher left may stretch alone; a smear doesn't.
  ratios.sort((x, y) => x - y);
  const stretch = ratios[Math.floor((ratios.length - 1) * STRETCH_PERCENTILE)] ?? 1;
  return { volume: readable ? now / rest : 1, stretch, crossings, zone: zone.length };
}

/** Opaque skinned parts in the asset frame. */
export function skinned(asset: CompiledAsset): { name: string; mesh: Mesh }[] {
  const xf = worldTransforms(asset.parts);
  return asset.parts.flatMap((p) => {
    const m = p.mesh;
    const t = xf.get(p.name);
    if (!m?.joints || !t || (p.surface && p.surface !== 'opaque') || m.indices.length === 0)
      return [];
    const positions = new Float32Array(m.positions.length);
    for (let i = 0; i < positions.length; i += 3)
      positions.set(
        toWorld(t, [m.positions[i] ?? 0, m.positions[i + 1] ?? 0, m.positions[i + 2] ?? 0]),
        i,
      );
    return [{ name: p.name, mesh: { ...m, positions } }];
  });
}

export function deformFindings(asset: CompiledAsset): Finding[] {
  const sk = asset.skeleton;
  if (!sk) return [];
  const out = chainTwistFindings(asset);
  const poses = romPoses(sk);
  if (poses.length === 0) return out;
  for (const { name, mesh } of skinned(asset)) {
    const weld = weldIds(mesh.positions);
    for (const pose of poses) {
      const d = poseDeform(mesh, sk, pose, weld);
      if (!d) continue;
      const where = `LOD${asset.lod} part '${name}' at ${pose.label}`;
      const add = (code: string, what: string, fix: string): void => {
        out.push({ gate: 'deform', code, part: name, message: `${code} ${where}: ${what}`, fix });
      };
      if (d.volume < VOLUME_MIN)
        add(
          'T3D_DEFORM_VOLUME',
          `the joint keeps ${(d.volume * 100).toFixed(0)} % of its volume (≥ ${VOLUME_MIN * 100} %)`,
          'add a helper (half-angle) bone at the joint, or move the pivot to the anatomical centre of rotation',
        );
      if (d.stretch > pose.stretch)
        add(
          'T3D_DEFORM_STRETCH',
          `an edge stretches ×${d.stretch.toFixed(2)} (≤ ×${pose.stretch}${pose.why ? `, declared: ${pose.why}` : ''})`,
          'add a helper bone or edge loops across the joint, or move the pivot',
        );
      if (d.crossings > Math.max(4, d.zone * INTERSECT_SHARE))
        add(
          'T3D_DEFORM_INTERSECT',
          `${d.crossings} triangle pairs pass through each other (of ${d.zone} round the joint)`,
          'add a helper bone, move the pivot, or narrow the joint limit to the real range',
        );
    }
  }
  return out;
}

export const deform: Gate = (asset) => deformFindings(asset);
