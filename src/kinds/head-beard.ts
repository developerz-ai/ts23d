// Facial hair as sculpt groups, part of the skull field (so a beard splits with the jaw):
// eyebrows riding just proud of the brow ridge (tapered, arched), and beards built as one clipped
// volume — a mass around jaw and chin, trimmed above a cheek line that rises to the ears, the lips
// carved clear — plus a two-segment moustache and optional braid. Head units, mirrored across Y.

import type { Vec3 } from '../core/index.ts';
import type { SculptEdit } from '../primitives/index.ts';
import { along, unit } from './head-geom.ts';
import type { HeadLayout } from './head-layout.ts';
import type { HeadParams } from './head-params.ts';

const RAD = Math.PI / 180;

/** Eyebrows: two capsule segments (inner thick → outer thin) offset off the brow ridge. */
export function browEdits(p: HeadParams, l: HeadLayout): SculptEdit[] {
  const h = p.brow.hair ?? 0;
  if (h <= 0) return [];
  const [ex, ey] = l.eye;
  const r = l.eyeR;
  const lift: Vec3 = [p.brow.ridge * 0.55 + 0.012, 0, p.brow.ridge * 0.8 + 0.018];
  const inner: Vec3 = [ex + r * 0.75 + lift[0], 0.035, l.browZ - p.brow.scowl + lift[2]];
  const outer: Vec3 = [
    ex + r * 0.1 + lift[0] * 0.6,
    ey + r * 1.25,
    l.browZ + p.brow.scowl * 0.5 + lift[2] * 0.7,
  ];
  const mid: Vec3 = [
    (inner[0] + outer[0]) / 2,
    inner[1] + (outer[1] - inner[1]) * 0.55,
    (inner[2] + outer[2]) / 2 + 0.014,
  ];
  return [
    {
      group: [
        { shape: 'capsule', at: inner, to: mid, size: h },
        { shape: 'capsule', at: mid, to: outer, size: h * 0.65, blend: 0.006 },
      ],
      color: p.colors.hair,
      blend: 0.006,
    },
  ];
}

/** Box whose top face is the plane through `p` tilted `deg` about Y (positive: higher at back). */
const below = (p: Vec3, deg: number): SculptEdit => {
  const n: Vec3 = [-Math.sin(deg * RAD), 0, Math.cos(deg * RAD)];
  return {
    shape: 'roundBox',
    at: [p[0] - n[0], p[1], p[2] - n[2]],
    size: [4, 4, 2],
    rotate: [0, -deg, 0],
    op: 'intersect',
    blend: 0.02,
  };
};

export function beardEdits(p: HeadParams, l: HeadLayout): SculptEdit[] {
  if (p.beard === 'none') return [];
  const h = p.colors.hair;
  const light: Vec3 = [h[0] * 1.35, h[1] * 1.35, h[2] * 1.35];
  const [ax, ay, az] = l.angle;
  const ch = l.chin;
  const mw = p.mouth.width;
  const lipT = p.mouth.lips;
  const full = p.beard !== 'goatee';
  const mass: SculptEdit = full
    ? {
        shape: 'ellipsoid',
        at: [(ax + ch[0]) / 2 + 0.03, 0, (az + ch[2]) / 2 + 0.01],
        size: [(ch[0] - ax) / 2 + 0.08, ay + 0.065, 0.17],
      }
    : { shape: 'ellipsoid', at: [ch[0] + 0.01, 0, ch[2] + 0.02], size: [0.09, mw * 0.9, 0.11] };
  const out: SculptEdit[] = [
    {
      group: [
        mass,
        // Chin volume: the beard grows forward and down off the chin.
        {
          shape: 'ellipsoid',
          at: [ch[0] + 0.025, 0, ch[2] - 0.03],
          size: [0.08, full ? 0.13 : 0.08, 0.1],
          blend: 0.04,
        },
        // Trimmed below a cheek line that rises towards the ears.
        below([l.mouthX, 0, l.mouthZ + 0.03], full ? 28 : 0),
        // Lips carved clear.
        {
          shape: 'ellipsoid',
          at: [l.mouthX + 0.02, 0, l.mouthZ - lipT * 0.3],
          size: [0.07, mw * 1.05, lipT * 2.3],
          op: 'subtract',
          blend: 0.012,
        },
        // Clump grooves down the chin.
        ...[-0.05, 0.05].map(
          (y): SculptEdit => ({
            shape: 'capsule',
            at: [ch[0] + 0.12, y, l.mouthZ - 0.06],
            to: [ch[0] + 0.06, y * 1.3, ch[2] - 0.14],
            size: 0.008,
            op: 'subtract',
            blend: 0.012,
            mirror: false,
          }),
        ),
      ],
      color: h,
      blend: 0.012,
    },
  ];
  if (p.beard === 'braided')
    out.push({
      shape: 'capsule',
      at: [ch[0] + 0.03, 0.035, ch[2] - 0.08],
      to: [ch[0] + 0.01, 0.045, ch[2] - 0.34],
      size: 0.032,
      color: light,
      blend: 0.02,
    });
  // Moustache: from under the nose, over the lip corners, drooping past them.
  const root: Vec3 = [l.mouthX + 0.02, 0.012, l.mouthZ + lipT * 1.9];
  const bend: Vec3 = [l.mouthX - 0.005, mw * 0.85, l.mouthZ + lipT * 0.6];
  const tip = along(bend, unit([-0.4, 0.5, -1]), 0.05);
  out.push({
    group: [
      { shape: 'capsule', at: root, to: bend, size: 0.024 },
      { shape: 'capsule', at: bend, to: tip, size: 0.016, blend: 0.01 },
    ],
    color: light,
    blend: 0.008,
  });
  return out;
}
