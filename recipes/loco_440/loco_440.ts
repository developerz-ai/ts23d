// American 4-4-0 in "Jupiter" colours (Schenectady 1868, Central Pacific No. 60; 1979 replica at
// Golden Spike NHP): 5 ft 4 in (1.626 m) drivers, 16 × 24 in cylinders, 1.435 m gauge; engine +
// tender ≈ 17.4 m × 2.8 m × 4.6 m (overall box estimated from the photo with drivers as ruler).
// A family over the Whyte arrangement: the frame, boiler and rods are laid out from it.

import {
  applyAffine,
  beam,
  box,
  type Check,
  clear,
  cylinder,
  defineFamily,
  frame,
  grime,
  hex,
  inspect,
  type Lod,
  lathe,
  livery,
  type Mesh,
  merge,
  noOverlap,
  place,
  planar,
  prism,
  touches,
  translate,
  type Vec2,
  type Vec3,
  whyteAxles,
} from '@developerz-ai/ts23d';

const blue = hex('#2446a8');
const blueDark = hex('#182f73');
const red = hex('#b3241d');
const brass = hex('#c9a24a');
const jacket = hex('#1f2536');
const black = hex('#151515');
const iron = hex('#2e2e30');
const wood = hex('#6b4a2e');
const woodLight = hex('#8a6640');
const glass = hex('#2b3a44');
const ballast = hex('#8f8a80');
const tieWood = hex('#4a3a2c');
const rail = hex('#5c5650');

// Track and wheels (metres; +X forward, Z up).
const GAUGE = 1.435;
const HEAD = 0.072;
const TIE_H = 0.15;
const RAIL_H = 0.14;
const RAIL_TOP = TIE_H + RAIL_H;
const RAIL_Y = GAUGE / 2 + HEAD / 2;
const TREAD_W = 0.13;
const DRIVER_R = 0.813;
const LEAD_R = 0.38;
const TENDER_R = 0.38;
/** Gap between wheel rims; gives the (estimated) 8 ft driver wheelbase with 1.626 m drivers. */
const SPACING = 0.814;
const CRANK = 0.3;
const SPEED = 4;
const FRAME_Y = 0.5;
const CYL_Z = 1.42;
const ROD_Y = 0.98;
const BOILER_Z = 2.4;
const BOILER_R = 0.62;
const SMOKEBOX_R = 0.68;
const DECK_Z = 1.75;

interface Params {
  /** Whyte notation; the frame, boiler and rods are laid out from it. */
  readonly arrangement: string;
  readonly number: string;
  readonly name: string;
}

// ---------------------------------------------------------------- wheels

/** Flangeless tread + spoked centre in local space (axis Y, outer face +Y), at lateral `y`. */
function wheelMesh(lod: Lod, r: number, y: number, spokes: number, crankAngle: number | null) {
  if (lod === 2)
    return cylinder({
      radius: r,
      length: TREAD_W,
      segments: 6,
      axis: 'y',
      at: [0, y, 0],
      color: red,
    });
  const segs = [28, 14, 8][lod] ?? 8;
  const out = TREAD_W;
  const parts: Mesh[] = [
    // Tyre (tread) and rim, red centre.
    lathe({
      profile: [
        [r - 0.06, y - out / 2],
        [r - 0.004, y - out / 2],
        [r, y - out / 2 + 0.01],
        [r, y + out / 2 - 0.01],
        [r - 0.004, y + out / 2],
        [r - 0.06, y + out / 2],
      ],
      segments: segs,
      axis: 'y',
      color: iron,
    }),
    lathe({
      profile: [
        [r - 0.06, y + 0.03],
        [r - 0.1, y + 0.03],
        [r - 0.1, y - 0.03],
        [r - 0.06, y - 0.03],
      ],
      segments: segs,
      axis: 'y',
      color: red,
    }),
    // Hub with a brass cap.
    lathe({
      profile: [
        [0.0, y - 0.07],
        [r * 0.2, y - 0.07],
        [r * 0.2, y + 0.06],
        [r * 0.12, y + 0.09],
        [0, y + 0.09],
      ],
      segments: Math.max(8, segs / 2),
      axis: 'y',
      color: red,
    }),
  ];
  if (spokes > 0) {
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * Math.PI * 2;
      parts.push(
        beam({
          from: [Math.cos(a) * r * 0.18, y, Math.sin(a) * r * 0.18],
          to: [Math.cos(a) * (r - 0.09), y, Math.sin(a) * (r - 0.09)],
          width: r * 0.06,
          height: 0.04,
          color: red,
        }),
      );
    }
  } else {
    parts.push(
      lathe({
        profile: [
          [r - 0.09, y - 0.02],
          [r * 0.2, y - 0.02],
          [r * 0.2, y + 0.02],
          [r - 0.09, y + 0.02],
        ],
        segments: segs,
        axis: 'y',
        color: red,
      }),
    );
  }
  if (crankAngle !== null && lod < 2) {
    // Counterweight: a crescent between the spokes opposite the crank pin.
    const c = crankAngle + Math.PI;
    const arc = lod === 0 ? 10 : 5;
    const poly: Vec2[] = [];
    for (let i = 0; i <= arc; i++) {
      const a = c - 0.75 + (1.5 * i) / arc;
      poly.push([Math.cos(a) * (r - 0.1), Math.sin(a) * (r - 0.1)]);
    }
    for (let i = arc; i >= 0; i--) {
      const a = c - 0.45 + (0.9 * i) / arc;
      poly.push([Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.42]);
    }
    parts.push(
      translate(prism({ profile: poly, depth: 0.07, plane: 'xz', color: red }), [0, y, 0]),
    );
  }
  return merge(parts);
}

