// The grey wolf's own head forms over the creature kind's block-out (head-local: +X to the nose,
// origin at the atlas, left = +Y; the sculpt mirrors them). Two things the kind's canid head
// lacks and a wolf is told by: ears thick with fur (the kind grows a flat blade, which shows as a
// sliver edge-on: here each blade backs onto a furred cone, so the ear holds a triangle from
// every side), and a deep blunt muzzle (the kind's tapers to the nose like a coyote's).

import type { CreatureInfo, SculptEdit, Vec3 } from '@developerz.ai/ts23d';
import { dmath } from '@developerz.ai/ts23d';
import { facePlanes } from '../_lib/creature/wild-head.ts';

type Head = CreatureInfo['head'];

/** The ear's rising direction (left), head-local: the creature kind's own (`EAR_UP`). */
const UP: Vec3 = (() => {
  const l = dmath.hypot(-0.25, 0.4, 1);
  return [-0.25 / l, 0.4 / l, 1 / l];
})();

export function wolfHead(l: Head): SculptEdit[] {
  const { L, lc, rt, zt } = l;
  const out: SculptEdit[] = [
    // Muzzle: deep from the stop to the nose pad, the flews hanging square.
    {
      shape: 'roundCone',
      at: [lc * 0.92, 0, zt - rt * 0.12],
      to: [L - rt * 1.25, 0, zt - rt * 0.06],
      size: [rt * 1.5, rt * 1.04],
      blend: 0.05 * L,
    },
  ];
  if (l.ear) {
    const eh = l.earHeight;
    const at = (k: number, back: number): Vec3 => [
      (l.ear?.[0] ?? 0) + UP[0] * k * eh - back * eh,
      (l.ear?.[1] ?? 0) + UP[1] * k * eh,
      (l.ear?.[2] ?? 0) + UP[2] * k * eh,
    ];
    // The furred back of the ear: a cone behind the blade, root to just under the tip.
    out.push({
      shape: 'roundCone',
      at: at(-0.1, 0.12),
      to: at(0.9, 0.05),
      size: [eh * 0.34, eh * 0.07],
      blend: 0.035 * L,
    });
  }
  // Brow shelf, cheekbone and the hollow under the eye; the dark lid rim of a wolf's eye.
  out.push(...facePlanes(l, { rim: [0.035, 0.03, 0.027] }));
  return out;
}
