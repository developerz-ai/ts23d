// QA `gait` (ADR 013, plan 101 slice 10): baked locomotion holds up in an engine. Every looping
// clip closes its seam (last key = first; a root's horizontal travel excepted). For clips that
// move the root, each foot (a leaf bone reaching the ground) is sampled at 30 fps with the root
// motion applied, i.e. at the manifest's root speed: a planted foot (its toe within 3 mm of its
// lowest point; a foot that never lifts 3 mm is planted throughout) may slide < 1 mm per frame
// and must be planted over some frame pair (T3D_GAIT_FOOT_SLIDE), and no foot sinks more than
// 2 mm below its rest height. Clips that stay in place have no ground speed to slide against;
// there the SKIN of each foot may not dip more than 3 mm under the floor (gait-skin.ts). A foot
// ends a limb (chain-bones.ts): a serpent's tail or a tentacle's tip lying low is not one, and a
// water asset (`medium: 'water'`) has no feet at all; its loops are still checked.

import type { Armature, Bone, Clip, CompiledAsset, Track, Vec3 } from '../core/index.ts';
import { quatRotate } from '../core/index.ts';
import { isLimb, LOW_SHARE, leafChains, MID_SUFFIX, skeletonTop } from './chain-bones.ts';
import { clipPose, jointWorlds } from './clip-pose.ts';
import { SKIN_SINK_LIMIT, type SoleSink, soleSinks } from './gait-skin.ts';
import type { Finding, Gate } from './types.ts';

export const GAIT_FPS = 30;
/** Largest horizontal slide of a planted foot per frame, metres. */
export const SLIDE_LIMIT = 0.001;
/** A foot is planted within this height of its lowest point in the clip, metres… */
export const CONTACT_BAND = 0.003;
/** …or within this share of its step height, when smaller: a fox's 4 cm step peels off the toe
 *  2.7 mm up at lift-off, which is swing, not a planted foot sliding. */
export const CONTACT_SHARE = 0.05;
/** …but never under this: a band of microns (a foot that barely lifts) would call every frame
 *  swing and measure no slide at all. */
export const CONTACT_FLOOR = 0.001;
/** How far a foot may dip under its rest height, metres. */
export const SINK_LIMIT = 0.002;
/** Seam tolerance: first and last key may differ by this (quaternion components, metres). */
export const SEAM_TOLERANCE = 1e-4;

const finding = (code: string, message: string, fix: string): Finding => ({
  gate: 'gait',
  code,
  message: `${code} ${message}`,
  fix,
});

/** Feet: leaf bones (helpers `*_mid` aside) in the lowest 8 % of the skeleton that end a limb. */
export function feetOf(sk: Armature): Bone[] {
  const parents = new Set(sk.bones.map((b) => b.parent));
  const top = skeletonTop(sk);
  const runs = new Map(leafChains(sk).map((c) => [c.bones.at(-1)?.name, c]));
  const limb = (b: Bone): boolean => {
    const run = runs.get(b.name);
    return !run || isLimb(run, top);
  };
  // A tail's last bone is a low leaf too (a long tail rests on the ground): it is not a foot.
  return sk.bones.filter(
    (b) =>
      !parents.has(b.name) &&
      !b.name.endsWith(MID_SUFFIX) &&
      !/(^|_)tail_\d+$/.test(b.name) &&
      b.tail[2] < top * LOW_SHARE &&
      limb(b),
  );
}

function seamFindings(c: Clip, roots: ReadonlySet<string>): Finding[] {
  if (!c.loop) return [];
  for (const t of c.tracks) {
    const s = t.values.length / t.times.length;
    const n = t.times.length;
    const root = 'bone' in t && roots.has(t.bone) && t.path === 'translation';
    for (let k = 0; k < s; k++) {
      if (root && k < 2) continue;
      const a = t.values[k] ?? 0;
      const b = t.values[(n - 1) * s + k] ?? 0;
      const flip = t.path === 'rotation' && dotEnds(t) < 0 ? -1 : 1;
      if (Math.abs(a - b * flip) > SEAM_TOLERANCE)
        return [
          finding(
            'T3D_QA_GAIT',
            `clip '${c.name}' does not loop: ${'bone' in t ? t.bone : t.part} ${t.path} ends ${(b * flip).toFixed(5)} ≠ starts ${a.toFixed(5)}`,
            'bake the last key from the first (phase 1 ≡ phase 0), or set loop: false',
          ),
        ];
    }
  }
  return [];
}

function dotEnds(t: Track): number {
  const n = t.times.length;
  let d = 0;
  for (let k = 0; k < 4; k++) d += (t.values[k] ?? 0) * (t.values[(n - 1) * 4 + k] ?? 0);
  return d;
}

