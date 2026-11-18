// Reading baked clips by what they do, never by asset: does a clip loop, does its root travel, the
// same clip with that travel removed, and which clip to open on. A looping clip's root ends one stride ahead of where it
// starts, so a player that repeats it snaps back once per loop; taking the straight-line drift out
// of the root track closes the seam and leaves the body's own recoil in place.

import type { AnimationClip, KeyframeTrack } from 'three';

/** Metres (and quaternion dot distance) below which two keys are the same pose. */
const NEAR = 1e-4;

/** The bake writes root motion as the clip's first translation track. */
const rootTrack = (clip: AnimationClip): KeyframeTrack | null =>
  clip.tracks.find((t) => t.name.endsWith('.position')) ?? null;

/** How far the last key of `t` is from its first, per value. */
function seam(t: KeyframeTrack): number[] {
  const size = t.getValueSize();
  const last = t.values.length - size;
  return Array.from({ length: size }, (_, i) => (t.values[last + i] ?? 0) - (t.values[i] ?? 0));
}

function closes(t: KeyframeTrack): boolean {
  if (!t.name.endsWith('.quaternion')) return seam(t).every((d) => Math.abs(d) < NEAR);
  // q and -q are one rotation: a whole turn ends on the opposite sign.
  const last = t.values.length - 4;
  let dot = 0;
  for (let i = 0; i < 4; i++) dot += (t.values[i] ?? 0) * (t.values[last + i] ?? 0);
  return 1 - Math.abs(dot) < NEAR;
}

/** True when every track but the root's ends where it starts. */
export function isLoop(clip: AnimationClip): boolean {
  const root = rootTrack(clip);
  return clip.duration > 0 && clip.tracks.every((t) => t === root || closes(t));
}

/** Metres the root moves between the clip's first and last key. */
export function travelOf(clip: AnimationClip): number {
  const root = rootTrack(clip);
  return root ? Math.hypot(...seam(root)) : 0;
}

/**
 * `clip` with its root's net travel removed, so it repeats on the spot without a jump. A clip that
 * does not loop or does not travel comes back as it is.
 */
export function inPlace(clip: AnimationClip): AnimationClip {
  if (!isLoop(clip) || travelOf(clip) < NEAR) return clip;
  const copy = clip.clone();
  const root = rootTrack(copy);
  if (!root) return clip;
  const drift = seam(root);
  const size = drift.length;
  const start = root.times[0] ?? 0;
  const span = (root.times[root.times.length - 1] ?? start) - start;
  root.times.forEach((time, key) => {
    const u = (time - start) / span;
    drift.forEach((d, axis) => {
      const at = key * size + axis;
      root.values[at] = (root.values[at] ?? 0) - d * u;
    });
  });
  return copy;
}

const loops = (clips: readonly AnimationClip[]): AnimationClip[] =>
  clips.filter((c) => c.name !== 'rest' && isLoop(c));

/** Gaits that push against a surface: in open water they would tread nothing. */
const SURFACE_GAITS = new Set(['crawl', 'walk', 'trot', 'gallop', 'slither', 'sidewind']);

/** The clip a swimmer shows: `cruise`, `swim`, a travelling loop, `idle`, any loop, or none. */
export function swimClip(clips: readonly AnimationClip[]): AnimationClip | null {
  const all = loops(clips).filter((c) => !SURFACE_GAITS.has(c.name));
  const named = (name: string): AnimationClip | undefined => all.find((c) => c.name === name);
  return (
    named('cruise') ??
    named('swim') ??
    all.find((c) => travelOf(c) >= NEAR) ??
    named('idle') ??
    all[0] ??
    null
  );
}

/** The looping `burst` clip, when the asset has one. */
export const burstClip = (clips: readonly AnimationClip[]): AnimationClip | null =>
  loops(clips).find((c) => c.name === 'burst') ?? null;

/**
 * Studio's first choice, best first: the mechanical show, a swimmer's cruise, then the idle; a
 * ground gait like `slither` waits to be picked.
 */
const FIRST = ['run', 'cruise', 'idle'] as const;

/** The clip the Studio binds first: the best name in FIRST, else the first clip. */
export function firstClip(clips: readonly AnimationClip[]): AnimationClip | null {
  for (const name of FIRST) {
    const hit = clips.find((c) => c.name === name);
    if (hit) return hit;
  }
  return clips[0] ?? null;
}
