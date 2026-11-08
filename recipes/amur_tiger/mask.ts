// The face mask, painted in the head-local frame (README "Coat and stripe logic", face photos):
// orange crown and bridge; white eye spots above each eye, white cheeks, whisker pads, lips and
// ruff; black eyeliner running back from the outer corner; three or four black lines fanning back
// across each white cheek into the ruff; narrow transverse forehead stripes converging on the
// brow; dark whisker-spot rows on the pads. Left and right differ (seeded per side).

import type { Vec3 } from '@developerz.ai/ts23d';
import { mixRgb, smoothstep } from '../_lib/creature/curve.ts';
import { whiskerSpots } from './face.ts';
import { C } from './palette.ts';
import { HEAD } from './skeleton.ts';
import { hash } from './stripes.ts';

const E = HEAD.eye;
const AA = [0.003, 0.005, 0.01] as const;

/** Distance from p to segment ab, in the x-z plane (side projection). */
function segXZ(p: Vec3, a: Vec3, b: Vec3): { d: number; t: number } {
  const ux = b[0] - a[0];
  const uz = b[2] - a[2];
  const l2 = ux * ux + uz * uz || 1;
  const t = Math.min(1, Math.max(0, ((p[0] - a[0]) * ux + (p[2] - a[2]) * uz) / l2));
  return { d: Math.hypot(p[0] - a[0] - ux * t, p[2] - a[2] - uz * t), t };
}

const line = (d: number, w: number, aa: number): number =>
  smoothstep(w + aa, Math.max(0, w - aa), d);

/** White of the face (0..1), symmetric. */
export function faceWhite(p: Vec3): number {
  const [x, y0, z] = p;
  const y = Math.abs(y0);
  // Eye spot: the white patch above and in front of each eye.
  const spot =
    1 -
    smoothstep(
      0.75,
      1.15,
      Math.hypot((x - E[0] - 0.004) / 0.024, (y - E[1]) / 0.03, (z - E[2] - 0.03) / 0.016),
    );
  // Muzzle, whisker pads and lips; the bridge stays orange down to the nose.
  const bridge = smoothstep(0.03, 0.018, y) * smoothstep(-0.005, 0.02, z);
  const muzzle = smoothstep(0.205, 0.235, x) * smoothstep(0.04, 0.01, z) * (1 - bridge);
  // Cheeks below the eye line and the ruff behind them.
  const cheek =
    smoothstep(E[2] - 0.006, E[2] - 0.03, z) *
    smoothstep(0.045, 0.065, y) *
    smoothstep(-0.06, 0.0, x);
  // Under the head (throat ruff) and the chin.
  const under = smoothstep(-0.05, -0.08, z);
  return Math.min(1, Math.max(spot, muzzle, cheek, under));
}

