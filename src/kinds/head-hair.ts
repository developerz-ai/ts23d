// Scalp hair as edit lists, part of the skull field: a top-knot, mohawk ridge, chunky swept locks
// over a cap clipped at the hairline, wiry tufts, braids. Beards and eyebrows: head-beard.ts.
// Head units, mirrored across Y unless an edit opts out.

import type { Vec3 } from '../core/index.ts';
import type { SculptEdit } from '../primitives/index.ts';
import { alongZ } from './head-geom.ts';
import type { HeadLayout } from './head-layout.ts';
import type { HeadParams } from './head-params.ts';

const RAD = Math.PI / 180;

export function hairEdits(p: HeadParams, l: HeadLayout): SculptEdit[] {
  const h = p.colors.hair;
  const [cx, , cz] = l.cranium.at;
  const [rx, ry, rz] = l.cranium.r;
  const top = l.crown;
  switch (p.hair) {
    case 'topknot': {
      // A warrior's knot: hair gathered at the back of the crown, bound by two iron rings, rising
      // and then falling back in a thick tapering tail to the nape.
      const root: Vec3 = [cx - 0.14, 0, top - 0.03];
      const rise: Vec3 = [cx - 0.2, 0, top + 0.13];
      const fall: Vec3 = [cx - 0.38, 0, top + 0.02];
      const tip: Vec3 = [cx - rx - 0.08, 0, cz - 0.12];
      const seg = (a: Vec3, b: Vec3, r0: number, r1: number): SculptEdit => ({
        shape: 'cone',
        at: a,
        size: [r0, r1, Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])],
        rotate: alongZ([b[0] - a[0], b[1] - a[1], b[2] - a[2]]),
        blend: 0.03,
      });
      const ring = (at: Vec3, deg: number): SculptEdit => ({
        shape: 'torus',
        at,
        size: [0.07, 0.018],
        rotate: [0, deg, 0],
        color: p.colors.metal,
        blend: 0.004,
      });
      return [
        {
          group: [
            seg(root, rise, 0.085, 0.075),
            seg(rise, fall, 0.08, 0.07),
            seg(fall, tip, 0.07, 0.015),
          ],
          color: h,
          blend: 0.02,
        },
        ring([root[0] - 0.02, 0, root[2] + 0.06], -15),
        ring([root[0] - 0.04, 0, root[2] + 0.11], -25),
      ];
    }
    case 'mohawk':
      return Array.from({ length: 6 }, (_, i): SculptEdit => {
        const a = (-20 + i * 26) * RAD;
        return {
          shape: 'ellipsoid',
          at: [cx + Math.sin(a) * rx * 0.95, 0, cz + Math.cos(a) * rz * 0.97],
          size: [0.06, 0.035, 0.09],
          rotate: [0, (a * 180) / Math.PI - 15, 0],
          color: h,
          blend: 0.03,
        };
      });
    case 'swept': {
      // Cap clipped to a rounded hairline (face and ears carved out), then big tapered locks
      // sweeping back from the hairline — thick roots proud, tips sunk — in two shades.
      const C: Vec3 = [cx - 0.04, 0, cz + 0.04];
      const R: Vec3 = [rx + 0.035, ry + 0.04, rz + 0.02];
      const on = (az: number, el: number, lift = 0): Vec3 => [
        C[0] + (R[0] + lift) * Math.cos(el * RAD) * Math.cos(az * RAD),
        C[1] + (R[1] + lift) * Math.cos(el * RAD) * Math.sin(az * RAD),
        C[2] + (R[2] + lift) * Math.sin(el * RAD),
      ];
      const light: Vec3 = [h[0] * 1.45, h[1] * 1.45, h[2] * 1.45];
      // A lock hugs the cap: two tapering cones root → mid → tip, mid on the surface.
      const cone = (a: Vec3, b: Vec3, r0: number, r1: number): SculptEdit => ({
        shape: 'cone',
        at: a,
        size: [r0, r1, Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])],
        rotate: alongZ([b[0] - a[0], b[1] - a[1], b[2] - a[2]]),
      });
      const lock = (az: number, el: number, len: number, r: number, i: number): SculptEdit => {
        const a = on(az, el, -0.005);
        const m = on(az + len * 0.3, el - len * 0.45, -0.012);
        const b = on(az + len * 0.6, el - len, -0.045);
        return {
          group: [cone(a, m, r, r * 0.75), cone(m, b, r * 0.75, r * 0.15)],
          color: i % 2 ? h : light,
          blend: 0.035,
          ...(az === 0 ? { mirror: false } : {}),
        };
      };
      return [
        {
          group: [
            { shape: 'ellipsoid', at: C, size: R },
            {
              shape: 'ellipsoid',
              at: [l.faceX + 0.12, 0, l.eye[2] - 0.08],
              size: [0.34, ry * 0.92, 0.36],
              op: 'subtract',
              blend: 0.03,
            },
            {
              shape: 'ellipsoid',
              at: [cx + 0.02, ry, l.eye[2] - 0.08],
              size: [0.13, 0.25, 0.16],
              op: 'subtract',
              blend: 0.03,
            },
          ],
          color: h,
          blend: 0.012,
        },
        lock(0, 44, 50, 0.07, 1),
        lock(22, 46, 50, 0.07, 0),
        lock(45, 40, 45, 0.068, 1),
        lock(70, 34, 40, 0.06, 0),
        lock(95, 30, 35, 0.055, 1),
        lock(120, 30, 30, 0.05, 0),
      ];
    }
    case 'tufts': {
      // Wispy strands: a few thin, curling wisps on the crown and over the ears, each a root cone
      // and a finer tip cone bent back — straggly, not a brush.
      const out: SculptEdit[] = [];
      const spots: ReadonlyArray<readonly [number, number, number]> = [
        [10, 78, 0.26],
        [-25, 70, 0.22],
        [40, 62, 0.22],
        [150, 55, 0.2],
        [115, 30, 0.2],
        [100, 16, 0.18],
        [-120, 40, 0.18],
      ];
      for (const [az, el, len] of spots) {
        const a = az * RAD;
        const e = el * RAD;
        const n: Vec3 = [Math.cos(e) * Math.cos(a), Math.cos(e) * Math.sin(a), Math.sin(e)];
        const root: Vec3 = [cx - 0.04 + rx * 0.97 * n[0], ry * 0.97 * n[1], cz + rz * 0.97 * n[2]];
        const d1: Vec3 = [n[0] - 0.6, n[1] * 1.3, n[2] * 0.6 + 0.25];
        const l1 = Math.hypot(...d1);
        const mid: Vec3 = [
          root[0] + (d1[0] / l1) * len * 0.55,
          root[1] + (d1[1] / l1) * len * 0.55,
          root[2] + (d1[2] / l1) * len * 0.55,
        ];
        const d2: Vec3 = [d1[0] - 0.5, d1[1] * 1.6, -0.9];
        out.push({
          group: [
            { shape: 'cone', at: root, size: [0.026, 0.014, len * 0.58], rotate: alongZ(d1) },
            {
              shape: 'cone',
              at: mid,
              size: [0.015, 0.004, len * 0.6],
              rotate: alongZ(d2),
              blend: 0.008,
            },
          ],
          color: h,
          blend: 0.012,
          mirror: az !== 10 && az !== -25 && az !== -120,
        });
      }
      return out;
    }
    case 'braids':
      return [
        { ...capOf(l, h) },
        {
          shape: 'capsule',
          at: [cx - 0.2, ry * 0.7, cz - 0.1],
          to: [cx - 0.1, ry * 0.8, cz - 0.6],
          size: 0.035,
          color: h,
          blend: 0.02,
        },
      ];
    default:
      return [];
  }
}

const capOf = (l: HeadLayout, h: Vec3): SculptEdit => ({
  shape: 'ellipsoid',
  at: [l.cranium.at[0] - 0.07, 0, l.cranium.at[2] + 0.09],
  size: [l.cranium.r[0] + 0.02, l.cranium.r[1] + 0.025, l.cranium.r[2]],
  color: h,
  blend: 0.02,
});
