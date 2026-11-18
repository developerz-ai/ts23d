// The creature skeleton record every sculpt stage reads: trunk masses, neck/tail chains, legs as
// joint chains with radii, the head frame (atlas pivot + pitch), wings and fins, ground contacts.
// Left side only (+Y); the body sculpt mirrors. Also the shared maths: allometric limb radius
// (Campione & Evans 2012) and eye size from mass, and the head-local → world transform.
// `armatureOf` exports the record as the core `Armature` (ADR 013) the kind declares via ctx.bone.

import type { Bone, Vec3 } from '../core/index.ts';
import type { Hoof } from './creature-family.ts';
import type { SkinNode } from './creature-skin.ts';
import type { Skeleton, Stance } from './creature-spec.ts';

export interface Muscle {
  readonly at: Vec3;
  readonly r: Vec3;
  readonly rotate?: Vec3;
  /** Only where the sculpted bone chain exists (LOD0/1): a knob on a LOD2 tube would float. */
  readonly fine?: boolean;
}

export interface Limb {
  readonly name: 'fore' | 'hind';
  /** Joint chain root → foot top (left side). */
  readonly joints: readonly Vec3[];
  readonly radii: readonly number[];
  /** Foot centre on the ground (z = 0) and its half-sizes (x along, y across, z up). */
  readonly foot: Vec3;
  readonly footSize: Vec3;
  /** Clawed toes on the ground (claws/talons), or 0 for a hoof. */
  readonly toes: number;
  /** Digits carried off the ground: a paw's dewclaw (digit I), a cloven hoof's II + V. */
  readonly dewclaws: number;
  /** Hoof of an unguligrade foot: one (equid) or two hoofed digits (artiodactyl); null for paws. */
  readonly hoof: Hoof | null;
  /** Muscle masses and joint landmarks (triceps, forearm, thigh, calf, elbow point, hock…). */
  readonly muscles: readonly Muscle[];
}

export interface HeadFrame {
  /** Atlas joint (the head part's pivot), world. */
  readonly atlas: Vec3;
  /** Nose-down pitch, radians. */
  readonly pitch: number;
  /** Head length (occiput → nose), width, metres. */
  readonly length: number;
  readonly width: number;
  /** Head height (crown → jaw), metres. */
  readonly height: number;
  /** Bird beak / fish snout instead of a furred muzzle with nose leather. */
  readonly beak: boolean;
}

export interface Wing {
  /** Arm chain root → wrist and finger tips (left). */
  readonly arm: readonly SkinNode[];
  readonly tips: readonly Vec3[];
  /** Membrane outline (closed polygon, world, left). */
  readonly membrane: readonly Vec3[];
  /** One wing's area, m². */
  readonly area: number;
  readonly folded: boolean;
}

export interface Bones {
  readonly skeleton: Skeleton;
  readonly stance: Stance;
  readonly mass: number;
  /** Shoulder height (legged) or body depth, metres. */
  readonly height: number;
  /** Upper-limb flesh radius (allometric × build.limbs). */
  readonly limbR: number;
  /** Trunk masses (centred on y = 0): ellipsoids, or superellipsoids of exponent `power`. */
  readonly trunk: readonly { at: Vec3; r: Vec3; rotate?: Vec3; power?: number }[];
  /** Round body chain (serpent) or none. */
  readonly chain: readonly SkinNode[];
  /** Dorsal top line, rear → front: colour zones read the back from it. */
  readonly spine: readonly Vec3[];
  readonly neck: readonly SkinNode[];
  readonly tail: readonly SkinNode[];
  readonly head: HeadFrame;
  readonly legs: readonly Limb[];
  readonly wings: readonly Wing[];
  /** Fins as pressed chains: [nodes, side normal]. */
  readonly fins: readonly { nodes: readonly SkinNode[]; side: Vec3 }[];
  /** Ground contacts of both sides (feet, fin tips, belly), z = 0: the support polygon. */
  readonly ground: readonly Vec3[];
  /** Whether the body sculpt is mirror-symmetric (all but the serpent's S-curve). */
  readonly mirror: boolean;
  /** Nose tip and tail root, world (head-body length is their distance). */
  readonly nose: Vec3;
  readonly tailRoot: Vec3;
}

/** Bone diameter ÷ furred limb width at mid-humerus / mid-femur (tiger dossier assumption;
 *  unsourced). */
export const BONE_FRACTION = 0.2;

/** Campione & Evans 2012: humerus + femur circumference (mm) that carries `mass` kg. */
export const boneCircumference = (mass: number): number =>
  10 ** ((Math.log10(mass * 1000) + 1.104) / 2.749);

/** Inverse: body mass (kg) carried by humerus + femur circumference `c` mm. */
export const massFromBones = (c: number): number => 10 ** (2.749 * Math.log10(c) - 1.104) / 1000;

/** Upper-limb flesh radius (m) for a mass: each bone half the circumference, flesh = bone / BF. */
export function allometricLimbR(mass: number): number {
  const boneDiameter = boneCircumference(mass) / 2 / Math.PI / 1000;
  return boneDiameter / BONE_FRACTION / 2;
}

