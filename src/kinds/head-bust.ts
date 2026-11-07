// The bust under the head: the anatomy, bust cut and plinth (head-torso.ts) plus the gear that
// sells the race at a glance — spiked plate pauldrons and a fur mantle (orc, head-armour.ts), a
// leather vest, scarf and cowl (goblin, head-garb.ts), a draped hood, or a tunic with mantle and
// brooch (human). Head units, mirrored across Y; the neck itself belongs to the head.

import type { Vec3 } from '../core/index.ts';
import { type SculptEdit, sculptField } from '../primitives/index.ts';
import { armour } from './head-armour.ts';
import { vest } from './head-garb.ts';
import type { HeadLayout } from './head-layout.ts';
import type { HeadParams } from './head-params.ts';
import {
  type BustFrame,
  bodyEdits,
  bustCut,
  frameOf,
  plinthEdits,
  torsoForms,
} from './head-torso.ts';

function hood(p: HeadParams, cx: number, nz: number): SculptEdit[] {
  const c = p.colors;
  return [
    {
      shape: 'torus',
      at: [cx - 0.08, 0, nz + 0.04],
      size: [p.neck.radius + 0.13, 0.11],
      color: c.cloth,
      blend: 0.05,
    },
    {
      shape: 'ellipsoid',
      at: [cx - 0.36, 0, nz + 0.14],
      size: [0.16, 0.3, 0.2],
      color: c.cloth,
      blend: 0.08,
    },
    {
      shape: 'cone',
      at: [cx - 0.42, 0, nz + 0.1],
      size: [0.12, 0.02, 0.32],
      rotate: [0, -165, 0],
      color: c.cloth,
      blend: 0.05,
    },
    {
      shape: 'roundBox',
      at: [cx + 0.1, 0.32, nz - 0.02],
      size: [0.04, 0.1, 0.08],
      round: 0.01,
      rotate: [20, 0, 0],
      color: c.leather,
      blend: 0.005,
      mirror: false,
    },
    {
      shape: 'capsule',
      at: [cx + 0.18, 0.12, nz - 0.02],
      to: [cx + 0.26, 0.05, nz - 0.32],
      size: 0.018,
      color: c.leather,
      blend: 0.01,
    },
  ];
}

function tunic(p: HeadParams, f: BustFrame): SculptEdit[] {
  const c = p.colors;
  const { cx, s, b, nz } = f;
  const shell = (g: number): SculptEdit => ({ group: torsoForms(f, g) });
  const torso = sculptField(torsoForms(f), { color: c.cloth, mirror: 'y' }).field;
  const front = (z: number): number => {
    let x = cx + 0.7;
    for (let i = 0; i < 300 && torso([x, 0, z]) > 0; i++) x -= 0.004;
    return x;
  };
  const n = p.neck.radius;
  const axis = (z: number): Vec3 => [cx - 0.08, 0, z];
  const mantle = (g: number): SculptEdit => ({
    shape: 'ellipsoid',
    at: [cx - 0.1, 0, b + 0.45],
    size: [0.42 + g, s + 0.06 + g, 0.3 + g],
  });
  const opening: SculptEdit = {
    shape: 'ellipsoid',
    at: [cx + 0.38, 0, nz - 0.1],
    size: [0.3, s * 0.45, 0.5],
    op: 'subtract',
    blend: 0.02,
  };
  const brooch = (y: number): SculptEdit => ({
    group: [
      mantle(0.03),
      { shape: 'sphere', at: [cx + 0.17, y, b + 0.5], size: 0.065, op: 'intersect' },
    ],
    color: c.metal,
    blend: 0.004,
  });
  return [
    // Mantle: a dome over shoulders and back, cut level below, open at the front.
    {
      group: [
        mantle(0),
        { shape: 'roundBox', at: [0, 0, b + 0.3 + 1], size: [4, 4, 2], op: 'intersect' },
        opening,
        bustCut(f),
      ],
      color: c.cape ?? c.leather,
      blend: 0.01,
    },
    brooch(s * 0.4),
    // Standing collar, notched open at the throat.
    {
      group: [
        { shape: 'capsule', at: axis(nz - 0.06), to: axis(nz + 0.1), size: n + 0.08 },
        {
          shape: 'capsule',
          at: axis(nz - 0.2),
          to: axis(nz + 0.3),
          size: n + 0.02,
          op: 'subtract',
        },
        {
          shape: 'ellipsoid',
          at: [cx + 0.2, 0, nz + 0.12],
          size: [0.12, 0.08, 0.14],
          op: 'subtract',
          blend: 0.02,
        },
      ],
      color: c.leather,
      blend: 0.015,
    },
    // Leather placket with three brass buttons down the chest.
    {
      group: [
        shell(0.012),
        { shape: 'roundBox', at: [cx + 0.3, 0, b + 0.2], size: [0.4, 0.07, 0.6], op: 'intersect' },
      ],
      color: c.leather,
      blend: 0.004,
      mirror: false,
    },
    // Brass buttons seated on the chest surface (probed along −X at the midline).
    ...[0.5, 0.38, 0.26].map(
      (z): SculptEdit => ({
        shape: 'sphere',
        at: [front(b + z) + 0.014, 0, b + z],
        size: 0.028,
        color: c.metal,
        blend: 0.004,
        mirror: false,
      }),
    ),
  ];
}

/** `cell`: the bust's sculpt cell (head units), floors the plinth disc so far LODs keep it. */
export function bustEdits(p: HeadParams, l: HeadLayout, cell = 0): SculptEdit[] {
  const c = p.colors;
  const f = frameOf(p, l);
  const style = p.bust.style;
  const bare = style === 'pauldrons' || style === 'vest';
  const e: SculptEdit[] = [
    ...bodyEdits(p, f, bare ? c.skin : c.cloth),
    // Neck root in skin, so the head's neck seats into the bust without a cloth ring (flattened,
    // so it never pokes through the chest below the collar).
    {
      shape: 'ellipsoid',
      at: [f.cx - 0.09, 0, f.nz + 0.06],
      size: [f.n * 1.02, f.n * 1.02, 0.12],
      color: c.skin,
      blend: 0.04,
    },
  ];
  if (style === 'pauldrons') e.push(...armour(p, f, cell));
  else if (style === 'hood') e.push(...hood(p, f.cx, f.nz));
  else if (style === 'vest') e.push(...vest(p, f));
  else e.push(...tunic(p, f));
  e.push(...plinthEdits(p, f, cell * 1.5));
  // Base cut flat at z = base.
  e.push({ shape: 'roundBox', at: [0, 0, f.floor - 1], size: [4, 4, 2], op: 'subtract' });
  return e;
}
