// Cooling: an aluminium cross-flow radiator raked back in the nose (end tanks, fin core, filler
// neck), twin electric fans in a moulded shroud (seven swept blades each, motor hubs, struts),
// upper and lower radiator hoses with clamps to the water pump and thermostat housing, the
// coolant expansion tank, and the front-of-engine accessory drive: crank damper, water pump,
// alternator, A/C compressor and power-steering pump on one serpentine belt.

import type { Lod, Mesh, Vec2, Vec3 } from '@developerz.ai/ts23d';
import { lathe, merge, planar } from '@developerz.ai/ts23d';
import { X_CRANK_FRONT, Z_CRANK } from '../dims.ts';
import { C } from '../lib/colors.ts';
import { bx, obox, rod, rotateAbout, shift, tube } from '../lib/geo.ts';

export const RAD = { x: 1.76, y0: -0.4, y1: 0.4, z0: 0.22, z1: 0.56, rake: 0.3 } as const;

/** A point on the radiator's front face at (y, z), following the rake (top leans back). */
const radAt = (y: number, z: number, dx = 0): Vec3 => [
  RAD.x - (z - RAD.z0) * Math.tan(RAD.rake) + dx,
  y,
  z,
];

function radiator(lod: Lod): Mesh {
  const parts: Mesh[] = [];
  const th = 0.045;
  // Core: a raked slab between the tanks; LOD0 adds the fin lines.
  const coreY0 = RAD.y0 + 0.05;
  const coreY1 = RAD.y1 - 0.05;
  parts.push(
    rotateAbout(
      bx([RAD.x - th, coreY0, RAD.z0], [RAD.x, coreY1, RAD.z1], C.radiator, 'iron_cast'),
      [RAD.x, 0, RAD.z0],
      [0, 1, 0],
      -RAD.rake,
    ),
  );
  for (const y of [RAD.y0, RAD.y1 - 0.05])
    parts.push(
      rotateAbout(
        bx(
          [RAD.x - th - 0.005, y, RAD.z0 - 0.01],
          [RAD.x + 0.005, y + 0.05, RAD.z1 + 0.01],
          C.black,
          'plastic',
          lod === 0 ? 0.006 : 0,
        ),
        [RAD.x, 0, RAD.z0],
        [0, 1, 0],
        -RAD.rake,
      ),
    );
  if (lod === 0) {
    const fins: Mesh[] = [];
    for (let k = 0; k <= 70; k++) {
      const y = coreY0 + ((coreY1 - coreY0) * k) / 70;
      fins.push(
        bx(
          [RAD.x + 0.0005, y - 0.0012, RAD.z0 + 0.005],
          [RAD.x + 0.0025, y + 0.0012, RAD.z1 - 0.005],
          C.alloyCast,
          'aluminium',
        ),
      );
    }
    for (let k = 0; k <= 22; k++) {
      const z = RAD.z0 + 0.01 + ((RAD.z1 - RAD.z0 - 0.02) * k) / 22;
      fins.push(
        bx(
          [RAD.x + 0.0026, coreY0, z - 0.0015],
          [RAD.x + 0.004, coreY1, z + 0.0015],
          C.radiator,
          'iron_cast',
        ),
      );
    }
    parts.push(rotateAbout(merge(fins), [RAD.x, 0, RAD.z0], [0, 1, 0], -RAD.rake));
    // Filler neck and cap on the left tank top.
    const neck = radAt(RAD.y1 - 0.025, RAD.z1 + 0.01, -0.02);
    parts.push(rod(neck, [neck[0], neck[1], neck[2] + 0.04], 0.03, C.natural, 'aluminium', 12));
    parts.push(
      rod(
        [neck[0], neck[1], neck[2] + 0.04],
        [neck[0], neck[1], neck[2] + 0.055],
        0.045,
        C.natural,
        'chrome',
        12,
      ),
    );
  }
  return merge(parts);
}

function fanBlades(lod: Lod, r: number): Mesh {
  const blades: Mesh[] = [];
  const n = 7;
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * Math.PI * 2;
    const pts: Vec3[] = [];
    const steps = lod === 0 ? 5 : 2;
    // Swept, twisted blade as a strip of quads from hub to tip.
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const rr = 0.05 + (r - 0.06) * t;
      const sweep = 0.35 * t * t;
      const chord = 0.28 - 0.08 * t;
      const pitch = 0.5 - 0.25 * t;
      for (const c of [-0.5, 0.5]) {
        const a = a0 + sweep + c * chord;
        pts.push([c * Math.sin(pitch) * 0.04, rr * Math.cos(a), rr * Math.sin(a)]);
      }
    }
    for (let i = 0; i < steps; i++) {
      const p = (j: number): Vec3 => pts[j] ?? [0, 0, 0];
      blades.push(
        planar({
          points: [p(2 * i), p(2 * i + 1), p(2 * i + 3), p(2 * i + 2)],
          color: C.black,
          strip: 'plastic',
          doubleSided: true,
        }),
      );
    }
  }
  return merge(blades);
}

