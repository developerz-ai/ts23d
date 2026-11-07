// The scrawny tinker's garb (bust style `vest`), layered like real clothing over the bony torso:
// a shirt shell with a V-neck (clavicles and sternal notch show through), a leather vest shell open
// down the front, a strap across the chest with a buckle, a scarf wound round the neck and knotted
// off-centre with hanging tails, and a cowl (a hood worn down) bunched on the back of the neck.
// Each layer is the torso grown a little (torsoForms) and trimmed by the same bust cut.

import type { Vec3 } from '../core/index.ts';
import type { SculptEdit } from '../primitives/index.ts';
import { alongZ, unit } from './head-geom.ts';
import type { HeadParams } from './head-params.ts';
import { type BustFrame, bustCut, torsoForms } from './head-torso.ts';

const shade = (c: Vec3, k: number): Vec3 => [c[0] * k, c[1] * k, c[2] * k];

export function vest(p: HeadParams, f: BustFrame): SculptEdit[] {
  const c = p.colors;
  const { cx, s, b, nz, n } = f;
  const scarf = c.scarf ?? c.cloth;
  const hood = c.cape ?? shade(c.cloth, 0.8);
  const out: SculptEdit[] = [
    // Shirt: V-neck down to the sternum.
    {
      group: [
        { group: torsoForms(f, 0.032) },
        {
          shape: 'ellipsoid',
          at: [cx + 0.32, 0, nz + 0.01],
          size: [0.2, 0.07, 0.11],
          op: 'subtract',
          blend: 0.01,
        },
        bustCut(f),
      ],
      color: c.cloth,
      blend: 0.006,
    },
    // Vest: open down the front, the opening widening to the hem.
    {
      group: [
        { group: torsoForms(f, 0.065) },
        {
          shape: 'roundBox',
          at: [cx + 0.4, 0, b + 0.3],
          size: [0.5, 0.3, 1],
          rotate: [0, -8, 0],
          round: 0.08,
          op: 'subtract',
          blend: 0.02,
        },
        // Arm holes: the vest stops short of the shoulder tip, so the shirt shows there.
        {
          shape: 'sphere',
          at: [cx - 0.03, s * 0.98, b + 0.42],
          size: 0.17,
          op: 'subtract',
          blend: 0.02,
        },
        bustCut(f),
      ],
      color: c.leather,
      blend: 0.006,
    },
    // Strap from the right shoulder across to the left hip, with a buckle.
    {
      group: [
        { group: torsoForms(f, 0.088) },
        {
          shape: 'roundBox',
          at: [cx, 0, b + 0.38],
          size: [4, 4, 0.08],
          rotate: [-48, 0, 0],
          op: 'intersect',
        },
        bustCut(f),
      ],
      color: shade(c.leather, 0.65),
      blend: 0.004,
      mirror: false,
    },
    {
      group: [
        { group: torsoForms(f, 0.105) },
        {
          shape: 'roundBox',
          at: [cx + 0.3, -0.06, b + 0.32],
          size: [0.3, 0.1, 0.1],
          rotate: [-48, 0, 0],
          op: 'intersect',
        },
        {
          shape: 'roundBox',
          at: [cx + 0.4, -0.06, b + 0.32],
          size: [0.16, 0.05, 0.05],
          rotate: [-48, 0, 0],
          op: 'subtract',
        },
      ],
      color: c.metal,
      blend: 0.003,
      mirror: false,
    },
    // Hood worn down: a rolled rim round the neck, the bag of it lying on the upper back with
    // its dark mouth open upward, and a pointed tail hanging down the spine.
    {
      group: [
        {
          shape: 'torus',
          at: [cx - 0.1, 0, nz + 0.03],
          size: [n + 0.12, 0.06],
          rotate: [0, -28, 0],
        },
        {
          shape: 'roundBox',
          at: [cx - 1.04, 0, nz],
          size: [2, 4, 4],
          op: 'intersect',
          blend: 0.04,
        },
      ],
      color: hood,
      blend: 0.03,
    },
    {
      group: [
        { shape: 'ellipsoid', at: [cx - 0.33, 0, nz - 0.04], size: [0.13, s * 0.5, 0.25] },
        {
          shape: 'cone',
          at: [cx - 0.36, 0, nz - 0.12],
          size: [0.1, 0.015, 0.34],
          rotate: alongZ(unit([-0.35, 0, -1])),
          blend: 0.05,
        },
        {
          shape: 'ellipsoid',
          at: [cx - 0.3, 0, nz + 0.12],
          size: [0.08, s * 0.36, 0.1],
          op: 'subtract',
          blend: 0.02,
          color: shade(hood, 0.35),
        },
      ],
      color: hood,
      blend: 0.04,
      mirror: false,
    },
    // Scarf: a wrap round the neck root, a knot off-centre and two tails.
    {
      shape: 'torus',
      at: [cx - 0.04, 0, nz + 0.17],
      size: [n + 0.05, 0.065],
      rotate: [0, -12, 0],
      color: scarf,
      blend: 0.02,
    },
  ];
  const knot: Vec3 = [cx + n * 0.8, n + 0.04, nz + 0.13];
  out.push({
    shape: 'ellipsoid',
    at: knot,
    size: [0.05, 0.06, 0.05],
    color: shade(scarf, 0.85),
    blend: 0.02,
    mirror: false,
  });
  for (const [dy, len, tw] of [
    [0.3, 0.2, 0.045],
    [0.6, 0.16, 0.04],
  ] as const) {
    const dir = unit([0.3, dy, -1]);
    out.push({
      shape: 'cone',
      at: [knot[0] + 0.01, knot[1] + dy * 0.04, knot[2] - 0.02],
      size: [tw, tw * 0.7, len],
      rotate: alongZ(dir),
      color: dy > 0.5 ? scarf : shade(scarf, 0.8),
      blend: 0.015,
      mirror: false,
    });
  }
  return out;
}
