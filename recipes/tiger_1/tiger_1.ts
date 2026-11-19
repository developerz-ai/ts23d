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
  hex,
  type Lod,
  lathe,
  type Mesh,
  merge,
  noOverlap,
  place,
  planar,
  prism,
  type Rng,
  symmetric,
  touches,
  tread,
  type Vec2,
  type Vec3,
  valueNoise,
} from '@developerz.ai/ts23d';
import {
  type Blob,
  camo,
  onGround,
  reproject,
  restrip,
  type StripRule,
  tessellate,
  type WeatheringOptions,
  weatherer,
} from '../_lib/finish/finish.ts';
import {
  engineDeck,
  exhaustAt,
  type RearSpec,
  rearMudguards,
  rearPlate,
  sideExtensions,
} from './rear.ts';
import { COLUMN, type Coating, coatFaces, coating, TURRET_PITCH } from './zimmerit.ts';

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
const bare = hex('#7d766c');
/** Raw Zimmerit paste where the coat broke (barium sulphate, ochre, sawdust: grey-ochre). */
const paste = hex('#b0a588');
/** Red-oxide primer under factory Zimmerit (README "Zimmerit"). */
const primer = hex('#a2573a');

/** Authoring colour → material: painted steel takes the paint as vertex colour (chips show the
 *  steel), rubber tyres, rusted manganese-steel track, cast/forged tool heads, ash handles. */
const STRIP_RULES: readonly StripRule[] = [
  { from: dunkelgelb, strip: 'steel_painted' },
  { from: paintDark, strip: 'steel_painted' },
  { from: rubber, strip: 'rubber', color: hex('#d8d8d8') },
  { from: trackSteel, strip: 'iron_rust', color: hex('#b8aea4') },
  { from: rust, strip: 'iron_rust', color: hex('#c09a80') },
  { from: steel, strip: 'iron_cast', color: hex('#c8c4be') },
  { from: bare, strip: 'aluminium', color: hex('#9a948a') },
  { from: primer, strip: 'steel_painted' },
  { from: wood, strip: 'oak', color: hex('#e0d0bc') },
];

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
/** Plate angles from vertical (Jentz armour table via armorsite; recipes/tiger_1/README.md). */
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
/** Shifts the flake field: ≈ 10 % of the coat broken off, more at plate edges (README). */
const FLAKE_BIAS = -0.05;
/** The coating weighs as a 6 mm skin of paste, not as the volume its curve encloses. */
const ZIM_MASS = { density: 1600, shell: 0.006 } as const;

/** LOD1/2 plates that carry Zimmerit (triangle centre and normal, hull space). */
const onHullPlates = (c: Vec3, n: Vec3): boolean =>
  (Math.abs(n[1]) > 0.95 && Math.abs(c[1]) > SIDE_Y - 0.01 && c[2] > PANNIER_Z && c[2] < DECK) ||
  (n[0] > 0.9 && n[2] > 0.1 && c[2] > 1.3 && c[2] < DECK) ||
  (n[0] > 0.85 && n[2] < -0.3 && c[2] > 0.9 && c[2] < 1.2) ||
  (n[0] < -0.95 && c[2] > PANNIER_Z && c[2] < DECK);

/** LOD1/2 mantlet face and curled ends (gun space): not the back, collar, coax or roof. */
const onMantletFace = (c: Vec3, n: Vec3): boolean =>
  Math.abs(n[2]) < 0.3 && n[0] > -0.5 && c[0] < 0.222 && Math.abs(c[2]) < 0.35;

/** LOD1/2 turret walls (turret space): horseshoe, cheeks and front plate; not bin or cupola. */
const onTurretWall = (c: Vec3, n: Vec3): boolean =>
  Math.abs(n[2]) < 0.3 &&
  c[2] > 0.02 &&
  c[2] < 0.84 &&
  Math.hypot(c[0] + 0.2, c[1]) > 1.1 &&
  !(c[0] < -1.53 && Math.abs(c[1]) < 0.8);

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

