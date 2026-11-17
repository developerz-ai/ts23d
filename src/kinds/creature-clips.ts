// The creature's default baked clips (ADR 013), on the bones its armature has: `idle` (breath,
// tail sway, an ear flick), `look` (neck and head turn left and right), `bite` (jaw snap with a
// neck lunge) and, for four-legged quadrupeds, `walk`, `trot` and `gallop` as root-motion loops
// (gait.ts; `run` is reserved for part motions). Tail and ears follow through on baked springs
// (springs.ts) in every clip. In the in-place clips the paws stay planted: the legs are re-solved
// under the moving body (creature-plant.ts). Every loop's last key repeats its first.

import type { Bone, Clip, Quat, Vec3 } from '../core/index.ts';
import type { Bones } from './creature-bones.ts';
import { headLayout } from './creature-head.ts';
import { withMidTracks } from './creature-helpers.ts';
import { type Envelope, jawOf, rigBones } from './creature-limits.ts';
import { legOf, plantLegs } from './creature-plant.ts';
import type { CreatureSpec } from './creature-spec.ts';
import { FEET, type Foot, GAITS, type Gait, type QuadrupedRig } from './gait.ts';
import { bakeKeys, gaitClip, rotationTracks } from './gait-bake.ts';
import type { LegBones } from './gait-ik.ts';
import { qexp } from './pose.ts';
import { bakeSprings, type SpringBone } from './springs.ts';

const deg = Math.PI / 180;
const TAU = Math.PI * 2;

/** Gait clips a quadruped gets, by clip name. */
export const CREATURE_GAITS: readonly (readonly [string, Gait])[] = [
  ['walk', 'walk'],
  ['trot', 'trot'],
  ['gallop', 'gallop'],
];

/** Tail segments after the first and both ears follow through [P: tail 2.2 Hz, ears 4 Hz]. */
function springsOf(bones: readonly Bone[], prefix: string): SpringBone[] {
  return bones.flatMap((b): SpringBone[] => {
    const n = b.name.slice(prefix.length);
    if (/^tail_[1-9]\d*$/.test(n)) return [{ bone: b.name, hz: 2.2, damping: 0.3, max: 20 }];
    if (/^ear_[lr]$/.test(n)) return [{ bone: b.name, hz: 4, damping: 0.35, max: 12 }];
    return [];
  });
}

/** The gait rig of a four-legged quadruped armature, else null. */
export function quadrupedRig(bones: readonly Bone[], prefix: string): QuadrupedRig | null {
  const legs: Partial<Record<Foot, LegBones>> = {};
  for (const f of FEET) {
    const leg = legOf(bones, prefix, f);
    if (!leg) return null;
    legs[f] = leg;
  }
  const named = (re: RegExp): string[] =>
    bones.filter((b) => re.test(b.name.slice(prefix.length))).map((b) => b.name);
  const spine = named(/^spine_\d+$/);
  if (spine.length === 0 || !legs.lh || !legs.lf || !legs.rh || !legs.rf) return null;
  return {
    bones,
    legs: { lh: legs.lh, lf: legs.lf, rh: legs.rh, rf: legs.rf },
    spine,
    neck: named(/^neck_\d+$/),
    tail: named(/^tail_\d+$/),
    scapula: Object.fromEntries(
      (['lf', 'rf'] as const).flatMap((f) => {
        const n = `${prefix}scapula_${f[0]}`;
        return bones.some((b) => b.name === n) ? [[f, n]] : [];
      }),
    ),
  };
}

/** A looping in-place clip from per-phase local rotations: paws planted, springs on top. */
function loopClip(
  name: string,
  seconds: number,
  bones: readonly Bone[],
  legs: readonly LegBones[],
  springs: readonly SpringBone[],
  pose: (phi: number) => Map<string, Quat>,
): Clip {
  const { times, keys } = bakeKeys(seconds, (phi) => plantLegs(bones, legs, pose(phi)));
  const n = keys.length - 1;
  const roots = keys.slice(0, n).map((): Vec3 => [0, 0, 0]);
  const sprung = bakeSprings(bones, keys.slice(0, n), roots, seconds / n, springs);
  sprung.push(sprung[0] ?? new Map());
  return { name, seconds, loop: true, tracks: rotationTracks(bones, times, sprung) };
}

const pulse = (x: number, at: number, width: number): number =>
  Math.abs(x - at) < width ? 0.5 * (1 + Math.cos((Math.PI * (x - at)) / width)) : 0;