function fans(lod: Lod): Mesh {
  const parts: Mesh[] = [];
  const x = RAD.x - 0.08;
  const r = 0.17;
  // Shroud plate with two round openings (approximated by a frame of boxes round each ring).
  parts.push(
    rotateAbout(
      bx(
        [x - 0.01, RAD.y0 + 0.02, RAD.z0 + 0.01],
        [x, RAD.y1 - 0.02, RAD.z1 - 0.01],
        C.black,
        'plastic',
      ),
      [RAD.x, 0, RAD.z0],
      [0, 1, 0],
      -RAD.rake,
    ),
  );
  for (const y of [-0.19, 0.19]) {
    const c: Vec3 = [x - 0.06 - 0.12 * Math.tan(RAD.rake), y, (RAD.z0 + RAD.z1) / 2];
    const segs = lod === 0 ? 40 : 14;
    parts.push(
      shift(
        lathe({
          profile: [
            [r + 0.008, 0.05],
            [r + 0.008, -0.01],
            [r + 0.02, -0.02],
          ],
          segments: segs,
          axis: 'x',
          color: C.black,
          strip: 'plastic',
          caps: false,
        }),
        c,
      ),
    );
    parts.push(shift(rod([-0.04, 0, 0], [0.02, 0, 0], 0.09, C.ironDark, 'plastic', segs / 2), c));
    if (lod < 2) parts.push(shift(fanBlades(lod, r), c));
    // Motor struts.
    if (lod === 0)
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + 0.4;
        parts.push(
          rod(
            [c[0] - 0.045, c[1], c[2]],
            [c[0] - 0.045, c[1] + (r + 0.01) * Math.cos(a), c[2] + (r + 0.01) * Math.sin(a)],
            0.008,
            C.black,
            'plastic',
            5,
          ),
        );
      }
  }
  return merge(parts);
}

interface Pulley {
  readonly y: number;
  readonly z: number;
  readonly r: number;
}

/** Convex hull of the pulley circles in the (y, z) plane: the serpentine belt's path. */
function beltPath(ps: readonly Pulley[]): Vec2[] {
  const pts: Vec2[] = [];
  for (const p of ps)
    for (let k = 0; k < 48; k++) {
      const a = (k / 48) * Math.PI * 2;
      pts.push([p.y + (p.r + 0.004) * Math.cos(a), p.z + (p.r + 0.004) * Math.sin(a)]);
    }
  const s = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Vec2, a: Vec2, b: Vec2): number =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Vec2[] = [];
  for (const p of s) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2] ?? p, lower[lower.length - 1] ?? p, p) <= 0
    )
      lower.pop();
    lower.push(p);
  }
  const upper: Vec2[] = [];
  for (const p of [...s].reverse()) {
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2] ?? p, upper[upper.length - 1] ?? p, p) <= 0
    )
      upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function accessoryDrive(lod: Lod): Mesh {
  const x = X_CRANK_FRONT + 0.075;
  const ps: Pulley[] = [
    { y: 0, z: Z_CRANK, r: 0.095 }, // crank damper
    { y: 0, z: Z_CRANK + 0.2, r: 0.07 }, // water pump
    { y: 0.2, z: Z_CRANK + 0.26, r: 0.04 }, // alternator
    { y: -0.21, z: Z_CRANK + 0.2, r: 0.065 }, // power steering
    { y: 0.2, z: Z_CRANK + 0.02, r: 0.06 }, // A/C compressor
    { y: -0.13, z: Z_CRANK + 0.37, r: 0.035 }, // idler
  ];
  const segs = lod === 0 ? 28 : 12;
  const parts: Mesh[] = [];
  for (const p of ps)
    parts.push(
      shift(
        lathe({
          profile: [
            [0, -0.015],
            [p.r, -0.015],
            [p.r - 0.006, -0.011],
            [p.r - 0.006, 0.011],
            [p.r, 0.015],
            [0, 0.015],
          ],
          segments: segs,
          axis: 'x',
          color: C.ironDark,
          strip: 'iron_cast',
          creaseDeg: 40,
        }),
        [x, p.y, p.z],
      ),
    );
  if (lod < 2) {
    const path = beltPath(ps);
    const ring: Vec3[] = [...path, path[0] ?? [0, 0]].map(([y, z]): Vec3 => [x, y, z]);
    parts.push(tube(ring, 0.022, C.hoseBlack, 'rubber', 4, 1, false));
  }
  // Accessory bodies behind their pulleys.
  const alt = ps[2];
  const ac = ps[4];
  const psp = ps[3];
  if (alt)
    parts.push(
      shift(rod([0, 0, 0], [-0.17, 0, 0], 0.13, C.alloyCast, 'aluminium', segs), [
        x - 0.02,
        alt.y + 0.02,
        alt.z,
      ]),
    );
  if (ac)
    parts.push(
      shift(rod([0, 0, 0], [-0.2, 0, 0], 0.12, C.alloyCast, 'aluminium', segs), [
        x - 0.02,
        ac.y + 0.02,
        ac.z - 0.01,
      ]),
    );
  if (psp) {
    parts.push(
      shift(rod([0, 0, 0], [-0.12, 0, 0], 0.1, C.alloyCast, 'aluminium', segs), [
        x - 0.02,
        psp.y,
        psp.z,
      ]),
    );
    parts.push(
      shift(rod([0, 0, 0], [0, 0, 0.06], 0.07, C.black, 'plastic', segs), [
        x - 0.08,
        psp.y - 0.02,
        psp.z + 0.04,
      ]),
    );
  }
  if (lod === 0 && alt) {
    // Alternator cooling slots and the terminal.
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      parts.push(
        obox(
          [x - 0.1, alt.y + 0.02 + 0.066 * Math.cos(a), alt.z + 0.066 * Math.sin(a)],
          [0.06, 0.004, 0.004],
          C.ironDark,
          'plastic',
        ),
      );
    }
  }
  return merge(parts);
}

