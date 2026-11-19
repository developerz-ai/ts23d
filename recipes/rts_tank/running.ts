// Running gear for the Saltmarch light tank: five road wheels, a front idler and a toothed rear
// sprocket per side (all spinning about Y), and a track belt laid round them: the belt is the
// convex hull of the wheel circles offset by half a link, so it hugs every wheel at every LOD.
// LOD0 places individual links with grousers and spins every wheel on its own pivot; LOD1 (the
// strategy camera's LOD) coarse links and the wheels as one static part a side; LOD2 18 slabs in
// an open belt with every wheel a two-polygon disc (dark tyre, muddy slate disc). Below LOD0 the
// wheel pivots stay (empty), so engine code driving them never breaks. Each belt is a `tread`
// motion part whose pitch is loop length ÷ link count, so the run clip moves it at every LOD.

import {
  box,
  cylinder,
  type Lod,
  lathe,
  type Mesh,
  merge,
  type PartOptions,
  place,
  planar,
  prism,
  tread,
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

/** Length of a closed polyline, metres. */
export function perimeter(path: readonly Vec2[]): number {
  let total = 0;
  for (let i = 0; i < path.length; i++) {
    const a = path[i] ?? [0, 0];
    const b = path[(i + 1) % path.length] ?? a;
    total += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return total;
}

/** `n` evenly spaced points (and tangent angles) round a closed polyline. */
export function resample(path: readonly Vec2[], n: number): { p: Vec2; angle: number }[] {
  const seg = path.map((a, i) => {
    const b = path[(i + 1) % path.length] ?? a;
    return Math.hypot(b[0] - a[0], b[1] - a[1]);
  });
  const total = perimeter(path);
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

/** Links round the belt per LOD: every link, coarse links, and 18 far slabs. */
export const LINKS = [96, 44, 18] as const;

/**
 * The length after which the belt repeats: loop length ÷ link count, measured along the centre
 * line (the stations `resample` lays the links on are exactly this far apart along it).
 */
export function beltPitch(lod: Lod, path: readonly Vec2[] = beltPath()): number {
  return perimeter(path) / LINKS[lod];
}

/**
 * One link (local: along +X, outer face +Z) with a grouser bar at LOD0. The far slab is longer
 * than its pitch and open at both ends, so the slabs close round the end wheels, and open on the
 * wheel side (the wheel discs stand in front of it): 6 triangles a slab.
 */
function link(lod: Lod, len: number): Mesh {
  if (lod === 2)
    return box({
      size: [len * 1.15, TRACK_W, LINK_T],
      at: [0, 0, -LINK_T / 2],
      color: IRON,
      strip: 'iron_rust',
      omit: ['front', 'back', 'bottom'],
    });
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
  const segments = SEG(lod, 28, 14, 6);
  // The dished disc out to the rim seat (both faces), and the tyre as its own closed band round
  // it: nothing of the tyre lies over the dish, so the disc's paint and mud are what shows.
  const seat = r * 0.8;
  const disc = lathe({
    profile: [
      [seat, -w * 0.92],
      [r * 0.7, -w * 0.82],
      [r * 0.3, -w * 0.7],
      [0.001, -w * 0.7],
      [0.001, w * 0.7],
      [r * 0.3, w * 0.7],
      [r * 0.7, w * 0.82],
      [seat, w * 0.92],
    ],
    segments,
    color: SLATE,
    axis: 'y',
  });
  const tyre = lathe({
    profile: [
      [seat, -w],
      [r * 0.96, -w],
      [r, -w * 0.86],
      [r, w * 0.86],
      [r * 0.96, w],
      [seat, w],
      [seat, -w],
    ],
    segments,
    color: RUBBER,
    axis: 'y',
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

/**
 * A far wheel on the left side (+Y face): the tyre as an eight-sided polygon and the disc as a
 * six-sided one 5 mm proud of it (10 triangles). `toward` is the angle of the corner that touches
 * the belt (straight down for a road wheel, fore or aft for idler and sprocket); `s` mirrors it.
 */
function farWheel(r: number, toward: number, s: number): Mesh {
  const gon = (n: number, rr: number, y: number, color: Vec3): Mesh =>
    planar({
      points: Array.from({ length: n }, (_, i): Vec3 => {
        const a = toward - s * (i / n) * Math.PI * 2;
        return [Math.cos(a) * rr, s * y, Math.sin(a) * rr];
      }),
      color,
    });
  return merge([gon(8, r, 0, RUBBER), gon(6, r * 0.78, 0.005, SLATE)]);
}

/** Registers a part (the tank's Kit: materials and wear happen there). */
export type Add = (name: string, m: Mesh | null, opts?: PartOptions) => void;

/** The hubs run on stub axles into the lower hull (their bearings): allowed to pass through it. */
const AXLE = ['hull'] as const;

/** Far LOD: the wheel discs' face sits this far inside the track's outer edge. */
const FAR_INSET = 0.015;

/**
 * `finishLink` puts ONE track link on its material and wears it before it is laid round the loop:
 * every link then looks the same, so the run clip can put each in its neighbour's place unseen
 * (the `treads` gate checks colour and UV one pitch on). Wear laid over the placed belt would stay
 * where it is while the links run through it, and jump at every wrap. `finishWheel` does the same
 * for one wheel about its own axle (`r` its rim radius; `far`: a two-polygon disc).
 */
export function runningGear(
  add: Add,
  lod: Lod,
  finishLink: (link: Mesh) => Mesh,
  finishWheel: (wheel: Mesh, r: number, far: boolean) => Mesh,
): void {
  const belt = beltPath();
  for (const [side, s] of [
    ['l', 1],
    ['r', -1],
  ] as const) {
    const y = s * TRACK_Y;
    // +rps about +Y rolls the wheel tops forward (+X): the tank drives forward and the belt's
    // ground run moves back (−X). All three rims run at the same 1.70 m/s.
    const spin = (rps: number) => ({ kind: 'spin' as const, axis: [0, 1, 0] as Vec3, rps });
    // The seven wheels of a side: mesh (finished about its own axle), axle position, spin.
    const gear: readonly (readonly [string, Mesh, Vec3, number])[] = [
      ...ROAD_X.map(
        (x, i) =>
          [
            `wheel_${side}_${i}`,
            lod === 2
              ? finishWheel(farWheel(ROAD_R, -Math.PI / 2, s), ROAD_R, true)
              : finishWheel(wheel(lod, ROAD_R, TRACK_W * 0.8), ROAD_R, false),
            [x, y, ROAD_Z] as Vec3,
            0.9,
          ] as const,
      ),
      [
        `idler_${side}`,
        lod === 2
          ? finishWheel(farWheel(IDLER.r, 0, s), IDLER.r, true)
          : finishWheel(wheel(lod, IDLER.r, TRACK_W * 0.7), IDLER.r, false),
        [IDLER.x, y, IDLER.z],
        1.04,
      ],
      [
        `sprocket_${side}`,
        lod === 2
          ? finishWheel(farWheel(SPROCKET.r, Math.PI, s), SPROCKET.r, true)
          : finishWheel(sprocket(lod, SPROCKET.r), SPROCKET.r, false),
        [SPROCKET.x, y, SPROCKET.z],
        0.97,
      ],
    ];
    // LOD0 spins each wheel on its own pivot (one draw each: the close-up LOD). Below it the
    // pivots stay empty and the wheels are one static part a side, drawn with the hull: 14 fewer
    // draws on the LODs a strategy camera shows by the hundred. Far: each disc stands on the
    // belt's outer edge, in front of the lower hull, so the side reads as wheels in an open belt.
    const out = s * (TRACK_W / 2 - FAR_INSET);
    for (const [name, m, at, rps] of gear)
      add(name, lod === 0 ? m : null, { at, motion: spin(rps), clearOf: AXLE });
    if (lod > 0)
      add(
        `wheels_${side}`,
        merge(
          gear.map(([, m, at]) => place(m, { at: [at[0], at[1] + (lod === 2 ? out : 0), at[2]] })),
        ),
      );
    const pitch = beltPitch(lod, belt);
    const one = finishLink(link(lod, pitch));
    // The belt runs counter-clockwise in XZ: pitch −angle lays local +X along the tangent, and a
    // half roll turns local +Z (the grouser face) outward, away from the wheels. Stations are one
    // pitch apart along the line at every LOD, so the belt repeats and the run clip can move it.
    const links = resample(belt, LINKS[lod]).map(({ p, angle }) =>
      place(one, { at: [p[0], y, p[1]], pitch: -angle, roll: Math.PI }),
    );
    add(`track_${side}`, merge(links), { motion: tread(belt, y, pitch) });
  }
}
