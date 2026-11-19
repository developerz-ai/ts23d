// Whether the viewer plays once a subject is on screen. A fresh subject (another asset, or the
// other tier of the same one) in Studio plays only when it lives in water and has a clip to swim;
// Scene keeps playing across a tier switch (the visitor is watching the scenario); the same
// subject again (another LOD, a mode switch) keeps whatever was chosen.

import type { Mode } from './viewer-ui.ts';

export interface Arrival {
  /** Not the subject that was on screen before (`Shown.arrive`). */
  readonly fresh: boolean;
  readonly mode: Mode;
  /** Playing before this subject arrived. */
  readonly playing: boolean;
  /** The subject lives in water (the water look) and Studio has a baked clip to swim. */
  readonly swims: boolean;
  readonly reduced: boolean;
}

export function playingOnArrival(a: Arrival): boolean {
  if (!a.fresh || a.mode === 'scene') return a.playing;
  return a.swims && !a.reduced;
}
