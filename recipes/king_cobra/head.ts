// The cobra's head: one fine loft with the named shields as cells (dark sutures, shallow grooves), the
// mouth line and eye socket, plus the eye and forked tongue. Layout from the scalation plate (README).

import type { Mesh, Vec3 } from '@developerz.ai/ts23d';
import {
  add,
  curve3,
  even,
  eyeball,
  fbm,
  gauss,
  loft,
  mix,
  mixRgb,
  norm,
  scale,
  smooth,
  stations,
  TAU,
} from '../_lib/body-plan-kit.ts';
import { pinLoftUv, pinUv } from './material.ts';
import { frameAt, HEAD, halfW, surfacePoint } from './shape.ts';
import { COLOUR, SCALE_STRIP, sideOf } from './surface.ts';

type Lod = 0 | 1 | 2;

// Head shield seeds, in head lengths along and head half-widths across (from the scalation plate).
const SHIELDS: readonly (readonly [number, number])[] = [
  [0.035, 0],
  [0.16, 0.42],
  [0.28, 0.46],
  [0.27, 0.07],
  [0.45, 0],
  [0.43, 0.68],
  [0.63, 0.25],
  [0.66, 0.78],
  [0.87, 0.26],
  [0.92, 0.82],
  [0.47, 1.05],
  [0.72, 1.12],
  [1.03, 0.2],
  [1.06, 0.62],
  [0.17, 0.92],
  [0.29, 1.0],
];

/** Distance to the nearest shield border, in head lengths, at head position (u along, v across). */
function suture(u: number, v: number): number {
  const seeds = SHIELDS.flatMap(([a, b]) =>
    b === 0
      ? [[a, 0]]
      : [
          [a, b],
          [a, -b],
        ],
  );
  let [d1, d2] = [9, 9];
  for (const [a, b] of seeds) {
    const d = Math.hypot(u - (a ?? 0), (v - (b ?? 0)) * 0.46);
    if (d < d1) [d1, d2] = [d, d1];
    else if (d < d2) d2 = d;
  }
  return d2 - d1;
}

export const eyePoint = (side: 1 | -1): Vec3 => surfacePoint(0.0355, side > 0 ? 1.08 : TAU - 1.08);

function headPoint(s: number, a: number, lod: Lod): Vec3 {
  let lift = 0;
  if (lod < 2) {
    const line = sideOf(a);
    const mouth = gauss(line - mouthAngle(s), 0.05) * (1 - smooth(0.058, 0.072, s));
    const u = s / HEAD.length;
    const v = (Math.sin(a) * halfW(s)) / (HEAD.width / 2);
    const top = 1 - smooth(1.55, 1.85, line);
    const seam =
      lod === 0 ? (1 - smooth(0.006, 0.02, suture(u, v))) * top * smooth(0.002, 0.012, s) : 0;
    const eye = eyePoint(Math.sin(a) >= 0 ? 1 : -1);
    const p = surfacePoint(s, a);
    const dent = gauss(Math.hypot(p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]), 0.012);
    const brow =
      0.5 * gauss(Math.hypot(p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]) - 0.0105, 0.003);
    lift = -0.0011 * mouth - 0.00028 * seam - 0.0016 * dent + 0.0009 * brow;
  }
  return surfacePoint(s, a, lift);
}

const mouthAngle = (s: number): number => 1.9 + 0.24 * smooth(0.0, 0.04, s);

function headColour(s: number, a: number): Vec3 {
  const line = sideOf(a);
  const u = s / HEAD.length;
  const v = (Math.sin(a) * halfW(s)) / (HEAD.width / 2);
  let c = mixRgb(COLOUR.head, COLOUR.olive, 0.25 + 0.5 * fbm(s * 90, a * 3, 2));
  c = mixRgb(c, COLOUR.lip, smooth(1.72, 2.05, line));
  c = mixRgb(c, COLOUR.throat, smooth(2.1, 2.3, line));
  const top = 1 - smooth(1.7, 2.0, line);
  c = mixRgb(c, COLOUR.suture, (1 - smooth(0.004, 0.016, suture(u, v))) * top * 0.92);
  const mouth = gauss(line - mouthAngle(s), 0.042) * (1 - smooth(0.056, 0.07, s));
  return mixRgb(c, COLOUR.suture, mouth);
}

export function headMesh(lod: Lod): Mesh {
  const end = HEAD.length + 0.03;
  const us =
    lod === 2
      ? [0.0015, 0.012, 0.04, end]
      : stations([
          ...even(0.0008, 0.012, lod === 0 ? 12 : 4),
          ...even(0.012, end, lod === 0 ? 96 : 16),
        ]);
  const sides = lod === 0 ? 96 : lod === 1 ? 24 : 8;
  const mesh = loft({
    us,
    sides,
    strip: SCALE_STRIP,
    point: (s, a) => headPoint(s, a, lod),
    color: (_p, _n, s, a) => headColour(s, a),
  });
  // The big head shields are polished keratin; their sutures and the lips are matte.
  return pinLoftUv(mesh, us, sides, (s, a) => {
    const u = s / HEAD.length;
    const v = (Math.sin(a) * halfW(s)) / (HEAD.width / 2);
    return [0.25 + 0.7 * smooth(0.004, 0.02, suture(u, v)) * (1 - smooth(1.7, 2.1, sideOf(a))), 0];
  });
}

export function eyeMesh(side: 1 | -1, lod: Lod): Mesh {
  const c = eyePoint(side);
  const f = frameAt(0.0355);
  const out = norm(add(scale(f.side, side), scale(f.d, 0.45)));
  const [rings, sides] = lod === 0 ? [10, 16] : lod === 1 ? [5, 8] : [2, 4];
  // Seated proud in the socket under the clear brille: the glossiest point on the snake, so the
  // key light leaves a catchlight on it.
  const eye = eyeball(add(c, scale(out, -0.0022)), 0.0064, out, rings, sides, (th) =>
    th < 0.5 ? COLOUR.pupil : th < 0.95 ? COLOUR.iris : th < 1.15 ? COLOUR.lip : COLOUR.suture,
  );
  return pinUv(eye, 1);
}

/** Forked tongue: two thin tips off a shared stem, out through the mouth notch. */
export function tongueMesh(path: readonly Vec3[], lod: Lod): Mesh[] {
  if (lod === 2) return [tongueBlade(path, 0, lod)];
  return [tongueBlade(path, 1, lod), tongueBlade(path, -1, lod)];
}

function tongueBlade(path: readonly Vec3[], fork: number, lod: Lod): Mesh {
  const c = curve3(path);
  const y = (u: number): number => fork * 0.0085 * smooth(0.62, 1, u) ** 1.4;
  const blade = loft({
    us: even(0, 0.985, lod === 0 ? 12 : 4),
    sides: lod === 0 ? 6 : 4,
    strip: SCALE_STRIP,
    point: (u, a) => {
      const q = c(u);
      const r = mix(0.0024, 0.0005, u);
      return [q[0], q[1] + y(u) + r * Math.cos(a), q[2] + r * 0.7 * Math.sin(a)];
    },
    color: () => COLOUR.tongue,
  });
  return pinUv(blade, 0.75);
}
