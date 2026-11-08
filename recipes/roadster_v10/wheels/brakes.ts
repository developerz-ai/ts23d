// Brakes, local wheel frame (axle along Y, outer face toward +Y, centre at the origin):
// a two-piece vented disc — cast-iron friction rings with internal vanes, three staggered rows of
// cross-drilled holes, an aluminium hat bolted on — that spins with the wheel, and an opposed
// multi-piston monoblock caliper (6-pot front, 4-pot rear) that does NOT spin: it hangs off the
// upright, wrapped round the disc's trailing edge.

import {
  cylinder,
  type Lod,
  lathe,
  loft,
  type Mesh,
  merge,
  type Vec2,
  type Vec3,
} from '@developerz.ai/ts23d';
import { C } from '../lib/colors.ts';
import { rotateAbout, shift } from '../lib/geo.ts';

export interface DiscSize {
  readonly r: number;
  readonly inner: number;
  readonly thick: number;
  /** y of the disc's centre plane (inboard of the hub face). */
  readonly y: number;
}

/** Vented, cross-drilled disc with its hat; spins with the wheel. */
export function disc(lod: Lod, d: DiscSize): Mesh {
  const segs = [72, 32, 12][lod] ?? 12;
  const plate = 0.009;
  const parts: Mesh[] = [];
  const ringProfile = (y0: number, y1: number): Vec2[] => [
    [d.inner, y0],
    [d.r - 0.001, y0],
    [d.r, y0 + 0.001],
    [d.r, y1 - 0.001],
    [d.r - 0.001, y1],
    [d.inner, y1],
    [d.inner, y0],
  ];
  if (lod === 2) {
    parts.push(
      lathe({
        profile: ringProfile(d.y - d.thick / 2, d.y + d.thick / 2),
        segments: segs,
        axis: 'y',
        color: C.disc,
        strip: 'iron_cast',
      }),
    );
  } else {
    // Two friction plates with the vent gap between.
    parts.push(
      lathe({
        profile: ringProfile(d.y - d.thick / 2, d.y - d.thick / 2 + plate),
        segments: segs,
        axis: 'y',
        color: C.disc,
        strip: 'iron_cast',
      }),
      lathe({
        profile: ringProfile(d.y + d.thick / 2 - plate, d.y + d.thick / 2),
        segments: segs,
        axis: 'y',
        color: C.disc,
        strip: 'iron_cast',
      }),
    );
    // Curved vanes.
    const vanes = lod === 0 ? 36 : 18;
    const vaneH = d.thick - 2 * plate;
    for (let k = 0; k < vanes; k++) {
      const a0 = (k / vanes) * Math.PI * 2;
      const pts: Vec3[] = [];
      const n = 4;
      for (let i = 0; i <= n; i++) {
        const rr = d.inner + 0.004 + ((d.r - d.inner - 0.008) * i) / n;
        const a = a0 + 0.35 * (i / n) ** 1.2;
        pts.push([rr * Math.cos(a), d.y, rr * Math.sin(a)]);
      }
      const rings = pts.map((p): Vec3[] => {
        const t: Vec3 = [-p[2], 0, p[0]];
        const l = Math.hypot(t[0], t[2]) || 1;
        const w = 0.0028;
        const tx = (t[0] / l) * w;
        const tz = (t[2] / l) * w;
        return [
          [p[0] - tx, d.y - vaneH / 2, p[2] - tz],
          [p[0] + tx, d.y - vaneH / 2, p[2] + tz],
          [p[0] + tx, d.y + vaneH / 2, p[2] + tz],
          [p[0] - tx, d.y + vaneH / 2, p[2] - tz],
        ];
      });
      parts.push(
        loft({
          rings,
          color: hexMul(C.disc, 0.45),
          strip: 'iron_cast',
          capStart: true,
          capEnd: true,
        }),
      );
    }
    if (lod === 0) {
      // Cross-drilled holes: dark plugs flush with both faces, three staggered rows.
      const hole = cylinder({
        radius: 0.0032,
        length: d.thick + 0.0008,
        segments: 8,
        axis: 'y',
        color: [0.02, 0.02, 0.02],
        strip: 'iron_cast',
      });
      const rows = [0.32, 0.55, 0.78];
      const per = 24;
      for (let k = 0; k < per; k++)
        rows.forEach((f, j) => {
          const a = ((k + j / rows.length) / per) * Math.PI * 2;
          const rr = d.inner + (d.r - d.inner) * f;
          parts.push(shift(hole, [rr * Math.cos(a), d.y - d.thick / 2 - 0.0004, rr * Math.sin(a)]));
        });
      // Machined face rings (subtle darker bands where the pads run).
      for (const yy of [d.y - d.thick / 2 - 0.0002, d.y + d.thick / 2 + 0.0002]) {
        parts.push(
          lathe({
            profile: [
              [d.r - 0.006, yy],
              [d.r - 0.004, yy],
            ],
            segments: segs,
            axis: 'y',
            color: hexMul(C.disc, 0.7),
            strip: 'iron_cast',
            caps: false,
          }),
        );
      }
    }
  }
  // Hat: aluminium bell from the friction ring's inner edge out to the hub face.
  const hy = d.y + d.thick / 2;
  parts.push(
    lathe({
      profile: [
        [d.inner + 0.006, d.y - 0.004],
        [d.inner - 0.004, d.y + 0.002],
        [d.inner - 0.012, hy + 0.012],
        [0.095, hy + 0.04],
        [0.035, hy + 0.044],
        [0.035, hy + 0.034],
        [0.088, hy + 0.03],
        [d.inner - 0.02, hy + 0.004],
      ],
      segments: segs,
      axis: 'y',
      color: C.natural,
      strip: 'aluminium',
      caps: false,
    }),
  );
  if (lod === 0) {
    // Floating-disc bobbins between hat and ring.
    const bob = cylinder({
      radius: 0.006,
      length: 0.012,
      segments: 8,
      axis: 'y',
      color: C.natural,
      strip: 'chrome',
    });
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      parts.push(
        shift(bob, [(d.inner - 0.004) * Math.cos(a), d.y - 0.004, (d.inner - 0.004) * Math.sin(a)]),
      );
    }
  }
  return merge(parts);
}

