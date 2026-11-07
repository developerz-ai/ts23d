// Lips and mouth as edit lists, part of the skull field: upper and lower lip pads (the lower one
// pushed forward by the underbite), then the opening — a thin scowl line when `grin` is low, or a
// crescent cut (a wide smile, corners lifted) lined with small pointed teeth along the dental arch
// when it is high. Head units, mirrored across Y.

import type { SculptEdit } from '../primitives/index.ts';
import { alongZ } from './head-geom.ts';
import type { HeadLayout } from './head-layout.ts';
import type { HeadParams } from './head-params.ts';

export function mouthEdits(p: HeadParams, l: HeadLayout, teeth = true): SculptEdit[] {
  const c = p.colors;
  const lipT = p.mouth.lips;
  const mw = p.mouth.width;
  const g = p.mouth.grin;
  const out: SculptEdit[] = [
    {
      shape: 'ellipsoid',
      at: [l.mouthX - 0.01, 0, l.mouthZ + lipT * 0.7],
      size: [0.032, mw, lipT],
      color: c.lips,
      blend: 0.03,
    },
    {
      shape: 'ellipsoid',
      at: [l.mouthX - 0.015 + p.jaw.underbite * 0.7, 0, l.mouthZ - lipT * 0.8],
      size: [0.034 + p.jaw.underbite * 0.3, mw * 0.85, lipT * (1.1 + p.jaw.underbite * 4)],
      color: c.lips,
      blend: 0.03,
    },
  ];
  // Far LODs carve a grin as a plain wide line: a crescent that thin folds over at coarse cells.
  if (g < 0.4 || !teeth) {
    out.push({
      shape: 'capsule',
      at: [l.mouthX + 0.05, 0, l.mouthZ],
      to: [l.mouthX - 0.03 - 0.02 * g, mw * 0.98, l.mouthZ + 0.012 + g * 0.05 - p.brow.scowl * 0.4],
      size: 0.006 + g * 0.022,
      op: 'subtract',
      blend: 0.012,
      color: c.mouth,
    });
    return out;
  }
  // A grin: the part of a wide ellipsoid below a higher one — a crescent whose horns rise.
  const h = 0.035 + g * 0.05;
  const z0 = l.mouthZ + h * 0.45;
  const back = mw * 0.55;
  out.push({
    group: [
      { shape: 'ellipsoid', at: [l.mouthX - back, 0, z0], size: [back + 0.06, mw, h] },
      {
        shape: 'ellipsoid',
        at: [l.mouthX - back + 0.02, 0, z0 + h * 0.7],
        size: [back + 0.12, mw * 1.1, h * 0.9],
        op: 'subtract',
      },
    ],
    op: 'subtract',
    blend: 0.012,
    color: c.mouth,
  });
  // A tongue fills the floor of the open mouth (so no flat jaw cut shows through the grin).
  if (teeth)
    out.push({
      shape: 'ellipsoid',
      at: [l.mouthX - back * 0.9, 0, l.mouthZ - h * 0.4],
      size: [back * 0.9, mw * 0.62, h * 0.45],
      color: [0.42, 0.12, 0.12],
      blend: 0.01,
    });
  // The grin bunches the cheeks up and out beside the mouth corners.
  out.push({
    shape: 'ellipsoid',
    at: [l.mouthX - 0.06, mw * 0.95, z0 + h * 0.6],
    size: [0.05, 0.045, 0.04 + g * 0.01],
    rotate: [-30, 0, 0],
    blend: 0.035,
  });
  // Teeth: pointed little cones along the arch — the upper row hangs, the lower row rises.
  const n = teeth ? 3 : 0;
  for (let i = 0; i < n; i++) {
    const a = (0.25 + i) * 0.36;
    const y = Math.sin(a) * mw * 0.82;
    const x = l.mouthX - 0.03 - (1 - Math.cos(a)) * back * 1.3;
    // Follow the crescent: roots just inside its upper and lower edges, corners higher.
    const lo = z0 - h * Math.sqrt(Math.max(0, 1 - (y / mw) ** 2));
    const hi = z0 + h * 0.7 - h * 0.9 * Math.sqrt(Math.max(0, 1 - (y / (mw * 1.1)) ** 2));
    const len = 0.03 + g * 0.008 - i * 0.004;
    const r = 0.014 + g * 0.004 - i * 0.0015;
    out.push(
      {
        shape: 'cone',
        at: [x, y, hi + 0.008],
        size: [r, 0.003, len],
        rotate: alongZ([0.15, 0, -1]),
        color: c.teeth,
        blend: 0.004,
      },
      {
        shape: 'cone',
        at: [x - 0.006, y * 0.97, lo - 0.008],
        size: [r * 0.85, 0.003, len * 0.6],
        rotate: alongZ([0.1, 0, 1]),
        color: c.teeth,
        blend: 0.004,
      },
    );
  }
  return out;
}
