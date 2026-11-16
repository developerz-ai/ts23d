// Pose frames for the review pack's pose strip (render/pose-strip.ts): every joint-limit extreme
// (deform.ts `romPoses`, the poses QA `deform` measures) and a few evenly spaced frames of each
// clip that moves the root (gait.ts), the travel taken out so the animal stays in frame.

import type { Armature, Clip, CompiledAsset } from '../core/index.ts';
import { clipPose, type JointWorld, jointWorlds } from './clip-pose.ts';
import { romPoses } from './deform.ts';

export interface PoseFrameOut {
  readonly label: string;
  readonly joints: ReadonlyMap<string, JointWorld>;
}

/** One frame per joint-limit extreme; `only` keeps the bones it accepts (e.g. one side). */
export function romFrames(
  sk: Armature,
  only: (bone: string) => boolean = () => true,
): PoseFrameOut[] {
  return romPoses(sk)
    .filter((p) => only(p.bone))
    .map((p) => ({
      label: p.label,
      joints: jointWorlds(sk, { rotation: new Map(p.rotation), translation: new Map() }),
    }));
}

/** `count` frames of a clip, the roots' horizontal travel removed. */
export function clipFrames(sk: Armature, c: Clip, count: number): PoseFrameOut[] {
  const roots = new Set(sk.bones.filter((b) => b.parent === undefined).map((b) => b.name));
  return Array.from({ length: count }, (_, i) => {
    const pose = clipPose(c, (i * c.seconds) / count);
    for (const r of roots) {
      const t = pose.translation.get(r);
      if (t) pose.translation.set(r, [0, 0, t[2]]);
    }
    return { label: `${c.name} ${Math.round((i * 100) / count)}%`, joints: jointWorlds(sk, pose) };
  });
}

/** The review pack's frames: left-side and midline ROM extremes, then 6 frames per moving clip. */
export function poseFrames(asset: CompiledAsset, perClip = 6): PoseFrameOut[] {
  const sk = asset.skeleton;
  if (!sk) return [];
  const moving = (asset.clips ?? []).filter((c) =>
    c.tracks.some(
      (t) =>
        'bone' in t &&
        t.path === 'translation' &&
        sk.bones.find((b) => b.name === t.bone)?.parent === undefined,
    ),
  );
  return [
    ...romFrames(sk, (b) => !/_r(_|$)/.test(b)),
    ...moving.flatMap((c) => clipFrames(sk, c, perClip)),
  ];
}
