// The bust under the head: chest, trapezius and deltoid caps, cut flat at the base and at the arms
// (the classic sculpted bust), plus the gear that sells the race at a glance — layered spiked
// pauldrons and a fur mantle (orc), a draped hood (goblin), a tunic with cloak and clasp (human).
// Head units, mirrored across Y; the neck itself belongs to the head.

import type { Vec3 } from '../core/index.ts';
import type { SculptEdit } from '../primitives/index.ts';
import { armour, chestOf } from './head-armour.ts';
import type { HeadLayout } from './head-layout.ts';
import type { HeadParams } from './head-params.ts';

/** Bare-chested torso forms under the armour: pectorals with a sternal groove, deltoid caps. */
function torso(p: HeadParams, cx: number, b: number): SculptEdit[] {
  const c = p.colors;
  return [
    {
      shape: 'ellipsoid',
      at: [cx + 0.17, 0.16, b + 0.32],
      size: [0.16, 0.19, 0.12],
      rotate: [0, 0, 12],
      color: c.skin,
      blend: 0.07,
    },
    {
      shape: 'capsule',
      at: [cx + 0.33, 0, b + 0.42],
      to: [cx + 0.34, 0, b + 0.1],
      size: 0.012,
      op: 'subtract',
      blend: 0.04,
      color: c.shade,
      mirror: false,
    },
  ];
}

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

function tunic(p: HeadParams, cx: number, s: number, b: number, nz: number): SculptEdit[] {
  const c = p.colors;
  const chest = chestOf(cx, s, b);
  const shell = (g: number): SculptEdit => ({
    shape: 'ellipsoid',
    at: chest.at,
    size: [chest.r[0] + g, chest.r[1] + g, chest.r[2] + g],
  });
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
    ...[0.42, 0.3, 0.18].map(
      (z): SculptEdit => ({
        group: [
          shell(0.03),
          { shape: 'sphere', at: [cx + 0.3, 0, b + z], size: 0.03, op: 'intersect' },
        ],
        color: c.metal,
        blend: 0.003,
        mirror: false,
      }),
    ),
  ];
}

export function bustEdits(p: HeadParams, l: HeadLayout): SculptEdit[] {
  const c = p.colors;
  const cx = l.cranium.at[0] + p.jaw.muzzle * 0.3;
  const s = p.bust.shoulders;
  const b = l.base;
  const nz = b + 0.6; // neck root
  const body = p.bust.style === 'pauldrons' ? c.skin : c.cloth;
  const e: SculptEdit[] = [
    { shape: 'ellipsoid', at: chestOf(cx, s, b).at, size: chestOf(cx, s, b).r, color: body },
    {
      shape: 'capsule',
      at: [cx - 0.16, 0.1, nz + 0.16],
      to: [cx - 0.1, s * 0.78, b + 0.44],
      size: 0.15,
      color: body,
      blend: 0.15,
    },
    { shape: 'sphere', at: [cx - 0.04, s * 0.84, b + 0.3], size: 0.2, color: body, blend: 0.1 },
    // Trapezius: from high behind the neck down to the shoulder.
    {
      shape: 'capsule',
      at: [cx - 0.2, 0.08, nz + 0.3],
      to: [cx - 0.1, s * 0.62, b + 0.5],
      size: 0.1 + p.neck.radius * 0.2,
      color: body,
      blend: 0.12,
    },
    {
      shape: 'capsule',
      at: [cx - 0.08, 0, nz - 0.05],
      to: [cx - 0.1, 0, nz + 0.12],
      size: p.neck.radius * 1.05,
      color: c.skin,
      blend: 0.03,
    },
  ];
  // Arms cut flat at the shoulders (before the gear, so pauldrons overhang the cut).
  e.push({
    shape: 'roundBox',
    at: [0, s + 1.02, b + 0.5],
    size: [4, 2, 4],
    op: 'subtract',
    color: body,
  });
  if (p.bust.style === 'pauldrons') e.push(...torso(p, cx, b), ...armour(p, cx, s, b, nz));
  else if (p.bust.style === 'hood') e.push(...hood(p, cx, nz));
  else e.push(...tunic(p, cx, s, b, nz));
  // Base cut flat at z = base.
  e.push({ shape: 'roundBox', at: [0, 0, b - 1], size: [4, 4, 2], op: 'subtract' });
  return e;
}
