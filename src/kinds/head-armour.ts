// The orc's armoured bust gear as sculpt groups: plate pauldrons built like real armour — a domed
// shoulder cap and two shingled lames, each a hollow shell (so its edge shows a thickness and a
// shadowed underside) with a rolled rim, a raised crest and bone spikes along it, rivets — plus a
// leather baldric that hugs the chest (a shell of the torso ∩ a diagonal slab) with an iron buckle,
// and a fur mantle of clumped, tapering strands over the trapezius. Head units, mirrored across Y.

import type { Vec3 } from '../core/index.ts';
import type { SculptEdit } from '../primitives/index.ts';
import { alongZ, unit } from './head-geom.ts';
import type { HeadParams } from './head-params.ts';
import { type BustFrame, bustCut, torsoForms } from './head-torso.ts';

const RAD = Math.PI / 180;
const shade = (c: Vec3, k: number): Vec3 => [c[0] * k, c[1] * k, c[2] * k];

/** Half-space kept above the plane through `p` whose normal is +Z rolled `deg` about X. */
const above = (p: Vec3, deg: number): SculptEdit => {
  const n: Vec3 = [0, -Math.sin(deg * RAD), Math.cos(deg * RAD)];
  return {
    shape: 'roundBox',
    at: [p[0] + n[0], p[1] + n[1], p[2] + n[2]],
    size: [4, 4, 2],
    rotate: [deg, 0, 0],
    op: 'intersect',
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

const ell = (at: Vec3, r: Vec3, g: number, roll: number): SculptEdit => ({
  shape: 'ellipsoid',
  at,
  size: [r[0] + g, r[1] + g, r[2] + g],
  rotate: [roll, 0, 0],
});

/** One plate: a shell of thickness `t` trimmed above a tilted plane, with a rolled rim. */
function plate(
  at: Vec3,
  r: Vec3,
  roll: number,
  cut: Vec3,
  tilt: number,
  c: Vec3,
  t: number,
): SculptEdit[] {
  return [
    {
      group: [
        ell(at, r, 0, roll),
        // Hollow only while the shell is thinner than the plate itself (fine LODs).
        ...(t < Math.min(...r) * 0.6 ? [{ ...ell(at, r, -t, roll), op: 'subtract' as const }] : []),
        above(cut, tilt),
      ],
      color: c,
      blend: 0.006,
    },
    {
      group: [
        ell(at, r, 0.022, roll),
        ...(t < Math.min(...r) * 0.6
          ? [{ ...ell(at, r, -t * 0.8, roll), op: 'subtract' as const }]
          : []),
        slab(cut, tilt, 0.05),
      ],
      // Worn edge: the rim catches the light (a painter's edge highlight).
      color: shade(c, 1.3),
      blend: 0.006,
    },
  ];
}

/** `cell`: the bust's sculpt cell; plates thicken to ≈ 2.5 cells so far LODs stay closed. */
export function armour(p: HeadParams, f: BustFrame, cell = 0): SculptEdit[] {
  const t = Math.max(0.085, cell * 2.5);
  const c = p.colors;
  const { cx, s, b, nz } = f;
  const metal = c.metal;
  const out: SculptEdit[] = [];
  // Pauldron: a big shoulder cap, then two lames shingled out and down over the arm.
  const cap: Vec3 = [cx - 0.04, s * 0.8, b + 0.66];
  for (let k = 1; k >= 0; k--) {
    const at: Vec3 = [cap[0], cap[1] + k * 0.07 * s, cap[2] - k * 0.17];
    const r: Vec3 = k === 0 ? [0.27, 0.29, 0.25] : [0.23, 0.25, 0.19];
    const tilt = -(38 + k * 14);
    const cut: Vec3 = [at[0], at[1], at[2] - r[2] * 0.45];
    out.push(...plate(at, r, -25 - k * 10, cut, tilt, shade(metal, 1 - k * 0.15), t));
    // Rivets along each plate's rim.
    for (let j = 0; j < 4; j++) {
      const x = at[0] + (j - 1.5) * 0.12;
      out.push({
        shape: 'sphere',
        at: [x, at[1] + r[1] * 0.62, cut[2] + 0.02 - r[1] * 0.62 * Math.tan(-tilt * RAD) * 0.4],
        size: 0.017,
        color: shade(metal, 1.35),
        blend: 0.004,
      });
    }
  }
  // Crest along the cap's crown, bone spikes rising out of it.
  const crest: Vec3 = [cap[0], cap[1] - 0.03, cap[2] + 0.25];
  out.push({
    shape: 'ellipsoid',
    at: crest,
    size: [0.25, 0.028, 0.07],
    rotate: [-22, 0, 0],
    color: shade(metal, 0.75),
    blend: 0.02,
  });
  for (let k = 0; k < 3; k++)
    out.push({
      shape: 'cone',
      at: [crest[0] - 0.14 + k * 0.14, crest[1] + 0.01, crest[2] + 0.02 - Math.abs(k - 1) * 0.03],
      size: [0.075, 0.012, 0.36 - Math.abs(k - 1) * 0.12],
      rotate: alongZ(unit([(k - 1) * 0.3, 0.55, 1])),
      color: c.teeth,
      blend: 0.015,
    });
  // Baldric: a shell of the chest cut to a diagonal band over the left shoulder; iron buckle.
  const band: Vec3 = [cx, 0, b + 0.36];
  out.push(
    {
      group: [{ group: torsoForms(f, 0.03) }, slab(band, 50, 0.15), bustCut(f)],
      color: c.leather,
      blend: 0.006,
      mirror: false,
    },
    {
      group: [
        { group: torsoForms(f, 0.055) },
        bustCut(f),
        {
          shape: 'roundBox',
          at: [cx + 0.3, 0.02, b + 0.38],
          size: [0.3, 0.14, 0.14],
          rotate: [50, 0, 0],
          op: 'intersect',
        },
        {
          shape: 'ellipsoid',
          at: [cx + 0.42, 0.02, b + 0.38],
          size: [0.1, 0.04, 0.04],
          op: 'subtract',
        },
      ],
      color: shade(metal, 0.8),
      blend: 0.004,
      mirror: false,
    },
  );
  // Fur mantle over the trapezius: clumped strands fanning back and out from behind the neck.
  const fur = c.fur ?? c.leather;
  const R = f.n + 0.08;
  for (let row = 0; row < 3; row++)
    for (let i = 0; i < 8; i++) {
      const a = (-80 + i * 22 + row * 11) * RAD;
      const rr = R + row * 0.07;
      const root: Vec3 = [
        cx - 0.1 - Math.abs(Math.cos(a)) * rr * 0.9,
        Math.abs(Math.sin(a)) * rr + 0.02,
        nz + 0.16 - row * 0.05,
      ];
      const dir = unit([-0.7, Math.abs(Math.sin(a)) * 0.8, -0.55 - ((i + row) % 2) * 0.3]);
      out.push({
        shape: 'cone',
        at: root,
        size: [0.075 - row * 0.008, 0.012, 0.16 + ((i + row) % 3) * 0.04],
        rotate: alongZ(dir),
        color: (i + row) % 2 ? fur : shade(fur, 0.72),
        blend: 0.035,
      });
    }
  return out;
}
