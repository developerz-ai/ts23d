// Forged alloy wheel, original design: five split (twin) spokes on a deep concave face, a
// stepped lip, five lug nuts on a 114.3 mm circle (the class's common 5 × 4.5 in pattern), a
// centre cap with a hexagon emblem and the valve stem. Local frame like the tyre: axle along Y,
// outer face toward +Y, centred at the origin. `width` is the rim's barrel width.

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

export interface RimSize {
  /** Bead seat radius. */
  readonly r: number;
  /** Barrel width (bead seat to bead seat). */
  readonly width: number;
}

const SPOKES = 5;
const PCD = 0.1143 / 2;

/** Outer barrel + flanges + inner barrel, as one lathe (profile: radius, y). */
function barrel(s: RimSize, segments: number): Mesh {
  const hw = s.width / 2;
  const r = s.r;
  const prof: Vec2[] = [
    [r - 0.035, -hw + 0.01], // inner (brake-side) lip turn
    [r + 0.016, -hw - 0.008],
    [r + 0.019, -hw - 0.002],
    [r + 0.006, -hw + 0.008],
    [r, -hw + 0.02], // inner bead seat
    [r - 0.012, -hw * 0.35], // drop centre
    [r - 0.012, hw * 0.05],
    [r - 0.002, hw * 0.45],
    [r, hw - 0.02], // outer bead seat
    [r + 0.007, hw - 0.007],
    [r + 0.02, hw + 0.003], // outer lip
    [r + 0.017, hw + 0.012],
    [r - 0.006, hw + 0.012], // polished lip face
    [r - 0.016, hw + 0.004], // step into the face
  ];
  return lathe({
    profile: prof,
    segments,
    axis: 'y',
    color: C.natural,
    strip: 'aluminium',
    caps: false,
    creaseDeg: 35,
  });
}

/** Inner barrel face (the dark inside you see through the spokes). */
function innerBarrel(s: RimSize, segments: number): Mesh {
  const hw = s.width / 2;
  return lathe({
    profile: [
      [s.r - 0.016, hw + 0.004],
      [s.r - 0.02, hw - 0.03],
      [s.r - 0.026, -hw * 0.3],
      [s.r - 0.036, -hw + 0.012],
      [s.r - 0.035, -hw + 0.01],
    ],
    segments,
    axis: 'y',
    color: C.alloyCast,
    strip: 'aluminium',
    caps: false,
  });
}

/** Face depth (y of the spoke's front surface) at radius ρ: concave toward the hub. */
const faceY = (s: RimSize, rho: number): number => {
  const hw = s.width / 2;
  const t = Math.min(1, Math.max(0, (rho - 0.075) / (s.r - 0.016 - 0.075)));
  // Hub sits 42 mm inboard of the lip; the spoke curves out to the lip.
  return hw - 0.042 + 0.046 * (1 - (1 - t) ** 1.8);
};

/** One spoke arm: a loft of rounded-trapezoid sections from the hub to the lip at angle 0. */
function spokeArm(s: RimSize, lod: Lod, offset: number): Mesh {
  const stations = lod === 0 ? 14 : 6;
  const sec = lod === 0 ? 3 : 1; // points per corner round
  const rings: Vec3[][] = [];
  const r0 = 0.07;
  const r1 = s.r - 0.012;
  for (let i = 0; i <= stations; i++) {
    const t = i / stations;
    const rho = r0 + (r1 - r0) * t;
    // Twin spokes diverge from a shared root: lateral offset grows with radius.
    const lat = offset * (0.006 + 0.032 * t ** 0.8);
    const w = 0.024 - 0.008 * t + (t > 0.85 ? (t - 0.85) * 0.06 : 0); // flare into the lip
    const depth = 0.03 - 0.012 * t;
    const yF = faceY(s, rho);
    const corners: Vec2[] = [
      [-w / 2, 0],
      [w / 2, 0],
      [w / 2 - 0.004, -depth],
      [-w / 2 + 0.004, -depth],
    ];
    const ring: Vec3[] = [];
    // Rounded rectangle: walk the 4 corners with `sec` points each (chamfer-rounded top edge).
    for (let k = 0; k < 4; k++) {
      const a = corners[k] ?? [0, 0];
      const prev = corners[(k + 3) % 4] ?? a;
      const next = corners[(k + 1) % 4] ?? a;
      const rr = k < 2 ? 0.0045 : 0.002;
      for (let q = 0; q < sec; q++) {
        const f = sec === 1 ? 0.5 : q / (sec - 1);
        const toPrev: Vec2 = [prev[0] - a[0], prev[1] - a[1]];
        const toNext: Vec2 = [next[0] - a[0], next[1] - a[1]];
        const lp = Math.hypot(...toPrev) || 1;
        const ln = Math.hypot(...toNext) || 1;
        const pa: Vec2 = [a[0] + (toPrev[0] / lp) * rr, a[1] + (toPrev[1] / lp) * rr];
        const pb: Vec2 = [a[0] + (toNext[0] / ln) * rr, a[1] + (toNext[1] / ln) * rr];
        // Quadratic Bézier through the corner.
        const x = (1 - f) ** 2 * pa[0] + 2 * (1 - f) * f * a[0] + f * f * pb[0];
        const yy = (1 - f) ** 2 * pa[1] + 2 * (1 - f) * f * a[1] + f * f * pb[1];
        // Section x = tangential (z here at angle 0), y = axial depth below the face.
        ring.push([rho, yF + yy, x + lat]);
      }
    }
    rings.push(ring);
  }
  return loft({
    rings,
    color: C.natural,
    strip: 'aluminium',
    capStart: true,
    capEnd: true,
    uv: 'row',
  });
}

