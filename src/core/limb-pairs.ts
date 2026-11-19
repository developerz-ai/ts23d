// Paired limbs of a skeleton (D72): bones named `<limb>_<l|r>_<n>` (helpers `…_mid` included),
// grouped per limb with both sides present and a joint 2 (wrist or hock) on each. Below the lower
// of the two joint-2 heads the skin is a forearm, a shin or a paw: one leg's only. A pair that
// stands on its roots (wings raised off a back: joint 2 above joint 0 on both sides) is `raised`:
// its far end is ABOVE the higher joint 2, and where it meets the back below that both sides
// may share. QA `skin` checks it (`T3D_SKIN_CROSSED`).

import type { Bone } from './skeleton.ts';

export interface LimbPair {
  /** The limb's name: `fore`, `hind`, `arm`, `leg`… */
  readonly limb: string;
  /** Bone indices of each side. */
  readonly l: ReadonlySet<number>;
  readonly r: ReadonlySet<number>;
  /** Height (asset z, metres) past which only one side may weight: under the lower joint-2
   *  head, or over the higher one when the pair is `raised`. */
  readonly below: number;
  /** The limbs point up from their roots: the far end is above `below`, not under it. */
  readonly raised: boolean;
}

/** A side's share below which a weight is noise (quantised weights reach 1/255): a vertex is
 *  crossed when both sides of a limb hold at least this much of it. */
export const CROSS_SHARE = 0.05;

const SIDED = /^(.+)_([lr])_(\d+)(?:_mid)?$/;

export function limbPairs(bones: readonly Bone[]): LimbPair[] {
  const limbs = new Map<
    string,
    { l: Set<number>; r: Set<number>; tops: number[]; roots: number[] }
  >();
  bones.forEach((b, i) => {
    const m = SIDED.exec(b.name);
    if (!m) return;
    const [, limb = '', side, joint] = m;
    const e = limbs.get(limb) ?? {
      l: new Set<number>(),
      r: new Set<number>(),
      tops: [],
      roots: [],
    };
    (side === 'l' ? e.l : e.r).add(i);
    if (joint === '2' && !b.name.endsWith('_mid')) e.tops.push(b.head[2]);
    if (joint === '0' && !b.name.endsWith('_mid')) e.roots.push(b.head[2]);
    limbs.set(limb, e);
  });
  return [...limbs]
    .filter(([, e]) => e.l.size > 0 && e.r.size > 0 && e.tops.length === 2)
    .map(([limb, e]) => {
      const raised = e.roots.length === 2 && Math.min(...e.tops) > Math.max(...e.roots);
      const below = raised ? Math.max(...e.tops) : Math.min(...e.tops);
      return { limb, l: e.l, r: e.r, below, raised };
    });
}