/** Toe tip (bone tail) world positions per frame for each foot. */
export function footTrack(sk: Armature, c: Clip, feet: readonly Bone[]): Vec3[][] {
  const frames = Math.max(1, Math.round(c.seconds * GAIT_FPS));
  const out: Vec3[][] = feet.map(() => []);
  for (let f = 0; f <= frames; f++) {
    const w = jointWorlds(sk, clipPose(c, (f * c.seconds) / frames));
    feet.forEach((b, i) => {
      const j = w.get(b.name);
      if (!j) return;
      const o = quatRotate(j.rot, [
        b.tail[0] - b.head[0],
        b.tail[1] - b.head[1],
        b.tail[2] - b.head[2],
      ]);
      out[i]?.push([j.head[0] + o[0], j.head[1] + o[1], j.head[2] + o[2]]);
    });
  }
  return out;
}

function footFindings(sk: Armature, c: Clip, feet: readonly Bone[]): Finding[] {
  const out: Finding[] = [];
  footTrack(sk, c, feet).forEach((path, i) => {
    const b = feet[i];
    if (!b || path.length < 2) return;
    const low = Math.min(...path.map((p) => p[2]));
    const lift = Math.max(...path.map((p) => p[2])) - low;
    // A foot that never leaves the contact band is on the ground the whole clip.
    const band =
      lift < CONTACT_BAND
        ? CONTACT_BAND
        : Math.max(CONTACT_FLOOR, Math.min(CONTACT_BAND, CONTACT_SHARE * lift));
    let worst = 0;
    let at = 0;
    let planted = 0;
    for (let f = 1; f < path.length; f++) {
      const p = path[f] ?? [0, 0, 0];
      const q = path[f - 1] ?? [0, 0, 0];
      if (p[2] > low + band || q[2] > low + band) continue;
      planted++;
      const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (d > worst) [worst, at] = [d, f];
    }
    if (planted === 0)
      out.push(
        finding(
          'T3D_GAIT_FOOT_SLIDE',
          `clip '${c.name}' foot '${b.name}' is never planted: no two frames in a row within ${(band * 1000).toFixed(1)} mm of its lowest point (${GAIT_FPS} fps), so its slide cannot be measured`,
          'hold the foot at ground height for at least two frames of its stance (lock it with IK baked to keys), or bake the clip in place (no root travel) if nothing walks',
        ),
      );
    if (worst > SLIDE_LIMIT)
      out.push(
        finding(
          'T3D_GAIT_FOOT_SLIDE',
          `clip '${c.name}' foot '${b.name}' slides ${(worst * 1000).toFixed(1)} mm at frame ${at} (${GAIT_FPS} fps; limit ${SLIDE_LIMIT * 1000} mm)`,
          'match stride to speed (stride = speed × cycle) and lock the planted foot with IK baked to keys',
        ),
      );
    if (low < b.tail[2] - SINK_LIMIT)
      out.push(
        finding(
          'T3D_QA_GAIT',
          `clip '${c.name}' foot '${b.name}' sinks ${((b.tail[2] - low) * 1000).toFixed(1)} mm below its rest height`,
          'keep planted feet at rest height: lower the swing target or raise the pelvis',
        ),
      );
  });
  return out;
}

/** In-place clips: the skin of a foot under the floor. */
function skinFindings(c: Clip, sinks: readonly SoleSink[]): Finding[] {
  return sinks
    .filter((s) => s.sink > SKIN_SINK_LIMIT)
    .map((s) =>
      finding(
        'T3D_QA_GAIT',
        `clip '${c.name}' (in place): the skin of foot '${s.foot}' sinks ${(s.sink * 1000).toFixed(1)} mm under the floor at frame ${s.frame} (${GAIT_FPS} fps; limit ${SKIN_SINK_LIMIT * 1000} mm)`,
        `raise the clip's root by ${(s.sink * 1000).toFixed(1)} mm (kinds defineModelCharacter \`clips.lift\`, or the root's translation keys), or re-target the clip to this skeleton's leg lengths; a foot meant to go under (a dig, a wade) is a clip to keep out of the asset`,
      ),
    );
}

/** True when a clip moves a root bone horizontally over its length. */
function travels(c: Clip, roots: ReadonlySet<string>): boolean {
  return c.tracks.some((t) => {
    if (!('bone' in t) || !roots.has(t.bone) || t.path !== 'translation') return false;
    const n = t.times.length;
    return (
      Math.hypot(
        (t.values[(n - 1) * 3] ?? 0) - (t.values[0] ?? 0),
        (t.values[(n - 1) * 3 + 1] ?? 0) - (t.values[1] ?? 0),
      ) > 1e-6
    );
  });
}

export function gaitFindings(asset: CompiledAsset): Finding[] {
  const sk = asset.skeleton;
  const clips = asset.clips ?? [];
  if (!sk || clips.length === 0) return [];
  const roots = new Set(sk.bones.filter((b) => b.parent === undefined).map((b) => b.name));
  const feet = asset.medium === 'water' ? [] : feetOf(sk);
  const still = feet.length ? clips.filter((c) => !travels(c, roots)) : [];
  const sinks = still.length ? soleSinks(asset, sk, feet, still) : new Map();
  return clips.flatMap((c) => [
    ...seamFindings(c, roots),
    ...(travels(c, roots) && feet.length ? footFindings(sk, c, feet) : []),
    ...skinFindings(c, sinks.get(c.name) ?? []),
  ]);
}

export const gait: Gate = (asset) => gaitFindings(asset);
