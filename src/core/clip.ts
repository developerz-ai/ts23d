// Named keyframe clips: tracks of baked keys on bones or parts (walk, idle, bite). Springs, IK and
// gaits are baked into these, never run in the engine (ADR 013). A part's `Motion` stays as is;
// export turns it into the reserved `run` clip.

import { Ts23dError } from './errors.ts';
import { quatFromAxisAngle, quatRotate } from './vec.ts';

export type TrackPath = 'rotation' | 'translation' | 'scale' | 'weights';

/** Values per key: quaternion xyzw, xyz, xyz; `weights` = one per morph target. */
export const TRACK_STRIDE: Readonly<Record<Exclude<TrackPath, 'weights'>, number>> = {
  rotation: 4,
  translation: 3,
  scale: 3,
};

interface TrackKeys {
  readonly path: TrackPath;
  /** Key times in seconds, strictly increasing, within 0..clip.seconds. */
  readonly times: Float32Array;
  /** times.length × stride values, key-major. */
  readonly values: Float32Array;
}

/** Keys on exactly one target: a bone (`ctx.bone`) or a part (`ctx.part`). */
export type Track = TrackKeys & ({ readonly bone: string } | { readonly part: string });

export interface Clip {
  readonly name: string;
  readonly seconds: number;
  readonly loop: boolean;
  readonly tracks: readonly Track[];
}

/** Clip name the baked `Motion` of parts exports as; recipes may not declare it. */
export const RUN_CLIP = 'run';

export const trackTarget = (t: Track): { kind: 'bone' | 'part'; name: string } =>
  'bone' in t ? { kind: 'bone', name: t.bone } : { kind: 'part', name: t.part };

/** One clip's own shape: name, length, keys sorted, finite, the right count per path. */
export function checkClip(asset: string, c: Clip): Clip {
  const where = `clip '${c.name}' in '${asset}'`;
  const bad = (cause: string, fix: string): never => {
    throw new Ts23dError('T3D_RECIPE_INVALID', { cause: `${where}: ${cause}`, fix });
  };
  if (!/^[a-z][a-z0-9_]*$/.test(c.name)) bad('name is not snake_case', 'rename it, e.g. walk');
  if (c.name === RUN_CLIP)
    bad(`'${RUN_CLIP}' is reserved for part motions`, 'name it for what it does: walk, idle, trot');
  if (!(Number.isFinite(c.seconds) && c.seconds > 0))
    bad(`seconds ${c.seconds} is not > 0`, 'give the clip length in seconds, e.g. 1.2');
  if (c.tracks.length === 0) bad('has no tracks', 'add a track or drop the clip');
  const seen = new Set<string>();
  c.tracks.forEach((t, i) => {
    const { kind, name } = trackTarget(t);
    const label = `track ${i} (${kind} '${name}' ${t.path})`;
    const key = `${kind}:${name}:${t.path}`;
    if (seen.has(key)) bad(`${label} is keyed twice`, 'merge the keys into one track');
    seen.add(key);
    if (t.times.length === 0) bad(`${label} has no keys`, 'add at least one key');
    let prev = -Infinity;
    for (const time of t.times) {
      if (!(Number.isFinite(time) && time >= 0 && time <= c.seconds + 1e-6))
        bad(`${label} key time ${time} is outside 0..${c.seconds}`, 'clamp keys to the clip');
      if (time <= prev)
        bad(
          `${label} times are not strictly increasing (${prev} then ${time})`,
          'sort the keys by time and drop duplicates',
        );
      prev = time;
    }
    const stride = t.path === 'weights' ? t.values.length / t.times.length : TRACK_STRIDE[t.path];
    if (!Number.isInteger(stride) || stride < 1 || t.values.length !== t.times.length * stride)
      bad(
        `${label} has ${t.values.length} values for ${t.times.length} keys`,
        t.path === 'weights'
          ? 'give one weight per morph target per key'
          : `give ${stride} values per key`,
      );
    if (!t.values.every(Number.isFinite))
      bad(`${label} has a non-finite value`, 'bake finite keys');
  });
  return c;
}

/**
 * Bone keys turned by the instance's world yaw (D556). Joints carry no rest rotation, so a bone's
 * keys live in the asset frame: rotation keys are conjugated (yaw ⊗ key ⊗ yaw⁻¹), translation keys
 * turn about Z. Scale keys stay: only a uniform scale reads the same in a turned frame.
 */
function turnBoneKeys(t: Track, yaw: number): Float32Array {
  if (yaw === 0 || (t.path !== 'rotation' && t.path !== 'translation')) return t.values;
  const out = new Float32Array(t.values.length);
  const v = (i: number): number => t.values[i] ?? 0;
  const q = quatFromAxisAngle([0, 0, 1], yaw);
  if (t.path === 'translation') {
    for (let i = 0; i < out.length; i += 3) out.set(quatRotate(q, [v(i), v(i + 1), v(i + 2)]), i);
    return out;
  }
  for (let i = 0; i < out.length; i += 4) {
    const axis = quatRotate(q, [v(i), v(i + 1), v(i + 2)]);
    out.set([axis[0], axis[1], axis[2], v(i + 3)], i);
  }
  return out;
}

/** A child asset's clip seen from the parent: prefixed names, bone keys turned by `yaw`. */
export function useClip(c: Clip, prefix: string, yaw = 0): Clip {
  return {
    ...c,
    name: `${prefix}_${c.name}`,
    tracks: c.tracks.map((t) =>
      'bone' in t
        ? { ...t, bone: `${prefix}_${t.bone}`, values: turnBoneKeys(t, yaw) }
        : { ...t, part: `${prefix}_${t.part}` },
    ),
  };
}

/** Every clip valid, names unique, every track on a bone or part the asset has. */
export function checkClips(
  asset: string,
  clips: readonly Clip[],
  has: { readonly bone: (n: string) => boolean; readonly part: (n: string) => boolean },
): readonly Clip[] {
  const names = new Set<string>();
  for (const c of clips) {
    checkClip(asset, c);
    if (names.has(c.name))
      throw new Ts23dError('T3D_RECIPE_INVALID', {
        cause: `clip '${c.name}' in '${asset}' is declared twice`,
        fix: 'give each clip a unique name: walk, trot, idle',
      });
    names.add(c.name);
    for (const t of c.tracks) {
      const { kind, name } = trackTarget(t);
      if (!has[kind](name))
        throw new Ts23dError('T3D_RECIPE_INVALID', {
          cause: `clip '${c.name}' in '${asset}' keys ${kind} '${name}', which the asset does not have`,
          fix: `add it with ctx.${kind}('${name}', …) or key an existing ${kind}`,
        });
    }
  }
  return clips;
}
