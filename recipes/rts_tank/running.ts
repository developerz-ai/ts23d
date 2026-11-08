// Running gear for the Saltmarch light tank: five road wheels, a front idler and a toothed rear
// sprocket per side (all spinning about Y), and a track belt laid round them: the belt is the
// convex hull of the wheel circles offset by half a link, so it hugs every wheel at every LOD.
// LOD0 places individual links with guide horns; LOD1 coarse links; LOD2 a solid side slab and
// keeps the wheel pivots (empty) so engine code driving them never breaks.

import {
  box,
  cylinder,
  type Lod,
  lathe,
  type Mesh,
  merge,
  type PartOptions,
  place,
  prism,
  type Vec2,
  type Vec3,
} from '@developerz.ai/ts23d';
import { BRASS, IRON, RUBBER, SEG, SLATE } from '../_lib/rts/style.ts';

export const TRACK_Y = 1.225;
export const TRACK_W = 0.46;
export const LINK_T = 0.08;
export const ROAD_R = 0.3;
export const ROAD_Z = LINK_T + ROAD_R;
export const ROAD_X = [-1.6, -0.8, 0, 0.8, 1.6] as const;
export const IDLER = { x: 2.25, z: 0.56, r: 0.26 } as const;
export const SPROCKET = { x: -2.25, z: 0.56, r: 0.28 } as const;

interface Circle {
  readonly x: number;
  readonly z: number;
  readonly r: number;
}

const CIRCLES: readonly Circle[] = [
  { x: ROAD_X[0], z: ROAD_Z, r: ROAD_R },
  { x: ROAD_X[4], z: ROAD_Z, r: ROAD_R },
  IDLER,
  SPROCKET,
];

/** Convex hull of the wheel circles grown by `grow` (half a link: the track centreline), CCW. */
export function beltPath(grow = LINK_T / 2): Vec2[] {
  const pts: Vec2[] = [];
  for (const c of CIRCLES)
    for (let k = 0; k < 120; k++) {
      const a = (k / 120) * Math.PI * 2;
      pts.push([c.x + Math.cos(a) * (c.r + grow), c.z + Math.sin(a) * (c.r + grow)]);
    }
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Vec2, a: Vec2, b: Vec2): number =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Vec2[] = [];
  for (const p of pts) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2] ?? p, lower[lower.length - 1] ?? p, p) <= 0
    )
      lower.pop();
    lower.push(p);
  }
  const upper: Vec2[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i] ?? [0, 0];
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2] ?? p, upper[upper.length - 1] ?? p, p) <= 0
    )
      upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** `n` evenly spaced points (and tangent angles) round a closed polyline. */
export function resample(path: readonly Vec2[], n: number): { p: Vec2; angle: number }[] {
  const seg: number[] = [];
  let total = 0;
  for (let i = 0; i < path.length; i++) {
    const a = path[i] ?? [0, 0];
    const b = path[(i + 1) % path.length] ?? a;
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    seg.push(d);
    total += d;
  }
  const out: { p: Vec2; angle: number }[] = [];
  let i = 0;
  let walked = 0;
  for (let k = 0; k < n; k++) {
    const want = (k / n) * total;
    while (walked + (seg[i] ?? 0) < want && i < path.length - 1) walked += seg[i++] ?? 0;
    const a = path[i] ?? [0, 0];
    const b = path[(i + 1) % path.length] ?? a;
    const t = (want - walked) / Math.max(seg[i] ?? 1, 1e-9);
    out.push({
      p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
      angle: Math.atan2(b[1] - a[1], b[0] - a[0]),
    });
  }
  return out;
}

/** One link (local: along +X, outer face +Z) with a grouser bar at LOD0. */
function link(lod: Lod, len: number): Mesh {
  const plate = box({
    size: [len * 0.92, TRACK_W, LINK_T],
    at: [0, 0, -LINK_T / 2],
    color: IRON,
    strip: 'iron_rust',
  });
  if (lod > 0) return plate;
  const grouser = box({
    size: [0.04, TRACK_W * 0.95, 0.025],
    at: [0, 0, LINK_T / 2 - 0.005],
    color: IRON,
  });
  return merge([plate, grouser]);
}

