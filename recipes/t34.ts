// T-34/76 family. `t34` = Model 1943 (hexagonal "nut" turret, commander's cupola, side fuel drums,
// «LIDICE» as photographed on the 1st Czechoslovak brigade tank); `t34_1941` = cast turret with the
// big front hatch. Real: 6.68 m with gun (hull 5.92 m) × 3.00 m × 2.45 m (1941: 2.40 m); 830 mm
// Christie wheels, 550 mm track; 60° glacis, 40° side plates; 76.2 mm F-34 L/41.5.

import {
  applyAffine,
  beam,
  box,
  type Check,
  clear,
  cross,
  cylinder,
  defineFamily,
  frame,
  grime,
  hex,
  type Lod,
  lathe,
  type Mesh,
  merge,
  noOverlap,
  normalize,
  place,
  planar,
  prism,
  scale,
  sub,
  symmetric,
  touches,
  translate,
  type Vec2,
  type Vec3,
} from '@developerz-ai/ts23d';

const green = hex('#4e5a2c');
const greenDark = hex('#3a4422');
const rubber = hex('#252523');
const steel = hex('#45443f');
const trackSteel = hex('#4a4139');
const black = hex('#191919');
const white = hex('#e6e4da');
const rust = hex('#4a3426');

const TRACK_Y = 1.225;
const TRACK_W = 0.55;
const LINK_T = 0.06;
const WHEEL_R = 0.415;
const WHEEL_Z = 0.475;
const WHEELS_X = [1.82, 0.97, -0.08, -0.93, -1.78];
const IDLER = { x: 2.55, z: 0.6, r: 0.3 };
const SPROCKET = { x: -2.5, z: 0.58, r: 0.32 };
const BELLY = 0.4;
const PANNIER_Z = 1.0;
const DECK = 1.45;
const HULL_HALF = 2.96;
const NOSE: Vec2 = [HULL_HALF, 0.78];
const TAN60 = Math.tan(Math.PI / 3);
/** x of the glacis at height z (60° from vertical). */
const glacisX = (z: number): number => NOSE[0] - (z - NOSE[1]) * TAN60;
const REAR_PITCH = Math.atan2(-0.66, 0.75);
const TURRET_AT: Vec3 = [0.45, 0, DECK];

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

/** Waffle-pattern cast link (X along the run, Z outward); every other one has a guide horn. */
function trackLink(pitch: number, horn: boolean): Mesh {
  const parts = [
    box({
      size: [pitch * 0.88, TRACK_W, LINK_T * 0.6],
      at: [0, 0, -LINK_T * 0.3],
      color: trackSteel,
    }),
    box({
      size: [0.03, TRACK_W * 0.96, LINK_T * 0.4],
      at: [-pitch * 0.2, 0, 0],
      color: trackSteel,
    }),
    box({ size: [0.03, TRACK_W * 0.96, LINK_T * 0.4], at: [pitch * 0.2, 0, 0], color: trackSteel }),
  ];
  if (horn)
    parts.push(
      box({ size: [pitch * 0.5, 0.06, 0.13], at: [0, 0, -LINK_T * 0.3 - 0.13], color: steel }),
    );
  return merge(parts);
}

