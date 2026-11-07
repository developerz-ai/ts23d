// Tertiary head forms as edit lists: ears (added to the head after the jaw cut, so the cut never
// clips a lobe), tusks (added to the jaw), war paint and warts (part of the skull field). Hair and
// beards: head-hair.ts. Head units, mirrored across Y unless an edit opts out.

import type { Rng, Vec3 } from '../core/index.ts';
import type { SculptEdit } from '../primitives/index.ts';
import { along, alongX, alongZ, unit } from './head-geom.ts';
import type { HeadLayout } from './head-layout.ts';
import type { HeadParams } from './head-params.ts';

const RAD = Math.PI / 180;

/** `minThick`: the blade's floor thickness (≈ a cell), so far LODs keep their ears attached. */
export function earEdits(p: HeadParams, l: HeadLayout, minThick = 0): SculptEdit[] {
  const { length, width, sweep, lift, shape } = p.ears;
  const cx = l.cranium.at[0];
  const ry = l.cranium.r[1];
  const root: Vec3 = [cx + 0.02, ry * 0.9, l.eye[2] - 0.05];
  const d = unit([-Math.sin(sweep * RAD), Math.cos(sweep * RAD), Math.tan(lift * RAD)]);
  const rot = alongX(d, shape === 'pointed' ? -10 : 0);
  const thick = Math.max(0.022 + width * 0.06, minThick);
  const front: Vec3 = [Math.cos(sweep * RAD), Math.sin(sweep * RAD), 0];
  const shade = p.colors.shade;
  if (shape === 'round') {
    // A human/dwarf ear: upright oval, the long axis vertical, set just behind the jaw hinge.
    const at = along(root, d, 0.03);
    const rot2: Vec3 = [0, -lift, 90 + sweep];
    return [
      { shape: 'ellipsoid', at, size: [width / 2, thick, length / 2], rotate: rot2, blend: 0.02 },
      {
        shape: 'ellipsoid',
        at: along(along(at, d, thick * 0.6), front, 0.004),
        size: [width * 0.3, thick * 0.55, length * 0.3],
        rotate: rot2,
        op: 'subtract',
        blend: 0.012,
        color: shade,
      },
      {
        shape: 'ellipsoid',
        at: [at[0], at[1] + thick * 0.4, at[2] - length * 0.33],
        size: [width * 0.24, thick * 0.9, length * 0.16],
        blend: 0.015,
      },
    ];
  }
  // A pointed leaf ear: broad root blade, tapering tip blade, a hollow facing forward.
  return [
    {
      shape: 'ellipsoid',
      at: along(root, d, length * 0.3),
      size: [length * 0.36, thick, width * 0.5],
      rotate: rot,
      blend: 0.03,
    },
    {
      shape: 'ellipsoid',
      at: along(root, d, length * 0.68),
      size: [length * 0.34, thick * 0.75, width * 0.22],
      rotate: rot,
      blend: 0.04,
    },
    {
      shape: 'ellipsoid',
      at: along(along(root, d, length * 0.42), front, thick * 0.85),
      size: [length * 0.36, thick * 0.6, width * 0.3],
      rotate: rot,
      op: 'subtract',
      blend: 0.015,
      color: shade,
    },
    { shape: 'sphere', at: root, size: 0.04, blend: 0.03 },
  ];
}

/** Lower tusks rising from the jaw past the upper lip, curving out and back (3 cone segments). */
/** `minR`: radius floor (≈ half a cell) so far LODs keep the tusks. */
export function tuskEdits(p: HeadParams, l: HeadLayout, minR = 0): SculptEdit[] {
  const t = p.tusks;
  if (!t) return [];
  const out: SculptEdit[] = [];
  let at: Vec3 = [l.mouthX - 0.03 + p.jaw.underbite * 0.5, t.spread, l.mouthZ - 0.02];
  let dir = unit([0.25, t.flare * 0.5, 1]);
  const seg = t.length / 3;
  for (let i = 0; i < 3; i++) {
    const r0 = Math.max(t.radius * (1 - i / 3.4), minR);
    const r1 = Math.max(t.radius * (1 - (i + 1) / 3.4), minR * 0.6);
    out.push({
      shape: 'cone',
      at,
      size: [r0, Math.max(r1, 0.004), seg * 1.05],
      rotate: alongZ(dir),
      color: p.colors.teeth,
      blend: i === 0 ? 0.02 : 0.004,
    });
    at = along(at, dir, seg);
    dir = unit([dir[0] - 0.22, dir[1] + t.flare * 0.15, dir[2]]);
  }
  return out;
}

/** War paint: thin deep ellipsoids painted through the skin, so each stripe is a clean band of
 *  constant width wherever it crosses the surface — two claw marks per cheek, a crest stripe up
 *  the forehead, three down the chin. */
export function paintEdits(p: HeadParams, l: HeadLayout): SculptEdit[] {
  const c = p.colors.paint;
  if (!c) return [];
  const [ex, ey, ez] = l.eye;
  const band = (at: Vec3, r: Vec3, mirror = true, tilt = 0): SculptEdit => ({
    shape: 'ellipsoid',
    at,
    size: r,
    rotate: [tilt, 0, 0],
    op: 'paint',
    color: c,
    blend: 0.006,
    mirror,
  });
  const chinZ = (l.mouthZ + l.chin[2]) / 2 - 0.02;
  return [
    band([ex + 0.1, ey - 0.035, ez - 0.13], [0.45, 0.016, 0.09], true, -8),
    band([ex + 0.1, ey + 0.035, ez - 0.12], [0.45, 0.016, 0.085], true, -8),
    band([l.cranium.at[0], 0, l.browZ + 0.14], [0.6, 0.028, 0.13], false),
    band([l.chin[0], 0, chinZ], [0.4, 0.012, 0.06], false),
    band([l.chin[0], 0.055, chinZ], [0.4, 0.012, 0.05]),
  ];
}

/** Seeded warts and bumps on the cranium and cheeks. */
export function wartEdits(p: HeadParams, l: HeadLayout, rng: Rng): SculptEdit[] {
  const cx = l.cranium.at[0];
  const [rx, ry, rz] = l.cranium.r;
  return Array.from({ length: p.warts }, (): SculptEdit => {
    const yaw = rng.range(-1.2, 1.2);
    const el = rng.range(-0.1, 0.9);
    const at: Vec3 = [
      cx + rx * Math.cos(el) * Math.cos(yaw),
      ry * Math.cos(el) * Math.sin(yaw),
      l.cranium.at[2] + rz * Math.sin(el),
    ];
    return {
      shape: 'sphere',
      at,
      size: rng.range(0.008, 0.016),
      color: p.colors.shade,
      blend: 0.01,
      mirror: false,
    };
  });
}