/** Belt stations per LOD: LOD2 keeps an open belt of 24 slabs so the wheels show through it. */
function stationsOf(lod: Lod, line: readonly Vec2[]): Station[] {
  const perimeter = resample(line, 1)[0]?.len ?? 1;
  return resample(line, lod === 2 ? 24 : Math.round(perimeter / (lod === 0 ? 0.13 : 0.32)));
}

/**
 * The belt: one link laid round `line`. `finish` colours that ONE link (steel, mud) before it is
 * placed, so every link looks the same and the run clip can put each in its neighbour's place
 * unseen (the `treads` gate checks colour and UV one pitch on). Mud laid over the placed belt by
 * its height above the ground would stay put while the links run through it, and jump at each wrap.
 */
function trackMesh(lod: Lod, line: readonly Vec2[], y: number, finish: (link: Mesh) => Mesh): Mesh {
  const stations = stationsOf(lod, line);
  const len = stations[0]?.len ?? 0.13;
  const unit = finish(
    lod === 0
      ? trackLink(len)
      : box({
          size: [len * 1.04, TRACK_W, LINK_T],
          at: [0, 0, -LINK_T / 2],
          color: trackSteel,
          // LOD2 drops only the hull-facing edge: the outboard edge is what a side view shows.
          ...(lod === 2 ? { omit: [y > 0 ? 'right' : 'left'] as const } : {}),
        }),
  );
  return merge(stations.map((s) => place(unit, { at: [s.p[0], y, s.p[1]], pitch: s.pitch })));
}

// ---------------------------------------------------------------- wheels

