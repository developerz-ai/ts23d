// What is on screen in the viewer, as an identity: the asset AND its tier. The viewer tells this
// each subject it puts on screen and learns whether it differs from the last one it put there
// (never from the one merely asked for: a compile that was abandoned or failed showed nothing), so
// the downloads, the measured size and the framing follow what is actually shown.

import type { NeuralRef } from './compile-protocol.ts';

interface Keyed {
  readonly name: string;
  readonly neural?: NeuralRef;
}

/** `ranger+models` for the model tier, `ranger` for the CPU tier (same rule as the build cache). */
export const subjectKey = (s: Keyed): string => `${s.name}${s.neural ? '+models' : ''}`;

export class Shown {
  private key: string | null = null;

  /** Record `next` as on screen; true when it is not the subject that was there before. */
  arrive(next: Keyed): boolean {
    const key = subjectKey(next);
    const fresh = key !== this.key;
    this.key = key;
    return fresh;
  }
}