function trackMesh(lod: Lod, line: readonly Vec2[], y: number): Mesh {
  if (lod === 2) {
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
  const stations = resample(line, Math.round(perimeter / (lod === 0 ? 0.172 : 0.25)));
  const len = stations[0]?.len ?? 0.172;
  const band = box({
    size: [len * 1.04, TRACK_W, LINK_T],
    at: [0, 0, -LINK_T / 2],
    color: trackSteel,
  });
  const links = [trackLink(len, true), trackLink(len, false)];
  return merge(
    stations.map((s, i) =>
      place(lod === 0 ? (links[i % 2] as Mesh) : band, {
        at: [s.p[0], y, s.p[1]],
        pitch: s.pitch,
      }),
    ),
  );
}

// ---------------------------------------------------------------- wheels

/** One half of a Christie double wheel: rubber tyre + stamped dished disc. Axis Y, face +Y. */
function wheelHalf(lod: Lod, r: number, w: number, ribs: number, paint: Vec3): Mesh {
  const segs = [24, 12, 8][lod] ?? 8;
  const h = w / 2;
  const tyre = lathe({
    profile: [
      [r - 0.07, -h],
      [r - 0.01, -h],
      [r, -h + 0.015],
      [r, h - 0.015],
      [r - 0.01, h],
      [r - 0.07, h],
    ],
    segments: segs,
    axis: 'y',
    color: rubber,
  });
  const face: Vec2[] =
    lod === 0
      ? [
          [r - 0.07, h - 0.005],
          [r * 0.72, h - 0.04],
          [r * 0.36, h - 0.05],
          [r * 0.3, h - 0.01],
          [r * 0.2, h + 0.03],
          [r * 0.1, h + 0.045],
          [0, h + 0.05],
        ]
      : [
          [r - 0.07, h - 0.005],
          [r * 0.35, h - 0.04],
          [r * 0.2, h + 0.03],
          [0, h + 0.04],
        ];
  const back = face.map(([fr, fz]) => [fr, -fz] as Vec2).reverse();
  const parts = [
    tyre,
    lathe({ profile: [...back, ...face], segments: segs, axis: 'y', color: paint }),
  ];
  if (lod === 0) {
    // Stamped radial ribs and hub bolts.
    const rib = box({ size: [0.035, 0.025, r * 0.36], at: [0, 0, r * 0.33], color: paint });
    const bolt = box({ size: [0.03, 0.03, 0.03], at: [0, 0, -0.015], color: greenDark });
    for (let i = 0; i < ribs; i++) {
      const a = (i / ribs) * Math.PI * 2;
      parts.push(place(rib, { at: [0, h - 0.035, 0], pitch: a }));
      const b = a + Math.PI / ribs;
      parts.push(place(bolt, { at: [Math.sin(b) * r * 0.16, h + 0.045, Math.cos(b) * r * 0.16] }));
    }
  }
  return merge(parts);
}

/** Double road wheel: two halves straddling the guide horns. */
function christie(lod: Lod, r: number, ribs: number, paint: Vec3): Mesh {
  const half = wheelHalf(lod, r, 0.17, ribs, paint);
  return merge([
    translate(half, [0, 0.135, 0]),
    translate(place(half, { yaw: Math.PI }), [0, -0.135, 0]),
  ]);
}

/** Rear drive sprocket: two discs joined by six rollers that engage the guide horns. */
function sprocket(lod: Lod, r: number, paint: Vec3): Mesh {
  const segs = [24, 12, 8][lod] ?? 8;
  const disc = (y: number): Mesh =>
    lathe({
      profile: [
        [0.1, y - 0.03],
        [r, y - 0.03],
        [r, y + 0.03],
        [0.1, y + 0.03],
      ],
      segments: segs,
      axis: 'y',
      color: paint,
    });
  const parts = [
    disc(0.1),
    disc(-0.1),
    lathe({
      profile: [
        [0.16, -0.25],
        [0.16, 0.2],
        [0.1, 0.27],
        [0, 0.27],
      ],
      segments: segs,
      axis: 'y',
      color: greenDark,
    }),
  ];
  if (lod === 0)
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      parts.push(
        cylinder({
          radius: 0.05,
          length: 0.2,
          segments: 8,
          axis: 'y',
          at: [Math.cos(a) * (r - 0.06), 0, Math.sin(a) * (r - 0.06)],
          color: steel,
        }),
      );
    }
  return merge(parts);
}

// ---------------------------------------------------------------- solids and details

/** Solid between two parallel polygons with matching vertices (CCW from above): sloped armour. */
function taper(bottom: readonly Vec3[], top: readonly Vec3[], color: Vec3): Mesh {
  const faces = [planar({ points: [...bottom].reverse(), color, strip: 'iron' })];
  faces.push(planar({ points: top, color, strip: 'iron' }));
  bottom.forEach((b, i) => {
    const j = (i + 1) % bottom.length;
    faces.push(
      planar({
        points: [b, bottom[j] as Vec3, top[j] as Vec3, top[i] as Vec3],
        color,
        strip: 'iron',
      }),
    );
  });
  return merge(faces);
}

function cable(points: readonly Vec3[], d: number, color: Vec3): Mesh {
  return merge(
    points
      .slice(1)
      .map((to, i) => beam({ from: points[i] as Vec3, to, width: d, segments: 5, color })),
  );
}

/** Grime in world space for a part authored around its own pivot. */
const muddy = (m: Mesh, at: Vec3 = [0, 0, 0]): Mesh =>
  translate(grime(translate(m, at), { ground: 1.0, groundStrength: 0.5 }), [
    -at[0],
    -at[1],
    -at[2],
  ]);

