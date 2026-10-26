// Tiger I, mid production (Henschel, Oct–Nov 1943, Eastern Front): factory Zimmerit, low cast
// cupola with 7 periscopes, single centred Bosch light, spare links on the turret sides, S-mine
// dischargers; no Feifel filters, no turret smoke dischargers. Real: hull 6.316 m (8.45 m with gun)
// × 3.56 m (battle tracks) × 3.00 m; 8 stations at 515 mm, 800 mm wheels, 725 mm track.

import {
  applyAffine,
  beam,
  box,
  type Check,
  clear,
  cylinder,
  defineAsset,
  frame,
  grime,
  hex,
  type Lod,
  lathe,
  type Mesh,
  MeshBuilder,
  merge,
  noOverlap,
  place,
  planar,
  prism,
  type Rng,
  symmetric,
  touches,
  translate,
  type Vec2,
  type Vec3,
} from '@developerz-ai/ts23d';

const dunkelgelb = hex('#b89d63');
const rotbraun = hex('#6e3b2a');
const olivgruen = hex('#55603a');
const paintDark = hex('#8a744a');
const rubber = hex('#262422');
const steel = hex('#4d4943');
const trackSteel = hex('#4a4038');
const black = hex('#161616');
const white = hex('#e8e6dc');
const wood = hex('#7a5a3a');
const rust = hex('#5a3a2a');

// Running gear (metres; hull frame +X front, Z up). Station pitch 515 mm (tiger1.info).
const TRACK_Y = 1.4175;
const TRACK_W = 0.725;
const LINK_T = 0.06;
const WHEEL_R = 0.4;
const WHEEL_Z = 0.46;
const STATIONS = Array.from({ length: 8 }, (_, i) => 1.8025 - i * 0.515);
const SPROCKET = { x: 2.62, z: 0.64, r: 0.4 };
const IDLER = { x: -2.68, z: 0.66, r: 0.36 };
/** Guide horns sit on the centre of the original 520 mm track, 102.5 mm inboard. */
const HORN_Y = -0.1025;
const HULL_FRONT = 3.158;
const HULL_REAR = -3.158;
const DECK = 1.8;
const PANNIER_Z = 1.16;
const SIDE_Y = 1.61;
/** The turret sits on a ring collar above the deck, so deck stowage clears its traverse. */
const RING = 0.08;
/** Plate angles from vertical (Jentz armour table via armorsite; refs/tiger_1.md). */
const TAN9 = Math.tan((9 * Math.PI) / 180);
const TAN25 = Math.tan((25 * Math.PI) / 180);
const TAN81 = Math.tan((81 * Math.PI) / 180);
const BELLY = 0.47;
const REAR_LOW = 0.95;
/** Rear plate: 80 mm at 9°, foot at the hull's rearmost point, top leaning in toward the deck. */
const rearX = (z: number): number => HULL_REAR + (z - REAR_LOW) * TAN9;
const NOSE_TOP: Vec2 = [HULL_FRONT, 1.2];
const NOSE_FOOT: Vec2 = [HULL_FRONT - 0.3 * TAN25, 0.9];
const GLACIS_TOP: Vec2 = [HULL_FRONT - 0.1 * TAN81, 1.3];
/** Driver's front plate: 100 mm at 9°. */
const frontX = (z: number): number => GLACIS_TOP[0] - (z - GLACIS_TOP[1]) * TAN9;
const TURRET_AT: Vec3 = [0.15, 0, DECK + RING];

type Circle = { readonly x: number; readonly z: number; readonly r: number };
type Station = { readonly p: Vec2; readonly pitch: number; readonly len: number };

// ---------------------------------------------------------------- track belt

/** Clockwise (x right, z up) convex hull of points: walking it, outward is on the left. */
function hullCw(pts: Vec2[]): Vec2[] {
  const s = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o: Vec2, a: Vec2, b: Vec2): number =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: Vec2[]): Vec2[] => {
    const h: Vec2[] = [];
    for (const p of list) {
      while (h.length >= 2 && cr(h[h.length - 2] as Vec2, h[h.length - 1] as Vec2, p) <= 0) h.pop();
      h.push(p);
    }
    h.pop();
    return h;
  };
  return [...half(s), ...half([...s].reverse())].reverse();
}

/** Evenly re-sample a closed polyline into n stations with their pitch (for place()). */
function resample(poly: readonly Vec2[], n: number): Station[] {
  const seg = poly.map((a, i) => {
    const b = poly[(i + 1) % poly.length] as Vec2;
    return Math.hypot(b[0] - a[0], b[1] - a[1]);
  });
  const total = seg.reduce((s, l) => s + l, 0);
  const out: Station[] = [];
  let i = 0;
  let acc = 0;
  for (let k = 0; k < n; k++) {
    const d = (k / n) * total;
    while (acc + (seg[i] ?? 0) < d && i < poly.length - 1) acc += seg[i++] ?? 0;
    const a = poly[i] as Vec2;
    const b = poly[(i + 1) % poly.length] as Vec2;
    const t = (d - acc) / (seg[i] || 1);
    out.push({
      p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
      pitch: Math.atan2(-(b[1] - a[1]), b[0] - a[0]),
      len: total / n,
    });
  }
  return out;
}

/** The track's centre line: a belt around sprocket, idler and road wheels, sagging on top. */
function beltLine(wheels: readonly Circle[], ends: readonly Circle[], sag: number): Vec2[] {
  const off = LINK_T / 2;
  const pts: Vec2[] = [];
  for (const c of [...wheels, ...ends])
    for (let i = 0; i < 72; i++) {
      const t = (i / 72) * Math.PI * 2;
      pts.push([c.x + (c.r + off) * Math.cos(t), c.z + (c.r + off) * Math.sin(t)]);
    }
  const dense = resample(hullCw(pts), 600);
  const x0 = Math.min(...ends.map((c) => c.x));
  const x1 = Math.max(...ends.map((c) => c.x));
  const env = (x: number): number =>
    Math.max(
      0,
      ...wheels.map((w) =>
        Math.abs(x - w.x) < w.r + off ? w.z + Math.sqrt((w.r + off) ** 2 - (x - w.x) ** 2) : 0,
      ),
    );
  return dense.map(({ p, pitch }) => {
    const topRun = Math.cos(pitch) > 0.8 && p[1] > WHEEL_Z;
    if (!topRun || p[0] <= x0 || p[0] >= x1) return p;
    const drop = sag * Math.sin((Math.PI * (p[0] - x0)) / (x1 - x0));
    return [p[0], Math.max(env(p[0]), p[1] - drop)];
  });
}

