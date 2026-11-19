// Human torso: the shared parametric bust torso (../_lib/bust/torso.ts) 15 % narrower in the
// shoulders than the shared human bust's (0.172 m half-span, mass 0.42: at 0.2 / 0.55 the mantled
// deltoids were 3.3 head widths apart), its arms sawn off by the shared arm cut a finger inside the
// shoulder point, so the mantle falls from the shoulder instead of ballooning round a deltoid. `keep` cuts the body away where the outfit hides it (the garments are closed solids of
// their own, clothes.ts): the built skin keeps only what can show.

import type { Field, SculptEdit } from '@developerz.ai/ts23d';
import { L, TORSO as SHARED } from '../_lib/bust/human/spec.ts';
import type { V } from '../_lib/bust/kit.ts';
import { type TorsoSpec, torsoEdits } from '../_lib/bust/torso.ts';

/** Sawn through the deltoid a finger INSIDE the shoulder point: left whole under the mantle, the
 *  deltoids stood out as two puffed sleeves. */
export const TORSO: TorsoSpec = { ...SHARED, shoulders: 0.172, mass: 0.42, armCut: -0.012 };

const EVERYWHERE: [V, V] = [
  [-2, -2, -1],
  [2, 2, 3],
];

/** The torso's masses; with `keep` (≤ 0 = kept) only the part of them that can show. */
export function bodyEdits(keep?: Field): SculptEdit[] {
  const body: SculptEdit[] = torsoEdits(L, TORSO, { neck: false });
  if (!keep) return [{ group: body }];
  return [{ group: [...body, { field: keep, bounds: EVERYWHERE, op: 'intersect', blend: 0.003 }] }];
}