/** Every default clip for the creature, its bones named with `prefix`. */
export function creatureClips(b: Bones, spec: CreatureSpec, prefix = ''): Clip[] {
  const l = headLayout(b, spec);
  return boneClips(rigBones(b, l, jawOf(b, l), prefix), prefix);
}
/** The default clips baked on any creature armature (the plan's, or one fitted into a model). */
export function boneClips(bones: readonly Bone[], prefix = ''): Clip[] {
  const has = (n: string): boolean => bones.some((x) => x.name === `${prefix}${n}`);
  const p = (n: string): string => `${prefix}${n}`;
  const springs = springsOf(bones, prefix);
  const legs = FEET.flatMap((f): LegBones[] => {
    const leg = legOf(bones, prefix, f);
    return leg ? [leg] : [];
  });
  const set = (m: Map<string, Quat>, n: string, r: Vec3): void => {
    if (has(n)) m.set(p(n), qexp(r));
  };
  const clips: Clip[] = [];
  if (has('tail_0') || has('neck_0'))
    clips.push(
      loopClip('idle', 4, bones, legs, springs, (phi) => {
        const m = new Map<string, Quat>();
        set(m, 'tail_0', [0, 0, 8 * deg * Math.sin(TAU * phi)]);
        // Two breaths: the withers rise and fall with the ribs, over planted paws.
        set(m, 'neck_0', [0, 2 * deg * 0.5 * (1 - Math.cos(TAU * 2 * phi)), 0]);
        set(m, 'spine_1', [0, -0.6 * deg * Math.sin(TAU * 2 * phi), 0]);
        set(m, 'ear_l', [-14 * deg * pulse(phi, 0.62, 0.05), 0, 0]);
        return m;
      }),
    );
  if (has('neck_1') && has('head'))
    clips.push(
      loopClip('look', 4, bones, legs, springs, (phi) => {
        const m = new Map<string, Quat>();
        const turn = Math.sin(TAU * phi);
        set(m, 'neck_1', [0, 0, 30 * deg * turn]);
        set(m, 'head', [0, -6 * deg * Math.abs(turn), 8 * deg * turn]);
        return m;
      }),
    );
  clips.push(
    loopClip('bite', 1.2, bones, legs, springs, (phi) => {
      const m = new Map<string, Quat>();
      const snap = pulse(phi, 0.35, 0.35);
      set(m, 'jaw', [0, 28 * deg * snap, 0]);
      set(m, 'neck_0', [0, 6 * deg * pulse(phi, 0.4, 0.4), 0]);
      set(m, 'head', [0, 4 * deg * snap, 0]);
      return m;
    }),
  );
  const rig = quadrupedRig(bones, prefix);
  if (rig) {
    const hip = rig.legs.lh[0].head[2];
    for (const [name, gait] of CREATURE_GAITS)
      clips.push(
        gaitClip(name, rig, GAITS[gait], hip, (keys, roots, seconds) => {
          const n = keys.length - 1;
          const travel: Vec3 = [(roots[n]?.[0] ?? 0) - (roots[0]?.[0] ?? 0), 0, 0];
          const sprung = bakeSprings(
            bones,
            keys.slice(0, n),
            roots.slice(0, n),
            seconds / n,
            springs,
            travel,
          );
          sprung.push(sprung[0] ?? new Map());
          return sprung;
        }).clip,
      );
  }
  return withMidTracks(clips, bones);
}

/** Each limited bone's signed excursion about its limit axis over the clips, degrees. */
export function clipEnvelope(clips: readonly Clip[], bones: readonly Bone[]): Envelope {
  const axis = new Map(bones.flatMap((b) => (b.limit ? [[b.name, b.limit.axis] as const] : [])));
  const out = new Map<string, [number, number]>();
  for (const c of clips)
    for (const t of c.tracks) {
      const a = 'bone' in t && t.path === 'rotation' ? axis.get(t.bone) : undefined;
      if (!a || !('bone' in t)) continue;
      const l = Math.hypot(...a);
      const e = out.get(t.bone) ?? [0, 0];
      for (let i = 0; i < t.values.length; i += 4) {
        const [x = 0, y = 0, z = 0, w = 1] = t.values.subarray(i, i + 4);
        const s = w < 0 ? -1 : 1;
        const d =
          (2 * Math.atan2((s * (x * a[0] + y * a[1] + z * a[2])) / l, s * w) * 180) / Math.PI;
        e[0] = Math.min(e[0], d);
        e[1] = Math.max(e[1], d);
      }
      out.set(t.bone, e);
    }
  return out;
}

/** The creature's bones (limits narrowed to its own clips' excursion) and those clips. */
export function creatureArmature(
  b: Bones,
  spec: CreatureSpec,
  prefix = '',
): { bones: Bone[]; clips: Clip[] } {
  const clips = creatureClips(b, spec, prefix);
  const l = headLayout(b, spec);
  const passive = rigBones(b, l, jawOf(b, l), prefix);
  return { bones: rigBones(b, l, jawOf(b, l), prefix, clipEnvelope(clips, passive)), clips };
}