/** One cast Kgs 63/725 link in local space: X along the run, Y across, Z outward. */
function trackLink(pitch: number): Mesh {
  return merge([
    box({
      size: [pitch * 0.86, TRACK_W, LINK_T * 0.6],
      at: [0, 0, -LINK_T * 0.3],
      color: trackSteel,
    }),
    box({ size: [0.035, TRACK_W * 0.94, LINK_T * 0.45], at: [0, 0, 0], color: trackSteel }),
    box({
      size: [pitch * 0.6, 0.025, 0.08],
      at: [0, HORN_Y + 0.025, -LINK_T * 0.3 - 0.08],
      color: steel,
    }),
    box({
      size: [pitch * 0.6, 0.025, 0.08],
      at: [0, HORN_Y - 0.025, -LINK_T * 0.3 - 0.08],
      color: steel,
    }),
  ]);
}

function trackMesh(lod: Lod, line: readonly Vec2[], y: number): Mesh {
  if (lod === 2) {
    // Outer skin of the belt: push the centre line out by half a link along its normal.
    const ring = resample(line, 22).map(
      (s): Vec2 => [
        s.p[0] + (Math.sin(s.pitch) * LINK_T) / 2,
        s.p[1] + (Math.cos(s.pitch) * LINK_T) / 2,
      ],
    );
    return translate(prism({ profile: ring, depth: TRACK_W, plane: 'xz', color: trackSteel }), [
      0,
      y,
      0,
    ]);
  }
  const perimeter = resample(line, 1)[0]?.len ?? 1;
  const stations = resample(line, Math.round(perimeter / (lod === 0 ? 0.13 : 0.32)));
  const len = stations[0]?.len ?? 0.13;
  const unit =
    lod === 0
      ? trackLink(len)
      : box({ size: [len * 1.04, TRACK_W, LINK_T], at: [0, 0, -LINK_T / 2], color: trackSteel });
  return merge(stations.map((s) => place(unit, { at: [s.p[0], y, s.p[1]], pitch: s.pitch })));
}

// ---------------------------------------------------------------- wheels

/** One steel disc with a solid rubber tyre, centred on `y` (axis Y), dished toward ±Y faces. */
function disc(lod: Lod, r: number, w: number, y: number, bolts: boolean): Mesh {
  const segs = [20, 12, 8][lod] ?? 8;
  const h = w / 2;
  const tyre = lathe({
    profile: [
      [r - 0.05, y - h],
      [r - 0.008, y - h],
      [r, y - h + 0.012],
      [r, y + h - 0.012],
      [r - 0.008, y + h],
      [r - 0.05, y + h],
    ],
    segments: segs,
    axis: 'y',
    color: rubber,
  });
  const face: Vec2[] = [
    [r - 0.05, h - 0.004],
    [r * 0.75, h - 0.025],
    [r * 0.38, h - 0.03],
    [r * 0.26, h + 0.006],
    [r * 0.12, h + 0.01],
    [0, h + 0.01],
  ];
  const back = face.map(([fr, fz]) => [fr, -fz] as Vec2).reverse();
  const parts = [
    tyre,
    lathe({
      profile: [...back, ...face].map(([fr, fz]) => [fr, fz + y] as Vec2),
      segments: segs,
      axis: 'y',
      color: dunkelgelb,
    }),
  ];
  if (bolts) {
    const bolt = box({ size: [0.03, 0.012, 0.03], at: [0, 0, -0.015], color: paintDark });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      parts.push(
        place(bolt, { at: [Math.cos(a) * r * 0.2, y + h + 0.004, Math.sin(a) * r * 0.2] }),
      );
    }
  }
  return merge(parts);
}

/**
 * Schachtellaufwerk station, left side (+Y outboard). Type A: a centre pair straddling the guide
 * horns plus the outermost wheel; type B: an inner wheel plus an outer one. Layers never overlap
 * axially, so neighbouring stations' wheels interleave without touching.
 */
function station(lod: Lod, typeA: boolean): Mesh {
  if (typeA) {
    const outer = disc(lod, WHEEL_R, 0.09, 0.27, lod === 0);
    if (lod > 0) return outer;
    return merge([
      outer,
      disc(lod, WHEEL_R, 0.08, HORN_Y - 0.083, false),
      disc(lod, WHEEL_R, 0.08, HORN_Y + 0.083, false),
    ]);
  }
  const outer = disc(lod, WHEEL_R, 0.09, 0.12, lod === 0);
  return lod > 0 ? outer : merge([outer, disc(lod, WHEEL_R, 0.08, -0.3, false)]);
}

/** Front drive sprocket: two 18-tooth rings straddling the horns, on a dished hub. */
function sprocket(lod: Lod, r: number): Mesh {
  const segs = [24, 12, 8][lod] ?? 8;
  const ring = (y: number): Mesh =>
    lathe({
      profile: [
        [0.12, y - 0.03],
        [r - 0.07, y - 0.03],
        [r - 0.06, y],
        [r - 0.07, y + 0.03],
        [0.12, y + 0.03],
      ],
      segments: segs,
      axis: 'y',
      color: paintDark,
    });
  const hub = lathe({
    profile: [
      [0.2, -0.32],
      [0.22, -0.28],
      [0.22, 0.08],
      [0.2, 0.12],
      [0.1, 0.15],
      [0, 0.15],
    ],
    segments: segs,
    axis: 'y',
    color: dunkelgelb,
  });
  const parts = [ring(HORN_Y + 0.12), ring(HORN_Y - 0.12), hub];
  if (lod === 0) {
    const tooth = box({ size: [0.07, 0.06, 0.1], color: steel });
    for (const y of [HORN_Y + 0.12, HORN_Y - 0.12])
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        parts.push(
          place(tooth, { at: [Math.sin(a) * (r - 0.08), y, Math.cos(a) * (r - 0.08)], pitch: a }),
        );
      }
    const bolt = box({ size: [0.03, 0.02, 0.03], at: [0, 0, -0.015], color: steel });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      parts.push(place(bolt, { at: [Math.cos(a) * 0.15, 0.16, Math.sin(a) * 0.15] }));
    }
  }
  return merge(parts);
}

/** Rear idler: a dished double disc straddling the horns. */
const idler = (lod: Lod): Mesh =>
  merge([
    disc(lod, IDLER.r, 0.1, HORN_Y + 0.13, lod === 0),
    disc(lod, IDLER.r, 0.1, HORN_Y - 0.13, false),
  ]);

// ---------------------------------------------------------------- finish passes

/** Mud in world space for a part authored around its own pivot. */
const muddy = (m: Mesh, at: Vec3 = [0, 0, 0], strength = 0.5): Mesh =>
  translate(grime(translate(m, at), { ground: 1.3, groundStrength: strength }), [
    -at[0],
    -at[1],
    -at[2],
  ]);