/** Place a detail flat on the glacis at height z (local Z → plate normal, local X → downslope). */
const onGlacis = (m: Mesh, y: number, z: number): Mesh =>
  place(m, { at: [glacisX(z), y, z], pitch: Math.PI / 6 });

/** Run a check only at LODs where `part` exists (running gear is dropped at LOD2). */
const whenBuilt =
  (part: string, check: Check): Check =>
  (asset) =>
    asset.parts.some((p) => p.name === part && p.mesh) ? check(asset) : [];

// ---------------------------------------------------------------- lettering

/** Block capitals on a 4 × 6 grid as stroke segments; enough for slogans and numbers. */
const GLYPHS: Record<string, readonly (readonly [number, number, number, number])[]> = {
  L: [
    [0, 0, 0, 6],
    [0, 0, 4, 0],
  ],
  I: [
    [2, 0, 2, 6],
    [1, 0, 3, 0],
    [1, 6, 3, 6],
  ],
  D: [
    [0, 0, 0, 6],
    [0, 6, 3, 6],
    [3, 6, 4, 5],
    [4, 5, 4, 1],
    [4, 1, 3, 0],
    [3, 0, 0, 0],
  ],
  C: [
    [4, 6, 0, 6],
    [0, 6, 0, 0],
    [0, 0, 4, 0],
  ],
  E: [
    [0, 0, 0, 6],
    [0, 6, 4, 6],
    [0, 3, 3, 3],
    [0, 0, 4, 0],
  ],
  '"': [
    [1, 6, 1, 4.5],
    [2.5, 6, 2.5, 4.5],
  ],
};

/** Text as stroke quads (u right, v up), letter height `h`, CCW in (u, v). */
function lettering(text: string, h: number): Vec2[][] {
  const k = h / 6;
  const t = 0.9 * k;
  const out: Vec2[][] = [];
  [...text].forEach((ch, i) => {
    for (const [x0, y0, x1, y1] of GLYPHS[ch] ?? []) {
      const a: Vec2 = [(x0 + i * 5.5) * k, y0 * k];
      const b: Vec2 = [(x1 + i * 5.5) * k, y1 * k];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const d: Vec2 = [((b[0] - a[0]) / l) * (t / 2), ((b[1] - a[1]) / l) * (t / 2)];
      const n: Vec2 = [-d[1], d[0]];
      out.push([
        [a[0] - n[0] - d[0], a[1] - n[1] - d[1]],
        [b[0] - n[0] + d[0], b[1] - n[1] + d[1]],
        [b[0] + n[0] + d[0], b[1] + n[1] + d[1]],
        [a[0] + n[0] - d[0], a[1] + n[1] - d[1]],
      ]);
    }
  });
  return out;
}

/**
 * Paint flat quads onto a (possibly sloped) plate. `a` → `b` is the plate's bottom edge in the
 * reading direction, `up` a point higher on the plate; the decal stands 8 mm proud.
 */
function plateDecal(quads: readonly Vec2[][], a: Vec3, b: Vec3, up: Vec3, at: Vec2, c: Vec3) {
  const u = normalize(sub(b, a));
  const raw = sub(up, a);
  const v = normalize(sub(raw, scale(u, raw[0] * u[0] + raw[1] * u[1] + raw[2] * u[2])));
  const n = cross(u, v);
  const o: Vec3 = [
    a[0] + u[0] * at[0] + v[0] * at[1] + n[0] * 0.008,
    a[1] + u[1] * at[0] + v[1] * at[1] + n[1] * 0.008,
    a[2] + u[2] * at[0] + v[2] * at[1] + n[2] * 0.008,
  ];
  return merge(
    quads.map((q) =>
      applyAffine(
        planar({ points: q.map(([x, y]): Vec3 => [x, y, 0]), color: c }),
        frame(u, v, n, o),
      ),
    ),
  );
}

// ---------------------------------------------------------------- turrets

interface Params {
  /** 1941: cast turret with one big front hatch; 1943: hexagonal "nut" with twin roof hatches. */
  readonly turret: 'cast1941' | 'hex1943';
  readonly cupola: boolean;
  readonly fuelDrums: boolean;
  /** White turret-side slogan, as photographed (null = unmarked). */
  readonly slogan: string | null;
}

type Shell = { bottom: Vec3[]; top: Vec3[] };

