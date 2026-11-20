// The creature's skin (ADR 013): every part rides the 28-bone armature. Weights come from the
// skeleton's own flesh: each bone a tapered capsule with the radii the sculpt used (neck, tail,
// limb nodes; trunk masses for the spine, its line dropped from the dorsal top line to the
// trunk's centre), falloff k = ½ the upper-limb radius. Body: smooth over every bone but the jaw;
// head: head + neck (+ jaw at LOD2, where the jaw is sculpted in); jaw part rigid on `jaw` (the
// mouth opens by the bone, so no jaw morph is needed); eyes rigid on `head`; fur cards and claws
// rigid per piece at their root; ears on their own bones (they follow through). `blink` is a
// morph on the head: each upper lid turns down over the ball about its lateral axis. Clips:
// creature-clips.ts.

import type { Bone, Mesh, Vec3 } from '../core/index.ts';
import { dmath } from '../core/index.ts';
import {
  bindRigid,
  hingeMorph,
  skinPieces,
  skinWeights,
  sumMorphs,
  type WeightBone,
} from '../passes/index.ts';
import type { Bones, HeadFrame } from './creature-bones.ts';
import type { EyeSpec } from './creature-eye.ts';
import { MID, midTriples, splitMid } from './creature-helpers.ts';

export interface CreatureRig {
  /** Smooth weights over every bone but the jaw (body, trunk, legs, tail, neck into the head). */
  body(mesh: Mesh): Mesh;
  /** The pitched head mesh at the atlas: smooth on head + neck, plus the `blink` morph. */
  head(mesh: Mesh, lod: number): Mesh;
  /** Every vertex on one bone (`head`, `jaw`). */
  rigid(mesh: Mesh, bone: 'head' | 'jaw'): Mesh;
  /** Rigid per card / claw at its root, on the body's or the head's bones; `at` = part offset. */
  pieces(mesh: Mesh, on: 'body' | 'head', at: Vec3): Mesh;
}

const deg = Math.PI / 180;
type Node = { readonly at: Vec3; readonly r: number };

const nearest = (nodes: readonly Node[], p: Vec3, fallback: number): number => {
  let best = fallback;
  let d = Infinity;
  for (const n of nodes) {
    const e = dmath.hypot(n.at[0] - p[0], n.at[1] - p[1], n.at[2] - p[2]);
    if (e < d) [d, best] = [e, n.r];
  }
  return best;
};

/** Trunk centre line and half-thickness at x (the widest-covering trunk mass), or null. */
function trunkAt(b: Bones, x: number): { z: number; r: number } | null {
  let out: { z: number; r: number } | null = null;
  for (const t of b.trunk) {
    const u = (x - t.at[0]) / t.r[0];
    if (Math.abs(u) >= 1) continue;
    const k = Math.sqrt(1 - u * u);
    const r = Math.max(t.r[1], t.r[2]) * 0.9 * k;
    if (!out || r > out.r) out = { z: t.at[2], r };
  }
  return out;
}

/** The flesh capsule of one bone (name without the prefix). */
function fleshOf(b: Bones, bone: Bone, name: string): WeightBone {
  const flip = (n: Node): Node => ({ at: [n.at[0], -n.at[1], n.at[2]], r: n.r });
  const side = name.includes('_r_');
  const mirror = (ns: readonly Node[]): readonly Node[] => (side ? ns.map(flip) : ns);
  const ends = (ns: readonly Node[], fallback: number): WeightBone => ({
    a: bone.head,
    b: bone.tail,
    r1: nearest(ns, bone.head, fallback),
    r2: nearest(ns, bone.tail, fallback),
  });
  const h = b.head.height;
  if (name === 'head') return { a: bone.head, b: bone.tail, r1: h * 0.4, r2: h * 0.2 };
  if (name === 'jaw') return { a: bone.head, b: bone.tail, r1: h * 0.15, r2: h * 0.1 };
  // The scapula: the upper shoulder and withers flesh over the blade, as thick as the upper arm.
  if (name.startsWith('scapula_'))
    return { a: bone.head, b: bone.tail, r1: b.limbR * 1.2, r2: b.limbR * 1.2 };
  if (name.startsWith('ear_')) {
    const len = dmath.norm(bone.tail.map((t, k) => t - (bone.head[k] ?? 0)));
    return { a: bone.head, b: bone.tail, r1: len * 0.3, r2: len * 0.08 };
  }
  if (name.startsWith('neck')) return ends(b.neck, h * 0.3);
  if (name.startsWith('tail')) return ends(b.tail, b.limbR);
  if (name.startsWith('wing')) return ends(mirror(b.wings.flatMap((w) => w.arm)), b.limbR);
  const limb = b.legs.find((l) => name.startsWith(`${l.name}_`));
  if (limb)
    return ends(mirror(limb.joints.map((at, i) => ({ at, r: limb.radii[i] ?? b.limbR }))), b.limbR);
  if (name.startsWith('arm_')) return ends(mirror(b.chain), b.limbR);
  if (b.chain.length > 1 && b.skeleton !== 'biped') return ends(b.chain, b.limbR);
  // Spine: the bone runs along the dorsal top line; its flesh is the trunk below it.
  const ta = trunkAt(b, bone.head[0]);
  const tb = trunkAt(b, bone.tail[0]);
  if (!ta || !tb) return { a: bone.head, b: bone.tail, r1: b.height * 0.15, r2: b.height * 0.15 };
  return { a: [bone.head[0], 0, ta.z], b: [bone.tail[0], 0, tb.z], r1: ta.r, r2: tb.r };
}