interface Blob {
  readonly c: Vec3;
  readonly r: Vec3;
  readonly color: Vec3;
}

/** Three-tone camouflage: soft ellipsoids seeded from the rng, sprayed over the paint only. */
function camoBlobs(rng: Rng): Blob[] {
  const out: Blob[] = [];
  for (let i = 0; i < 22; i++) {
    out.push({
      c: [rng.range(-3.4, 5.2), rng.range(-1.9, 1.9), rng.range(0.4, 3.0)],
      r: [rng.range(0.25, 0.7), rng.range(0.35, 1.2), rng.range(0.2, 0.45)],
      color: i % 2 === 0 ? olivgruen : rotbraun,
    });
  }
  return out;
}

/** Split long edges until every triangle is under `max` metres, so vertex-colour camo has room. */
function tessellate(m: Mesh, max: number): Mesh {
  const b = new MeshBuilder();
  type V = { p: Vec3; n: Vec3; uv: Vec2; color: Vec3 };
  const read = (i: number): V => ({
    p: [m.positions[i * 3] ?? 0, m.positions[i * 3 + 1] ?? 0, m.positions[i * 3 + 2] ?? 0],
    n: [m.normals[i * 3] ?? 0, m.normals[i * 3 + 1] ?? 0, m.normals[i * 3 + 2] ?? 1],
    uv: [m.uvs[i * 2] ?? 0, m.uvs[i * 2 + 1] ?? 0],
    color: [m.colors[i * 3] ?? 0, m.colors[i * 3 + 1] ?? 0, m.colors[i * 3 + 2] ?? 0],
  });
  const mid = (x: V, y: V): V => ({
    p: [(x.p[0] + y.p[0]) / 2, (x.p[1] + y.p[1]) / 2, (x.p[2] + y.p[2]) / 2],
    n: x.n,
    uv: [(x.uv[0] + y.uv[0]) / 2, (x.uv[1] + y.uv[1]) / 2],
    color: x.color,
  });
  const d = (x: V, y: V): number => Math.hypot(x.p[0] - y.p[0], x.p[1] - y.p[1], x.p[2] - y.p[2]);
  const split = (x: V, y: V, z: V): void => {
    const [e0, e1, e2] = [d(x, y), d(y, z), d(z, x)];
    const top = Math.max(e0, e1, e2);
    if (top <= max) {
      b.tri(b.vertex(x), b.vertex(y), b.vertex(z));
      return;
    }
    if (top === e0) {
      const q = mid(x, y);
      split(x, q, z);
      split(q, y, z);
    } else if (top === e1) {
      const q = mid(y, z);
      split(x, y, q);
      split(x, q, z);
    } else {
      const q = mid(z, x);
      split(x, y, q);
      split(q, y, z);
    }
  };
  for (let t = 0; t < m.indices.length; t += 3)
    split(read(m.indices[t] ?? 0), read(m.indices[t + 1] ?? 0), read(m.indices[t + 2] ?? 0));
  return b.build();
}

function camo(m: Mesh, blobs: readonly Blob[], at: Vec3 = [0, 0, 0]): Mesh {
  const colors = new Float32Array(m.colors);
  const isPaint = (i: number): boolean =>
    [0, 1, 2].every((k) => Math.abs((m.colors[i * 3 + k] ?? 0) - (dunkelgelb[k] ?? 0)) < 1e-4);
  for (let i = 0; i < m.positions.length / 3; i++) {
    if (!isPaint(i)) continue;
    const p: Vec3 = [
      (m.positions[i * 3] ?? 0) + at[0],
      (m.positions[i * 3 + 1] ?? 0) + at[1],
      (m.positions[i * 3 + 2] ?? 0) + at[2],
    ];
    for (const b of blobs) {
      const d = Math.hypot(
        (p[0] - b.c[0]) / b.r[0],
        (p[1] - b.c[1]) / b.r[1],
        (p[2] - b.c[2]) / b.r[2],
      );
      if (d >= 1) continue;
      const w = d < 0.75 ? 1 : 1 - (d - 0.75) / 0.25;
      for (let k = 0; k < 3; k++)
        colors[i * 3 + k] = (colors[i * 3 + k] ?? 0) * (1 - w) + (b.color[k] ?? 0) * w;
    }
  }
  return { ...m, colors };
}

type WallPoint = { readonly p: Vec2; readonly n: Vec2 };

/**
 * Factory Zimmerit: bands of vertical ridges along a wall given in plan (point + outward normal).
 * LOD0 geometry only; becomes a trim-sheet strip once the material generator lands.
 */
function zimmerit(
  path: readonly WallPoint[],
  z0: number,
  z1: number,
  lean = 0,
  pitch = 0.045,
): Mesh {
  const band = 0.16;
  const ridges: Mesh[] = [];
  const bands = Math.max(1, Math.floor((z1 - z0) / band));
  const bh = (z1 - z0) / bands;
  const ridge = box({
    size: [0.012, 0.016, bh - 0.025],
    at: [0.006, 0, 0],
    color: dunkelgelb,
    omit: ['back', 'bottom'],
  });
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i] as WallPoint;
    const b = path[i + 1] as WallPoint;
    const len = Math.hypot(b.p[0] - a.p[0], b.p[1] - a.p[1]);
    const count = Math.max(1, Math.floor(len / pitch));
    for (let k = 0; k < count; k++) {
      const t = (k + 0.5) / count;
      const x = a.p[0] + (b.p[0] - a.p[0]) * t;
      const y = a.p[1] + (b.p[1] - a.p[1]) * t;
      const yaw = Math.atan2(a.n[1] + (b.n[1] - a.n[1]) * t, a.n[0] + (b.n[0] - a.n[0]) * t);
      for (let j = 0; j < bands; j++) {
        // Sloped plates lean inward by `lean` m per m of height; ridges tilt with them.
        const zb = z0 + j * bh + 0.0125;
        const inward = lean * (zb - z0);
        ridges.push(
          place(ridge, {
            at: [x - Math.cos(yaw) * inward, y - Math.sin(yaw) * inward, zb],
            yaw,
            pitch: -Math.atan(lean),
          }),
        );
      }
    }
  }
  return merge(ridges);
}

const straight = (a: Vec2, b: Vec2, n: Vec2): WallPoint[] => [
  { p: a, n },
  { p: b, n },
];

// ---------------------------------------------------------------- small details

function cable(points: readonly Vec3[], d: number, color: Vec3): Mesh {
  return merge(
    points
      .slice(1)
      .map((to, i) => beam({ from: points[i] as Vec3, to, width: d, segments: 5, color })),
  );
}