function turretShell(kind: Params['turret']): Shell {
  if (kind === 'hex1943')
    return {
      bottom: [
        [1.0, -0.62, 0],
        [1.0, 0.62, 0],
        [0.15, 1.0, 0],
        [-1.1, 0.72, 0],
        [-1.1, -0.72, 0],
        [0.15, -1.0, 0],
      ],
      top: [
        [0.78, -0.46, 0.72],
        [0.78, 0.46, 0.72],
        [0.1, 0.76, 0.72],
        [-0.92, 0.56, 0.72],
        [-0.92, -0.56, 0.72],
        [0.1, -0.76, 0.72],
      ],
    };
  // Cast 1941 turret: narrow nose, rounded sides, long rear overhang.
  const ring = (rx: number, ry: number, z: number, front: number, rear: number): Vec3[] =>
    [
      [front, -ry * 0.62, z],
      [front, ry * 0.62, z],
      [front - 0.35, ry * 0.92, z],
      [0.0, ry, z],
      [-0.55, ry * 0.95, z],
      [rear + 0.25, ry * 0.7, z],
      [rear, ry * 0.3, z],
      [rear, -ry * 0.3, z],
      [rear + 0.25, -ry * 0.7, z],
      [-0.55, -ry * 0.95, z],
      [0.0, -ry, z],
      [front - 0.35, -ry * 0.92, z],
    ].map(([x, y, zz]): Vec3 => [(x ?? 0) * rx, y ?? 0, zz ?? 0]);
  return { bottom: ring(1, 0.92, 0, 0.98, -1.2), top: ring(0.92, 0.7, 0.66, 0.85, -1.08) };
}

// ---------------------------------------------------------------- the family