/** The hub disc the spokes root into, with lug seats. */
function hub(s: RimSize, segments: number): Mesh {
  const y = faceY(s, 0.07);
  return lathe({
    profile: [
      [0.034, y + 0.006],
      [0.05, y + 0.004],
      [0.078, y + 0.001],
      [0.084, y - 0.012],
      [0.08, y - 0.05],
      [0.06, y - 0.07],
    ],
    segments,
    axis: 'y',
    color: C.natural,
    strip: 'aluminium',
    caps: false,
  });
}

/** Five lug nuts (hex, chrome) + centre cap with a raised hexagon emblem + valve stem. */
function hardware(s: RimSize, lod: Lod): Mesh {
  const y = faceY(s, 0.07);
  const parts: Mesh[] = [];
  if (lod < 2) {
    const nut = lathe({
      profile: [
        [0.0, y + 0.03],
        [0.007, y + 0.03],
        [0.0105, y + 0.026],
        [0.0105, y + 0.004],
        [0.012, y],
        [0.0, y],
      ],
      segments: 6,
      faceted: true,
      axis: 'y',
      color: C.natural,
      strip: 'chrome',
    });
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + Math.PI / 5;
      parts.push(shift(nut, [PCD * Math.cos(a), 0, PCD * Math.sin(a)]));
    }
  }
  parts.push(
    lathe({
      profile: [
        [0, y + 0.02],
        [0.022, y + 0.019],
        [0.031, y + 0.012],
        [0.034, y + 0.004],
        [0.034, y - 0.004],
      ],
      segments: lod === 0 ? 32 : 12,
      axis: 'y',
      color: C.black,
      strip: 'plastic',
      caps: false,
    }),
  );
  if (lod === 0) {
    // Hexagon emblem: a low faceted boss in brushed metal.
    parts.push(
      lathe({
        profile: [
          [0, y + 0.0215],
          [0.013, y + 0.0215],
          [0.0145, y + 0.0195],
        ],
        segments: 6,
        faceted: true,
        axis: 'y',
        color: C.badge,
        strip: 'chrome',
        caps: false,
      }),
    );
    // Valve stem at the lip.
    const stem = cylinder({
      radius: 0.004,
      length: 0.022,
      segments: 6,
      axis: 'y',
      color: C.black,
      strip: 'rubber',
    });
    parts.push(shift(stem, [0, s.width / 2 - 0.02, s.r - 0.006]));
  }
  return merge(parts);
}

export function rim(lod: Lod, s: RimSize): Mesh {
  const segs = [96, 24, 10][lod] ?? 10;
  if (lod === 2) {
    // Far: a dished face disc with the spoke pattern implied by a darker hub; no barrel detail.
    return lathe({
      profile: [
        [0, s.width / 2 - 0.02],
        [0.06, s.width / 2 - 0.03],
        [s.r + 0.015, s.width / 2 + 0.005],
        [s.r + 0.015, s.width / 2 - 0.01],
      ],
      segments: segs,
      axis: 'y',
      color: C.natural,
      strip: 'aluminium',
      caps: false,
    });
  }
  const parts: Mesh[] = [barrel(s, segs), hub(s, segs), innerBarrel(s, segs)];
  const spoke = merge([-1, 1].map((o) => spokeArm(s, lod, o)));
  for (let k = 0; k < SPOKES; k++)
    parts.push(rotateAbout(spoke, [0, 0, 0], [0, 1, 0], (k / SPOKES) * Math.PI * 2 + Math.PI / 2));
  parts.push(hardware(s, lod));
  return merge(parts);
}