/** A cable eye: a small ring (lathe of a circular section) facing ±Y. */
const eye = (at: Vec3): Mesh =>
  lathe({
    profile: Array.from({ length: 7 }, (_, i): Vec2 => {
      const a = (i / 6) * Math.PI * 2;
      return [0.05 + 0.014 * Math.cos(a), 0.014 * Math.sin(a)];
    }),
    segments: 10,
    axis: 'y',
    at,
    color: steel,
  });

/** A flat polygon on a side wall facing ±Y: (u, v) = (along the wall toward the front, up). */
function sideDecal(
  poly: readonly Vec2[],
  s: number,
  x: number,
  y: number,
  z: number,
  c: Vec3,
): Mesh {
  // CCW as seen from outside: for +Y walls U = -X, for -Y walls U = +X.
  return planar({ points: poly.map(([u, v]): Vec3 => [x - s * u, y, z + v]), color: c });
}

const cross = (l: number, t: number): Vec2[] => [
  [l, -t],
  [l, t],
  [t, t],
  [t, l],
  [-t, l],
  [-t, t],
  [-l, t],
  [-l, -t],
  [-t, -t],
  [-t, -l],
  [t, -l],
  [t, -t],
];

/** Seven-segment digit as rectangles (u right, v up), cell h/2 wide × h tall. */
function digitRects(d: number, h: number): Vec2[][] {
  const seg = [
    [0, 2, 1, 2],
    [1, 1, 1, 2],
    [1, 0, 1, 1],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
    [0, 1, 0, 2],
    [0, 1, 1, 1],
  ];
  const on = ['1111110', '0110000', '1101101', '1111001'][d] ?? '1111110';
  const t = 0.045 * h;
  const out: Vec2[][] = [];
  seg.forEach(([x0 = 0, y0 = 0, x1 = 0, y1 = 0], i) => {
    if (on[i] !== '1') return;
    const [ua, va] = [Math.min(x0, x1) * h * 0.5, Math.min(y0, y1) * h * 0.5];
    const [ub, vb] = [Math.max(x0, x1) * h * 0.5, Math.max(y0, y1) * h * 0.5];
    out.push([
      [ua - t, va - t],
      [ub + t, va - t],
      [ub + t, vb + t],
      [ua - t, vb + t],
    ]);
  });
  return out;
}

// ---------------------------------------------------------------- the asset

/** Run a check only at LODs where `part` exists (running gear is dropped at LOD2). */
const whenBuilt =
  (part: string, check: Check): Check =>
  (asset) =>
    asset.parts.some((p) => p.name === part && p.mesh) ? check(asset) : [];

