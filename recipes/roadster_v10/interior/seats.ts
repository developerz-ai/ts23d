// Bucket seats: a sculpted cushion and backrest (lofted rounded sections), raised side bolsters,
// an integrated headrest with a hole, contrast-stitched seams, red centre inserts, seat rails and
// the adjuster bar; plus 4-point harness belts draped over the shell. Authored at the origin
// (H-point area, X forward), placed per seat by the caller.

import type { Lod, Mesh, Vec3 } from '@developerz.ai/ts23d';
import { loft, merge } from '@developerz.ai/ts23d';
import { C } from '../lib/colors.ts';
import { bx, rod, rotateAbout, shift, tube } from '../lib/geo.ts';

/** Rounded-rectangle ring in the plane ⟂ X at x, half-sizes (hy, hz), corner radius r. */
function rrect(
  x: number,
  cy: number,
  cz: number,
  hy: number,
  hz: number,
  r: number,
  per: number,
): Vec3[] {
  const out: Vec3[] = [];
  const corners: [number, number, number][] = [
    [hy - r, hz - r, 0],
    [-(hy - r), hz - r, Math.PI / 2],
    [-(hy - r), -(hz - r), Math.PI],
    [hy - r, -(hz - r), (3 * Math.PI) / 2],
  ];
  for (const [ky, kz, a0] of corners)
    for (let k = 0; k < per; k++) {
      const a = a0 + (k / Math.max(1, per - 1)) * (Math.PI / 2);
      out.push([x, cy + ky + r * Math.cos(a), cz + kz + r * Math.sin(a)]);
    }
  return out;
}

/** Cushion: a slab along X from the back (x0) to the front lip, thicker bolsters at ±y. */
function cushion(lod: Lod): Mesh {
  const per = lod === 0 ? 5 : 2;
  const n = lod === 0 ? 10 : 4;
  const rings: Vec3[][] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = -0.05 + 0.5 * t;
    // Thigh support rises toward the front; the front lip rolls down.
    const z = 0.08 + 0.05 * t * t - (t > 0.9 ? (t - 0.9) * 0.4 : 0);
    const hz = 0.055 + (t > 0.85 ? (-0.02 * (t - 0.85)) / 0.15 : 0);
    rings.push(rrect(x, 0, z, 0.22, hz, 0.035, per));
  }
  const parts: Mesh[] = [
    loft({ rings, color: C.leather, strip: 'leather', capStart: true, capEnd: true }),
  ];
  // Side bolsters on the cushion.
  for (const s of [1, -1]) {
    const b: Vec3[][] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = -0.04 + 0.42 * t;
      b.push(rrect(x, s * 0.19, 0.17 + 0.04 * t - 0.03 * t * t, 0.04, 0.04 - 0.01 * t, 0.03, per));
    }
    parts.push(
      loft({ rings: b, color: C.leather, strip: 'leather', capStart: true, capEnd: true }),
    );
  }
  if (lod === 0) {
    // Red centre insert, stitched.
    const ins: Vec3[][] = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      const x = 0.02 + 0.36 * t;
      ins.push(rrect(x, 0, 0.13 + 0.045 * t * t + 0.004, 0.13, 0.008, 0.006, 3));
    }
    parts.push(
      loft({ rings: ins, color: C.leatherAccent, strip: 'leather', capStart: true, capEnd: true }),
    );
    for (const y of [-0.13, 0.13])
      parts.push(
        tube(
          [
            [0.02, y, 0.142],
            [0.2, y, 0.152],
            [0.38, y, 0.19],
          ],
          0.003,
          C.stitch,
          'plastic',
          4,
          3,
          false,
        ),
      );
  }
  return merge(parts);
}

