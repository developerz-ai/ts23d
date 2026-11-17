// Clips of a rigged model, fitted to the bones the asset keeps: tracks of bones folded away are
// dropped and renamed bones followed (`onBones`); a clip is raised or lowered whole by adding to
// its root's height keys (`liftClip`), the correction QA `gait` names when the skin of a foot
// dips under the floor in an in-place clip. Loop closing is the importer's job
// (neural/import-clips-loop.ts): a clip arrives here closed or as a one-shot.

import type { Clip, Track } from '../core/index.ts';

/** Tracks retargeted to the kept bones: folded bones' tracks dropped, renamed bones followed. */
export function onBones(
  c: Clip,
  kept: ReadonlySet<string>,
  rename: Readonly<Record<string, string>>,
): Clip {
  const tracks = c.tracks.flatMap((t): Track[] => {
    if (!('bone' in t)) return [t];
    return kept.has(t.bone) ? [{ ...t, bone: rename[t.bone] ?? t.bone }] : [];
  });
  return { ...c, tracks };
}

/**
 * The clip with `metres` added to the height (Z) of bone `root` at every key: the whole figure
 * rides that much higher through the clip, first key and last alike (a loop stays closed). A root
 * with no translation track gets one (two keys, start and end). 0 returns the clip as it is.
 */
export function liftClip(c: Clip, root: string, metres: number): Clip {
  if (metres === 0) return c;
  const is = (t: Track): boolean => 'bone' in t && t.bone === root && t.path === 'translation';
  if (!c.tracks.some(is)) {
    const held: Track = {
      bone: root,
      path: 'translation',
      times: Float32Array.from([0, c.seconds]),
      values: Float32Array.from([0, 0, metres, 0, 0, metres]),
    };
    return { ...c, tracks: [...c.tracks, held] };
  }
  const tracks = c.tracks.map(
    (t): Track =>
      is(t) ? { ...t, values: t.values.map((v, k) => (k % 3 === 2 ? v + metres : v)) } : t,
  );
  return { ...c, tracks };
}