const t34Family = defineFamily<Params>({
  kind: 'vehicle',
  tags: ['military', 'tracked', 'ww2'],
  sources: [
    'https://en.wikipedia.org/wiki/T-34 (T-34/76 specifications: 6.68 × 3.00 × 2.45 m, hull 5.92 m)',
    'https://en.wikipedia.org/wiki/76_mm_tank_gun_M1940_F-34 (L/41.5 → 3.162 m barrel)',
    'Zaloga & Grandsen, T-34 in Action (Squadron/Signal 1981): 830 mm road wheels, 550 mm track, plate angles',
    'https://commons.wikimedia.org/wiki/File:Tank_Lidice,_čs._armáda_v_SSSR.png («LIDICE» slogan, Model 1943 with cupola and side drums)',
  ],
  real: {
    length: 6.68,
    width: 3.0,
    height: 2.45,
    measures: [
      { label: 'road wheel diameter', axis: 'z', value: 0.83, parts: ['wheel_l_0'] },
      { label: 'track width', axis: 'y', value: 0.55, parts: ['track_l'] },
      {
        label: 'track centres',
        axis: 'y',
        value: 2.45,
        between: ['track_l', 'track_r'],
        source: '3.00 m overall − 0.55 m track',
      },
      { label: 'hull length', axis: 'x', value: 5.92, parts: ['hull'] },
      {
        label: 'F-34 barrel length (L/41.5)',
        axis: 'x',
        value: 3.162,
        parts: ['gun_barrel'],
        source: 'https://en.wikipedia.org/wiki/76_mm_tank_gun_M1940_F-34',
      },
    ],
  },
  budget: { triangles: [60000, 14000, 800] },
  checks: [
    clear('track_*', 'hull'),
    clear('wheel_*', 'hull'),
    noOverlap('wheel_l_*'),
    noOverlap('wheel_r_*'),
    touches('turret_body', 'hull'),
    whenBuilt('sprocket_l', touches('sprocket_l', 'hull')),
    whenBuilt('idler_l', touches('idler_l', 'hull')),
    symmetric('_l', '_r', 'y'),
  ],
  defaults: { turret: 'hex1943', cupola: true, fuelDrums: true, slogan: '"LIDICE"' },
  build(ctx, p) {
    const lod = ctx.lod;
    const segs = ctx.pick([20, 14, 8]);
    // Factory paint varies a little from tank to tank.
    const paint = ctx.rng.fork('paint').jitter(green, 0.04);
    const wheels: Circle[] = WHEELS_X.map((x) => ({ x, z: WHEEL_Z, r: WHEEL_R }));
    const line = beltLine(wheels, [IDLER, SPROCKET], 0.06);

    // ---- Running gear ----
    const stubs: Mesh[] = [];
    for (const side of ['l', 'r'] as const) {
      const s = side === 'l' ? 1 : -1;
      const y = s * TRACK_Y;
      const track = `track_${side}`;
      ctx.part(track, muddy(trackMesh(lod, line, y)));
      // Idler crank and final-drive housing: what holds idler and sprocket to the hull side.
      stubs.push(
        cylinder({
          radius: 0.1,
          length: 0.05,
          segments: segs,
          axis: 'y',
          at: [IDLER.x, s * 0.93, IDLER.z],
          color: paint,
        }),
        cylinder({
          radius: 0.16,
          length: 0.07,
          segments: segs,
          axis: 'y',
          at: [SPROCKET.x, s * 0.94, SPROCKET.z],
          color: paint,
        }),
      );
      if (lod === 2) continue;
      const flip = (m: Mesh): Mesh => (s > 0 ? m : place(m, { yaw: Math.PI }));
      const wheel = christie(lod, WHEEL_R, 8, paint);
      WHEELS_X.forEach((x, i) => {
        ctx.part(`wheel_${side}_${i}`, muddy(flip(wheel), [x, y, WHEEL_Z]), {
          at: [x, y, WHEEL_Z],
          motion: { kind: 'spin', axis: [0, 1, 0], rps: 0.75 },
          clearOf: [track],
        });
      });
      ctx.part(
        `idler_${side}`,
        muddy(flip(christie(lod, IDLER.r, 6, paint)), [IDLER.x, y, IDLER.z]),
        {
          at: [IDLER.x, y, IDLER.z],
          motion: { kind: 'spin', axis: [0, 1, 0], rps: 1.0 },
          clearOf: [track],
        },
      );
      ctx.part(
        `sprocket_${side}`,
        muddy(flip(sprocket(lod, SPROCKET.r, paint)), [SPROCKET.x, y, SPROCKET.z]),
        {
          at: [SPROCKET.x, y, SPROCKET.z],
          motion: { kind: 'spin', axis: [0, 1, 0], rps: 1.0 },
          clearOf: [track],
        },
      );
      ctx.emitter(`track_dust_${side}`, {
        kind: 'dust',
        at: [SPROCKET.x - 0.4, y, 0.15],
        dir: [-1, 0, 0.4],
        rate: 30,
        life: 1.6,
        size: [0.3, 1.6],
        color: hex('#9a8a6a'),
        speed: 1.2,
        spreadDeg: 35,
        when: 'moving',
      });
    }

    // ---- Hull structure: tub between the tracks + sloped upper hull (60° glacis, 40° sides) ----
    const tub: Vec2[] = [
      [-2.72, BELLY],
      [2.42, BELLY],
      NOSE,
      [glacisX(PANNIER_Z), PANNIER_Z],
      [-HULL_HALF, PANNIER_Z],
      [-HULL_HALF, 0.72],
    ];
    const lowX = glacisX(PANNIER_Z);
    const topX = glacisX(DECK);
    ctx.part(
      'hull',
      muddy(
        merge([
          prism({ profile: tub, depth: 1.84, plane: 'xz', color: paint, strip: 'iron' }),
          taper(
            [
              [lowX, -1.5, PANNIER_Z],
              [lowX, 1.5, PANNIER_Z],
              [-HULL_HALF, 1.5, PANNIER_Z],
              [-HULL_HALF, -1.5, PANNIER_Z],
            ],
            [
              [topX, -1.12, DECK],
              [topX, 1.12, DECK],
              [-2.45, 1.12, DECK],
              [-2.45, -1.12, DECK],
            ],
            paint,
          ),
          ...stubs,
        ]),
      ),
    );

    // ---- Hull dressing ----
    const detail: Mesh[] = [];
    for (const s of [1, -1])
      detail.push(
        planar({
          points: [
            [lowX, s * 0.95, PANNIER_Z],
            [lowX, s * 1.5, PANNIER_Z],
            [3.0, s * 1.5, 0.93],
            [3.0, s * 0.95, 0.93],
          ],
          color: paint,
          doubleSided: true,
        }),
      );
    if (lod < 2) {
      // Driver's hatch (left) with twin periscopes; hull MG ball (right); headlight.
      detail.push(
        onGlacis(box({ size: [0.5, 0.55, 0.07], color: greenDark }), 0.42, 1.2),
        onGlacis(
          box({ size: [0.08, 0.12, 0.09], at: [-0.12, 0.13, 0.07], color: black }),
          0.42,
          1.2,
        ),
        onGlacis(
          box({ size: [0.08, 0.12, 0.09], at: [-0.12, -0.13, 0.07], color: black }),
          0.42,
          1.2,
        ),
        onGlacis(
          lathe({
            profile: [
              [0.17, 0],
              [0.16, 0.06],
              [0.1, 0.11],
              [0, 0.12],
            ],
            segments: segs,
            color: paint,
          }),
          -0.5,
          1.12,
        ),
        beam({
          from: [glacisX(1.12) + 0.08, -0.5, 1.17],
          to: [glacisX(1.12) + 0.45, -0.5, 1.12],
          width: 0.035,
          segments: 6,
          color: black,
        }),
        lathe({
          profile: [
            [0.05, 0],
            [0.09, 0.05],
            [0.09, 0.14],
            [0, 0.15],
          ],
          segments: 10,
          axis: 'x',
          at: [lowX - 0.05, 1.1, PANNIER_Z + 0.12],
          color: greenDark,
        }),
        // Engine deck: access hatch, rear-plate transmission hatch.
        box({ size: [1.0, 0.95, 0.05], at: [-1.6, 0, DECK], color: greenDark }),
        place(
          lathe({
            profile: [
              [0.3, 0],
              [0.3, 0.04],
              [0.26, 0.07],
              [0, 0.08],
            ],
            segments: segs,
            color: greenDark,
          }),
          { at: [-2.705, 0, 1.225], pitch: REAR_PITCH },
        ),
      );
      for (const s of [1, -1]) {
        detail.push(
          beam({
            from: [-2.78, s * 0.55, 1.14],
            to: [-3.06, s * 0.55, 1.04],
            width: 0.13,
            segments: 8,
            color: rust,
          }),
          box({ size: [0.22, 0.24, 0.05], at: [-2.83, s * 0.55, 1.2], color: paint }),
        );
        if (lod === 0)
          for (let k = 0; k < 7; k++)
            detail.push(
              box({
                size: [0.95, 0.05, 0.03],
                at: [-1.55, s * (0.62 + k * 0.065), DECK],
                color: greenDark,
              }),
            );
        else
          detail.push(
            box({ size: [0.95, 0.42, 0.03], at: [-1.55, s * 0.8, DECK], color: greenDark }),
          );
      }
    }
    if (lod === 0) {
      // Tow hooks, spare links on the glacis, rear-plate bolts, side tow cables, rider rails.
      for (const s of [1, -1]) {
        detail.push(
          beam({
            from: [2.85, s * 0.7, 0.72],
            to: [3.05, s * 0.7, 0.7],
            width: 0.06,
            color: steel,
          }),
          beam({
            from: [-2.9, s * 0.7, 0.75],
            to: [-3.08, s * 0.7, 0.75],
            width: 0.06,
            color: steel,
          }),
          cable(
            [
              [1.6, s * 1.42, 1.1],
              [-2.4, s * 1.42, 1.1],
              [-2.55, s * 1.4, 1.18],
              [-2.4, s * 1.36, 1.25],
              [1.5, s * 1.36, 1.25],
              [1.65, s * 1.4, 1.18],
            ],
            0.035,
            steel,
          ),
        );
        const railY = s * 1.2;
        detail.push(
          beam({
            from: [1.2, railY, 1.38],
            to: [-2.2, railY, 1.38],
            width: 0.025,
            segments: 5,
            color: steel,
          }),
        );
        for (const x of [1.2, 0.0, -1.1, -2.2])
          detail.push(
            beam({ from: [x, railY, 1.33], to: [x, railY, 1.38], width: 0.025, color: steel }),
          );
      }
      const spare = place(trackLink(0.172, true), { yaw: Math.PI / 2 });
      for (const y of [-0.55, -0.35, 0.0, 0.2])
        detail.push(onGlacis(translate(spare, [0, 0, LINK_T * 0.6]), y, 0.92));
      const bolt = box({ size: [0.035, 0.035, 0.03], color: greenDark });
      for (let k = 0; k < 16; k++) {
        const y = -1.0 + (2.0 * k) / 15;
        for (const t of [0.06, 0.94])
          detail.push(
            place(bolt, {
              at: [-HULL_HALF + 0.51 * t, y, PANNIER_Z + 0.45 * t],
              pitch: REAR_PITCH,
            }),
          );
      }
    }
    if (p.fuelDrums && lod < 2) {
      // External fuel drums strapped high on the rear side plates (40° slope: normal y·0.77, z·0.64).
      for (const s of [1, -1])
        for (const x of [-1.25, -2.05]) {
          const c: Vec3 = [x, s * (1.247 + 0.18 * 0.766), 1.3 + 0.18 * 0.643];
          detail.push(
            cylinder({
              radius: 0.18,
              length: 0.72,
              segments: segs,
              axis: 'x',
              at: c,
              color: paint,
            }),
          );
          if (lod === 0)
            for (const dx of [-0.22, 0.22])
              detail.push(
                cylinder({
                  radius: 0.19,
                  length: 0.04,
                  segments: segs,
                  axis: 'x',
                  at: [x + dx, c[1], c[2]],
                  color: greenDark,
                }),
              );
        }
    }
    ctx.part(
      'fittings',
      grime(merge(detail), {
        ground: 1.0,
        groundStrength: 0.5,
        zones: [
          { at: [-3.0, 0.55, 1.05], radius: 0.5, strength: 0.7 },
          { at: [-3.0, -0.55, 1.05], radius: 0.5, strength: 0.7 },
        ],
      }),
    );
    for (const [side, s] of [
      ['l', 1],
      ['r', -1],
    ] as const)
      ctx.emitter(`exhaust_smoke_${side}`, {
        kind: 'smoke',
        at: [-3.08, s * 0.55, 1.03],
        dir: [-1, 0, 0.3],
        rate: 14,
        life: 2.5,
        size: [0.2, 1.3],
        color: hex('#38362f'),
        speed: 1.5,
        spreadDeg: 15,
        when: 'always',
      });

    // ---- Turret ----
    ctx.group('turret', {
      at: TURRET_AT,
      motion: { kind: 'sway', axis: [0, 0, 1], degrees: 20, hz: 0.1 },
    });
    const shell = turretShell(p.turret);
    const roofZ = shell.top[0]?.[2] ?? 0.7;
    const turret: Mesh[] = [taper(shell.bottom, shell.top, paint)];
    if (p.cupola)
      turret.push(
        lathe({
          profile: [
            [0.34, roofZ - 0.02],
            [0.34, roofZ + 0.18],
            [0.3, roofZ + 0.23],
            [0.24, roofZ + 0.28],
            [0, roofZ + 0.28],
          ],
          segments: segs,
          at: [-0.4, 0.38, 0],
          color: paint,
          caps: true,
        }),
      );
    if (lod < 2) {
      if (p.turret === 'hex1943')
        turret.push(
          lathe({
            profile: [
              [0.27, roofZ - 0.02],
              [0.27, roofZ + 0.04],
              [0.2, roofZ + 0.08],
              [0, roofZ + 0.09],
            ],
            segments: segs,
            at: [-0.35, -0.38, 0],
            color: greenDark,
          }),
          box({ size: [0.12, 0.1, 0.12], at: [0.35, -0.38, roofZ - 0.01], color: greenDark }),
        );
      else
        turret.push(
          // The 1941 turret's single big hatch, hinged at the front, and two periscopes.
          box({ size: [0.95, 0.85, 0.06], at: [-0.35, 0, roofZ - 0.01], color: greenDark }),
          box({ size: [0.14, 0.12, 0.2], at: [0.45, -0.3, roofZ - 0.01], color: greenDark }),
          box({ size: [0.12, 0.1, 0.12], at: [0.45, 0.3, roofZ - 0.01], color: greenDark }),
        );
    }
    if (lod === 0) {
      if (p.cupola)
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 + 0.6;
          turret.push(
            box({
              size: [0.09, 0.09, 0.07],
              at: [-0.4 + Math.cos(a) * 0.33, 0.38 + Math.sin(a) * 0.33, roofZ + 0.12],
              color: black,
            }),
          );
        }
      // Grab handles on the sloped sides, pistol ports, lifting hooks.
      for (const s of [1, -1])
        turret.push(
          cable(
            [
              [0.3, s * 0.97, 0.18],
              [0.3, s * 1.0, 0.24],
              [-0.6, s * 0.85, 0.24],
              [-0.6, s * 0.82, 0.18],
            ],
            0.025,
            steel,
          ),
          box({ size: [0.12, 0.05, 0.06], at: [0.45, s * 0.6, roofZ - 0.01], color: greenDark }),
        );
    }
    if (p.slogan && lod < 2) {
      // White slogan on both rear side faces, read from outside, front to back.
      const b = shell.bottom;
      const t = shell.top;
      const text = lettering(p.slogan, 0.14);
      const width = Math.max(...text.flat().map((q) => q[0]));
      for (const [i0, i1] of [
        [2, 3],
        [4, 5],
      ] as const) {
        const a = b[i0] as Vec3;
        const c = b[i1] as Vec3;
        const up = t[i0] as Vec3;
        const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
        turret.push(plateDecal(text, a, c, up, [(len - width) / 2, 0.24], white));
      }
    }
    ctx.part('turret_body', muddy(merge(turret), TURRET_AT), { parent: 'turret' });

    // ---- Gun: cast mantlet + cradle + F-34 barrel; elevation sways ----
    const gunZ = 0.32;
    const front =
      (shell.bottom[0]?.[0] ?? 1) -
      ((shell.bottom[0]?.[0] ?? 1) - (shell.top[0]?.[0] ?? 0.8)) * (gunZ / roofZ);
    // The elevation sweep is checked as a full turn about the trunnion, so it passes through the
    // turret and front deck; the real arc (−5°…+25°) clears both.
    ctx.group('gun', {
      at: [front, 0, gunZ],
      parent: 'turret',
      motion: { kind: 'sway', axis: [0, 1, 0], degrees: 5, hz: 0.25 },
      clearOf: ['turret_body', 'hull', 'fittings'],
    });
    ctx.emitter('muzzle', {
      kind: 'muzzle',
      parent: 'gun',
      at: [2.4, 0, 0],
      dir: [1, 0, 0],
      rate: 60,
      life: 0.2,
      size: [0.3, 1.5],
      speed: 12,
      spreadDeg: 25,
      when: 'event',
    });
    const mantlet: Vec2[] = [
      [0, -0.27],
      [0.16, -0.27],
      [0.25, -0.16],
      [0.28, 0],
      [0.25, 0.16],
      [0.16, 0.27],
      [0, 0.27],
    ];
    const mParts = [prism({ profile: mantlet, depth: 0.78, plane: 'xz', color: paint })];
    if (lod === 0)
      mParts.push(
        box({ size: [0.04, 0.07, 0.07], at: [0.26, 0.2, -0.03], color: black }),
        box({ size: [0.04, 0.06, 0.06], at: [0.25, -0.17, 0.1], color: black }),
      );
    ctx.part('gun_mantlet', merge(mParts), { parent: 'gun' });
    const tip = 2.37;
    const breech = tip - 3.162;
    ctx.part(
      'gun_barrel',
      lathe({
        profile:
          lod === 0
            ? [
                [0.1, breech],
                [0.14, 0.2],
                [0.2, 0.26],
                [0.2, 0.29],
                [0.14, 0.3],
                [0.14, 0.62],
                [0.11, 0.66],
                [0.075, 0.7],
                [0.068, 1.3],
                [0.058, 2.28],
                [0.064, 2.3],
                [0.064, tip],
                [0.04, tip],
                [0.04, 2.3],
              ]
            : [
                [0.1, breech],
                [0.14, 0.2],
                [0.2, 0.26],
                [0.2, 0.29],
                [0.14, 0.3],
                [0.14, 0.62],
                [0.075, 0.7],
                [0.06, tip],
              ],
        segments: ctx.pick([14, 10, 6]),
        axis: 'x',
        color: paint,
        caps: true,
      }),
      { parent: 'gun' },
    );
  },
});

