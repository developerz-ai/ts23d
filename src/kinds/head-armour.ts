// The orc's armoured bust gear as sculpt groups: layered metal pauldron lames (domes trimmed by a
// tilted plane, each with a rolled rim), bone spikes, a leather baldric that follows the chest
// (a shell of the chest ∩ a diagonal slab) with an iron buckle, and a fur mantle of clumped,
// tapering strands. Head units, mirrored across Y unless an edit opts out.

import type { Vec3 } from '../core/index.ts';
import type { SculptEdit } from '../primitives/index.ts';
import { alongZ, unit } from './head-geom.ts';
import type { HeadParams } from './head-params.ts';

const RAD = Math.PI / 180;
const shade = (c: Vec3, k: number): Vec3 => [c[0] * k, c[1] * k, c[2] * k];

/** Half-space kept above the plane through `p` whose normal is +Z rolled `deg` about X. */
const above = (p: Vec3, deg: number, op: 'intersect' | 'subtract' = 'intersect'): SculptEdit => {
  const n: Vec3 = [0, -Math.sin(deg * RAD), Math.cos(deg * RAD)];
  return {
    shape: 'roundBox',
    at: [p[0] + n[0], p[1] + n[1], p[2] + n[2]],
    size: [4, 4, 2],
    rotate: [deg, 0, 0],
    op,
  };
};

/** Thin slab (thickness `t`) through `p`, normal +Z rolled `deg` about X. */
const slab = (p: Vec3, deg: number, t: number): SculptEdit => ({
  shape: 'roundBox',
  at: p,
  size: [4, 4, t],
  rotate: [deg, 0, 0],
  op: 'intersect',
});

/** Chest ellipsoid of the bust (shared with head-bust.ts so the strap hugs it). */
export const chestOf = (cx: number, s: number, b: number): { at: Vec3; r: Vec3 } => ({
  at: [cx - 0.04, 0, b + 0.2],
  r: [0.36, s * 0.75, 0.42],
});

export function armour(p: HeadParams, cx: number, s: number, b: number, nz: number): SculptEdit[] {
  const c = p.colors;
  const metal = c.metal;
  const out: SculptEdit[] = [];
  // Pauldrons: three lames, top one biggest, stepping down and out; rims a darker iron.
  for (let k = 0; k < 3; k++) {
    const at: Vec3 = [cx - 0.03, s * (0.78 + k * 0.1), b + 0.53 - k * 0.12];
    const r: Vec3 = [0.31 - k * 0.02, 0.27 - k * 0.03, 0.19 - k * 0.02];
    const tilt = -(28 + k * 14);
    const cut: Vec3 = [at[0], at[1], at[2] - r[2] * 0.35];
    out.push(
      {
        group: [{ shape: 'ellipsoid', at, size: r }, above(cut, tilt)],
        color: shade(metal, 1 - k * 0.12),
        blend: 0.008,
      },
      {
        group: [
          { shape: 'ellipsoid', at, size: [r[0] + 0.018, r[1] + 0.018, r[2] + 0.018] },
          slab(cut, tilt, 0.035),
        ],
        color: shade(metal, 0.55),
        blend: 0.004,
      },
    );
    // Rivets along the top of each lame's rim.
    for (let j = 0; j < 4; j++) {
      const t = (j - 1.5) * 0.11;
      out.push({
        shape: 'sphere',
        at: [at[0] + t, at[1] + Math.sin(-tilt * RAD) * r[1] * 0.55, cut[2] + 0.03],
        size: 0.016,
        color: shade(metal, 1.4),
        blend: 0.004,
      });
    }
  }
  // Bone spikes along the top lame's ridge.
  for (let k = 0; k < 3; k++)
    out.push({
      shape: 'cone',
      at: [cx - 0.17 + k * 0.14, s * 0.84, b + 0.68 - Math.abs(k - 1) * 0.03],
      size: [0.065, 0.006, 0.26 - Math.abs(k - 1) * 0.08],
      rotate: alongZ(unit([(k - 1) * 0.35, 0.45, 1])),
      color: c.teeth,
      blend: 0.01,
    });
  // Baldric: a shell of the chest cut to a diagonal band, over the left shoulder; iron buckle.
  const chest = chestOf(cx, s, b);
  const grow = (g: number): Vec3 => [chest.r[0] + g, chest.r[1] + g, chest.r[2] + g];
  const band: Vec3 = [cx, 0, b + 0.28];
  out.push(
    {
      group: [{ shape: 'ellipsoid', at: chest.at, size: grow(0.03) }, slab(band, 52, 0.17)],
      color: c.leather,
      blend: 0.006,
      mirror: false,
    },
    {
      group: [
        { shape: 'ellipsoid', at: chest.at, size: grow(0.055) },
        {
          shape: 'roundBox',
          at: [cx + 0.3, 0.02, b + 0.3],
          size: [0.3, 0.15, 0.15],
          rotate: [52, 0, 0],
          op: 'intersect',
        },
        {
          shape: 'ellipsoid',
          at: [cx + 0.42, 0.02, b + 0.3],
          size: [0.1, 0.045, 0.045],
          op: 'subtract',
        },
      ],
      color: shade(metal, 0.8),
      blend: 0.004,
      mirror: false,
    },
  );
  // Fur mantle: a thick base roll, then clumped strands fanning out and down from it.
  const fur = c.fur ?? c.leather;
  const R = p.neck.radius + 0.1;
  out.push({
    shape: 'torus',
    at: [cx - 0.08, 0, nz + 0.02],
    size: [R, 0.07],
    color: shade(fur, 0.75),
    blend: 0.04,
  });
  for (let row = 0; row < 2; row++)
    for (let i = 0; i < 10; i++) {
      const a = (-85 + i * 20 + row * 10) * RAD;
      const rr = R + row * 0.05;
      const root: Vec3 = [
        cx - 0.08 + Math.cos(a) * rr,
        Math.abs(Math.sin(a)) * rr + 0.015,
        nz + 0.07 - row * 0.06,
      ];
      const dir = unit([Math.cos(a), Math.abs(Math.sin(a)), -0.5 - ((i + row) % 2) * 0.35]);
      out.push({
        shape: 'cone',
        at: root,
        size: [0.07 - row * 0.01, 0.012, 0.13 + ((i + row) % 3) * 0.03],
        rotate: alongZ(dir),
        color: (i + row) % 2 ? fur : shade(fur, 0.7),
        blend: 0.03,
      });
    }
  return out;
}
