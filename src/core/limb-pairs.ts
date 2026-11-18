// Paired limbs of a skeleton (D72): bones named `<limb>_<l|r>_<n>` (helpers `…_mid` included),
// grouped per limb with both sides present and a joint 2 (wrist or hock) on each. Below the lower
// of the two joint-2 heads the skin is a forearm, a shin or a paw: one leg's only. QA `skin`
// checks it (`T3D_SKIN_CROSSED`); the creature kind's skinning keeps to it.

import type { Bone } from './skeleton.ts';

export interface LimbPair {
  /** The limb's name: `fore`, `hind`, `arm`, `leg`… */
  readonly limb: string;
  /** Bone indices of each side. */
  readonly l: ReadonlySet<number>;
  readonly r: ReadonlySet<number>;
  /** Height (asset z, metres) of the lower joint-2 head: below it only one side may weight. */
  readonly below: number;
}

const SIDED = /^(.+)_([lr])_(\d+)(?:_mid)?$/;

export function limbPairs(bones: readonly Bone[]): LimbPair[] {
  const limbs = new Map<string, { l: Set<number>; r: Set<number>; tops: number[] }>();
  bones.forEach((b, i) => {
    const m = SIDED.exec(b.name);
    if (!m) return;
    const [, limb = '', side, joint] = m;
    const e = limbs.get(limb) ?? { l: new Set<number>(), r: new Set<number>(), tops: [] };
    (side === 'l' ? e.l : e.r).add(i);
    if (joint === '2' && !b.name.endsWith('_mid')) e.tops.push(b.head[2]);
    limbs.set(limb, e);
  });
  return [...limbs]
    .filter(([, e]) => e.l.size > 0 && e.r.size > 0 && e.tops.length === 2)
    .map(([limb, e]) => ({ limb, l: e.l, r: e.r, below: Math.min(...e.tops) }));
}
