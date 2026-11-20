// The creature's full armature: `armatureOf` plus the ear bones (head-local ear base → tip, so the
// ears can follow through) and joint limits — leg ROM from the passive flexion / extension table
// (docs/research/animal-anatomy.md §6, FORM19) narrowed to the asset's own baked excursion
// (creature-clips.ts `clipEnvelope`), neck, head and tail ranges [P]. Limits are the range
// deformation QA poses the skin at (qa/deform.ts): what the asset moves through, never wider.

import type { Bone, JointLimit, Vec3 } from '../core/index.ts';
import { dmath } from '../core/index.ts';
import { armatureOf, type Bones, headToWorld } from './creature-bones.ts';
import type { HeadLayout } from './creature-head.ts';
import { EAR_UP } from './creature-head-parts.ts';
import { midBones } from './creature-helpers.ts';
import { jawHinge } from './creature-skull.ts';

/** Inside angles between bone axes, degrees: [flexed, extended] (FORM19, French Bulldog). */
const ROM: Readonly<Record<string, readonly [number, number]>> = {
  fore_0: [51, 160],
  fore_1: [50, 175],
  fore_2: [32, 204],
  hind_0: [58, 180],
  hind_1: [58, 173],
  hind_2: [40, 188],
};
/** Which way flexion turns the bone about +Y (checked on the wolf skeleton: the inside angle
 *  closes). +1: the shoulder (elbow goes back), carpus (paw folds back) and stifle; −1: the
 *  elbow (forearm swings forward-up to the humerus), hip (knee forward) and hock. */
const FLEX_SIGN: Readonly<Record<string, 1 | -1>> = {
  fore_0: 1,
  fore_1: -1,
  fore_2: 1,
  hind_0: -1,
  hind_1: 1,
  hind_2: -1,
};
/** The unmodelled proximal segment at the shoulder (scapula: up, 30° back of vertical) and the
 *  hip (ilium: forward, 30° above horizontal) [P]. */
const PROXIMAL: Readonly<Record<string, Vec3>> = {
  fore_0: [-0.5, 0, 0.866],
  hind_0: [0.866, 0, 0.5],
};
/** Degrees of slack round a joint's baked excursion. */
export const ENVELOPE_MARGIN = 3;

/** Signed degrees, min and max, each bone turns about its own limit axis over the clips. */
export type Envelope = ReadonlyMap<string, readonly [number, number]>;

/** The passive limit narrowed to the asset's own baked excursion (± the margin), if it moves. */
function working(
  l: JointLimit | undefined,
  e: readonly [number, number] | undefined,
): JointLimit | undefined {
  if (!l || !e) return l;
  const m = ENVELOPE_MARGIN;
  return {
    ...l,
    min: Math.min(0, Math.max(l.min, Math.round((e[0] - m) * 10) / 10)),
    max: Math.max(0, Math.min(l.max, Math.round((e[1] + m) * 10) / 10)),
  };
}

/** Toes at the MCP / MTP joint: 60° curl, 60° lift [P]. */
const TOES: JointLimit = { axis: [0, 1, 0], min: -60, max: 60 };

const planar = (v: Vec3): number => dmath.atan2(v[0], v[2]);

/** Inside angle at a joint (degrees) between the proximal and distal directions in the XZ plane. */
function inside(p: Vec3, d: Vec3): number {
  let a = Math.abs(planar(p) - planar(d)) * (180 / Math.PI);
  if (a > 180) a = 360 - a;
  return a;
}

