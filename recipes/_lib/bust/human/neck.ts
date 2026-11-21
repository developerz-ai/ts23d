// The human hero's neck, thickened over the skull stage's (../../face/skull.ts): the base's neck
// is 110 mm across under an 85 mm front, a column the head balances on (D575). Clay laid on the
// built skin, never on the skull itself (the hair groom's cache is keyed on the scalp's mesh):
// each side of the neck from under the ear down to the shoulder's slope (the sternocleidomastoid
// and the scalenes under it), and the trapezius from the nape out to the shoulder, so the neck
// widens into the shoulders instead of standing on them. face-check.ts `measureNeck` holds it.

import type { SculptEdit } from '@developerz.ai/ts23d';
import { clayOn, type Surface, type V } from '../kit.ts';

/** The landmarks the neck is built from (a skull's, left side). */
export interface NeckPoints {
  readonly mastoid: V;
  readonly gonion: V;
  readonly neck: V;
  readonly trapezius: V;
  readonly nape: V;
}

/** `side` and `traps`: how far the clay stands off the base neck, × H. */
export function neckEdits(
  k: NeckPoints,
  H: number,
  skin: Surface,
  o: { readonly side: number; readonly traps: number },
): SculptEdit[] {
  const mid = (a: V, b: V, t: number): V => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
  const under: V = [k.mastoid[0] + 0.02 * H, k.mastoid[1], k.gonion[2] - 0.03 * H];
  return [
    // The neck's side: broad and low, a mass, not a rope.
    clayOn(
      skin,
      [under, mid(under, k.neck, 0.5), k.neck, mid(k.neck, k.trapezius, 0.5)],
      0.09 * H,
      o.side * H,
      {
        blend: 0.03 * H,
        tips: 0.6,
      },
    ),
    // The trapezius: from beside the nape down and out to the shoulder.
    clayOn(
      skin,
      [
        [k.nape[0] + 0.03 * H, k.neck[1] * 0.55, k.nape[2]],
        [k.neck[0] - 0.06 * H, k.neck[1] * 1.05, k.neck[2] - 0.02 * H],
        k.trapezius,
      ],
      0.08 * H,
      o.traps * H,
      { blend: 0.04 * H, tips: 0.6 },
    ),
  ];
}