function hoses(lod: Lod): Mesh {
  const segs = lod === 0 ? 12 : 6;
  const wp: Vec3 = [X_CRANK_FRONT + 0.05, 0.0, Z_CRANK + 0.28];
  const upperIn = radAt(RAD.y1 - 0.025, RAD.z1 - 0.06, -0.05);
  const lowerOut = radAt(RAD.y0 + 0.025, RAD.z0 + 0.05, -0.05);
  const parts: Mesh[] = [
    tube(
      [
        wp,
        [wp[0] + 0.12, 0.1, wp[2] + 0.02],
        [upperIn[0] - 0.2, upperIn[1] - 0.06, upperIn[2] - 0.01],
        upperIn,
      ],
      0.045,
      C.hoseBlack,
      'rubber',
      segs,
      4,
    ),
    tube(
      [
        [X_CRANK_FRONT + 0.03, -0.08, Z_CRANK + 0.14],
        [X_CRANK_FRONT + 0.15, -0.2, 0.36],
        [lowerOut[0] - 0.18, lowerOut[1] + 0.05, 0.3],
        lowerOut,
      ],
      0.045,
      C.hoseBlack,
      'rubber',
      segs,
      4,
    ),
  ];
  if (lod === 0)
    for (const p of [upperIn, lowerOut, wp])
      parts.push(
        rod([p[0] - 0.012, p[1], p[2]], [p[0] + 0.012, p[1], p[2]], 0.056, C.natural, 'chrome', 10),
      );
  // Expansion tank (translucent-looking white plastic) with its blue cap, right front.
  const tank: Vec3 = [0.5, -0.45, 0.6];
  parts.push(
    bx(
      tank,
      [tank[0] + 0.16, tank[1] + 0.1, tank[2] + 0.12],
      C.reservoir,
      'plastic',
      lod === 0 ? 0.015 : 0,
    ),
  );
  parts.push(
    rod(
      [tank[0] + 0.05, tank[1] + 0.05, tank[2] + 0.12],
      [tank[0] + 0.05, tank[1] + 0.05, tank[2] + 0.145],
      0.045,
      C.capBlue,
      'plastic',
      14,
    ),
  );
  if (lod === 0)
    parts.push(
      tube(
        [
          [tank[0] + 0.1, tank[1] + 0.05, tank[2]],
          [tank[0] + 0.12, tank[1] + 0.1, tank[2] - 0.08],
          [lowerOut[0] - 0.3, lowerOut[1] + 0.12, 0.35],
        ],
        0.014,
        C.hoseBlack,
        'rubber',
        6,
        3,
      ),
    );
  return merge(parts);
}

export function cooling(lod: Lod): Mesh {
  const parts = [radiator(lod), fans(lod), accessoryDrive(lod)];
  if (lod < 2) parts.push(hoses(lod));
  return merge(parts);
}
