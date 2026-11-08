// Orc jaw and mouth: the jaw corners (gonion knuckles) and jaw-side planes, the mouth volume
// wrapped round a teeth cylinder — the upper lip following it, the underbite's thick lower lip
// riding ahead of it, a dark mouth slit, blunt lower teeth standing in front of the upper lip —
// and the lower tusks rooted in the jaw. Stage 1 = masses, 2 = planes, 3 = mouth + tusks,
// 4 = expression lines.

import type { SculptEdit } from '@developerz.ai/ts23d';
import {
  add,
  ball,
  chain,
  clayOn,
  crease,
  creaseOn,
  type Surface,
  scrape,
  spline,
  taper,
  type V,
} from '../_lib/bust/kit.ts';
import { L } from './landmarks.ts';
import { C } from './palette.ts';

/** A point on an arc round the teeth axis: radius r, angle a (deg, 0 = straight ahead), height z. */
export function arc(r: number, a: number, z: number, cx = L.teeth.axis[0]): V {
  const t = (a * Math.PI) / 180;
  return [cx + r * Math.cos(t), r * Math.sin(t), z];
}

/** Lower tusk (left): root in the jaw outside the lower lip, curving up, out and slightly back. */
export function tuskStroke(): { pts: V[]; radii: number[] } {
  const root = arc(0.086, 33, 0.338);
  const ctrl: V[] = [
    [root[0] - 0.008, root[1] - 0.003, root[2] - 0.012],
    root,
    [root[0] + 0.007, root[1] + 0.008, root[2] + 0.022],
    [root[0] + 0.004, root[1] + 0.017, root[2] + 0.04],
    [root[0] - 0.003, root[1] + 0.024, root[2] + 0.053],
  ];
  return { pts: spline(ctrl, 9), radii: taper(9, 0.0165, 0.0028, 0.0015) };
}

export function jawEdits(stage: number, s?: Surface): SculptEdit[] {
  const out: SculptEdit[] = [];
  // Jaw corner: the gonion knuckle where the jaw-side and under-jaw planes meet.
  out.push(ball(L.gonion, 0.016, { blend: 0.025 }));
  if (stage < 3 || !s) return out;
  // Upper lip: draped over the teeth cylinder, heavier at the centre, tucking in at the corners.
  const up = Array.from({ length: 9 }, (_, i) =>
    arc(L.teeth.r + 0.003, i * 7.5, 0.368 + i * 0.0004),
  );
  out.push(chain([...up].reverse(), taper(9, 0.0045, 0.009, 0), { blend: 0.009, join: 0.004 }));
  // Lower lip: the underbite's prow — thick, rolled out, a crescent rising to the corners.
  const lo = Array.from({ length: 9 }, (_, i) =>
    arc(0.09 - i * 0.0012, i * 7.2, 0.345 + i * i * 0.00012),
  );
  out.push(chain([...lo].reverse(), taper(9, 0.004, 0.0125, 0.001), { blend: 0.016, join: 0.006 }));
  // Mouth slit: between the upper lip and the lower teeth, dark inside.
  out.push(
    crease(
      Array.from({ length: 6 }, (_, i) => arc(0.079, i * 5.5, 0.3585 + i * i * 0.00008)),
      0.0038,
      { blend: 0.0018, tips: 0.55, color: C.mouth },
    ),
  );
  // Lower teeth of the underbite, standing in front of the upper lip — battle-worn: the left pair
  // straight, the right inner tooth knocked out (a gap), the right outer one crooked (leaning 10°
  // out and twisted forward). Colour yellows toward the gum.
  const tooth = (a: number, h: number, r: number, lean = 0): SculptEdit =>
    chain(
      [
        arc(0.085, a, 0.349),
        arc(0.0855, a + lean * 0.3, 0.349 + h * 0.5),
        arc(0.084 + lean * 0.0004, a + lean, 0.349 + h),
      ],
      [r, r * 0.92, r * 0.7],
      { blend: 0.0015, mirror: false, color: C.bone },
    );
  out.push(tooth(7, 0.024, 0.0074), tooth(19, 0.021, 0.0066), tooth(-19, 0.019, 0.0064, -10));
  out.push(ball(arc(0.083, -7, 0.346), 0.006, { blend: 0.004, mirror: false, color: C.gum }));
  // Lower tusks: rooted in the jaw outside the lower lip, flared at the root, gum swelling round,
  // yellowing from root to tip. The RIGHT tusk is broken: cut 30 % short with a jagged flat
  // fracture (a plane cut plus a chip carved out of the front).
  const t = tuskStroke();
  const tusk = (s: number, broken: boolean): SculptEdit[] => {
    const flip = (p: V): V => [p[0], p[1] * s, p[2]];
    const pts = t.pts.map(flip);
    const n = broken ? 7 : pts.length;
    const segs: SculptEdit[] = [
      chain(pts.slice(0, 4), t.radii.slice(0, 4), { color: C.boneDark, join: 0.002 }),
      chain(pts.slice(3, n), t.radii.slice(3, n), { color: C.bone, join: 0.002, blend: 0.004 }),
    ];
    if (broken) {
      const tip = pts[n - 1] ?? L.mouth;
      segs.push(scrape(add(tip, [0, 0, -0.002]), [0.25, 0.1 * s, 1], 0.05, 0.0006));
      segs.push(
        ball(add(tip, [0.006, 0.002 * s, -0.004]), 0.0045, { op: 'subtract', blend: 0.0008 }),
      );
    }
    return [{ group: segs, blend: 0.0035, mirror: false, color: C.bone }];
  };
  out.push(...tusk(1, false), ...tusk(-1, true));
  out.push(ball(t.pts[1] ?? L.mouth, 0.016, { blend: 0.012 }));
  // Chin cleft: a shallow vertical dent splitting the chin's front plane.
  out.push(
    creaseOn(
      s,
      [
        [0.16, 0, 0.318],
        [0.16, 0, 0.3],
      ],
      0.006,
      0.0022,
      { mirror: false },
    ),
  );
  if (stage < 4) return out;
  // Marionette lines from the mouth corner down beside the chin; the crease under the lower lip.
  out.push(
    creaseOn(
      s,
      [
        [0.11, 0.07, 0.35],
        [0.118, 0.066, 0.326],
        [0.128, 0.056, 0.304],
      ],
      0.003,
      0.0022,
    ),
  );
  out.push(
    creaseOn(
      s,
      [
        [0.16, 0.035, 0.33],
        [0.165, 0.015, 0.327],
        [0.165, 0, 0.326],
      ],
      0.0026,
      0.0018,
    ),
  );
  // Philtrum ridges on the upper lip.
  out.push(
    clayOn(
      s,
      [
        [0.13, 0.008, 0.388],
        [0.136, 0.0085, 0.372],
      ],
      0.0026,
      0.0012,
    ),
  );
  return out;
}