/** T-34/76 Model 1943: hex turret with cupola, side fuel drums, «LIDICE» (1st Czechoslovak bde). */
export const t34 = t34Family.variant({
  name: 't34',
  description:
    'T-34/76 Model 1943 — hexagonal turret with cupola, Christie double wheels, waffle track link by link, «LIDICE»',
});

/** T-34/76 Model 1941: cast turret with the single big hatch, no cupola, no drums, unmarked. */
export const t34_1941 = t34Family.variant({
  name: 't34_1941',
  description: 'T-34/76 Model 1941 — cast turret with the big front hatch, F-34 gun',
  params: { turret: 'cast1941', cupola: false, fuelDrums: false, slogan: null },
  real: {
    length: 6.68,
    width: 3.0,
    height: 2.4,
    measures: [
      { label: 'road wheel diameter', axis: 'z', value: 0.83, parts: ['wheel_l_0'] },
      { label: 'track width', axis: 'y', value: 0.55, parts: ['track_l'] },
      { label: 'track centres', axis: 'y', value: 2.45, between: ['track_l', 'track_r'] },
      { label: 'hull length', axis: 'x', value: 5.92, parts: ['hull'] },
      { label: 'F-34 barrel length (L/41.5)', axis: 'x', value: 3.162, parts: ['gun_barrel'] },
    ],
  },
});