export const tiger_1 = defineAsset({
  name: 'tiger_1',
  kind: 'vehicle',
  description:
    'Tiger I mid production (late 1943) — Zimmerit, three-tone camo, interleaved wheels, link-by-link track, full stowage',
  tags: ['military', 'tracked', 'ww2', 'hero'],
  sources: [
    'https://en.wikipedia.org/wiki/Tiger_I (specifications: 6.316 m hull, 8.45 m with gun, 3.56 m, 3.0 m)',
    'https://tiger1.info/EN/RoadWheelSpacing.html (800 mm wheels, 515 mm station pitch, 725 mm track)',
    'https://tankmuseum.org/tiger-wheels/ (800 mm steel wheels with solid rubber tyres, 24 per side)',
    'https://tamiyausa.com/shop/135-military-miniature/german-tiger-i-mid-production (mid production Jul 1943–Jan 1944: new cupola, single headlight, Zimmerit from Sep 1943)',
    'Jentz & Doyle, Germany’s Tiger Tanks: D.W. to Tiger I (Schiffer 2000), stowage and tool layout',
  ],
  real: {
    length: 8.45,
    width: 3.56,
    height: 3.0,
    measures: [
      {
        label: 'hull length',
        axis: 'x',
        value: 6.316,
        parts: ['hull'],
        source: 'https://en.wikipedia.org/wiki/Tiger_I',
      },
      {
        label: 'road wheel diameter',
        axis: 'z',
        value: 0.8,
        parts: ['wheel_l_0'],
        source: 'https://tankmuseum.org/tiger-wheels/',
      },
      {
        label: 'track width',
        axis: 'y',
        value: 0.725,
        parts: ['track_l'],
        source: 'https://tiger1.info/EN/RoadWheelSpacing.html',
      },
      {
        label: 'track centres',
        axis: 'y',
        value: 2.835,
        between: ['track_l', 'track_r'],
        source: '3.56 m overall − 0.725 m track',
      },
      {
        label: '8.8 cm KwK 36 L/56 barrel length',
        axis: 'x',
        value: 4.928,
        parts: ['gun_barrel'],
        source: '56 calibres × 88 mm',
      },
      {
        label: 'wheel station pitch × 7',
        axis: 'x',
        value: 3.605,
        between: ['wheel_l_0', 'wheel_l_7'],
        source: 'https://tiger1.info/EN/RoadWheelSpacing.html',
      },
    ],
  },
  budget: { triangles: [110000, 18000, 800] },
  checks: [
    clear('track_*', 'hull'),
    clear('track_*', 'fenders'),
    clear('wheel_*', 'hull'),
    clear('wheel_*', 'fenders'),
    noOverlap('wheel_l_*'),
    noOverlap('wheel_r_*'),
    touches('turret_body', 'hull'),
    whenBuilt('sprocket_l', touches('sprocket_l', 'hull')),
    whenBuilt('idler_l', touches('idler_l', 'hull')),
    symmetric('_l', '_r', 'y'),
  ],
  build(ctx) {
    const lod = ctx.lod;
    const segs = [20, 14, 8][lod] ?? 8;
    const blobs = camoBlobs(ctx.rng.fork('camo'));
    const paintJob = (m: Mesh, at: Vec3 = [0, 0, 0]): Mesh =>
      lod === 2 ? m : camo(tessellate(m, lod === 0 ? 0.3 : 0.6), blobs, at);
    const wheels: Circle[] = STATIONS.map((x) => ({ x, z: WHEEL_Z, r: WHEEL_R }));
    const line = beltLine(wheels, [SPROCKET, IDLER], 0.1);

    // ---- Running gear, per side ----
    const stubs: Mesh[] = [];
    for (const side of ['l', 'r'] as const) {
      const s = side === 'l' ? 1 : -1;
      const ty = s * TRACK_Y;
      const flip = (m: Mesh): Mesh => (s > 0 ? m : place(m, { yaw: Math.PI }));
      const track = `track_${side}`;
      ctx.part(track, muddy(trackMesh(lod, line, ty), [0, 0, 0], 0.35));
      // Final-drive housing and idler axle stub: what holds sprocket and idler to the hull.
      stubs.push(
        cylinder({
          radius: 0.205,
          length: 0.42,
          segments: segs,
          axis: 'y',
          at: [SPROCKET.x, s * (TRACK_Y - 0.32 - 0.21), SPROCKET.z],
          color: dunkelgelb,
        }),
        cylinder({
          radius: 0.1,
          length: 0.32,
          segments: segs,
          axis: 'y',
          at: [IDLER.x, s * (TRACK_Y + HORN_Y - 0.19 - 0.16), IDLER.z],
          color: dunkelgelb,
        }),
      );
      if (lod === 2) continue;
      STATIONS.forEach((x, i) => {
        const at: Vec3 = [x, ty, WHEEL_Z];
        ctx.part(`wheel_${side}_${i}`, muddy(paintJob(flip(station(lod, i % 2 === 0)), at), at), {
          at,
          motion: { kind: 'spin', axis: [0, 1, 0], rps: 0.8 },
          clearOf: [track],
        });
      });
      const sAt: Vec3 = [SPROCKET.x, ty, SPROCKET.z];
      ctx.part(`sprocket_${side}`, muddy(paintJob(flip(sprocket(lod, SPROCKET.r)), sAt), sAt), {
        at: sAt,
        motion: { kind: 'spin', axis: [0, 1, 0], rps: 0.8 },
        clearOf: [track],
      });
      const iAt: Vec3 = [IDLER.x, ty, IDLER.z];
      ctx.part(`idler_${side}`, muddy(paintJob(flip(idler(lod)), iAt), iAt), {
        at: iAt,
        motion: { kind: 'spin', axis: [0, 1, 0], rps: 0.9 },
        clearOf: [track],
      });
    }

    // ---- Hull: tub between the tracks + panniers over them (side-profile prisms) ----
    // Lower hull between the tracks, up to the pannier floor; the full-width upper hull sits on it
    // (two solids sharing a face, so inside/outside tests stay exact).
    const noseAt = (z: number): number =>
      NOSE_FOOT[0] +
      ((z - NOSE_FOOT[1]) / (NOSE_TOP[1] - NOSE_FOOT[1])) * (NOSE_TOP[0] - NOSE_FOOT[0]);
    const tub: Vec2[] = [
      [-2.8, BELLY],
      [2.62, BELLY],
      NOSE_FOOT,
      [noseAt(PANNIER_Z), PANNIER_Z],
      [rearX(PANNIER_Z), PANNIER_Z],
      [HULL_REAR, REAR_LOW],
    ];
    const upper: Vec2[] = [
      [rearX(PANNIER_Z), PANNIER_Z],
      [noseAt(PANNIER_Z), PANNIER_Z],
      NOSE_TOP,
      GLACIS_TOP,
      [frontX(DECK), DECK],
      [rearX(DECK), DECK],
    ];
    const hull: Mesh[] = [
      prism({ profile: tub, depth: 2.0, plane: 'xz', color: dunkelgelb, strip: 'iron' }),
      prism({ profile: upper, depth: SIDE_Y * 2, plane: 'xz', color: dunkelgelb, strip: 'iron' }),
      ...stubs,
    ];
    if (lod < 2) {
      for (const s of [1, -1])
        hull.push(
          box({ size: [0.75, 0.62, 0.04], at: [-2.1, s * 0.62, DECK], color: paintDark }),
          cylinder({
            radius: 0.28,
            length: 0.05,
            segments: segs,
            at: [-2.72, s * 0.6, DECK + 0.025],
            color: paintDark,
          }),
          // Driver's and radio operator's hatches.
          cylinder({
            radius: 0.3,
            length: 0.06,
            segments: segs,
            at: [1.95, s * 0.72, DECK + 0.03],
            color: dunkelgelb,
          }),
        );
      hull.push(
        box({ size: [1.0, 0.7, 0.05], at: [-2.05, 0, DECK], color: paintDark }),
        // Driver's visor (left) and bow MG ball mount (right) on the front plate.
        box({ size: [0.1, 0.55, 0.2], at: [2.5, 0.72, 1.48], color: dunkelgelb }),
        box({ size: [0.03, 0.4, 0.035], at: [2.555, 0.72, 1.56], color: black }),
        lathe({
          profile: [
            [0.15, 0],
            [0.16, 0.05],
            [0.12, 0.13],
            [0, 0.16],
          ],
          segments: segs,
          axis: 'x',
          at: [2.46, -0.72, 1.55],
          color: dunkelgelb,
        }),
        beam({
          from: [2.6, -0.72, 1.55],
          to: [2.82, -0.72, 1.55],
          width: 0.04,
          segments: 6,
          color: black,
        }),
      );
    }
    if (lod === 0) {
      // Interlocking plate joints, tow shackles and couplings, grab handles, lifting eyes.
      const handle = (x: number, y: number): Mesh =>
        cable(
          [
            [x, y, DECK],
            [x, y, DECK + 0.06],
            [x - 0.18, y, DECK + 0.06],
            [x - 0.18, y, DECK],
          ],
          0.02,
          steel,
        );
      for (const s of [1, -1]) {
        hull.push(
          box({
            size: [0.1, 0.08, 0.3],
            at: [HULL_FRONT - 0.05, s * 1.57, 1.25],
            color: dunkelgelb,
          }),
          box({
            size: [0.1, 0.08, 0.3],
            at: [rearX(1.3) + 0.05, s * 1.57, 1.3],
            color: dunkelgelb,
          }),
          box({ size: [0.16, 0.07, 0.14], at: [HULL_FRONT - 0.08, s * 0.85, 0.72], color: steel }),
          box({ size: [0.16, 0.07, 0.14], at: [HULL_REAR + 0.08, s * 0.85, 0.78], color: steel }),
          lathe({
            profile: [
              [0.05, 0],
              [0.05, 0.03],
              [0.025, 0.05],
              [0, 0.05],
            ],
            segments: 8,
            at: [1.2, s * 1.45, DECK],
            color: steel,
          }),
        );
        for (const x of [1.0, -0.4, -1.6]) hull.push(handle(x, s * 1.52));
      }
      // Zimmerit on the pannier sides, front plate, nose and rear plate.
      hull.push(
        zimmerit(straight([2.35, SIDE_Y], [-2.95, SIDE_Y], [0, 1]), PANNIER_Z, DECK),
        zimmerit(straight([-2.95, -SIDE_Y], [2.35, -SIDE_Y], [0, -1]), PANNIER_Z, DECK),
        zimmerit(straight([frontX(1.32), -1.55], [frontX(1.32), 1.55], [1, 0]), 1.32, 1.78, TAN9),
        zimmerit(straight([noseAt(0.92), -0.98], [noseAt(0.92), 0.98], [1, 0]), 0.92, 1.18, -TAN25),
        zimmerit(straight([rearX(1.2), 1.55], [rearX(1.2), -1.55], [-1, 0]), 1.2, 1.78, TAN9),
      );
      // Balkenkreuz on both pannier sides (white edges, black cross).
      for (const s of [1, -1]) {
        hull.push(
          sideDecal(cross(0.26, 0.1), s, -0.9, s * (SIDE_Y + 0.016), 1.48, white),
          sideDecal(cross(0.23, 0.06), s, -0.9, s * (SIDE_Y + 0.02), 1.48, black),
        );
      }
    }
    // Structure (closed plates + drive housings) vs dressing (Zimmerit, decals, fittings): the
    // structural solid is what clearance checks test against, so it stays lean and watertight.
    const structure = 2 + stubs.length;
    ctx.part('hull', muddy(paintJob(merge(hull.slice(0, structure))), [0, 0, 0], 0.45));
    if (hull.length > structure)
      ctx.part('hull_detail', muddy(paintJob(merge(hull.slice(structure))), [0, 0, 0], 0.45));

    // ---- Fenders: side sections out to the track edge, hinged front mudguards ----
    const fenders: Mesh[] = [];
    for (const s of [1, -1]) {
      fenders.push(
        box({
          size: [5.9, 0.17, 0.025],
          at: [-0.2, s * (SIDE_Y + 0.085), PANNIER_Z - 0.025],
          color: dunkelgelb,
        }),
        planar({
          points: [
            [2.62, s * 1.06, PANNIER_Z],
            [3.3, s * 1.06, 1.05],
            [3.3, s * 1.78, 1.05],
            [2.62, s * 1.78, PANNIER_Z],
          ],
          color: dunkelgelb,
          doubleSided: true,
        }),
      );
      if (lod === 0)
        for (const x of [1.3, -0.2, -1.7])
          fenders.push(
            box({
              size: [0.02, 0.17, 0.035],
              at: [x, s * (SIDE_Y + 0.085), PANNIER_Z - 0.035],
              color: paintDark,
            }),
          );
    }
    ctx.part('fenders', muddy(paintJob(merge(fenders)), [0, 0, 0], 0.4));

    // ---- Particle sources: exhaust smoke, track dust ----
    for (const [side, s] of [
      ['l', 1],
      ['r', -1],
    ] as const) {
      ctx.emitter(`exhaust_smoke_${side}`, {
        kind: 'smoke',
        at: [rearX(1.08) - 0.095, s * 0.55, 1.8],
        dir: [-0.3, 0, 1],
        rate: 14,
        life: 2.5,
        size: [0.25, 1.4],
        color: hex('#3a3836'),
        speed: 1.5,
        spreadDeg: 15,
        when: 'always',
      });
      ctx.emitter(`track_dust_${side}`, {
        kind: 'dust',
        at: [IDLER.x - 0.3, s * TRACK_Y, 0.15],
        dir: [-1, 0, 0.4],
        rate: 30,
        life: 1.8,
        size: [0.3, 1.8],
        color: hex('#9a8a6a'),
        speed: 1.2,
        spreadDeg: 35,
        when: 'moving',
      });
    }

    // ---- Exhausts with sheet guards (soot), jack on the rear plate ----
    if (lod < 2) {
      const rear: Mesh[] = [];
      for (const s of [1, -1]) {
        rear.push(
          lathe({
            profile: [
              [0.09, 0],
              [0.09, 0.62],
              [0.11, 0.66],
              [0.07, 0.7],
            ],
            segments: segs,
            at: [rearX(1.08) - 0.095, s * 0.55, 1.08],
            color: rust,
          }),
          box({
            size: [0.03, 0.34, 0.5],
            at: [rearX(1.08) - 0.215, s * 0.55, 1.18],
            color: paintDark,
          }),
          box({
            size: [0.2, 0.025, 0.5],
            at: [rearX(1.08) - 0.1, s * 0.73, 1.18],
            color: paintDark,
          }),
          box({
            size: [0.2, 0.025, 0.5],
            at: [rearX(1.08) - 0.1, s * 0.37, 1.18],
            color: paintDark,
          }),
        );
      }
      if (lod === 0)
        rear.push(
          cylinder({
            radius: 0.08,
            length: 0.55,
            segments: 10,
            axis: 'y',
            at: [rearX(1.55) - 0.08, 0, 1.55],
            color: steel,
          }),
          box({ size: [0.04, 0.06, 0.06], at: [rearX(1.52) - 0.02, 0.22, 1.52], color: steel }),
          box({ size: [0.04, 0.06, 0.06], at: [rearX(1.52) - 0.02, -0.22, 1.52], color: steel }),
        );
      ctx.part(
        'exhausts',
        grime(merge(rear), {
          ground: 1.3,
          groundStrength: 0.4,
          zones: [
            { at: [HULL_REAR - 0.1, 0.55, 1.8], radius: 0.7, strength: 0.7 },
            { at: [HULL_REAR - 0.1, -0.55, 1.8], radius: 0.7, strength: 0.7 },
          ],
        }),
      );
    }

    // ---- Stowage and tools on the deck ----
    const tools: Mesh[] = [];
    if (lod < 2) {
      // Bosch headlight centred on the front plate (mid production), cleaning-rod tube.
      tools.push(
        box({ size: [0.1, 0.08, 0.06], at: [2.5, 0, 1.6], color: dunkelgelb }),
        lathe({
          profile: [
            [0.04, 0],
            [0.09, 0.04],
            [0.09, 0.15],
            [0, 0.16],
          ],
          segments: 12,
          axis: 'x',
          at: [2.5, 0, 1.72],
          color: dunkelgelb,
        }),
        cylinder({
          radius: 0.05,
          length: 2.2,
          segments: 8,
          axis: 'x',
          at: [-1.8, 1.47, DECK + 0.05],
          color: dunkelgelb,
        }),
      );
    }
    if (lod === 0) {
      tools.push(
        // Shovel (left front), axe (right front), sledgehammer, crowbar, track tool.
        beam({
          from: [1.35, 1.25, DECK + 0.03],
          to: [0.35, 1.25, DECK + 0.03],
          width: 0.035,
          segments: 5,
          color: wood,
        }),
        box({ size: [0.3, 0.22, 0.02], at: [1.5, 1.25, DECK], color: steel }),
        beam({
          from: [1.35, -1.25, DECK + 0.03],
          to: [0.5, -1.25, DECK + 0.03],
          width: 0.04,
          segments: 5,
          color: wood,
        }),
        box({ size: [0.18, 0.14, 0.035], at: [1.42, -1.25, DECK], color: steel }),
        beam({
          from: [-2.3, -1.25, DECK + 0.03],
          to: [-2.95, -1.25, DECK + 0.03],
          width: 0.04,
          segments: 5,
          color: wood,
        }),
        box({ size: [0.1, 0.18, 0.06], at: [-2.25, -1.25, DECK], color: steel }),
        beam({
          from: [-0.9, -1.45, DECK + 0.025],
          to: [-2.6, -1.45, DECK + 0.025],
          width: 0.035,
          color: steel,
        }),
        beam({
          from: [2.3, -1.1, DECK + 0.025],
          to: [2.3, -0.2, DECK + 0.025],
          width: 0.035,
          color: steel,
        }),
        box({ size: [0.08, 0.1, 0.06], at: [2.3, -1.12, DECK], color: steel }),
        // Wire cutters, starter crank, jack block.
        box({ size: [0.06, 0.4, 0.03], at: [2.3, 0.6, DECK], color: steel }),
        beam({
          from: [-2.95, -0.3, DECK + 0.025],
          to: [-2.95, -1.0, DECK + 0.025],
          width: 0.03,
          color: steel,
        }),
        box({ size: [0.35, 0.3, 0.2], at: [-2.85, 1.2, DECK], color: wood }),
      );
      // S-mine dischargers: five tubes round the deck edge.
      for (const [x, y] of [
        [2.3, 1.45],
        [2.3, -1.45],
        [-0.9, 1.48],
        [-0.9, -1.48],
        [-3.0, 0],
      ] as const)
        tools.push(
          lathe({
            profile: [
              [0.07, 0],
              [0.06, 0.04],
              [0.045, 0.05],
              [0.045, 0.16],
            ],
            segments: 8,
            at: [x, y, DECK],
            color: dunkelgelb,
          }),
        );
      // Tow cables along both pannier sides with eyes at the ends.
      for (const s of [1, -1]) {
        const y = s * (SIDE_Y + 0.035);
        tools.push(
          cable(
            [
              [2.1, y, 1.66],
              [-2.6, y, 1.66],
              [-2.75, y, 1.53],
              [-2.6, y, 1.4],
              [2.0, y, 1.4],
            ],
            0.035,
            steel,
          ),
          eye([2.16, y, 1.66]),
          eye([2.06, y, 1.4]),
          box({ size: [0.04, 0.03, 0.08], at: [0.8, s * (SIDE_Y + 0.015), 1.62], color: steel }),
          box({ size: [0.04, 0.03, 0.08], at: [-1.6, s * (SIDE_Y + 0.015), 1.62], color: steel }),
        );
      }
    }
    if (tools.length > 0) ctx.part('stowage', paintJob(merge(tools)));

    // ---- Turret: horseshoe plan prism, cupola, hatches, bin; traverses as one group ----
    ctx.group('turret', {
      at: TURRET_AT,
      motion: { kind: 'sway', axis: [0, 0, 1], degrees: 20, hz: 0.1 },
    });
    const arc = lod === 0 ? 18 : lod === 1 ? 10 : 6;
    const plan: Vec2[] = [
      [1.0, -1.15],
      [1.0, 1.15],
    ];
    for (let i = 0; i <= arc; i++) {
      const a = ((70 + (220 * i) / arc) * Math.PI) / 180;
      plan.push([-0.2 + 1.33 * Math.cos(a), 1.33 * Math.sin(a)]);
    }
    const turret: Mesh[] = [
      // Turret ring collar (1.79 m ring) standing on the deck.
      lathe({
        profile: [
          [0.95, -RING],
          [0.95, 0],
        ],
        segments: segs * 2,
        color: dunkelgelb,
      }),
      prism({
        profile: plan,
        depth: 0.85,
        plane: 'xy',
        centred: false,
        color: dunkelgelb,
        strip: 'iron',
      }),
      // Rear stowage bin (Rommelkiste).
      prism({
        profile: [
          [-1.5, 0.15],
          [-1.5, 0.62],
          [-1.95, 0.6],
          [-2.02, 0.4],
          [-1.95, 0.17],
        ],
        depth: 1.55,
        plane: 'xz',
        color: dunkelgelb,
      }),
      // Low cast cupola (mid production).
      lathe({
        profile: [
          [0.38, 0.84],
          [0.38, 1.04],
          [0.33, 1.08],
          [0.3, 1.1],
        ],
        segments: segs,
        at: [-0.55, 0.62, 0],
        color: dunkelgelb,
        caps: true,
      }),
    ];
    if (lod < 2) {
      turret.push(
        lathe({
          profile: [
            [0.3, 1.1],
            [0.31, 1.15],
            [0.24, 1.19],
            [0, 1.19],
          ],
          segments: segs,
          at: [-0.55, 0.62, 0],
          color: paintDark,
        }),
        cylinder({
          radius: 0.28,
          length: 0.06,
          segments: segs,
          at: [-0.2, -0.6, 0.88],
          color: paintDark,
        }),
      );
    }
    if (lod === 0) {
      // Seven periscope housings, AA ring, loader's periscope, ventilator, lifting lugs.
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + 0.3;
        turret.push(
          place(box({ size: [0.06, 0.13, 0.09], color: black }), {
            at: [-0.55 + Math.cos(a) * 0.37, 0.62 + Math.sin(a) * 0.37, 0.93],
            yaw: a,
          }),
        );
      }
      turret.push(
        lathe({
          profile: Array.from({ length: 7 }, (_, i): Vec2 => {
            const a = (i / 6) * Math.PI * 2;
            return [0.36 + 0.015 * Math.cos(a), 1.12 + 0.015 * Math.sin(a)];
          }),
          segments: segs,
          at: [-0.55, 0.62, 0],
          color: steel,
        }),
        box({ size: [0.15, 0.1, 0.1], at: [0.1, -0.6, 0.85], color: paintDark }),
        lathe({
          profile: [
            [0.12, 0.84],
            [0.12, 0.9],
            [0.08, 0.94],
            [0, 0.95],
          ],
          segments: 10,
          at: [0.55, 0, 0],
          color: paintDark,
        }),
      );
      for (const [x, y] of [
        [0.6, 0.85],
        [0.6, -0.85],
        [-1.2, 0],
      ] as const)
        turret.push(box({ size: [0.12, 0.04, 0.08], at: [x, y, 0.85], color: paintDark }));
      // Pistol port (left) and escape hatch (right rear).
      const hatchA = 4.2;
      turret.push(
        lathe({
          profile: [
            [0.1, 0],
            [0.1, 0.03],
            [0.06, 0.05],
            [0, 0.05],
          ],
          segments: 10,
          axis: 'y',
          at: [-0.4, 1.3, 0.42],
          color: paintDark,
        }),
        place(
          lathe({
            profile: [
              [0.25, 0],
              [0.25, 0.03],
              [0.2, 0.05],
              [0, 0.05],
            ],
            segments: segs,
            axis: 'x',
            color: paintDark,
          }),
          {
            at: [-0.2 + 1.33 * Math.cos(hatchA) - 0.01, 1.33 * Math.sin(hatchA), 0.42],
            yaw: hatchA,
          },
        ),
      );
      // Spare track links on both turret sides (flat stretch behind the front corners).
      const link = trackLink(0.13);
      for (const s of [1, -1]) {
        const a: Vec2 = [1.0, s * 1.15];
        const b: Vec2 = [-0.2 + 1.33 * Math.cos(1.22), s * 1.33 * Math.sin(1.22)];
        const along = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const u: Vec3 = [(b[0] - a[0]) / along, (b[1] - a[1]) / along, 0];
        const n: Vec3 = [u[1], -u[0], 0];
        const out: Vec3 = n[1] * s < 0 ? [-n[0], -n[1], 0] : n;
        for (let k = 0; k < 4; k++) {
          const m: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0.2 + k * 0.14];
          turret.push(
            applyAffine(
              link,
              frame([0, 0, 1], u, out, [m[0] + out[0] * 0.05, m[1] + out[1] * 0.05, m[2]]),
            ),
          );
        }
      }
      // Zimmerit round the turret walls.
      const wall: WallPoint[] = plan.map((p, i) => {
        const q = plan[(i + 1) % plan.length] as Vec2;
        const o = plan[(i + plan.length - 1) % plan.length] as Vec2;
        const tx = q[0] - o[0];
        const ty = q[1] - o[1];
        const l = Math.hypot(tx, ty) || 1;
        return { p, n: [ty / l, -tx / l] };
      });
      turret.push(zimmerit([...wall.slice(1), wall[0] as WallPoint], 0.05, 0.82));
      // Turret number "332", outlined digits (Bundesarchiv Bild 101I-277-0846-08), both sides,
      // reading front-to-back on the left and back-to-front on the right.
      for (const s of [1, -1])
        [3, 3, 2].forEach((d, i) => {
          const x = s > 0 ? 0.05 - i * 0.22 : -0.39 + i * 0.22;
          const y = s * (Math.sqrt(1.33 ** 2 - (x + 0.2) ** 2) + 0.022);
          for (const rect of digitRects(d, 0.3)) {
            const grow = rect.map(
              ([u, v], k): Vec2 => [
                u + (k === 0 || k === 3 ? -0.012 : 0.012),
                v + (k < 2 ? -0.012 : 0.012),
              ],
            );
            turret.push(sideDecal(grow, s, x, y - s * 0.004, 0.3, black));
            turret.push(sideDecal(rect, s, x, y, 0.3, white));
          }
        });
    }
    ctx.part('turret_body', muddy(paintJob(merge(turret), TURRET_AT), TURRET_AT, 0.3), {
      parent: 'turret',
    });

    // ---- Gun: curved mantlet with coax and sight ports; KwK 36 L/56 with muzzle brake ----
    // The elevation sweep is checked as a full turn about the trunnion, so it necessarily passes
    // through the turret roof and front deck; the real arc (−4°…+15°) clears both.
    ctx.group('gun', {
      at: [1.0, 0, 0.42],
      parent: 'turret',
      motion: { kind: 'sway', axis: [0, 1, 0], degrees: 5, hz: 0.25 },
      clearOf: ['turret_body', 'hull', 'hull_detail', 'stowage', 'fenders'],
    });
    ctx.emitter('muzzle', {
      kind: 'muzzle',
      parent: 'gun',
      at: [4.15, 0, 0],
      dir: [1, 0, 0],
      rate: 60,
      life: 0.25,
      size: [0.4, 2.0],
      speed: 12,
      spreadDeg: 25,
      when: 'event',
    });
    const mantletArc = lod === 0 ? 8 : 4;
    const mantlet: Vec2[] = [];
    for (let i = 0; i <= mantletArc; i++) {
      const a = -Math.PI / 2 + (Math.PI * i) / mantletArc;
      mantlet.push([0.24 * Math.cos(a), 0.4 * Math.sin(a)]);
    }
    const mParts = [prism({ profile: mantlet, depth: 1.95, plane: 'xz', color: dunkelgelb })];
    if (lod === 0)
      mParts.push(
        box({ size: [0.04, 0.09, 0.09], at: [0.22, 0.42, 0.0], color: black }),
        box({ size: [0.04, 0.09, 0.07], at: [0.23, -0.2, 0.12], color: black }),
        box({ size: [0.04, 0.07, 0.07], at: [0.23, -0.34, 0.12], color: black }),
      );
    const gunAt: Vec3 = [TURRET_AT[0] + 1.0, 0, TURRET_AT[2] + 0.42];
    ctx.part('gun_mantlet', paintJob(merge(mParts), gunAt), { parent: 'gun' });
    const breech = 4.14 - 4.928;
    ctx.part(
      'gun_barrel',
      paintJob(
        lathe({
          profile:
            lod === 0
              ? [
                  [0.12, breech],
                  [0.17, 0.2],
                  [0.26, 0.2],
                  [0.26, 0.24],
                  [0.17, 0.25],
                  [0.17, 0.5],
                  [0.12, 0.56],
                  [0.105, 0.62],
                  [0.088, 3.62],
                  [0.14, 3.64],
                  [0.15, 3.66],
                  [0.15, 3.8],
                  [0.11, 3.82],
                  [0.11, 3.9],
                  [0.15, 3.92],
                  [0.15, 4.08],
                  [0.12, 4.13],
                  [0.06, 4.14],
                  [0.06, 4.0],
                ]
              : [
                  [0.12, breech],
                  [0.17, 0.2],
                  [0.26, 0.2],
                  [0.26, 0.24],
                  [0.17, 0.25],
                  [0.17, 0.5],
                  [0.1, 0.6],
                  [0.088, 3.62],
                  [0.15, 3.66],
                  [0.15, 4.14],
                ],
          segments: [16, 10, 6][lod] ?? 6,
          axis: 'x',
          color: dunkelgelb,
          caps: true,
        }),
        gunAt,
      ),
      { parent: 'gun' },
    );
  },
});