/** A road wheel (about local Y): rubber tyre, dished slate disc, brass hub (LOD0 bolts). */
function wheel(lod: Lod, r: number, width: number): Mesh {
  const w = width / 2;
  const profile: Vec2[] = [
    [0.001, -w * 0.7],
    [r * 0.3, -w * 0.7],
    [r * 0.72, -w * 0.85],
    [r * 0.82, -w],
    [r, -w * 0.9],
    [r, w * 0.9],
    [r * 0.82, w],
    [r * 0.72, w * 0.85],
    [r * 0.3, w * 0.7],
    [0.001, w * 0.7],
  ];
  const disc = lathe({ profile, segments: SEG(lod, 28, 14, 6), color: SLATE, axis: 'y' });
  const tyre = cylinder({
    radius: r * 1.0,
    length: width * 0.86,
    segments: SEG(lod, 28, 14, 6),
    axis: 'y',
    color: RUBBER,
  });
  const parts: Mesh[] = [disc, tyre];
  if (lod < 2)
    parts.push(
      cylinder({
        radius: r * 0.22,
        length: width * 1.6,
        segments: SEG(lod, 12, 8, 4),
        axis: 'y',
        color: BRASS,
      }),
    );
  if (lod === 0)
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      for (const s of [-1, 1])
        parts.push(
          cylinder({
            radius: 0.018,
            length: 0.03,
            segments: 6,
            axis: 'y',
            at: [Math.cos(a) * r * 0.45, s * w * 0.72, Math.sin(a) * r * 0.45],
            color: IRON,
          }),
        );
    }
  return merge(parts);
}

/** The rear drive sprocket: a toothed disc pair (LOD < 2). */
function sprocket(lod: Lod, r: number): Mesh {
  const teeth = SEG(lod, 14, 10, 6);
  const ring: Vec2[] = [];
  for (let k = 0; k < teeth * 2; k++) {
    const a = (k / (teeth * 2)) * Math.PI * 2;
    const rr = k % 2 === 0 ? r : r * 0.86;
    ring.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  const plate = prism({ profile: ring, depth: 0.08, plane: 'xz', color: IRON });
  return merge([
    place(plate, { at: [0, -0.13, 0] }),
    place(plate, { at: [0, 0.13, 0] }),
    cylinder({
      radius: r * 0.55,
      length: TRACK_W * 0.95,
      segments: SEG(lod, 16, 8, 4),
      axis: 'y',
      color: SLATE,
    }),
    cylinder({
      radius: r * 0.2,
      length: TRACK_W * 1.3,
      segments: SEG(lod, 10, 6, 4),
      axis: 'y',
      color: BRASS,
    }),
  ]);
}

/** Registers a part (the tank's Kit: materials and wear happen there). */
export type Add = (name: string, m: Mesh | null, opts?: PartOptions) => void;

/** The hubs run on stub axles into the lower hull (their bearings): allowed to pass through it. */
const AXLE = ['hull'] as const;

export function runningGear(add: Add, lod: Lod): void {
  const belt = beltPath();
  for (const [side, s] of [
    ['l', 1],
    ['r', -1],
  ] as const) {
    const y = s * TRACK_Y;
    const spin = (rps: number) => ({ kind: 'spin' as const, axis: [0, 1, 0] as Vec3, rps });
    ROAD_X.forEach((x, i) => {
      add(`wheel_${side}_${i}`, lod < 2 ? wheel(lod, ROAD_R, TRACK_W * 0.8) : null, {
        at: [x, y, ROAD_Z],
        motion: spin(-0.9),
        clearOf: AXLE,
      });
    });
    add(`idler_${side}`, lod < 2 ? wheel(lod, IDLER.r, TRACK_W * 0.7) : null, {
      at: [IDLER.x, y, IDLER.z],
      motion: spin(-1.04),
      clearOf: AXLE,
    });
    add(`sprocket_${side}`, lod < 2 ? sprocket(lod, SPROCKET.r) : null, {
      at: [SPROCKET.x, y, SPROCKET.z],
      motion: spin(-0.97),
      clearOf: AXLE,
    });
    if (lod === 2) {
      // Far: the track and wheels are one solid side block in the belt's outline.
      add(
        `track_${side}`,
        place(
          prism({
            profile: beltPath(LINK_T)
              .filter((_, k) => k % 6 === 0)
              .map(([px, pz]): Vec2 => [px, pz]),
            depth: TRACK_W,
            plane: 'xz',
            color: IRON,
          }),
          { at: [0, y, 0] },
        ),
      );
      continue;
    }
    const n = lod === 0 ? 96 : 44;
    const pts = resample(belt, n);
    const len =
      (pts.length > 1
        ? Math.hypot(
            (pts[1]?.p[0] ?? 0) - (pts[0]?.p[0] ?? 0),
            (pts[1]?.p[1] ?? 0) - (pts[0]?.p[1] ?? 0),
          )
        : 0.15) * 1.0;
    const one = link(lod, len);
    // The belt runs counter-clockwise in XZ: pitch −angle lays local +X along the tangent, and a
    // half roll turns local +Z (the grouser face) outward, away from the wheels.
    const links = pts.map(({ p, angle }) =>
      place(one, { at: [p[0], y, p[1]], pitch: -angle, roll: Math.PI }),
    );
    add(`track_${side}`, merge(links));
  }
}
