// The orc's harness: a leather baldric crossing the chest from under the left pauldron to the
// right flank (the `leather` strip, stitched at LOD0, blotched near black with years of sweat and
// grease) and its forged iron buckle on the chest. Straps and stitching come from
// ../_lib/bust/cloth-strap.ts. The far LOD carries none: the strap lies flat on the chest and
// would fold at that cell.

import {
  type BuildContext,
  createRng,
  type Mesh,
  merge,
  sculpt,
  valueNoise,
} from '@developerz.ai/ts23d';
import { stitches, strap } from '../_lib/bust/cloth-strap.ts';
import {
  add,
  cross,
  dot,
  k,
  local,
  mul,
  norm,
  rbox,
  type Surface,
  sub,
  type V,
} from '../_lib/bust/kit.ts';
import { BALDRIC } from './fittings.ts';
import { C, FITTING_STRIP } from './palette.ts';

/** The strap's grime mask: seeded world-space noise (the same blotches at every LOD). */
const GRIME = valueNoise(createRng(0x0c01), { scale: 0.03, octaves: 3 });

export function harness(ctx: BuildContext, body: Surface): Mesh | null {
  const lod = ctx.lod;
  // Baldric: from under the left pauldron across the chest to the right flank.
  const ctrl = BALDRIC;
  const leather = sculpt({
    edits: [
      ...strap(body, ctrl, 0.042, 0.007),
      ...(lod === 0 ? stitches(body, ctrl, 0.042, 0.007, C.thread) : []),
      // Years of sweat and grease: the strap near black where it crosses the chest and rubs
      // the fur, blotched along its length.
      {
        field: (p) => 0.012 - 0.035 * GRIME(p),
        bounds: [
          [-0.3, -0.4, 0],
          [0.3, 0.4, 0.5],
        ],
        op: 'paint',
        color: C.strapGrime,
        blend: 0.014,
      },
    ],
    resolution: ctx.pick([0.0048, 0.0055, 0.014]),
    color: C.strap,
    strip: 'leather',
  });
  // LOD2: the strap lies flat on the chest and would fold at that cell; it is left off.
  if (lod === 2) return null;
  // Buckle on the chest: an iron frame proud of the strap, its face along the skin normal.
  const mid = ctrl[5] ?? [0.12, 0, 0.18];
  const bc = body.off(mid, 0.0085);
  const bn = body.normal(bc);
  const along = norm(sub(ctrl[6] ?? mid, ctrl[4] ?? mid));
  // Orthonormal: a raw cross product sheared the frame into a knife-cornered parallelogram.
  const u = norm(sub(along, mul(bn, dot(along, bn))));
  const f = { o: bc, u, v: cross(bn, u), w: bn };
  const near: [V, V] = [
    [-0.04, -0.04, -0.02],
    [0.04, 0.04, 0.02],
  ];
  const buckle = sculpt({
    edits: [
      local(f, k.box([0, 0, 0], [0.024, 0.03, 0.004], 0.002), near),
      // The opening's corners rounded (a forged frame, not a knife-cut slot).
      local(f, k.box([0, 0, 0], [0.016, 0.022, 0.01], 0.004), near, {
        op: 'subtract',
        blend: 0.003,
      }),
      rbox(add(bc, mul(bn, 0.001)), [0.006, 0.006, 0.006], 0.002, { color: C.boss }),
    ],
    resolution: ctx.pick([0.003, 0.005, 0.01]),
    color: C.rivet,
    strip: FITTING_STRIP,
  });
  return merge([leather, buckle]);
}
