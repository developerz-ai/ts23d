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
    case 'topknot':
      return [
        { shape: 'ellipsoid', at: [cx - 0.12, 0, top - 0.02], size: [0.11, 0.08, 0.07], color: h },
        {
          shape: 'sphere',
          at: [cx - 0.16, 0, top + 0.07],
          size: 0.075,
          color: h,
          blend: 0.03,
        },
        {
          shape: 'capsule',
          at: [cx - 0.2, 0, top + 0.08],
          to: [cx - 0.42, 0, top - 0.25],
          size: 0.04,
          color: h,
          blend: 0.04,
        },
        {
          shape: 'torus',
          at: [cx - 0.17, 0, top + 0.02],
          size: [0.06, 0.018],
          color: p.colors.metal,
        },
      ];
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
    case 'tufts':
      return Array.from({ length: 5 }, (_, i): SculptEdit => {
        const a = (i / 4 - 0.5) * 1.6;
        const base: Vec3 = [cx - 0.1 + Math.cos(a) * 0.05, Math.sin(a) * 0.12, top - 0.04];
        return {
          shape: 'cone',
          at: base,
          size: [0.025, 0.004, 0.12 + (i % 2) * 0.05],
          rotate: alongZ([-0.6, Math.sin(a) * 0.8, 1]),
          color: h,
          blend: 0.01,
          mirror: false,
        };
      });
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