/** Black face lines (0..1), asymmetric per side. */
export function faceStripes(p: Vec3, lod: number): number {
  const [x, y0, z] = p;
  const y = Math.abs(y0);
  const side = y0 >= 0 ? 0 : 1;
  const aa = AA[lod as 0 | 1 | 2] ?? 0.01;
  const r = (k: number, s: number): number => hash(800 + k * 2 + side, s);
  let c = 0;
  // Eyeliner: the dark rim at the outer corner running back and slightly down.
  if (y > 0.04) {
    const a: Vec3 = [E[0] - 0.012, 0, E[2] - 0.004];
    const b: Vec3 = [E[0] - 0.06 - 0.01 * r(0, 1), 0, E[2] - 0.012];
    const s = segXZ(p, a, b);
    c = Math.max(c, line(s.d, 0.0045 * (1 - 0.6 * s.t), aa));
  }
  // Cheek lines: fanning back from under the eye into the ruff.
  if (y > 0.05 && z < E[2] - 0.012)
    for (let k = 0; k < 4; k++) {
      const z0 = E[2] - 0.028 - k * 0.02 - 0.006 * r(k + 1, 2);
      const a: Vec3 = [E[0] - 0.01 - 0.012 * k, 0, z0];
      const b: Vec3 = [0.05 - 0.02 * r(k + 1, 3), 0, z0 - 0.03 - 0.025 * r(k + 1, 4)];
      const s = segXZ(p, a, b);
      // Wavy, thick in the middle, broken on some.
      const w = 0.0075 * Math.sin(Math.PI * (0.15 + 0.85 * s.t)) * (0.8 + 0.5 * r(k + 1, 5));
      const gap = r(k + 1, 6) < 0.4 ? 1 - line(Math.abs(s.t - 0.5), 0.07, 0.03) : 1;
      c = Math.max(c, line(s.d + 0.002 * Math.sin(s.t * 9 + k), w, aa) * gap);
    }
  // Forehead: narrow transverse stripes over the crown, converging on the brow.
  if (z > E[2] + 0.04 && x < E[0] + 0.01 && x > -0.02)
    for (let k = 0; k < 6; k++) {
      const xc = E[0] - 0.025 - k * 0.028 + 0.006 * (r(k + 10, 1) - 0.5);
      // Each stripe bows back toward the sides and stops short of the midline.
      const centre = xc - 1.8 * y * y - 0.02 * y;
      const inner = 0.006 + 0.012 * r(k + 10, 2);
      const outer = 0.05 + 0.03 * r(k + 10, 3);
      const span =
        smoothstep(inner - 0.004, inner + 0.004, y) * smoothstep(outer + 0.01, outer - 0.01, y);
      c = Math.max(c, line(Math.abs(x - centre), 0.0035 + 0.002 * r(k + 10, 4), aa) * span);
    }
  // Temple stripes between the eye and the ear, running up and back.
  if (y > 0.05 && z > E[2] - 0.005)
    for (let k = 0; k < 3; k++) {
      const a: Vec3 = [E[0] - 0.055 - k * 0.025, 0, E[2] + 0.005];
      const b: Vec3 = [E[0] - 0.08 - k * 0.03, 0, E[2] + 0.05 + 0.02 * r(k + 20, 1)];
      const s = segXZ(p, a, b);
      c = Math.max(c, line(s.d, 0.004 * (1 - 0.5 * s.t), aa));
    }
  // Tear line: from the inner corner of the eye down beside the bridge toward the whisker pad.
  if (y > 0.02 && y < 0.06 && x > E[0] - 0.01) {
    const a: Vec3 = [E[0] + 0.012, 0, E[2] - 0.01];
    const b: Vec3 = [E[0] + 0.04, 0, E[2] - 0.05];
    const s = segXZ(p, a, b);
    const across = Math.abs(y - (E[1] - 0.014 - 0.012 * s.t));
    c = Math.max(c, line(Math.hypot(s.d, across * 0.6), 0.004 * (1 - 0.5 * s.t), aa));
  }
  // Whisker spots: rows of dark follicle dots on the pads.
  if (lod < 2 && y > 0.02 && x > 0.25)
    for (const w of whiskerSpots())
      c = Math.max(c, line(Math.hypot(x - w[0], z - w[2]), 0.0022, aa) * 0.8);
  return c;
}

export function headPaint(lod: number): (p: Vec3, c: Vec3) => Vec3 {
  return (p, c) => {
    // Edit colours (nose, lips, lids) win over the coat.
    const painted = Math.abs(c[0] - C.orange[0]) + Math.abs(c[1] - C.orange[1]) > 0.05;
    const crown = smoothstep(E[2], E[2] + 0.07, p[2]);
    let col = mixRgb(C.orange, C.back, crown * 0.45);
    const w = faceWhite(p);
    col = mixRgb(col, C.orangePale, smoothstep(0, 0.5, w) * 0.5);
    col = mixRgb(col, C.white, smoothstep(0.3, 1, w));
    col = mixRgb(col, C.stripe, faceStripes(p, lod));
    return painted ? mixRgb(col, c, 0.85) : col;
  };
}