/** Eyeball radius from mass (wolf 40 kg → 11.5 mm, tiger → 16.5 mm). Howland et al. 2004 give
 *  log-linear scaling with mass; this 0.2 exponent and the 0.0055 factor are unsourced fits. */
export const eyeRadius = (mass: number): number => 0.0055 * mass ** 0.2;

/** Head-local point → world (pitch about Y, then move to the atlas). */
export function headToWorld(h: HeadFrame, p: Vec3): Vec3 {
  const c = Math.cos(h.pitch);
  const s = Math.sin(h.pitch);
  return [h.atlas[0] + c * p[0] + s * p[2], h.atlas[1] + p[1], h.atlas[2] - s * p[0] + c * p[2]];
}

/** Both feet of each leg pair on the ground (left foot and its mirror). */
export function feet(legs: readonly Limb[]): Vec3[] {
  return legs.flatMap((l) => [l.foot, [l.foot[0], -l.foot[1], 0] as Vec3]);
}

/** Bones from a polyline: at most `max` segments (evenly picked joints), named `name_0…`. */
function chainBones(
  name: string,
  pts: readonly Vec3[],
  parent: string | undefined,
  max: number,
): Bone[] {
  const n = pts.length - 1;
  if (n < 1) return [];
  const k = Math.min(n, max);
  const at = (i: number): Vec3 => pts[Math.round((i * n) / k)] ?? [0, 0, 0];
  const out: Bone[] = [];
  for (let i = 0; i < k; i++)
    out.push({
      name: `${name}_${i}`,
      head: at(i),
      tail: at(i + 1),
      ...(i === 0 ? (parent ? { parent } : {}) : { parent: `${name}_${i - 1}` }),
    });
  return out;
}

const flipY = (p: Vec3): Vec3 => [p[0], -p[1], p[2]];

/**
 * The skeleton as bones (asset frame, parent first): `spine_*` sacrum → withers (or the body
 * chain), `neck_*`, `head` (atlas → nose), `jaw` (hinge → chin, when given), `tail_*`, each leg
 * `fore_l_*` / `hind_l_*` (shoulder/hip → foot tip) mirrored as `_r`, wings `wing_l_*`, a
 * biped's arms `arm_l_*` / `arm_r_*`.
 */
export function armatureOf(b: Bones, jaw: readonly [Vec3, Vec3] | null, prefix = ''): Bone[] {
  const p = (n: string): string => `${prefix}${n}`;
  // A biped's `chain` is its left arm (the sculpt mirrors it), not a body chain: its spine is
  // the dorsal line and the arms hang from the top of it.
  const arms = b.skeleton === 'biped' && b.chain.length > 1 ? b.chain.map((c) => c.at) : [];
  const chainBody = arms.length === 0 && b.chain.length > 1;
  const body = chainBody ? b.chain.map((c) => c.at) : b.spine;
  const spine = chainBones(p('spine'), body, undefined, 6);
  const top = spine[spine.length - 1]?.name;
  const neckPts = b.neck.slice(1).map((n) => n.at);
  const neck = chainBones(p('neck'), neckPts, top, 3);
  // A chain body runs head → tail: the bone beside the head is its first, not its last.
  const headParent = neck[neck.length - 1]?.name ?? (chainBody ? spine[0]?.name : top);
  const nose = headToWorld(b.head, [b.head.length * 0.9, 0, -0.1 * b.head.length]);
  const out: Bone[] = [
    ...spine,
    ...neck,
    {
      name: p('head'),
      head: b.head.atlas,
      tail: nose,
      ...(headParent ? { parent: headParent } : {}),
    },
  ];
  if (jaw)
    out.push({
      name: p('jaw'),
      parent: p('head'),
      head: jaw[0],
      tail: jaw[1],
      limit: { axis: [0, 1, 0], min: 0, max: 40 },
    });
  out.push(
    ...chainBones(
      p('tail'),
      b.tail.map((t) => t.at),
      spine[0]?.name,
      5,
    ),
  );
  for (const l of b.legs) {
    const tip: Vec3 = [l.foot[0] + l.footSize[0], l.foot[1], l.footSize[2] * 0.5];
    const pts = [...l.joints, tip];
    const root = l.name === 'fore' ? top : spine[0]?.name;
    for (const [side, f] of [
      ['l', (q: Vec3): Vec3 => q],
      ['r', flipY],
    ] as const)
      out.push(...chainBones(p(`${l.name}_${side}`), pts.map(f), root, 6));
  }
  if (arms.length)
    out.push(
      ...chainBones(p('arm_l'), arms, top, 3),
      ...chainBones(p('arm_r'), arms.map(flipY), top, 3),
    );
  for (const w of b.wings) {
    const pts = w.arm.map((a) => a.at);
    out.push(
      ...chainBones(p('wing_l'), pts, top, 4),
      ...chainBones(p('wing_r'), pts.map(flipY), top, 4),
    );
  }
  return out;
}
