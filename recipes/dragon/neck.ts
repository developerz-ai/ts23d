// Neck: an S-curved skin from the chest to the back of the skull, with the long neck muscles
// (a pair of ridges from the skull back to the shoulders, like a horse's crest and a croc's nuchal
// scutes), a throat dewlap under the jaw and a keel of throat plates. Part of the `body` sculpt.

import type { SculptEdit, Vec3 } from '@developerz.ai/ts23d';
import { pointAt, tangentAt, v3 } from '../_lib/creature/curve.ts';
import { skin, tube } from '../_lib/creature/skin.ts';
import { neckPath, neckRadius } from './lines.ts';
import { C } from './palette.ts';

export function neckEdits(lod: number): SculptEdit[] {
  const path = neckPath();
  const out: SculptEdit[] = [
    // Core: slightly taller than wide comes from the crest + throat edits below.
    skin(tube(path, neckRadius), { blend: 0.2, color: C.flank }),
  ];
  // Crest muscles: a pair of long ridges riding the top of the neck, flaring into the shoulders.
  const crest: Vec3[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = 0.05 + (i / 8) * 0.9;
    const p = pointAt(path, t);
    const r = neckRadius(t);
    crest.push([p[0] - r * 0.15, r * 0.38, p[2] + r * 0.6]);
  }
  // Both ridges as edits: the sculpt mirrors by folding |y|, so a lone left ridge would meet its
  // mirror image in a hard valley on the midline (QA connections: a seam over the withers). With
  // the right ridge present too, the blend sees both and the groove between them stays soft.
  for (const side of [1, -1])
    out.push(
      skin(
        tube(
          crest.map((p): Vec3 => [p[0], p[1] * side, p[2]]),
          (t) => 0.13 - 0.06 * t,
        ),
        { blend: 0.12, color: C.back },
      ),
    );
  // Throat: a soft keel under the neck that the throat plates sit on.
  const throat: Vec3[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = 0.08 + (i / 8) * 0.86;
    const p = pointAt(path, t);
    const tg = tangentAt(path, t);
    // Below the centre line, perpendicular to it in the XZ plane.
    const down = v3.norm([tg[2], 0, -tg[0]]);
    throat.push(v3.add(p, v3.mul(down, neckRadius(t) * 0.42)));
  }
  out.push(
    skin(
      tube(throat, (t) => 0.22 - 0.1 * t),
      { blend: 0.14, color: C.belly },
    ),
  );
  if (lod < 2) {
    // Dewlap fold hanging under the jaw joint.
    out.push({
      shape: 'ellipsoid',
      at: [2.1, 0, 2.9],
      size: [0.24, 0.12, 0.2],
      rotate: [0, -30, 0],
      blend: 0.1,
      color: C.belly,
    });
  }
  return out;
}