function legLimit(key: string, prox: Vec3, dist: Vec3): JointLimit | undefined {
  const rom = ROM[key];
  const sign = FLEX_SIGN[key];
  if (!rom || !sign) return undefined;
  const rest = inside(prox, dist);
  const flex = Math.max(0, rest - rom[0]);
  const ext = Math.max(0, rom[1] - rest);
  const r = (x: number): number => Math.round(x * 10) / 10;
  return sign > 0
    ? { axis: [0, 1, 0], min: r(-ext), max: r(flex) }
    : { axis: [0, 1, 0], min: r(-flex), max: r(ext) };
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/** Limit of a bone by its unprefixed name, given the armature (for the joint's proximal bone). */
function limitOf(
  local: string,
  bone: Bone,
  parent: Bone | undefined,
  e: readonly [number, number] | undefined,
): JointLimit | undefined {
  const leg = /^(fore|hind)_[lr]_(\d)$/.exec(local);
  if (leg) {
    const key = `${leg[1]}_${leg[2]}`;
    if (leg[2] === '3') return working(TOES, e);
    const dist = sub(bone.tail, bone.head);
    const prox = PROXIMAL[key] ?? (parent ? sub(parent.head, parent.tail) : undefined);
    return working(prox ? legLimit(key, prox, dist) : undefined, e);
  }
  if (local === 'neck_0') return { axis: [0, 1, 0], min: -25, max: 25 };
  if (local === 'neck_1') return { axis: [0, 0, 1], min: -35, max: 35 };
  if (local === 'head') return { axis: [0, 1, 0], min: -20, max: 25 };
  if (local === 'tail_0') return { axis: [0, 0, 1], min: -40, max: 40 };
  if (/^scapula_[lr]$/.test(local)) return working(bone.limit, e);
  return bone.limit;
}

/** Ear bones (left, mirrored right) under `head`: base → tip along the blade, world. */
export function earBones(b: Bones, l: HeadLayout, prefix: string): Bone[] {
  const base = l.ear;
  if (!base || l.earHeight <= 0) return [];
  const tip: Vec3 = [
    base[0] + EAR_UP[0] * l.earHeight,
    base[1] + EAR_UP[1] * l.earHeight,
    base[2] + EAR_UP[2] * l.earHeight,
  ];
  return [1, -1].map((s) => ({
    name: `${prefix}ear_${s > 0 ? 'l' : 'r'}`,
    parent: `${prefix}head`,
    head: headToWorld(b.head, [base[0], base[1] * s, base[2]]),
    tail: headToWorld(b.head, [tip[0], tip[1] * s, tip[2]]),
  }));
}

/** The jaw bone's ends, world: the hinge and the chin. */
export function jawOf(b: Bones, l: HeadLayout): [Vec3, Vec3] {
  const [hx, , hz] = jawHinge(l);
  return [
    headToWorld(b.head, [hx, 0, hz]),
    headToWorld(b.head, [l.L - l.rt * 2.2, 0, l.zt - l.rt * 0.85]),
  ];
}

/** Scapula: from the shoulder joint up 30° behind vertical (PROXIMAL.fore_0) toward the dorsal
 *  line, 90 % of the way; it pivots a third of its length below its top (dog scapula rotation
 *  centre in the upper third: Fischer & Lilje, *Dogs in Motion*, 2011) [P]. */
const SCAPULA_REACH = 0.9;
const SCAPULA_PIVOT = 2 / 3;
/** Scapula rotation range either way, degrees (±25–30° in canid trot/gallop) [P]. */
const SCAPULA_SWING = 28;

/** `scapula_l/r` bones (pivot → shoulder joint) under the thoracic spine bone `top`. */
function scapulae(arm: readonly Bone[], b: Bones, prefix: string, top: string): Bone[] {
  const dorsal = Math.max(...b.spine.map((p) => p[2]));
  const up = PROXIMAL['fore_0'] ?? [-0.5, 0, 0.866];
  return ['l', 'r'].flatMap((side) => {
    const s = arm.find((x) => x.name === `${prefix}fore_${side}_0`)?.head;
    if (!s) return [];
    const len = (Math.max(0, dorsal - s[2]) / up[2]) * SCAPULA_REACH * SCAPULA_PIVOT;
    return [
      {
        name: `${prefix}scapula_${side}`,
        parent: top,
        head: [s[0] + up[0] * len, s[1], s[2] + up[2] * len] as Vec3,
        tail: s,
        limit: { axis: [0, 1, 0] as Vec3, min: -SCAPULA_SWING, max: SCAPULA_SWING },
      },
    ];
  });
}

/** Fore legs re-hung from their scapulae (quadrupeds have no clavicle: the scapula slides). */
function withScapulae(arm: readonly Bone[], b: Bones, prefix: string): Bone[] {
  const top = arm.find((x) => x.name === `${prefix}fore_l_0`)?.parent;
  if (!top) return [...arm];
  const sc = scapulae(arm, b, prefix, top);
  const at = arm.findIndex((x) => x.name === top) + 1;
  const hung = arm.map((x) =>
    /^fore_[lr]_0$/.test(x.name.slice(prefix.length))
      ? { ...x, parent: `${prefix}scapula_${x.name.slice(prefix.length)[5]}` }
      : x,
  );
  return [...hung.slice(0, at), ...sc, ...hung.slice(at)];
}

/**
 * `armatureOf` + ears (when the head has them); quadrupeds: scapulae carrying the fore legs (unless
 * `scapula: false`), limits and half-angle helpers. Leg limits are the passive ROM, narrowed to
 * `envelope` (the asset's own clips) where given.
 */
export function rigBones(
  b: Bones,
  l: HeadLayout | null,
  jaw: readonly [Vec3, Vec3] | null,
  prefix = '',
  envelope: Envelope = new Map(),
  scapula = true,
): Bone[] {
  const arm = armatureOf(b, jaw, prefix);
  const ears = l && arm.some((x) => x.name === `${prefix}head`) ? earBones(b, l, prefix) : [];
  if (b.skeleton !== 'quadruped') return [...arm, ...ears];
  const all = [...(scapula ? withScapulae(arm, b, prefix) : arm), ...ears];
  const byName = new Map(all.map((x) => [x.name, x]));
  const limited = all.map((bone) => {
    const parent = bone.parent ? byName.get(bone.parent) : undefined;
    const limit = limitOf(bone.name.slice(prefix.length), bone, parent, envelope.get(bone.name));
    return limit ? { ...bone, limit } : bone;
  });
  return [...limited, ...midBones(limited, prefix)];
}
