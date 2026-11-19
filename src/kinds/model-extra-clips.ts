// Clips for a model body's extra chains (model-extra.ts), on top of the creature's own:
//   <motion.clip> — the chain's own loop (a wing `flap`): every bone swings about its limit axis
//                   between the two ends of its stroke, each trailing the bone before it by `lag`
//                   (the tip follows the root), 1 / hz seconds long; the body stands still
//   idle          — ± `idle` degrees with the breath (two per loop): the limb settles
//   gait clips    — ± `carry` degrees twice a stride (the trunk rises and falls twice a stride):
//                   the limb is carried, not driven
// Rotations are about the limit axis from the rest pose, as QA `deform` poses them.

import type { Bone, Clip, Quat, Track } from '../core/index.ts';
import { Ts23dError } from '../core/index.ts';
import { CREATURE_GAITS } from './creature-clips.ts';
import { bakeKeys, rotationTracks } from './gait-bake.ts';
import type { ExtraChain, ExtraMotion } from './model-extra.ts';
import { qexp } from './pose.ts';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const LAG = 0.08;

/** 0 at φ = 0, 1 at φ = `down`, 0 again at φ = 1, smooth at both ends. */
export function strokeWave(phi: number, down = 0.5): number {
  const p = phi - Math.floor(phi);
  return p < down
    ? 0.5 * (1 - Math.cos((Math.PI * p) / down))
    : 0.5 * (1 + Math.cos((Math.PI * (p - down)) / (1 - down)));
}

/** A rotation of `degrees` about the bone's limit axis. */
function turn(bone: Bone, degrees: number): Quat {
  const a = bone.limit?.axis ?? [0, 1, 0];
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  const r = (degrees * DEG) / l;
  return qexp([a[0] * r, a[1] * r, a[2] * r]);
}

interface Driven {
  readonly bone: Bone;
  readonly index: number;
  readonly motion: ExtraMotion;
}

/** Tracks for `driven` bones over one loop of `seconds`, from each bone's angle at phase φ. */
function tracks(
  seconds: number,
  driven: readonly Driven[],
  angle: (d: Driven, phi: number) => number,
): Track[] {
  const { times, keys } = bakeKeys(
    seconds,
    (phi) => new Map(driven.map((d) => [d.bone.name, turn(d.bone, angle(d, phi))])),
  );
  return rotationTracks(
    driven.map((d) => d.bone),
    times,
    keys,
  );
}

/** `clips` with the extra chains' parts added, then one clip per `motion.clip`. */
export function extraClips(
  bones: readonly Bone[],
  chains: readonly ExtraChain[],
  clips: readonly Clip[],
  prefix = '',
): Clip[] {
  const byName = new Map(bones.map((b) => [b.name, b]));
  const driven = chains.flatMap((c) =>
    c.limits.flatMap((_, index): Driven[] => {
      const bone = byName.get(`${prefix}${c.name}_${index}`);
      return bone && c.motion ? [{ bone, index, motion: c.motion }] : [];
    }),
  );
  if (driven.length === 0) return [...clips];
  const gaits = new Set(CREATURE_GAITS.map(([name]) => name));
  const lag = (d: Driven): number => d.index * (d.motion.lag ?? LAG);
  const out = clips.map((c): Clip => {
    const pick = c.name === 'idle' ? 'idle' : gaits.has(c.name) ? 'carry' : null;
    if (!pick) return c;
    const more = tracks(
      c.seconds,
      driven,
      (d, phi) => (d.motion[pick]?.[d.index] ?? 0) * Math.sin(TAU * (2 * phi - lag(d))),
    );
    return { ...c, tracks: [...c.tracks, ...more] };
  });
  const own = new Map<string, Driven[]>();
  for (const d of driven) own.set(d.motion.clip, [...(own.get(d.motion.clip) ?? []), d]);
  for (const [name, group] of own) {
    const hz = group[0]?.motion.hz ?? 1;
    if (out.some((c) => c.name === name) || group.some((d) => d.motion.hz !== hz))
      throw new Ts23dError('T3D_RECIPE_INVALID', {
        cause: `extra chain motion '${name}': ${out.some((c) => c.name === name) ? 'the creature already has a clip of that name' : 'its chains give different hz'}`,
        fix: 'name the clip after the motion (flap, fan, wave) and give every chain of one clip the same hz',
      });
    const moving = tracks(1 / hz, group, (d, phi) => {
      const [from, to] = d.motion.stroke[d.index] ?? [0, 0];
      return from + (to - from) * strokeWave(phi - lag(d), d.motion.down);
    });
    out.push({ name, seconds: 1 / hz, loop: true, tracks: moving });
  }
  return out;
}