/** Both upper lids turned down over the balls (head-local eye → the pitched head frame). */
function blink(mesh: Mesh, e: EyeSpec, h: HeadFrame): Mesh {
  const c = dmath.cos(h.pitch);
  const s = dmath.sin(h.pitch);
  const pitch = (p: Vec3): Vec3 => [c * p[0] + s * p[2], p[1], -s * p[0] + c * p[2]];
  const unpitch = (p: Vec3): Vec3 => [c * p[0] - s * p[2], p[1], s * p[0] + c * p[2]];
  const R = e.r + e.lid;
  const ih = e.r * dmath.sin(dmath.asin(Math.min(0.95, e.iris / e.r)));
  const upper = ih * (1 - 2 * e.upper);
  const lower = -ih * (1 - 2 * e.lower);
  const degrees =
    (dmath.asin(Math.max(-1, Math.min(1, upper / R))) -
      dmath.asin(Math.max(-1, Math.min(1, lower / R))) +
      dmath.asin(Math.min(1, e.lid / R))) /
    deg;
  const a = (e.aperture ?? 0) * deg;
  const morph = (side: 1 | -1) => {
    const centre: Vec3 = [e.centre[0], e.centre[1] * side, e.centre[2]];
    const axis: Vec3 = [-dmath.sin(a) * side, dmath.cos(a), 0];
    return hingeMorph(mesh, 'blink', {
      at: pitch(centre),
      axis: pitch(axis),
      degrees,
      weight: (q) => {
        const p = unpitch(q);
        const d: Vec3 = [p[0] - centre[0], p[1] - centre[1], p[2] - centre[2]];
        const front = d[0] * dmath.cos(a) + d[1] * dmath.sin(a) * side;
        const r = dmath.norm(d);
        if (front < -e.r * 0.8 || r > R + e.lid * 4) return 0;
        const near = Math.min(1, Math.max(0, (R + e.lid * 4 - r) / (e.lid * 2.5)));
        const above = Math.min(1, Math.max(0, (d[2] - (upper + lower) / 2) / e.lid));
        return near * above;
      },
    });
  };
  return { ...mesh, morphs: [...(mesh.morphs ?? []), sumMorphs('blink', morph(1), morph(-1))] };
}

export function creatureRig(
  b: Bones,
  bones: readonly Bone[],
  prefix: string,
  eye: EyeSpec,
): CreatureRig {
  const local = (n: Bone): string => n.name.slice(prefix.length);
  const flesh = bones.map((n) => fleshOf(b, n, local(n)));
  const index = (name: string): number => bones.findIndex((n) => local(n) === name);
  const all = bones.map((_, i) => i);
  const helper = (i: number): boolean => (bones[i]?.name ?? '').endsWith(MID);
  const body = all.filter((i) => !/^(jaw|ear_[lr])$/.test(local(bones[i] as Bone)) && !helper(i));
  const mids = midTriples(bones);
  const head = all.filter((i) => /^(head|neck_\d+|ear_[lr])$/.test(local(bones[i] as Bone)));
  const blend = Math.max(b.limbR, b.height * 0.05) * 0.5;
  return {
    body: (mesh) => splitMid(skinWeights(mesh, flesh, { blend, only: body }), mids),
    head: (mesh, lod) =>
      blink(
        skinWeights(mesh, flesh, {
          blend,
          only: lod === 2 ? [...head, index('jaw')] : head,
          offset: b.head.atlas,
        }),
        eye,
        b.head,
      ),
    rigid: (mesh, bone) => bindRigid(mesh, Math.max(0, index(bone))),
    pieces: (mesh, on, at) =>
      splitMid(
        skinPieces(mesh, flesh, { blend, only: on === 'body' ? body : head, offset: at }),
        mids,
      ),
  };
}