/** Backrest: sections along its own axis (tilted back ~24°), with bolsters and headrest. */
function backrest(lod: Lod): Mesh {
  const per = lod === 0 ? 5 : 2;
  const n = lod === 0 ? 14 : 5;
  const rings: Vec3[][] = [];
  const parts: Mesh[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const z = 0.1 + 0.72 * t;
    // Lumbar bulge, shoulder taper, headrest neck at t ≈ 0.72.
    const hy = t < 0.65 ? 0.23 - 0.02 * t : t < 0.75 ? 0.16 : 0.13;
    const hx = 0.07 + 0.02 * Math.sin(t * Math.PI) - (t > 0.7 ? 0.015 : 0);
    const ring = rrect(0, 0, 0, hy, hx, 0.035, per).map(
      ([, y, x2]): Vec3 => [x2 - 0.02 * Math.sin(t * Math.PI * 1.2), y, z],
    );
    rings.push(ring);
  }
  parts.push(loft({ rings, color: C.leather, strip: 'leather', capStart: true, capEnd: true }));
  // Side bolsters (wings) on the backrest.
  for (const s of [1, -1]) {
    const b: Vec3[][] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      if (t > 0.66) break;
      const z = 0.12 + 0.6 * t;
      b.push(
        rrect(0, 0, 0, 0.035, 0.065 - 0.015 * t, 0.03, per).map(
          ([, y, x2]): Vec3 => [x2 + 0.07, s * 0.205 + y, z],
        ),
      );
    }
    parts.push(
      loft({ rings: b, color: C.leather, strip: 'leather', capStart: true, capEnd: true }),
    );
  }
  if (lod === 0) {
    // Red insert and stitching; headrest emblem slot (dark).
    const ins: Vec3[][] = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      ins.push(
        rrect(0, 0, 0, 0.12, 0.006, 0.005, 3).map(
          ([, y, x2]): Vec3 => [x2 + 0.083 + 0.01 * Math.sin(t * Math.PI), y, 0.16 + 0.38 * t],
        ),
      );
    }
    parts.push(
      loft({ rings: ins, color: C.leatherAccent, strip: 'leather', capStart: true, capEnd: true }),
    );
    for (const y of [-0.12, 0.12])
      parts.push(
        tube(
          [
            [0.09, y, 0.16],
            [0.1, y, 0.35],
            [0.09, y, 0.54],
          ],
          0.003,
          C.stitch,
          'plastic',
          4,
          3,
          false,
        ),
      );
    parts.push(bx([0.05, -0.05, 0.7], [0.075, 0.05, 0.74], C.black, 'plastic'));
  }
  return rotateAbout(merge(parts), [0, 0, 0.1], [0, 1, 0], -0.42);
}

/** Rails, adjuster and the seat pan under the cushion. */
function frame(lod: Lod): Mesh {
  const parts: Mesh[] = [bx([-0.08, -0.2, 0.0], [0.42, 0.2, 0.035], C.ironDark, 'iron_cast')];
  if (lod < 2)
    for (const s of [1, -1])
      parts.push(
        bx([-0.15, s * 0.17 - 0.015, -0.03], [0.45, s * 0.17 + 0.015, 0.0], C.natural, 'aluminium'),
      );
  if (lod === 0)
    parts.push(rod([0.46, -0.12, 0.0], [0.46, 0.12, 0.0], 0.012, C.natural, 'chrome', 8));
  return merge(parts);
}

/** Harness: two shoulder straps over the backrest, lap belts, buckle. */
function harness(lod: Lod): Mesh {
  if (lod > 0) return merge([]);
  const parts: Mesh[] = [];
  const red = C.leatherAccent;
  for (const s of [1, -1]) {
    parts.push(
      tube(
        [
          [-0.42, s * 0.09, 0.82],
          [-0.22, s * 0.085, 0.78],
          [0.0, s * 0.08, 0.5],
          [0.16, s * 0.05, 0.25],
        ],
        0.006,
        red,
        'canvas',
        4,
        4,
        true,
      ),
    );
    parts.push(
      tube(
        [
          [0.0, s * 0.24, 0.12],
          [0.12, s * 0.18, 0.2],
          [0.2, s * 0.04, 0.22],
        ],
        0.006,
        red,
        'canvas',
        4,
        3,
        true,
      ),
    );
  }
  parts.push(bx([0.17, -0.035, 0.2], [0.23, 0.035, 0.235], C.natural, 'chrome', 0.006));
  return merge(parts);
}

/** One complete seat at the origin (left-right symmetric). */
export function seat(lod: Lod): Mesh {
  if (lod === 2) {
    // Far: a cushion block and a reclined back block read as a bucket seat.
    return merge([
      bx([-0.05, -0.23, 0.03], [0.45, 0.23, 0.17], C.leather, 'leather'),
      rotateAbout(
        bx([-0.08, -0.23, 0.1], [0.06, 0.23, 0.82], C.leather, 'leather'),
        [0, 0, 0.1],
        [0, 1, 0],
        -0.42,
      ),
    ]);
  }
  const parts = [cushion(lod), backrest(lod), frame(lod)];
  parts.push(harness(lod));
  return merge(parts);
}

/** Seat placed with its H-point area at `at`. */
export const seatAt = (lod: Lod, at: Vec3): Mesh => shift(seat(lod), at);
