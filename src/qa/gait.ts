// QA `gait` (ADR 013, plan 101 slice 10): baked locomotion holds up in an engine. Every looping
// clip closes its seam (last key = first; a root's horizontal travel excepted). For clips that
// move the root, each foot (a leaf bone reaching the ground) is sampled at 30 fps with the root
// motion applied, i.e. at the manifest's root speed: a planted foot (its toe within 3 mm of its
// lowest point) may slide < 1 mm per frame (T3D_GAIT_FOOT_SLIDE) and no foot sinks more than
// 2 mm below its rest height.

import type { Armature, Bone, Clip, CompiledAsset, Track, Vec3 } from '../core/index.ts';
import { quatRotate } from '../core/index.ts';
import { clipPose, jointWorlds } from './clip-pose.ts';
import { MID_SUFFIX } from './deform.ts';
import type { Finding, Gate } from './types.ts';

export const GAIT_FPS = 30;
/** Largest horizontal slide of a planted foot per frame, metres. */
export const SLIDE_LIMIT = 0.001;
/** A foot is planted within this height of its lowest point in the clip, metres. */
export const CONTACT_BAND = 0.003;
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

/** Feet: leaf bones (helpers `*_mid` aside) whose tail lies in the lowest 8 % of the skeleton. */
export function feetOf(sk: Armature): Bone[] {
  const parents = new Set(sk.bones.map((b) => b.parent));
  const top = Math.max(...sk.bones.map((b) => Math.max(b.head[2], b.tail[2])));
  return sk.bones.filter(
    (b) => !parents.has(b.name) && !b.name.endsWith(MID_SUFFIX) && b.tail[2] < top * 0.08,
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
    let worst = 0;
    let at = 0;
    for (let f = 1; f < path.length; f++) {
      const p = path[f] ?? [0, 0, 0];
      const q = path[f - 1] ?? [0, 0, 0];
      if (p[2] > low + CONTACT_BAND || q[2] > low + CONTACT_BAND) continue;
      const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (d > worst) [worst, at] = [d, f];
    }
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
  const feet = feetOf(sk);
  return clips.flatMap((c) => [
    ...seamFindings(c, roots),
    ...(travels(c, roots) && feet.length ? footFindings(sk, c, feet) : []),
  ]);
}

export const gait: Gate = (asset) => gaitFindings(asset);
