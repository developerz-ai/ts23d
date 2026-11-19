// Goblin torso: the shared parametric bust torso (../_lib/bust/torso.ts) with the goblin's
// stoop: a hump of upper back behind the neck's root, so the head hangs forward of the
// shoulders instead of standing on a pole. `keep` cuts the body away where the outfit hides it
// (the garments are closed solids of their own, clothes.ts): the built skin keeps only what can
// show.

import type { Field, SculptEdit } from '@developerz.ai/ts23d';
import { ell, scrape, type V } from '../_lib/bust/kit.ts';
import { torsoEdits } from '../_lib/bust/torso.ts';
import { H, LT as L, TORSO } from './spec.ts';

const EVERYWHERE: [V, V] = [
  [-2, -2, -1],
  [2, 2, 3],
];

/** The torso's masses; with `keep` (≤ 0 = kept) only the part of them that can show. */
export function bodyEdits(keep?: Field): SculptEdit[] {
  const masses: SculptEdit[] = [
    ...torsoEdits(L, TORSO, { neck: false }),
    // The stoop: rounded upper back rising behind the neck's root.
    ell([L.back + 0.2 * H, 0, L.mz - 0.4 * H], [0.2 * H, 0.36 * H, 0.2 * H], {
      blend: 0.12 * H,
      mirror: false,
    }),
  ];
  // A flat bony chest: the shared torso's pectorals planed off (on a goblin they read as breasts).
  const chest = scrape([L.gx - 0.15 * H, 0, L.mz - 0.75 * H], [1, 0, 0.18], 0.3, 0.07 * H);
  const body: SculptEdit[] = [...masses, chest];
  if (!keep) return [{ group: body }];
  return [{ group: [...body, { field: keep, bounds: EVERYWHERE, op: 'intersect', blend: 0.003 }] }];
}