/** Flange ring on the inboard side of a tread (kept separate so tread diameter measures true). */
const flangeMesh = (lod: Lod, r: number, y: number, s: number): Mesh =>
  lathe({
    profile: [
      [r - 0.02, y - s * 0.028],
      [r + 0.028, y - s * 0.028],
      [r + 0.028, y],
      [r - 0.02, y],
    ],
    segments: [28, 16, 8][lod] ?? 8,
    axis: 'y',
    color: iron,
  });

// ---------------------------------------------------------------- small builders

function cable(points: readonly Vec3[], d: number, color: Vec3): Mesh {
  return merge(
    points
      .slice(1)
      .map((to, i) => beam({ from: points[i] as Vec3, to, width: d, segments: 6, color })),
  );
}

/** Block capitals on a 4 × 6 grid as stroke segments. */
const GLYPHS: Record<string, readonly (readonly [number, number, number, number])[]> = {
  J: [
    [4, 6, 4, 1],
    [4, 1, 3, 0],
    [3, 0, 1, 0],
    [1, 0, 0, 1],
  ],
  U: [
    [0, 6, 0, 1],
    [0, 1, 1, 0],
    [1, 0, 3, 0],
    [3, 0, 4, 1],
    [4, 1, 4, 6],
  ],
  P: [
    [0, 0, 0, 6],
    [0, 6, 3, 6],
    [3, 6, 4, 5],
    [4, 5, 4, 4],
    [4, 4, 3, 3],
    [3, 3, 0, 3],
  ],
  I: [
    [2, 0, 2, 6],
    [1, 0, 3, 0],
    [1, 6, 3, 6],
  ],
  T: [
    [0, 6, 4, 6],
    [2, 6, 2, 0],
  ],
  E: [
    [0, 0, 0, 6],
    [0, 6, 4, 6],
    [0, 3, 3, 3],
    [0, 0, 4, 0],
  ],
  R: [
    [0, 0, 0, 6],
    [0, 6, 3, 6],
    [3, 6, 4, 5],
    [4, 5, 4, 4],
    [4, 4, 3, 3],
    [3, 3, 0, 3],
    [2, 3, 4, 0],
  ],
  '6': [
    [4, 6, 0, 6],
    [0, 6, 0, 0],
    [0, 0, 4, 0],
    [4, 0, 4, 3],
    [4, 3, 0, 3],
  ],
  '0': [
    [0, 0, 0, 6],
    [0, 6, 4, 6],
    [4, 6, 4, 0],
    [4, 0, 0, 0],
  ],
  '2': [
    [0, 6, 4, 6],
    [4, 6, 4, 3],
    [4, 3, 0, 3],
    [0, 3, 0, 0],
    [0, 0, 4, 0],
  ],
  '1': [[2, 0, 2, 6]],
};

/** Text as stroke quads (u right, v up), CCW in (u, v). Unknown glyphs leave a space. */
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

/** Lettering on a ±Y side wall, centred on (x, z), readable from outside. */
function sideText(text: string, h: number, s: number, x: number, y: number, z: number, c: Vec3) {
  const quads = lettering(text, h);
  const w = Math.max(...quads.flat().map((q) => q[0]));
  const u: Vec3 = [-s, 0, 0];
  const n: Vec3 = [0, s, 0];
  return merge(
    quads.map((q) =>
      applyAffine(
        planar({ points: q.map(([a, b]): Vec3 => [a - w / 2, b - h / 2, 0]), color: c }),
        frame(u, [0, 0, 1], n, [x, y + s * 0.006, z]),
      ),
    ),
  );
}

/** Run a check only at LODs where `part` exists. */
const whenBuilt =
  (part: string, check: Check): Check =>
  (asset) =>
    asset.parts.some((p) => p.name === part && p.mesh) ? check(asset) : [];

// ---------------------------------------------------------------- the family

/**
 * Every `*_l` part mirrors its `*_r` twin across y = 0. (The library's `symmetric('_l', '_r')`
 * rewrites the first `_l` in the name, so `axle_lead_0_wheel_l` became `axle_read_0_wheel_l`.)
 */
const mirrored: Check = (asset) => {
  const q = inspect(asset);
  return q.parts('*_l').flatMap((l) => {
    const r = `${l.slice(0, -2)}_r`;
    const a = q.bounds(l);
    const b = q.bounds(r);
    if (!a || !b) return [{ part: l, message: `'${l}' has no mirror '${r}'`, fix: `add '${r}'` }];
    const off = Math.abs(a.min[1] + b.max[1]) + Math.abs(a.max[1] + b.min[1]);
    return off > 0.04
      ? [
          {
            part: l,
            message: `'${l}' / '${r}' off mirror by ${(off * 50).toFixed(1)} cm`,
            fix: 'mirror it',
          },
        ]
      : [];
  });
};

/** A plain bearing: a ring whose bore lies on the axle surface (10 sides, like the axle). */
const bearing = (x: number, z: number, y: number, color: Vec3): Mesh =>
  lathe({
    profile: [
      [0.07, y - 0.06],
      [0.13, y - 0.06],
      [0.13, y + 0.06],
      [0.07, y + 0.06],
      [0.07, y - 0.06],
    ],
    segments: 10,
    axis: 'y',
    at: [x, 0, z],
    color,
  });

/**
 * What holds a frame on an axle: a bearing ring at LOD0/1; at LOD2 (no axles) a plate from the
 * frame out to the wheel's inner face.
 */
const support = (lod: Lod, x: number, z: number, s: number, frameY: number): Mesh =>
  lod < 2
    ? bearing(x, z, s * frameY, iron)
    : box({
        size: [0.3, GAUGE / 2 - frameY + 0.04, 0.3],
        at: [x, s * ((frameY - 0.04 + GAUGE / 2) / 2), z - 0.15],
        color: iron,
      });

