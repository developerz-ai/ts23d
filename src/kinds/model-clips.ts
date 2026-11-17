// The creature's clips on a skeleton fitted into a model (model-skeleton.ts): the same generators
// as the code creature (creature-clips.ts `boneClips`), fed the fitted bones, so the gait IK
// solves the fitted joints and lengths and every in-place clip turns the bones from the fitted
// rest pose (a head the model turned stays turned: `look` sweeps about it). The fused model head
// has no jaw and no lids: `bite` and `blink` are dropped. Leg and tail limits are narrowed to what
// these clips move through (QA `deform` poses the skin at the limits): a model's tail hangs where
// the picture caught it (on the hocks, often), so the plan's ±40° passive swing would put it
// through the legs.

import type { Bone, Clip } from '../core/index.ts';
import { boneClips, clipEnvelope } from './creature-clips.ts';
import { ENVELOPE_MARGIN } from './creature-limits.ts';

/** Clips the creature kind bakes that a fused model head cannot play (no jaw, no lids). */
export const FUSED_HEAD_DROPS: readonly string[] = ['bite', 'blink'];

export interface ModelClips {
  /** The bones with leg and tail limits narrowed to the clips' own excursion. */
  readonly bones: readonly Bone[];
  readonly clips: readonly Clip[];
  /** Creature clips left out (FUSED_HEAD_DROPS that the kind would have baked). */
  readonly dropped: readonly string[];
}

const clipped = new WeakMap<readonly Bone[], Map<string, ModelClips>>();

/** The creature's default clips baked on fitted bones, minus `drop` (by clip name): the gait IK reads the fitted joints and
 *  lengths, in-place clips turn the bones from the fitted rest pose (a head the model turned
 *  stays turned: `look` sweeps about it). */
export function modelClips(
  fitted: readonly Bone[],
  prefix = '',
  drop: readonly string[] = [],
): ModelClips {
  const key = `${prefix}|${drop.join(',')}`;
  const seen = clipped.get(fitted)?.get(key);
  if (seen) return seen;
  const all = boneClips(fitted, prefix);
  const clips = all.filter((c) => !FUSED_HEAD_DROPS.includes(c.name) && !drop.includes(c.name));
  const env = clipEnvelope(clips, fitted);
  const leg = /^((fore|hind)_[lr]|tail)_\d+$/;
  const m = ENVELOPE_MARGIN;
  const round = (x: number): number => Math.round(x * 10) / 10;
  const bones = fitted.map((x): Bone => {
    const e = env.get(x.name);
    if (!x.limit || !leg.test(x.name.slice(prefix.length))) return x;
    return {
      ...x,
      limit: {
        ...x.limit,
        // A limit lives in ±180° (core `boneOf`): a joint the gait swings further is capped there.
        min: e ? Math.max(-180, Math.min(0, round(e[0] - m))) : 0,
        max: e ? Math.min(180, Math.max(0, round(e[1] + m))) : 0,
      },
    };
  });
  const out: ModelClips = {
    bones,
    clips,
    dropped: FUSED_HEAD_DROPS.filter((n) => n === 'blink' || all.some((c) => c.name === n)),
  };
  const per = clipped.get(fitted) ?? new Map<string, ModelClips>();
  per.set(key, out);
  clipped.set(fitted, per);
  return out;
}