const hexMul = (c: Vec3, k: number): Vec3 => [c[0] * k, c[1] * k, c[2] * k];

export interface CaliperOptions {
  readonly disc: DiscSize;
  readonly pistons: 4 | 6;
  /** Angle about the axle where the caliper centres (0 = +X, π/2 = up). */
  readonly at: number;
  readonly color: Vec3;
}

/** Monoblock caliper straddling the disc edge (does not spin). */
export function caliper(lod: Lod, o: CaliperOptions): Mesh {
  const d = o.disc;
  const span = o.pistons === 6 ? 0.82 : 0.66; // radians of arc covered
  const outR = d.r + 0.016;
  const inR = d.r - 0.052;
  const halfW = d.thick / 2 + 0.026;
  const steps = lod === 0 ? 18 : lod === 1 ? 8 : 3;
  // Section (radial, axial) of the caliper body: a C round the disc, open toward the hub.
  const sec: Vec2[] =
    lod === 2
      ? [
          [inR, -halfW],
          [outR, -halfW],
          [outR, halfW],
          [inR, halfW],
        ]
      : [
          [inR, -halfW + 0.004],
          [inR + 0.006, -halfW],
          [outR - 0.008, -halfW],
          [outR, -halfW + 0.01],
          [outR + 0.002, 0],
          [outR, halfW - 0.01],
          [outR - 0.008, halfW],
          [inR + 0.006, halfW],
          [inR, halfW - 0.004],
          [inR, d.thick / 2 + 0.004], // inner face of the outer half (gap over the disc)
          [d.r - 0.004, d.thick / 2 + 0.004],
          [d.r - 0.004, -d.thick / 2 - 0.004],
          [inR, -d.thick / 2 - 0.004],
        ];
  const rings: Vec3[][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = o.at - span / 2 + span * t;
    // Ends taper (rounded caliper ends).
    const k = 1 - 0.12 * (2 * t - 1) ** 6;
    rings.push(
      sec.map(([r, y]): Vec3 => {
        const rr = d.r + (r - d.r) * k;
        return [rr * Math.cos(a), d.y + y * k, rr * Math.sin(a)];
      }),
    );
  }
  const parts: Mesh[] = [
    loft({ rings, color: o.color, strip: 'plastic', capStart: true, capEnd: true }),
  ];
  if (lod === 0) {
    // Bridge bolts across the top, bleed nipples, lettering pad (raised "6"/"4" plate), and
    // piston bores read as dark circles on the outer face.
    const bolt = cylinder({
      radius: 0.0055,
      length: 2 * halfW + 0.006,
      segments: 6,
      axis: 'y',
      color: C.natural,
      strip: 'chrome',
    });
    for (const f of [-0.3, 0.3]) {
      const a = o.at + span * f;
      parts.push(
        shift(bolt, [
          (outR - 0.004) * Math.cos(a),
          d.y - halfW - 0.003,
          (outR - 0.004) * Math.sin(a),
        ]),
      );
    }
    const nip = cylinder({
      radius: 0.003,
      length: 0.012,
      segments: 6,
      axis: 'y',
      color: C.natural,
      strip: 'brass',
    });
    const an = o.at + span * 0.42;
    parts.push(
      shift(nip, [(outR - 0.01) * Math.cos(an), d.y + halfW, (outR - 0.01) * Math.sin(an)]),
    );
    const per = o.pistons / 2;
    for (let p = 0; p < per; p++) {
      const a = o.at - span * 0.3 + (span * 0.6 * p) / Math.max(1, per - 1);
      const c: Vec3 = [
        (d.r - 0.022) * Math.cos(a),
        d.y + halfW + 0.0004,
        (d.r - 0.022) * Math.sin(a),
      ];
      const disk = lathe({
        profile: [
          [0, 0],
          [0.012, 0],
        ],
        segments: 16,
        axis: 'y',
        color: hexMul(o.color, 0.55),
        strip: 'plastic',
        caps: false,
      });
      parts.push(shift(disk, c));
    }
    // Outer face logo plate: a raised hexagon (original emblem), white.
    const plate = lathe({
      profile: [
        [0, 0.0016],
        [0.011, 0.0016],
        [0.012, 0],
      ],
      segments: 6,
      faceted: true,
      axis: 'y',
      color: [0.9, 0.9, 0.9],
      strip: 'plastic',
      caps: false,
    });
    parts.push(
      shift(plate, [outR * 0.93 * Math.cos(o.at), d.y + halfW, outR * 0.93 * Math.sin(o.at)]),
    );
  }
  return merge(parts);
}

/** Upright-side caliper mount bracket (static, joins caliper to the upright). */
export function caliperBracket(o: CaliperOptions): Mesh {
  const d = o.disc;
  const a = o.at;
  const r0 = d.r - 0.05;
  const pts: Vec3[][] = [];
  for (const rr of [0.09, r0]) {
    const c: Vec3 = [rr * Math.cos(a), d.y - d.thick / 2 - 0.03, rr * Math.sin(a)];
    const t: Vec3 = [-Math.sin(a), 0, Math.cos(a)];
    const w = 0.04;
    pts.push([
      [c[0] - t[0] * w, c[1] - 0.006, c[2] - t[2] * w],
      [c[0] + t[0] * w, c[1] - 0.006, c[2] + t[2] * w],
      [c[0] + t[0] * w, c[1] + 0.006, c[2] + t[2] * w],
      [c[0] - t[0] * w, c[1] + 0.006, c[2] - t[2] * w],
    ]);
  }
  return loft({ rings: pts, color: C.ironDark, strip: 'iron_cast', capStart: true, capEnd: true });
}

export const rotateWheel = (m: Mesh, angle: number): Mesh =>
  rotateAbout(m, [0, 0, 0], [0, 1, 0], angle);