const americanFamily = defineFamily<Params>({
  kind: 'vehicle',
  tags: ['rail', 'steam', '19th-century'],
  sources: [
    'https://en.wikipedia.org/wiki/Jupiter_(locomotive) (Schenectady 1868, 4-4-0, 5 ft 4 in drivers, 16 × 24 in cylinders, standard gauge)',
    'https://en.wikipedia.org/wiki/4-4-0 (American type: 2-axle lead truck, 2 coupled axles)',
    'https://en.wikipedia.org/wiki/Standard-gauge_railway (1435 mm)',
    'docs/reference/loco-photo-match.png (owner reference: Jupiter photo + procedural match)',
  ],
  real: {
    length: 17.4,
    width: 2.8,
    height: 4.6,
    tolerance: 0.05,
    measures: [
      {
        label: 'driver diameter (5 ft 4 in)',
        axis: 'z',
        value: 1.626,
        parts: ['axle_driver_0_wheel_l'],
        source: 'https://en.wikipedia.org/wiki/Jupiter_(locomotive)',
      },
      {
        label: 'lead truck wheel diameter (30 in, typical; not in the Jupiter infobox)',
        axis: 'z',
        value: 0.762,
        parts: ['axle_lead_0_wheel_l'],
      },
      {
        label: 'rail centres (1435 mm gauge + 72 mm head)',
        axis: 'y',
        value: GAUGE + HEAD,
        between: ['track_rail_l', 'track_rail_r'],
        source: 'https://en.wikipedia.org/wiki/Standard-gauge_railway',
      },
      {
        label: 'driver wheelbase (8 ft, estimated from the reference photo)',
        axis: 'x',
        value: 2.44,
        between: ['axle_driver_0_wheel_l', 'axle_driver_1_wheel_l'],
      },
      {
        label: 'boiler barrel diameter (49 in, typical)',
        axis: 'y',
        value: 1.24,
        parts: ['boiler_barrel'],
      },
      {
        label: 'funnel stack height (estimated from the reference photo)',
        axis: 'z',
        value: 1.6,
        parts: ['stack'],
      },
    ],
  },
  // A 17 m engine + tender + its own track: LOD2 keeps 16 wheels, boiler, stack and pilot.
  budget: { triangles: [60000, 15000, 1500] },
  checks: [
    clear('axle_*', 'boiler*'),
    clear('cab', 'boiler*'),
    noOverlap('axle_driver_*_wheel_l'),
    touches('boiler_barrel', 'frame'),
    touches('cab', 'frame'),
    whenBuilt('crosshead_l', touches('crosshead_l', 'guides')),
    mirrored,
  ],
  defaults: { arrangement: '4-4-0', number: '60', name: 'JUPITER' },
  build(ctx, p) {
    const lod = ctx.lod;
    const segs = ctx.pick([28, 14, 6]);
    const spokes = ctx.pick([16, 8, 0]);

    // ---- Wheel arrangement from Whyte; rear driver at x = 0 ----
    const layout = whyteAxles(p.arrangement, {
      leading: LEAD_R,
      driving: DRIVER_R,
      trailing: LEAD_R,
      spacing: SPACING,
    });
    const rearDriver = Math.min(...layout.filter((a) => a.role === 'driving').map((a) => a.x));
    const axles = layout.map((a) => ({
      ...a,
      // The lead truck sits ahead of the cylinders, a little further out than the even spacing.
      x: a.x - rearDriver + (a.role === 'leading' ? 0.6 : 0),
    }));
    const drivers = axles.filter((a) => a.role === 'driving').sort((a, b) => b.x - a.x);
    const leads = axles.filter((a) => a.role === 'leading').sort((a, b) => b.x - a.x);
    const front = Math.max(...axles.map((a) => a.x + a.radius));
    const frontDriver = drivers[0]?.x ?? 2.44;
    const truckX = leads.length ? leads.reduce((s, a) => s + a.x, 0) / leads.length : front - 0.8;
    const smokeFront = front + 0.22;
    const beamX = smokeFront + 0.3;
    const pilotTip = beamX + 0.95;
    const cabFront = -0.9;
    const cabRear = -3.3;
    const tenderFront = cabRear - 0.25;
    const tenderRear = tenderFront - 5.6;

    // ---- Track: ties + rails, its own part, the length of the train ----
    ctx.group('track');
    const tieCount = Math.round((pilotTip - tenderRear) / 0.6);
    const ties: Mesh[] = [];
    if (lod < 2) {
      for (let i = 0; i < tieCount; i += lod === 0 ? 1 : 2) {
        const x = tenderRear + 0.3 + i * 0.6;
        ties.push(box({ size: [0.23, 2.6, TIE_H], at: [x, 0, 0], color: tieWood, strip: 'wood' }));
        // Tie plates under each rail foot: what the rail actually bears on.
        for (const s of [1, -1])
          ties.push(
            box({ size: [0.2, 0.12, 0.012], at: [x, s * RAIL_Y, TIE_H - 0.011], color: rail }),
          );
      }
      ties.push(
        box({
          size: [pilotTip - tenderRear, 2.7, 0.04],
          at: [(pilotTip + tenderRear) / 2, 0, 0],
          color: ballast,
          strip: 'concrete',
        }),
      );
    } else {
      ties.push(
        box({
          size: [pilotTip - tenderRear, 2.6, TIE_H],
          at: [(pilotTip + tenderRear) / 2, 0, 0],
          color: tieWood,
        }),
      );
    }
    ctx.part('track_ties', grime(merge(ties), { ground: 0.2, groundStrength: 0.3 }), {
      parent: 'track',
    });
    const railProfile: Vec2[] =
      lod === 0
        ? [
            [-0.065, 0],
            [0.065, 0],
            [0.065, 0.012],
            [0.01, 0.03],
            [0.009, 0.1],
            [HEAD / 2, 0.105],
            [HEAD / 2, RAIL_H],
            [-HEAD / 2, RAIL_H],
            [-HEAD / 2, 0.105],
            [-0.009, 0.1],
            [-0.01, 0.03],
            [-0.065, 0.012],
          ]
        : [
            [-0.05, 0],
            [0.05, 0],
            [HEAD / 2, RAIL_H],
            [-HEAD / 2, RAIL_H],
          ];
    for (const [side, s] of [
      ['l', 1],
      ['r', -1],
    ] as const) {
      const r = prism({
        profile: railProfile,
        depth: pilotTip - tenderRear,
        plane: 'yz',
        color: rail,
        strip: 'iron',
      });
      ctx.part(
        `track_rail_${side}`,
        translate(r, [(pilotTip + tenderRear) / 2, s * RAIL_Y, TIE_H]),
        { parent: 'track' },
      );
    }

    // ---- Locomotive ----
    ctx.group('locomotive');
    const wheelsets: string[] = [];
    const cranks: string[] = [];
    const rails = ['track_rail_l', 'track_rail_r'];
    const driverRps = SPEED / (2 * Math.PI * DRIVER_R);
    const wheelset = (
      name: string,
      x: number,
      r: number,
      parent: string,
      crankAngle: number | null,
      spokeCount: number,
      clearOf: string[],
    ): void => {
      const z = RAIL_TOP + r;
      ctx.group(name, {
        at: [x, 0, z],
        parent,
        motion: { kind: 'spin', axis: [0, 1, 0], rps: SPEED / (2 * Math.PI * r) },
        clearOf: [...rails, ...clearOf],
      });
      wheelsets.push(name);
      const ty = GAUGE / 2 + TREAD_W / 2;
      for (const [side, s] of [
        ['l', 1],
        ['r', -1],
      ] as const) {
        // Right-hand cranks lead the left by 90° (quartering).
        const ca = crankAngle === null ? null : crankAngle + (s > 0 ? 0 : Math.PI / 2);
        const w = wheelMesh(lod, r, 0, spokeCount, ca);
        ctx.part(
          `${name}_wheel_${side}`,
          translate(s > 0 ? w : place(w, { yaw: Math.PI, roll: 0 }), [0, s * ty, 0]),
          { parent: name },
        );
        if (lod < 2)
          ctx.part(`${name}_flange_${side}`, flangeMesh(lod, r, s * (GAUGE / 2), s), {
            parent: name,
          });
        if (ca !== null && lod < 2) {
          const c = `${name}_crank_${side}`;
          cranks.push(c);
          ctx.part(
            c,
            cylinder({
              radius: 0.055,
              length: 0.24,
              segments: 10,
              axis: 'y',
              at: [Math.cos(ca) * CRANK, s * (ty + 0.14), Math.sin(ca) * CRANK],
              color: iron,
            }),
            { parent: name },
          );
        }
      }
      if (lod < 2)
        ctx.part(
          `${name}_axle`,
          cylinder({
            radius: 0.07,
            length: GAUGE + 0.1,
            segments: 10,
            axis: 'y',
            color: iron,
          }),
          { parent: name },
        );
    };

    // Frame: bar frames inside the wheels, buffer beam, cylinders and saddle, firebox.
    const frameParts: Mesh[] = [];
    for (const s of [1, -1]) {
      frameParts.push(
        box({
          size: [beamX - cabRear, 0.1, 0.28],
          at: [(beamX + cabRear) / 2, s * FRAME_Y, 0.9],
          color: iron,
        }),
      );
    }
    frameParts.push(
      box({ size: [0.25, 2.3, 0.32], at: [beamX - 0.1, 0, 0.85], color: red, strip: 'wood' }),
      box({
        size: [cabFront - cabRear + 0.3, 2.5, 0.12],
        at: [(cabFront + cabRear) / 2, 0, DECK_Z - 0.12],
        color: wood,
        strip: 'wood',
      }),
      // Firebox between the frames ahead of the cab.
      box({ size: [1.2, 1.0, 1.1], at: [cabFront - 0.3, 0, 1.0], color: jacket }),
      // Cross-stretchers that tie the frames to the boiler.
      box({ size: [0.3, 1.1, 0.9], at: [frontDriver + 1.2, 0, 1.18], color: iron }),
    );
    const cylX = truckX + 0.05;
    const guideFront = cylX - 0.5;
    const guideRear = frontDriver + 1.0;
    for (const s of [1, -1]) {
      frameParts.push(
        // Cylinder with brass-banded heads, saddle up to the smokebox.
        lathe({
          profile: [
            [0.22, cylX - 0.5],
            [0.25, cylX - 0.46],
            [0.25, cylX + 0.46],
            [0.22, cylX + 0.5],
          ],
          segments: segs,
          axis: 'x',
          at: [0, s * ROD_Y, CYL_Z],
          color: blue,
          caps: true,
        }),
        box({
          size: [1.0, ROD_Y - FRAME_Y, 0.55],
          at: [cylX, s * (FRAME_Y + (ROD_Y - FRAME_Y) / 2), CYL_Z - 0.2],
          color: blueDark,
        }),
      );
      if (lod < 2)
        for (const dx of [-0.5, 0.5])
          frameParts.push(
            lathe({
              profile: [
                [0.255, -0.015],
                [0.255, 0.015],
              ],
              segments: segs,
              axis: 'x',
              at: [cylX + dx, s * ROD_Y, CYL_Z],
              color: brass,
            }),
          );
    }
    for (const d of drivers)
      for (const s of [1, -1]) frameParts.push(support(lod, d.x, RAIL_TOP + d.radius, s, FRAME_Y));
    ctx.part('frame', grime(merge(frameParts), { ground: 1.2, groundStrength: 0.35 }), {
      parent: 'locomotive',
    });
    // Crosshead guides (bars above and below the crosshead path), mounted on a yoke.
    const guides: Mesh[] = [];
    for (const s of [1, -1]) {
      for (const dz of [0.11, -0.11])
        guides.push(
          box({
            size: [guideFront - guideRear, 0.06, 0.04],
            at: [(guideFront + guideRear) / 2, s * ROD_Y, CYL_Z + dz - 0.02],
            color: iron,
          }),
        );
      guides.push(
        box({
          size: [0.08, ROD_Y - FRAME_Y + 0.05, 0.3],
          at: [guideRear, s * (FRAME_Y + (ROD_Y - FRAME_Y) / 2), CYL_Z - 0.15],
          color: iron,
        }),
      );
    }
    if (lod < 2) ctx.part('guides', merge(guides), { parent: 'locomotive' });

    // Wheelsets: lead truck (with its own frame), coupled drivers.
    if (leads.length) {
      ctx.part(
        'lead_truck',
        merge(
          [1, -1]
            .map((s) =>
              box({
                size: [
                  Math.abs((leads[0]?.x ?? 0) - (leads[leads.length - 1]?.x ?? 0)) + 0.5,
                  0.08,
                  0.18,
                ],
                at: [truckX, s * 0.45, RAIL_TOP + LEAD_R - 0.09],
                color: iron,
              }),
            )
            .concat([
              box({
                size: [0.3, 1.0, 0.45],
                at: [truckX, 0, RAIL_TOP + LEAD_R - 0.05],
                color: iron,
              }),
            ])
            .concat(
              leads.flatMap((a) =>
                [1, -1].map((s) => support(lod, a.x, RAIL_TOP + a.radius, s, 0.45)),
              ),
            ),
        ),
        { parent: 'locomotive' },
      );
    }
    leads.forEach((a, i) => {
      wheelset(`axle_lead_${i}`, a.x, a.radius, 'locomotive', null, ctx.pick([10, 8, 0]), [
        'lead_truck',
      ]);
    });
    drivers.forEach((a, i) => {
      wheelset(`axle_driver_${i}`, a.x, a.radius, 'locomotive', 0, spokes, [
        'frame',
        'rod_side_l',
        'rod_side_r',
        'rod_main_l',
        'rod_main_r',
      ]);
    });

    // Side rods (coupling the drivers) and main rods (crosshead → front crank), crossheads.
    // Real motion is a circular translation; the DSL has spin/slide/sway, so each rod slides
    // vertically through the crank throw (side) or horizontally through the stroke (main).
    if (lod < 2) {
      const zA = RAIL_TOP + DRIVER_R;
      for (const [side, s] of [
        ['l', 1],
        ['r', -1],
      ] as const) {
        const ca = s > 0 ? 0 : Math.PI / 2;
        const cx = Math.cos(ca) * CRANK;
        const cz = Math.sin(ca) * CRANK;
        const yS = s * (GAUGE / 2 + TREAD_W + 0.1);
        const xs = drivers.map((d) => d.x + cx);
        const sideRod = merge([
          beam({
            from: [Math.min(...xs) - 0.08, 0, 0],
            to: [Math.max(...xs) + 0.08, 0, 0],
            width: 0.05,
            height: 0.11,
            color: iron,
          }),
          ...xs.map((x) =>
            cylinder({
              radius: 0.09,
              length: 0.06,
              segments: 12,
              axis: 'y',
              at: [x, 0, 0],
              color: iron,
            }),
          ),
        ]);
        ctx.part(`rod_side_${side}`, sideRod, {
          parent: 'locomotive',
          at: [0, yS, zA + cz],
          motion: { kind: 'slide', offset: [0, 0, CRANK], hz: driverRps },
          clearOf: [...cranks, `rod_main_${side}`, ...wheelsets.map((w) => `${w}_wheel_${side}`)],
        });
        const crossX = (guideFront + guideRear) / 2;
        const yM = s * ROD_Y;
        ctx.part(
          `crosshead_${side}`,
          merge([
            box({ size: [0.26, 0.14, 0.18], at: [0, 0, -0.09], color: brass }),
            beam({
              from: [0, 0, 0],
              to: [cylX - 0.5 - crossX, 0, 0],
              width: 0.06,
              segments: 8,
              color: iron,
            }),
          ]),
          {
            parent: 'locomotive',
            at: [crossX, yM, CYL_Z],
            motion: { kind: 'slide', offset: [CRANK, 0, 0], hz: driverRps },
            clearOf: ['guides', 'frame', `rod_main_${side}`],
          },
        );
        const fx = (drivers[0]?.x ?? frontDriver) + cx;
        ctx.part(
          `rod_main_${side}`,
          merge([
            beam({
              from: [0, 0, 0],
              to: [fx - crossX, 0, zA + cz - CYL_Z],
              width: 0.05,
              height: 0.13,
              color: iron,
            }),
            cylinder({
              radius: 0.1,
              length: 0.06,
              segments: 12,
              axis: 'y',
              at: [fx - crossX, 0, zA + cz - CYL_Z],
              color: iron,
            }),
          ]),
          {
            parent: 'locomotive',
            at: [crossX, s * (ROD_Y + 0.0), CYL_Z],
            motion: { kind: 'slide', offset: [CRANK, 0, 0], hz: driverRps },
            clearOf: [
              ...cranks,
              `crosshead_${side}`,
              'guides',
              `rod_side_${side}`,
              ...wheelsets.map((w) => `${w}_wheel_${side}`),
            ],
          },
        );
        ctx.emitter(`cylinder_steam_${side}`, {
          kind: 'steam',
          at: [cylX + 0.5, s * ROD_Y, CYL_Z - 0.2],
          dir: [0.3, s * 0.6, -0.3],
          rate: 25,
          life: 1.2,
          size: [0.15, 0.9],
          color: hex('#e8e8e8'),
          speed: 2,
          spreadDeg: 30,
          when: 'moving',
        });
      }
    }

    // ---- Boiler: smokebox, barrel with brass bands, wagon-top, domes, bell, stack, headlamp ----
    const barrelFront = smokeFront - 1.05;
    const barrelRear = cabFront + 0.05;
    ctx.part(
      'boiler_barrel',
      lathe({
        profile: [
          [BOILER_R, barrelRear],
          [BOILER_R, barrelRear + 1.0],
          [BOILER_R * 0.95, barrelRear + 1.4],
          [BOILER_R * 0.95, barrelFront],
        ],
        segments: segs,
        axis: 'x',
        at: [0, 0, BOILER_Z],
        color: jacket,
        caps: true,
      }),
      { parent: 'locomotive' },
    );
    // Saddle from the frame up to the boiler.
    ctx.part(
      'boiler_saddle',
      merge([
        box({
          size: [0.9, 1.1, BOILER_Z - 1.04],
          at: [smokeFront - 0.55, 0, 1.04],
          color: blueDark,
        }),
      ]),
      { parent: 'locomotive' },
    );
    const smoke: Mesh[] = [
      lathe({
        profile: [
          [SMOKEBOX_R, barrelFront - 0.02],
          [SMOKEBOX_R, smokeFront - 0.06],
          [SMOKEBOX_R - 0.04, smokeFront],
          [0.4, smokeFront + 0.03],
          [0, smokeFront + 0.05],
        ],
        segments: segs,
        axis: 'x',
        at: [0, 0, BOILER_Z],
        color: black,
        caps: true,
      }),
    ];
    if (lod < 2) {
      // Number plate on the smokebox door, brass ring.
      smoke.push(
        lathe({
          profile: [
            [0.14, smokeFront + 0.05],
            [0.14, smokeFront + 0.07],
            [0, smokeFront + 0.07],
          ],
          segments: 16,
          axis: 'x',
          at: [0, 0, BOILER_Z],
          color: brass,
        }),
      );
      const bands = lod === 0 ? 7 : 3;
      for (let i = 0; i <= bands; i++) {
        const x = barrelRear + 0.1 + ((barrelFront - barrelRear - 0.2) * i) / bands;
        const r = x < barrelRear + 1.2 ? BOILER_R : BOILER_R * 0.95;
        smoke.push(
          lathe({
            profile: [
              [r + 0.008, x - 0.025],
              [r + 0.008, x + 0.025],
            ],
            segments: segs,
            axis: 'x',
            at: [0, 0, BOILER_Z],
            color: brass,
          }),
        );
      }
    }
    ctx.part('boiler_front', merge(smoke), { parent: 'locomotive' });

    // Stack: Jupiter's big funnel (balloon) stack with a capped rim.
    const stackBase = BOILER_Z + SMOKEBOX_R - 0.06;
    const stackX = smokeFront - 0.45;
    ctx.part(
      'stack',
      lathe({
        profile:
          lod < 2
            ? [
                [0.26, 0],
                [0.2, 0.12],
                [0.19, 0.55],
                [0.3, 0.75],
                [0.52, 1.35],
                [0.56, 1.42],
                [0.54, 1.5],
                [0.42, 1.56],
                [0.2, 1.6],
              ]
            : [
                [0.22, 0],
                [0.19, 0.55],
                [0.56, 1.42],
                [0.3, 1.6],
              ],
        segments: segs,
        at: [stackX, 0, stackBase],
        color: black,
        caps: true,
      }),
      { parent: 'locomotive' },
    );
    ctx.emitter('stack_smoke', {
      kind: 'smoke',
      parent: 'locomotive',
      at: [stackX, 0, stackBase + 1.62],
      rate: 18,
      life: 4,
      size: [0.5, 3],
      color: hex('#4a4a4a'),
      speed: 2.5,
      spreadDeg: 12,
      when: 'always',
    });
    // Domes: brass steam dome over the wagon-top, blue sand dome with brass bands; bell between.
    const dome = (x: number, h: number, r: number, c: Vec3): Mesh =>
      lathe({
        profile:
          lod < 2
            ? [
                [r + 0.12, -0.08],
                [r + 0.02, 0.0],
                [r, 0.05],
                [r, h * 0.6],
                [r * 0.95, h * 0.72],
                [r * 0.7, h * 0.9],
                [r * 0.3, h],
                [0, h],
              ]
            : [
                [r + 0.1, -0.08],
                [r, h * 0.6],
                [0, h],
              ],
        segments: segs,
        at: [x, 0, BOILER_Z + BOILER_R * 0.95 - 0.06],
        color: c,
      });
    const steamX = barrelRear + 0.55;
    const sandX = (stackX + steamX) / 2 + 0.35;
    const domes: Mesh[] = [dome(steamX, 0.78, 0.33, brass), dome(sandX, 0.62, 0.3, blue)];
    if (lod < 2) {
      domes.push(
        lathe({
          profile: [
            [0.315, 0.3],
            [0.315, 0.36],
          ],
          segments: segs,
          at: [sandX, 0, BOILER_Z + BOILER_R * 0.95 - 0.06],
          color: brass,
        }),
        // Whistle on the steam dome.
        lathe({
          profile: [
            [0.03, 0],
            [0.03, 0.12],
            [0.06, 0.14],
            [0.06, 0.3],
            [0.02, 0.34],
          ],
          segments: 10,
          at: [steamX - 0.12, 0, BOILER_Z + BOILER_R * 0.95 + 0.7],
          color: brass,
          caps: true,
        }),
      );
      // Bell in its yoke.
      const bellX = (sandX + steamX) / 2;
      const bellZ = BOILER_Z + BOILER_R * 0.95 + 0.32;
      domes.push(
        lathe({
          profile: [
            [0.2, 0],
            [0.18, 0.04],
            [0.13, 0.2],
            [0.11, 0.3],
            [0.04, 0.33],
          ],
          segments: segs,
          at: [bellX, 0, bellZ - 0.16],
          color: brass,
          caps: true,
        }),
        beam({
          from: [bellX, 0.24, BOILER_Z + BOILER_R * 0.95 - 0.04],
          to: [bellX, 0.24, bellZ + 0.22],
          width: 0.04,
          color: brass,
        }),
        beam({
          from: [bellX, -0.24, BOILER_Z + BOILER_R * 0.95 - 0.04],
          to: [bellX, -0.24, bellZ + 0.22],
          width: 0.04,
          color: brass,
        }),
        beam({
          from: [bellX, 0.24, bellZ + 0.22],
          to: [bellX, -0.24, bellZ + 0.22],
          width: 0.04,
          color: brass,
        }),
      );
    }
    ctx.part('boiler_domes', merge(domes), { parent: 'locomotive' });

    // Headlamp: the big box lamp on a bracket on the smokebox, lens forward.
    const lampZ = BOILER_Z + SMOKEBOX_R + 0.02;
    const lamp: Mesh[] = [
      box({ size: [0.5, 0.18, 0.1], at: [smokeFront - 0.18, 0, lampZ - 0.12], color: blueDark }),
      box({ size: [0.55, 0.5, 0.6], at: [smokeFront - 0.15, 0, lampZ - 0.02], color: blue }),
      prism({
        profile: [
          [-0.3, 0],
          [0.3, 0],
          [0.18, 0.18],
          [-0.18, 0.18],
        ],
        depth: 0.55,
        plane: 'yz',
        color: blueDark,
        centred: true,
      }).positions.length
        ? translate(
            prism({
              profile: [
                [-0.3, 0],
                [0.3, 0],
                [0.18, 0.18],
                [-0.18, 0.18],
              ],
              depth: 0.55,
              plane: 'yz',
              color: blueDark,
            }),
            [smokeFront - 0.15, 0, lampZ + 0.58],
          )
        : box({ size: [0.1, 0.1, 0.1], color: blue }),
    ];
    if (lod < 2)
      lamp.push(
        lathe({
          profile: [
            [0.2, 0],
            [0.2, 0.04],
            [0.16, 0.05],
            [0, 0.05],
          ],
          segments: segs,
          axis: 'x',
          at: [smokeFront + 0.125, 0, lampZ + 0.28],
          color: hex('#f2e2a0'),
        }),
        box({ size: [0.04, 0.56, 0.04], at: [smokeFront + 0.125, 0, lampZ + 0.56], color: brass }),
        box({ size: [0.04, 0.56, 0.04], at: [smokeFront + 0.125, 0, lampZ - 0.02], color: brass }),
        lathe({
          profile: [
            [0.08, 0],
            [0.06, 0.12],
            [0.1, 0.16],
            [0.02, 0.2],
          ],
          segments: 10,
          at: [smokeFront - 0.15, 0, lampZ + 0.76],
          color: brass,
          caps: true,
        }),
      );
    ctx.part('headlamp', merge(lamp), { parent: 'locomotive' });

    // Running boards with brass edging, sand pipes, handrails.
    const boards: Mesh[] = [];
    const boardZ = RAIL_TOP + 2 * DRIVER_R + 0.06;
    for (const s of [1, -1]) {
      boards.push(
        box({
          size: [barrelFront - cabFront, 0.42, 0.04],
          at: [(barrelFront + cabFront) / 2, s * 0.95, boardZ],
          color: blue,
        }),
        box({
          size: [0.12, 0.42, boardZ - 1.04],
          at: [frontDriver + 1.0, s * 0.95, 1.04],
          color: iron,
        }),
      );
      if (lod < 2)
        boards.push(
          box({
            size: [barrelFront - cabFront - 0.1, 0.02, 0.06],
            at: [(barrelFront + cabFront) / 2 + 0.05, s * 1.165, boardZ - 0.01],
            color: brass,
          }),
          cable(
            [
              [cabFront - 0.02, s * (BOILER_R + 0.1), BOILER_Z + 0.25],
              [smokeFront - 0.15, s * (SMOKEBOX_R + 0.1), BOILER_Z + 0.25],
            ],
            0.03,
            brass,
          ),
        );
      if (lod === 0)
        for (const x of [cabFront + 0.4, barrelRear + 2.2, barrelFront - 0.2])
          boards.push(
            beam({
              from: [x, s * (BOILER_R + 0.02), BOILER_Z + 0.25],
              to: [x, s * (BOILER_R + 0.1), BOILER_Z + 0.25],
              width: 0.025,
              color: brass,
            }),
          );
    }
    ctx.part('running_boards', merge(boards), { parent: 'locomotive' });

    // Pilot (cowcatcher): a V of slats from the buffer beam to the point.
    const pilot: Mesh[] = [];
    const slats = ctx.pick([9, 5, 2]);
    const pz0 = RAIL_TOP + 0.08;
    const pz1 = 1.0;
    for (const s of [1, -1]) {
      for (let i = 0; i < slats; i++) {
        const t = i / (slats - 1);
        const y = s * (0.08 + t * 1.0);
        pilot.push(
          beam({
            from: [beamX + 0.03, y, pz1],
            to: [pilotTip - Math.abs(y) * 0.85, y * 0.55, pz0 + 0.02],
            width: 0.05,
            height: 0.06,
            color: blue,
          }),
        );
      }
      pilot.push(
        beam({
          from: [beamX + 0.03, s * 1.1, pz1],
          to: [pilotTip, 0, pz1 - 0.15],
          width: 0.07,
          color: blueDark,
        }),
        beam({
          from: [beamX + 0.03, s * 1.1, pz0 + 0.05],
          to: [pilotTip, 0, pz0],
          width: 0.07,
          color: blueDark,
        }),
      );
    }
    pilot.push(
      beam({ from: [beamX + 0.03, 0, pz1], to: [pilotTip, 0, pz0], width: 0.08, color: blueDark }),
    );
    ctx.part('pilot', merge(pilot), { parent: 'locomotive' });

    // Cab: maroon-red wooden cab with windows and an arched roof.
    const cabW = 2.5;
    const cabH = 1.95;
    const cab: Mesh[] = [
      box({
        size: [cabFront - cabRear, cabW, cabH],
        at: [(cabFront + cabRear) / 2, 0, DECK_Z],
        color: red,
        strip: 'wood',
      }),
      translate(
        prism({
          profile: Array.from({ length: 9 }, (_, i): Vec2 => {
            const a = Math.PI * (i / 8);
            return [Math.cos(a) * 1.35, Math.sin(a) * 0.22];
          }),
          depth: cabFront - cabRear + 0.4,
          plane: 'yz',
          color: hex('#2a2a2a'),
        }),
        [(cabFront + cabRear) / 2, 0, DECK_Z + cabH],
      ),
    ];
    if (lod < 2) {
      for (const s of [1, -1]) {
        for (const [i, x] of [cabFront - 0.55, cabRear + 0.6].entries())
          cab.push(
            box({
              size: [0.55, 0.02, 0.7],
              at: [x, s * (cabW / 2 + 0.01), DECK_Z + 0.95],
              color: glass,
            }),
            box({
              size: [0.63, 0.03, 0.06],
              at: [x, s * (cabW / 2 + 0.015), DECK_Z + 1.67 + (i === 0 ? 0 : 0)],
              color: brass,
            }),
          );
        cab.push(
          box({
            size: [0.02, 0.5, 0.6],
            at: [cabFront + 0.01, s * 0.95, DECK_Z + 1.05],
            color: glass,
          }),
          box({
            size: [cabFront - cabRear - 0.1, 0.03, 0.05],
            at: [(cabFront + cabRear) / 2, s * (cabW / 2 + 0.015), DECK_Z + 0.25],
            color: brass,
          }),
        );
      }
      if (lod === 0)
        for (const s of [1, -1])
          cab.push(
            sideText(
              p.number,
              0.3,
              s,
              (cabFront + cabRear) / 2,
              s * (cabW / 2 + 0.003),
              DECK_Z + 0.5,
              brass,
            ),
          );
    }
    ctx.part('cab', merge(cab), { parent: 'locomotive' });

    // ---- Tender: its own group, two four-wheel trucks, wood load, lettered panel ----
    ctx.group('tender');
    const tLen = tenderFront - tenderRear;
    const tz = RAIL_TOP + TENDER_R * 2 + 0.22;
    const trucks = [tenderFront - 1.25, tenderRear + 1.25];
    const tender: Mesh[] = [
      box({ size: [tLen, 2.5, 0.2], at: [(tenderFront + tenderRear) / 2, 0, tz], color: iron }),
      box({
        size: [tLen - 0.2, 2.4, 1.15],
        at: [(tenderFront + tenderRear) / 2 - 0.05, 0, tz + 0.2],
        color: blue,
      }),
      box({ size: [0.3, 0.5, 0.15], at: [tenderFront + 0.1, 0, tz + 0.02], color: iron }),
    ];
    for (const x of trucks)
      tender.push(
        box({
          size: [0.4, 1.0, tz - (RAIL_TOP + TENDER_R) + 0.02],
          at: [x, 0, RAIL_TOP + TENDER_R - 0.02],
          color: iron,
        }),
        ...[1, -1].map((s) =>
          box({
            size: [1.4, 0.08, 0.2],
            at: [x, s * 0.45, RAIL_TOP + TENDER_R - 0.1],
            color: iron,
          }),
        ),
        ...[0.45, -0.45].flatMap((dx) =>
          [1, -1].map((s) => support(lod, x + dx, RAIL_TOP + TENDER_R, s, 0.45)),
        ),
      );
    if (lod < 2) {
      // Flared coping rail round the top, and the stacked cordwood.
      for (const s of [1, -1])
        tender.push(
          box({
            size: [tLen - 0.2, 0.06, 0.25],
            at: [(tenderFront + tenderRear) / 2 - 0.05, s * 1.2, tz + 1.35],
            color: blueDark,
          }),
        );
      tender.push(
        box({ size: [0.06, 2.4, 0.25], at: [tenderRear + 0.08, 0, tz + 1.35], color: blueDark }),
      );
      const rows = lod === 0 ? 4 : 2;
      for (let r = 0; r < rows; r++)
        for (let k = 0; k < (lod === 0 ? 9 : 4); k++) {
          const y = -1.0 + (2.0 * (k + (r % 2) * 0.5)) / (lod === 0 ? 9 : 4);
          if (Math.abs(y) > 1.05) continue;
          tender.push(
            cylinder({
              radius: 0.11,
              length: 1.2 + ctx.rng.range(-0.1, 0.1),
              segments: 7,
              axis: 'x',
              at: [tenderFront - 1.0, y, tz + 1.46 + r * 0.19],
              color: ctx.rng.next() > 0.5 ? wood : woodLight,
            }),
          );
        }
      // Lettered panel: red, brass edged, the engine's name.
      for (const s of [1, -1]) {
        tender.push(
          box({
            size: [2.6, 0.02, 0.5],
            at: [(tenderFront + tenderRear) / 2 - 0.3, s * 1.205, tz + 0.5],
            color: red,
          }),
        );
        if (lod === 0)
          tender.push(
            sideText(
              p.name,
              0.3,
              s,
              (tenderFront + tenderRear) / 2 - 0.3,
              s * 1.215,
              tz + 0.75,
              brass,
            ),
          );
      }
    }
    ctx.part(
      'tender_body',
      livery(merge(tender), {
        rules: [{ color: [0.55, 0.55, 0.6], facing: 'under', multiply: true }],
      }),
      { parent: 'tender' },
    );
    trucks.forEach((tx, t) => {
      [0.45, -0.45].forEach((dx, a) => {
        wheelset(`axle_tender_${t}_${a}`, tx + dx, TENDER_R, 'tender', null, ctx.pick([0, 0, 0]), [
          'tender_body',
        ]);
      });
    });
  },
});

/** American 4-4-0 in Jupiter colours. */
export const loco_440 = americanFamily.variant({
  name: 'loco_440',
  description:
    'American 4-4-0 "Jupiter" — funnel stack, brass domes, bell, box headlamp, slatted pilot, red spoked drivers with rods, tender, track',
});
