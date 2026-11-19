// Elf torso: the shared parametric bust torso (../_lib/bust/torso.ts), its arms sawn off by the
// shared arm cut. `keep` cuts the body away
// where the outfit hides it (the garments are closed solids of their own, clothes.ts): the built
// skin keeps only what can show.

import type { Field, SculptEdit } from '@developerz.ai/ts23d';
import type { V } from '../_lib/bust/kit.ts';
import { torsoEdits } from '../_lib/bust/torso.ts';
import { L, TORSO } from './spec.ts';

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
