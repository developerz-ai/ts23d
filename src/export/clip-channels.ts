// Which declared clip tracks get a glTF channel in a LOD's file: the rule `animationsOf` writes
// by (clips.ts) and the manifest lists by, so `clips` in manifest.json never names an animation
// the GLB lacks. A part track needs the part's node (a pivot that survived merging); a `weights`
// track needs that node's mesh to have morph targets (a LOD-gated mesh can drop them); a bone
// track needs the bone in the LOD's skeleton.

import type { Clip, Track } from '../core/index.ts';

/** What one LOD's file offers a clip: part node name → its mesh's morph targets; bone names. */
export interface ClipTargets {
  readonly parts: ReadonlyMap<string, number>;
  readonly bones: ReadonlySet<string>;
}

/** Whether `t` keys a node whose mesh has `morphs` morph targets (weights need some; bones none). */
export const keysNode = (t: Track, morphs: number): boolean =>
  t.path !== 'weights' || ('part' in t && morphs > 0);

/** Whether `c` has at least one channel in a file offering `targets` (else the file omits it). */
export const clipPlays = (c: Clip, targets: ClipTargets): boolean =>
  c.tracks.some((t) => {
    if ('bone' in t) return targets.bones.has(t.bone) && keysNode(t, 0);
    const morphs = targets.parts.get(t.part);
    return morphs !== undefined && keysNode(t, morphs);
  });