/** One steel disc with a solid rubber tyre, centred on `y` (axis Y), dished toward ±Y faces. */
function disc(lod: Lod, r: number, w: number, y: number, bolts: boolean, inner = false): Mesh {
  // Inner discs hide behind the outer row: fewer sides there.
  const segs = (inner ? [12, 10, 8] : [16, 12, 8])[lod] ?? 8;
  const h = w / 2;
  const tyre = lathe({
    profile: [
      [r - 0.05, y - h],
      [r - 0.008, y - h],
      [r, y - h + 0.012],
      [r, y + h - 0.012],
      [r - 0.008, y + h],
      [r - 0.05, y + h],
      [r - 0.05, y - h],
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
  // The wheel hub/axle stub every disc of a station is keyed onto: from the innermost disc's
  // centre plane to the outer one's, so the interleaved discs hang on a shaft, not on air.
  const hub = (y0: number, y1: number): Mesh =>
    cylinder({
      radius: 0.07,
      length: y1 - y0,
      segments: 10,
      axis: 'y',
      at: [0, (y0 + y1) / 2, 0],
      color: paintDark,
    });
  if (typeA) {
    const outer = disc(lod, WHEEL_R, 0.09, 0.27, lod === 0);
    if (lod > 0) return outer;
    return merge([
      outer,
      disc(lod, WHEEL_R, 0.08, HORN_Y - 0.083, false, true),
      disc(lod, WHEEL_R, 0.08, HORN_Y + 0.083, false, true),
      hub(HORN_Y - 0.083, 0.27),
    ]);
  }
  const outer = disc(lod, WHEEL_R, 0.09, 0.12, lod === 0);
  return lod > 0
    ? outer
    : merge([outer, disc(lod, WHEEL_R, 0.08, -0.3, false, true), hub(-0.3, 0.12)]);
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
        [0.12, y - 0.03],
      ],
      segments: segs,
      axis: 'y',
      color: paintDark,
    });
  const hub = lathe({
    profile: [
      [0, -0.32],
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

/** LOD2 wheel: an 8-sided disc (32 triangles); `hub` reaches inboard to the axle stub. */
const farDisc = (r: number, y: number, hub = 0): Mesh =>
  merge([
    cylinder({ radius: r, length: 0.1, segments: 8, axis: 'y', at: [0, y, 0], color: dunkelgelb }),
    ...(hub > 0
      ? [
          cylinder({
            radius: 0.16,
            length: hub,
            segments: 6,
            axis: 'y',
            at: [0, y - hub / 2, 0],
            color: dunkelgelb,
          }),
        ]
      : []),
  ]);

/** Rear idler: a dished double disc straddling the horns. */
const idler = (lod: Lod): Mesh =>
  merge([
    disc(lod, IDLER.r, 0.1, HORN_Y + 0.13, lod === 0),
    disc(lod, IDLER.r, 0.1, HORN_Y - 0.13, false),
  ]);

// ---------------------------------------------------------------- finish passes

/** Three-tone camouflage: soft ellipsoid blobs seeded from the rng, sprayed over the paint only. */
function camoBlobs(rng: Rng): Blob[] {
  const out: Blob[] = [];
  for (let i = 0; i < 30; i++) {
    out.push({
      c: [rng.range(-3.4, 5.2), rng.range(-1.9, 1.9), rng.range(0.4, 3.0)],
      r: [rng.range(0.4, 0.9), rng.range(0.45, 1.3), rng.range(0.25, 0.55)],
      color: i % 2 === 0 ? olivgruen : rotbraun,
    });
  }
  return out;
}

/** Flaked Zimmerit: a world-space field, > 0.5 where the coat has broken off to the primer.
 *  Markings were painted on intact coat, so flakes stay out of their `keep` boxes. */
function flakes(
  noise: (p: Vec3) => number,
  keep: readonly (readonly [Vec3, Vec3])[],
): (p: Vec3) => number {
  return (p) =>
    keep.some(([lo, hi]) => p.every((v, k) => v >= (lo[k] ?? 0) && v <= (hi[k] ?? 0)))
      ? 0
      : noise(p) + FLAKE_BIAS;
}

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
    'https://tankmuseum.org/article/zimmerit (Zimmerit 6 mm: 2 mm + 4 mm patterned) · https://panzerworld.com/zimmerit (Tiger: vertical columns of horizontal ridges, 200 kg)',
  ],
  real: {
    length: 8.45,
    width: 3.56,
    height: 3.0,
    // Combat weight 57 t (README sources). The mass gate fills the hull at real steel density.
    mass: 57000,
    massTolerance: 0.1,
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
  // LOD2 keeps the interleaved wheels, open belt, camo and markings (critique: no popping).
  // Measured 68.9k / 17.4k / 3.41k: the Zimmerit is a strip now (11.1k tris of coating slab
  // with flake cuts at LOD0, none at LOD1/2), not 14.4k tris of ridge boxes.
  // LOD2: 3506 measured; the 96 triangles over the old 3500 are the tracks' outboard edges.
  budget: { triangles: [74000, 19000, 3600] },
  // Armour 25–120 mm (top 25, sides 60–80, front 100–120): a 60 mm mean wall approximates the
  // hollow hull and turret for mass; an approximation, not a per-plate model.
  physics: { shell: 0.06 },
  gaps: [
    {
      parts: ['track_*'],
      why: 'the track belt runs under the fenders and beside the hull with running clearance',
    },
  ],
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
    const rearSpec: RearSpec = {
      lod,
      deck: DECK,
      pannierZ: PANNIER_Z,
      rearLow: REAR_LOW,
      sideY: SIDE_Y,
      rearX,
      paint: dunkelgelb,
      dark: paintDark,
      steel,
      rust,
      black,
      red: hex('#7a1a12'),
    };
    const wobble = valueNoise(ctx.rng.fork('overspray'), { scale: 0.45, octaves: 2 });
    const weather = weatherer(ctx.rng.fork('weather'));
    // Flaked patches 10–40 cm across with a ragged break (the fine field roughens the outline).
    const chipBody = valueNoise(ctx.rng.fork('zimmerit'), { scale: 0.22, octaves: 2 });
    const chipEdge = valueNoise(ctx.rng.fork('zimmerit-edge'), { scale: 0.045, octaves: 1 });
    const chipNoise = (p: Vec3): number => chipBody(p) + 0.12 * chipEdge(p);
    const coatGrid = {
      // Flake edges cut on a 4.3 × 3.5 cm grid (LOD0 only: LOD1/2 plates take the strip).
      ds: COLUMN / 3,
      dt: 0.035,
      paint: dunkelgelb,
      paste,
      primer,
    };
    /** The coating's two layers: painted paste (camo over it) and flaked floors on the primer. */
    const coatJob = (c: Coating, at: Vec3, w: WeatheringOptions = {}): Mesh => {
      const o = { at, dust: 0.35, mud: 0.95, mudStrength: 0.9, ...w };
      const sprayed = camo(tessellate(c.coat, 0.4), dunkelgelb, blobs, wobble, at);
      return merge([weather(sprayed, o), weather(reproject(restrip(c.bare, STRIP_RULES)), o)]);
    };
    // Exhaust soot plumes on the rear plate and deck behind the engine.
    const soot = [1, -1].map((s) => ({
      at: [exhaustAt(rearSpec, s).x, s * 0.55, exhaustAt(rearSpec, s).top] as Vec3,
      radius: 0.75,
      strength: 0.85,
    }));
    /** Materials + dust + ragged mud, for parts that are not camouflaged (tracks, tools). */
    const finish = (m: Mesh, at: Vec3 = [0, 0, 0], w: WeatheringOptions = {}): Mesh =>
      weather(restrip(m, STRIP_RULES), { at, dust: 0.35, mud: 0.95, mudStrength: 0.9, ...w });
    /** The paint job: room for the spray, three-tone camo, materials at true scale, weathering. */
    const paintJob = (m: Mesh, at: Vec3 = [0, 0, 0], w: WeatheringOptions = {}): Mesh => {
      const sprayed = camo(
        tessellate(m, [0.4, 0.6, 1.1][lod] ?? 1.1),
        dunkelgelb,
        blobs,
        wobble,
        at,
      );
      return weather(reproject(restrip(sprayed, STRIP_RULES)), {
        at,
        dust: 0.35,
        mud: 0.95,
        mudStrength: 0.9,
        ...w,
      });
    };
    const wheels: Circle[] = STATIONS.map((x) => ({ x, z: WHEEL_Z, r: WHEEL_R }));
    const line = beltLine(wheels, [SPROCKET, IDLER], 0.1);

    // ---- Running gear, per side ----
    const stubs: Mesh[] = [];
    for (const side of ['l', 'r'] as const) {
      const s = side === 'l' ? 1 : -1;
      const ty = s * TRACK_Y;
      const flip = (m: Mesh): Mesh => (s > 0 ? m : place(m, { yaw: Math.PI }));
      const track = `track_${side}`;
      ctx.part(
        track,
        // Each link is weathered as if it sat 0.9 m up, under the ragged top of the 1.4 m mud:
        // packed mud with steel showing through in places, the same on every link of a side
        // (no dust: a link has no upward face for longer than half a turn of the belt).
        onGround(
          trackMesh(lod, line, ty, (link) =>
            finish(link, [0, ty, 0.9], { dust: 0, mud: 1.4, mudStrength: 0.85 }),
          ),
        ),
        { motion: tread(line, ty, stationsOf(lod, line)[0]?.len ?? 0.13) },
      );
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
      const spin = (rps: number) => ({
        motion: { kind: 'spin', axis: [0, 1, 0], rps } as const,
        clearOf: [track],
      });
      const gear = (m: Mesh, at: Vec3): Mesh => paintJob(m, at, { mud: 1.0, mudStrength: 0.9 });
      // Pressed/dished steel discs and cast sprocket rings: weighed as ~15 mm walls, not solids.
      const wall = { shell: 0.015 };
      STATIONS.forEach((x, i) => {
        const at: Vec3 = [x, ty, WHEEL_Z];
        // LOD2 keeps the interleave as one low-poly disc per station, so the side never goes flat.
        const m =
          lod === 2
            ? flip(farDisc(WHEEL_R, i % 2 === 0 ? 0.27 : 0.12))
            : flip(station(lod, i % 2 === 0));
        ctx.part(`wheel_${side}_${i}`, gear(m, at), { at, ...spin(0.8), ...wall });
      });
      const sAt: Vec3 = [SPROCKET.x, ty, SPROCKET.z];
      const sm =
        lod === 2
          ? // Hub ends where the LOD0 hub does (y = −0.32), on the final-drive housing's face.
            flip(farDisc(SPROCKET.r - 0.05, HORN_Y, 0.32 + HORN_Y))
          : flip(sprocket(lod, SPROCKET.r));
      ctx.part(`sprocket_${side}`, gear(sm, sAt), { at: sAt, ...spin(0.8), ...wall });
      const iAt: Vec3 = [IDLER.x, ty, IDLER.z];
      const im = lod === 2 ? flip(farDisc(IDLER.r, HORN_Y, 0.18)) : flip(idler(lod));
      ctx.part(`idler_${side}`, gear(im, iAt), { at: iAt, ...spin(0.9), ...wall });
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
        ...engineDeck(rearSpec),
        ...sideExtensions(rearSpec),
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
            // Side-plate tenon standing on the nose: its foot sinks 3 cm into the nose plate.
            size: [0.1, 0.08, 0.3],
            at: [HULL_FRONT - 0.05, s * 1.57, 1.17],
            color: dunkelgelb,
          }),
          // Front tow shackle lug: welded into the sloped lower nose plate (it used to stand
          // 1.2 cm off it), same face 8 cm behind the hull front.
          box({ size: [0.28, 0.07, 0.14], at: [HULL_FRONT - 0.218, s * 0.85, 0.72], color: steel }),
          box({ size: [0.16, 0.07, 0.14], at: [HULL_REAR + 0.04, s * 0.85, 0.82], color: steel }),
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
        // Driver's / radio operator's hatch: hinge block, lift handle, periscope hood.
        hull.push(
          box({ size: [0.12, 0.34, 0.06], at: [1.62, s * 0.72, DECK], color: paintDark }),
          cable(
            [
              [2.1, s * 0.66, DECK + 0.06],
              [2.1, s * 0.66, DECK + 0.1],
              [2.1, s * 0.78, DECK + 0.1],
              [2.1, s * 0.78, DECK + 0.06],
            ],
            0.018,
            steel,
          ),
          box({ size: [0.1, 0.16, 0.07], at: [2.28, s * 0.72, DECK], color: black }),
        );
      }
    }
    // Zimmerit on the pannier sides, driver's plate, nose and rear plate (README "Zimmerit"):
    // a 6 mm coating slab with flaked patches at LOD0; at LOD1/2 the plates take the strip.
    const hullCoat =
      lod === 0
        ? coating(
            [
              {
                path: [
                  [2.42, SIDE_Y],
                  [-3.0, SIDE_Y],
                ],
                z0: PANNIER_Z,
                z1: DECK - 0.004,
                wear: 1,
              },
              {
                path: [
                  [-3.0, -SIDE_Y],
                  [2.42, -SIDE_Y],
                ],
                z0: PANNIER_Z,
                z1: DECK - 0.004,
                wear: 1,
              },
              {
                path: [
                  [frontX(1.31), -1.58],
                  [frontX(1.31), 1.58],
                ],
                z0: 1.31,
                z1: DECK - 0.004,
                lean: TAN9,
                wear: 1,
              },
              {
                path: [
                  [noseAt(0.92), -0.98],
                  [noseAt(0.92), 0.98],
                ],
                z0: 0.92,
                z1: 1.19,
                lean: -TAN25,
                wear: 0.5,
              },
              {
                path: [
                  [rearX(1.2), 1.55],
                  [rearX(1.2), -1.55],
                ],
                z0: 1.2,
                z1: DECK - 0.004,
                lean: TAN9,
              },
            ],
            {
              ...coatGrid,
              // Balkenkreuz on both pannier sides: painted on intact coat.
              flake: flakes(chipNoise, [
                [
                  [-1.25, -2, 1.15],
                  [-0.55, 2, 1.8],
                ],
              ]),
              rng: ctx.rng.fork('zimmerit-hull'),
            },
          )
        : null;
    // Balkenkreuz on both pannier sides (white edges, black cross), kept to LOD2; painted on the
    // 6 mm Zimmerit, so it stands just proud of the coat face.
    for (const s of [1, -1]) {
      hull.push(
        sideDecal(cross(0.26, 0.1), s, -0.9, s * (SIDE_Y + 0.008), 1.48, white),
        sideDecal(cross(0.23, 0.06), s, -0.9, s * (SIDE_Y + 0.0095), 1.48, black),
      );
    }
    // Structure (closed plates + drive housings) vs dressing (Zimmerit, decals, fittings): the
    // structural solid is what clearance checks test against, so it stays lean and watertight.
    const structure = 2 + stubs.length;
    // Hull wall: 45 mm is the area-weighted mean of the armour table in README.md (25 mm deck,
    // belly and pannier floors; 60–80 mm sides; 80–100 mm front and rear).
    const hullMesh = paintJob(merge(hull.slice(0, structure)), [0, 0, 0], { soot });
    ctx.part('hull', lod > 0 ? coatFaces(hullMesh, onHullPlates) : hullMesh, { shell: 0.045 });
    // Zimmerit is a 6 mm cement-like paste, not armour: weighed as a 6 mm skin of paste
    // (~1600 kg/m³, unverified), ≈ 200 kg over the tank as in the 29 Dec 1943 allotment.
    if (hullCoat) ctx.part('zimmerit', coatJob(hullCoat, [0, 0, 0], { soot }), ZIM_MASS);
    if (hull.length > structure)
      ctx.part('hull_detail', paintJob(merge(hull.slice(structure)), [0, 0, 0], { soot }));

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
    fenders.push(...rearMudguards(rearSpec, -3.1));
    ctx.part('fenders', paintJob(merge(fenders), [0, 0, 0], { mud: 1.3 }));

    // ---- Particle sources: exhaust smoke, track dust ----
    for (const [side, s] of [
      ['l', 1],
      ['r', -1],
    ] as const) {
      ctx.emitter(`exhaust_smoke_${side}`, {
        kind: 'smoke',
        at: [exhaustAt(rearSpec, s).x, s * 0.55, exhaustAt(rearSpec, s).top],
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

    // ---- Rear plate: exhausts in armoured covers, crank cover, jack, lights, pintle ----
    ctx.part(
      'exhausts',
      finish(merge(rearPlate(rearSpec)), [0, 0, 0], {
        soot: soot.map((z) => ({ ...z, strength: 1 })),
      }),
    );

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
    if (tools.length > 0) ctx.part('stowage', paintJob(merge(tools), [0, 0, 0], { soot }));

    // ---- Turret: horseshoe plan prism, cupola, hatches, bin; traverses as one group ----
    ctx.group('turret', {
      at: TURRET_AT,
      motion: { kind: 'sway', axis: [0, 0, 1], degrees: 20, hz: 0.1 },
    });
    const arc = lod === 0 ? 18 : lod === 1 ? 10 : 8;
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
          [0.38, 0.98],
          [0.33, 1.01],
          [0.3, 1.03],
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
            [0.3, 1.03],
            [0.31, 1.07],
            [0.24, 1.1],
            [0, 1.1],
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
            at: [-0.55 + Math.cos(a) * 0.37, 0.62 + Math.sin(a) * 0.37, 0.9],
            yaw: a,
          }),
        );
      }
      turret.push(
        lathe({
          profile: Array.from({ length: 7 }, (_, i): Vec2 => {
            const a = (i / 6) * Math.PI * 2;
            return [0.36 + 0.015 * Math.cos(a), 1.045 + 0.015 * Math.sin(a)];
          }),
          segments: segs,
          at: [-0.55, 0.62, 0],
          color: steel,
        }),
        // Six brackets carry the AA ring off the cupola lip (each sunk into lip and ring).
        ...Array.from({ length: 6 }, (_, i) =>
          place(box({ size: [0.09, 0.025, 0.025], color: steel }), {
            at: [
              -0.55 + Math.cos((i / 6) * Math.PI * 2 + 0.25) * 0.33,
              0.62 + Math.sin((i / 6) * Math.PI * 2 + 0.25) * 0.33,
              1.0325,
            ],
            yaw: (i / 6) * Math.PI * 2 + 0.25,
          }),
        ),
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
        // The flat hatch on the 1.33 m wall: its base sinks 2.5 cm at the centre so the rim
        // (2.3 cm sagitta out at its sides) still seats in the wall; it stands 5.5 cm proud.
        place(
          lathe({
            profile: [
              [0.25, 0],
              [0.25, 0.06],
              [0.2, 0.08],
              [0, 0.08],
            ],
            segments: segs,
            axis: 'x',
            color: paintDark,
          }),
          {
            at: [-0.2 + 1.305 * Math.cos(hatchA), 1.305 * Math.sin(hatchA), 0.42],
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
    }
    // Turret number "332", outlined digits (Bundesarchiv Bild 101I-277-0846-08), both sides,
    // reading front-to-back on the left and back-to-front on the right. Painted on the Zimmerit:
    // each digit lies in the tangent plane of the wall facet under its centre (a supporting
    // plane of the convex plan, so the wall never pokes through), just proud of the 6 mm coat.
    const onWall = (poly: readonly Vec2[], s: number, x: number, off: number, c: Vec3): Mesh => {
      const xc = x - s * 0.075;
      const k = plan.findIndex((p, j) => {
        const q = plan[(j + 1) % plan.length] as Vec2;
        return p[1] * s > 0 && q[1] * s > 0 && (p[0] - xc) * (q[0] - xc) <= 0;
      });
      const p = plan[k] as Vec2;
      const q = plan[(k + 1) % plan.length] as Vec2;
      const l = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const t: Vec2 = [(q[0] - p[0]) / l, (q[1] - p[1]) / l];
      const f = (xc - p[0]) / (q[0] - p[0]);
      const w: Vec2 = [xc + t[1] * off, p[1] + (q[1] - p[1]) * f - t[0] * off];
      return planar({
        points: poly.map(
          ([u, v]): Vec3 => [w[0] + t[0] * (u - 0.075), w[1] + t[1] * (u - 0.075), 0.3 + v],
        ),
        color: c,
      });
    };
    for (const s of [1, -1])
      [3, 3, 2].forEach((d, i) => {
        const x = s > 0 ? 0.05 - i * 0.22 : -0.39 + i * 0.22;
        for (const rect of digitRects(d, 0.3)) {
          const grow = rect.map(
            ([u, v], k): Vec2 => [
              u + (k === 0 || k === 3 ? -0.012 : 0.012),
              v + (k < 2 ? -0.012 : 0.012),
            ],
          );
          turret.push(onWall(grow, s, x, 0.0075, black));
          turret.push(onWall(rect, s, x, 0.0085, white));
        }
      });
    // Turret wall: 80 mm sides, 25 mm roof and an open bottom (the closed prism's floor is not
    // real armour): ~45 mm area-weighted over the closed solid.
    const turretMesh = paintJob(merge(turret), TURRET_AT, { dust: 0.4 });
    ctx.part(
      'turret_body',
      lod > 0 ? coatFaces(turretMesh, onTurretWall, TURRET_PITCH) : turretMesh,
      { parent: 'turret', shell: 0.045 },
    );
    // Zimmerit round the turret walls (Wegmann's coarser ridges), from the flat cheeks behind the
    // front plate round the horseshoe to the other cheek, plus the front plate the mantlet leaves.
    if (lod === 0) {
      const turretCoat = coating(
        [
          { path: [...plan.slice(1), plan[0] as Vec2], z0: 0.03, z1: 0.83, pitch: TURRET_PITCH },
          // Front plate beside the mantlet's curled ends (clear of its elevation sweep).
          ...[-1, 1].map((s) => ({
            path: [
              [1.0, s < 0 ? -1.15 : 0.98],
              [1.0, s < 0 ? -0.98 : 1.15],
            ] as Vec2[],
            z0: 0.03,
            z1: 0.83,
            pitch: TURRET_PITCH,
          })),
        ],
        {
          ...coatGrid,
          // Turret number on both sides: painted on intact coat.
          flake: flakes(chipNoise, [
            [
              [-0.6, -2, 0.24],
              [0.24, 2, 0.68],
            ],
          ]),
          rng: ctx.rng.fork('zimmerit-turret'),
        },
      );
      ctx.part('turret_zimmerit', coatJob(turretCoat, TURRET_AT), {
        parent: 'turret',
        ...ZIM_MASS,
      });
    }

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
    // Mantlet: the broad cast plate (1.9 m wide, 0.72 m tall) whose ends curl back into the
    // turret front, with the gun collar, binocular sight apertures (left) and coax MG port (right).
    const endArc = lod === 0 ? 6 : lod === 1 ? 3 : 2;
    const plate: Vec2[] = [];
    for (const s of [-1, 1]) {
      const arc: Vec2[] = [];
      for (let i = 0; i <= endArc; i++) {
        const a = (Math.PI / 2) * (i / endArc);
        arc.push([-0.03 + 0.25 * Math.cos(a), s * (0.7 + 0.25 * Math.sin(a))]);
      }
      plate.push(...(s < 0 ? arc.reverse() : arc));
    }
    // Front edge first (y −0.95 → +0.95 via the rounded ends), then the straight back edge.
    const mParts = [
      prism({ profile: plate, depth: 0.72, plane: 'xy', color: dunkelgelb }),
      lathe({
        profile: [
          [0.24, 0.2],
          [0.24, 0.32],
          [0.2, 0.42],
          [0.17, 0.46],
        ],
        segments: segs,
        axis: 'x',
        color: dunkelgelb,
      }),
    ];
    if (lod < 2)
      mParts.push(
        box({ size: [0.03, 0.08, 0.1], at: [0.215, 0.36, 0.06], color: black }),
        box({ size: [0.03, 0.08, 0.1], at: [0.215, 0.5, 0.06], color: black }),
        lathe({
          profile: [
            [0.07, 0.2],
            [0.06, 0.25],
            [0.03, 0.26],
          ],
          segments: 8,
          axis: 'x',
          at: [0, -0.45, 0.02],
          color: paintDark,
        }),
      );
    if (lod === 0) {
      // Bolt heads round the plate face and the collar.
      const bolt = box({ size: [0.02, 0.035, 0.035], color: steel });
      // Seated on the face they hold: the rounded ends curve back, so outer bolts follow the
      // curve (turned to its normal) and every head sinks 5 mm.
      for (const y of [-0.85, -0.6, 0.6, 0.85]) {
        const u = Math.max(0, Math.abs(y) - 0.7) / 0.25;
        const a = Math.asin(u) * Math.sign(y);
        const x = -0.03 + 0.25 * Math.sqrt(1 - u * u);
        const at = (z: number): Vec3 => [x + 0.005 * Math.cos(a), y + 0.005 * Math.sin(a), z];
        for (const z of [-0.28, 0.24]) mParts.push(place(bolt, { at: at(z), yaw: a }));
      }
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        mParts.push(place(bolt, { at: [0.43, Math.cos(a) * 0.19, Math.sin(a) * 0.19 - 0.0175] }));
      }
    }
    const gunAt: Vec3 = [TURRET_AT[0] + 1.0, 0, TURRET_AT[2] + 0.42];
    const mantlet = paintJob(merge(mParts), gunAt);
    ctx.part('gun_mantlet', lod > 0 ? coatFaces(mantlet, onMantletFace, TURRET_PITCH) : mantlet, {
      parent: 'gun',
    });
    // Zimmerit on the mantlet face and its curled ends (both reference photos show it coated).
    if (lod === 0)
      ctx.part(
        'gun_zimmerit',
        coatJob(
          coating([{ path: plate, z0: -0.34, z1: 0.34, pitch: TURRET_PITCH, wear: 0.5 }], {
            ...coatGrid,
            flake: flakes(chipNoise, []),
            rng: ctx.rng.fork('zimmerit-mantlet'),
          }),
          gunAt,
        ),
        { parent: 'gun', ...ZIM_MASS },
      );
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
        // Muzzle brake blued and soot-stained by firing.
        { soot: [{ at: [gunAt[0] + 3.95, 0, gunAt[2]], radius: 0.7, strength: 0.75 }], dust: 0.2 },
      ),
      { parent: 'gun' },
    );
  },
});
