// USRA 50-ton single-sheathed boxcar (1918, spec 1001-B): 40 ft 6 in inside, 41 ft 3 in body,
// 13 ft 3 in over the running board, on cast side-frame trucks with 33 in wheels. Rail top z = 0,
// +X = the A end, car centred on x = 0. A family: the livery (road name, marks, number, colour) is
// the variant; the steel-framed body, trucks and gear are one build. Car paint and lettering are
// paint slots, so `boxcar` also carries switchable liveries (KHR_materials_variants) in one GLB.
// Dossier: ./README.md.

import {
  beam,
  box,
  clear,
  cylinder,
  defineFamily,
  defineMaterial,
  dmath,
  hex,
  type Lod,
  lathe,
  type Mesh,
  materialVariant,
  merge,
  noOverlap,
  place,
  planar,
  type StripId,
  symmetric,
  text,
  tiled,
  type Vec3,
} from '@developerz.ai/ts23d';
import { brakeRigging, truckBrakes } from '../_lib/finish/aging.ts';
import { tessellate } from '../_lib/finish/finish.ts';
import { BAND, type Run, rustRuns, wearOf } from './wear.ts';

// ---------------------------------------------------------------- dimensions (metres)
const GAUGE = 1.435;
const WHEEL_R = 0.419; // 33 in
const FLANGE = 0.025;
const TREAD_W = 0.14;
const WHEEL_Y = GAUGE / 2 + 0.036; // tread centre over the rail head
const WB = 1.676; // 5 ft 6 in
const TC = 9.37; // truck centres (photo-scaled)
const BODY_L = 12.573; // 41 ft 3 in
const XB = BODY_L / 2;
const SHEATH_Y = 1.33; // outer face of the boards
const FRAME_Y = 1.4; // outer face of the steel posts / braces
const FLOOR_Z = 1.16;
const EAVE_Z = 3.8;
const RIDGE_Z = 3.92;
const WALK_TOP = 4.039; // 13 ft 3 in
const COUPLER_Z = 0.876; // 34½ in
const DOOR_W = 1.83;
const DOOR_Z0 = 1.15;
const DOOR_Z1 = 3.64;
const JOURNAL_Y = 0.925; // axle end = journal box inner face
const BRACE = 0.03; // diagonal brace relief over the boards
const CARD: Vec3 = [0.72, 0.68, 0.55]; // a sun-yellowed car card

const steel = hex('#a59f97'); // tints iron_cast: dark, sand-cast trucks and gear
const iron = hex('#a8a29c'); // tints iron_rust: weathered hardware
const wheelC = hex('#948f8a');
const LID = hex('#d8b9a0'); // journal-box lids: bare pressed steel gone to light rust
const CHALK: Vec3 = [0.8, 0.79, 0.74];
// Running-board planks: wood_weathered's silver-grey, pulled down to the grey-brown of boards
// that have had thirty years of soot and boots.
const walk: Vec3 = [0.62, 0.56, 0.5];

// Paint chips (sRGB). Mineral red as built (NARA photo), N&W's darker oxide (Rapido N&W 42574).
const MINERAL_RED = '#84402d';
const OXIDE_RED = '#74382a';
const LETTER_WHITE = '#e8e2d2';

/**
 * The steel ends' paint: the library's painted steel with its chips cut to a fifth and its tile
 * stretched to 1.5 m. At 0.2 chips on a 0.5 m tile the 2.9 m end wall read as rows of scattered
 * dark slots; a pressed steel end is one sheet, its wear the grime and rust in vertex colour.
 */
const END_STEEL = defineMaterial({
  id: 'boxcar_end_steel',
  kind: 'metal',
  scaleMetres: 1.5,
  roughness: 0.45,
  metalness: 1,
  albedo: '#eeeeee',
  albedo2: '#5a3b2a',
  params: { paint: 1, paintRough: 0.5, chips: 0.04, streaks: 0.25, grime: 0.25, relief: 1 },
  description: 'Boxcar steel end sheet: painted steel, few chips (vertex colour = paint).',
});

interface Params {
  /** Large road name left of the door. */
  readonly road: string;
  /** Reporting marks under it. */
  readonly marks: string;
  readonly number: string;
  readonly paint: Vec3;
  readonly letter: Vec3;
}

// ---------------------------------------------------------------- helpers
/** Axis-aligned box from two corners (any order). */
function bx(
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
  color: Vec3,
  strip: StripId = 'iron_cast',
  bevel = 0,
): Mesh {
  const [a, b] = [Math.min(x0, x1), Math.max(x0, x1)];
  const [c, d] = [Math.min(y0, y1), Math.max(y0, y1)];
  const [e, f] = [Math.min(z0, z1), Math.max(z0, z1)];
  const small = Math.min(b - a, d - c, f - e);
  return box({
    size: [b - a, d - c, f - e],
    at: [(a + b) / 2, (c + d) / 2, e],
    color,
    strip,
    ...(bevel > 0 && bevel < small / 2 ? { bevel } : {}),
  });
}

const rod = (from: Vec3, to: Vec3, w: number, color: Vec3 = iron, segments = 0): Mesh =>
  beam({ from, to, width: w, color, strip: 'iron_rust', ...(segments ? { segments } : {}) });

/**
 * LOD2 lettering: a word's glyphs (100+ triangles a word) as one painted block per letter on the
 * sheathing, two triangles each, 60% of the letter height so it keeps the stencil's weight at
 * distance. Letters are the runs of the word's triangles along the car that no gap splits; one
 * bar for the whole word read as a smeared stripe.
 */
function greeked(word: Mesh, s: number, color: Vec3): Mesh {
  const spans: [number, number][] = [];
  let z0 = Infinity;
  let z1 = -Infinity;
  for (let t = 0; t < word.indices.length; t += 3) {
    const xs = [0, 1, 2].map((k) => word.positions[(word.indices[t + k] ?? 0) * 3] ?? 0);
    spans.push([Math.min(...xs), Math.max(...xs)]);
    for (let k = 0; k < 3; k++) {
      const z = word.positions[(word.indices[t + k] ?? 0) * 3 + 2] ?? 0;
      z0 = Math.min(z0, z);
      z1 = Math.max(z1, z);
    }
  }
  spans.sort((p, q) => p[0] - q[0]);
  const letters: [number, number][] = [];
  for (const [lo, hi] of spans) {
    const last = letters[letters.length - 1];
    if (last && lo <= last[1] + 0.01) last[1] = Math.max(last[1], hi);
    else letters.push([lo, hi]);
  }
  const h = (z1 - z0) * 0.6;
  const faces = ['top', 'bottom', 'front', 'back', 'left', 'right'] as const;
  const keep = s > 0 ? 'left' : 'right';
  return merge(
    letters.map(([x0, x1]) =>
      box({
        size: [x1 - x0, 0.004, h],
        at: [(x0 + x1) / 2, s * (SHEATH_Y + 0.002), (z0 + z1 - h) / 2],
        color,
        omit: faces.filter((f) => f !== keep),
      }),
    ),
  );
}

// ---------------------------------------------------------------- running gear
/** One wheel's tread disc (exactly 33 in) at lateral y, outer face toward ±y. */
function tread(lod: Lod, y: number): Mesh {
  if (lod === 2)
    return cylinder({
      radius: WHEEL_R,
      length: TREAD_W,
      segments: 6,
      axis: 'y',
      at: [0, y, 0],
      color: wheelC,
      strip: 'iron_cast',
    });
  const s = Math.sign(y);
  const segs = [24, 14, 8][lod] ?? 8;
  return lathe({
    profile: [
      [0, y - s * (TREAD_W / 2)],
      [WHEEL_R, y - s * (TREAD_W / 2)],
      [WHEEL_R, y + s * (TREAD_W / 2)],
      [0, y + s * (TREAD_W / 2)],
    ],
    segments: segs,
    axis: 'y',
    color: wheelC,
    strip: 'iron_cast',
  });
}

/** Axle, flanges and hubs (spins with the treads). */
function wheelset(lod: Lod): Mesh {
  if (lod === 2) {
    // Axle + a hub boss sharing each tread's outer face, so the set touches its wheels.
    const hub = (s: number): Mesh =>
      cylinder({
        radius: 0.12,
        length: 0.05,
        segments: 3,
        axis: 'y',
        at: [0, s * (WHEEL_Y + TREAD_W / 2 + 0.025), 0],
        color: wheelC,
        strip: 'iron_cast',
      });
    const shaft = cylinder({
      radius: 0.075,
      length: JOURNAL_Y * 2,
      segments: 4,
      axis: 'y',
      color: wheelC,
      strip: 'iron_cast',
    });
    return merge([shaft, hub(1), hub(-1)]);
  }
  const segs = [24, 14, 8][lod] ?? 8;
  const parts: Mesh[] = [
    cylinder({
      radius: 0.075,
      length: JOURNAL_Y * 2,
      segments: Math.max(6, segs / 2),
      axis: 'y',
      color: wheelC,
      strip: 'iron_cast',
    }),
  ];
  for (const s of [1, -1]) {
    const yi = s * (WHEEL_Y - TREAD_W / 2);
    parts.push(
      lathe({
        profile: [
          [WHEEL_R - 0.02, yi - s * 0.03],
          [WHEEL_R + FLANGE, yi - s * 0.025],
          [WHEEL_R + FLANGE, yi - s * 0.002],
          [WHEEL_R - 0.02, yi - s * 0.002],
        ],
        segments: segs,
        axis: 'y',
        color: wheelC,
        strip: 'iron_cast',
        caps: false,
      }),
    );
    if (lod === 0) {
      // Ribbed back: radial ribs on the inner face, and the outer hub boss.
      const yo = s * (WHEEL_Y + TREAD_W / 2);
      parts.push(
        cylinder({
          radius: 0.12,
          length: 0.05,
          segments: 12,
          axis: 'y',
          at: [0, yo + s * 0.02, 0],
          color: wheelC,
          strip: 'iron_cast',
        }),
      );
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        parts.push(
          rod(
            [dmath.cos(a) * 0.13, yi - s * 0.015, dmath.sin(a) * 0.13],
            [dmath.cos(a) * (WHEEL_R - 0.05), yi - s * 0.015, dmath.sin(a) * (WHEEL_R - 0.05)],
            0.03,
            wheelC,
          ),
        );
      }
    }
  }
  return merge(parts);
}

/** Cast side-frame truck around x = 0 (local): frames, journal boxes, springs, bolster, brakes. */
function truckFrame(lod: Lod, bevel: number): Mesh {
  if (lod === 2) {
    // Far: one side-frame block per side over the journal boxes, the bolster and centre plate.
    const far: Mesh[] = [bx(-0.15, 0.15, -(JOURNAL_Y + 0.12), JOURNAL_Y + 0.12, 0.33, 0.6, steel)];
    for (const s of [-1, 1])
      far.push(
        bx(
          -WB / 2 - 0.16,
          WB / 2 + 0.16,
          s * JOURNAL_Y,
          s * (JOURNAL_Y + 0.16),
          WHEEL_R - 0.09,
          WHEEL_R + 0.2,
          steel,
        ),
      );
    far.push(bx(-0.18, 0.18, -0.18, 0.18, 0.62, 0.66, steel)); // centre plate
    return merge(far);
  }
  const r = WHEEL_R;
  const ax = [-WB / 2, WB / 2] as const;
  const zt = r + 0.14;
  const zb = r - 0.26;
  const out: Mesh[] = [];
  for (const s of [-1, 1]) {
    const y = s * (JOURNAL_Y + 0.08);
    for (const a of ax) {
      out.push(
        bx(
          a - 0.13,
          a + 0.13,
          s * JOURNAL_Y,
          s * (JOURNAL_Y + 0.17),
          r - 0.09,
          r + 0.12,
          steel,
          'iron_cast',
          bevel,
        ),
      );
      if (lod === 0)
        // Journal-box lid: a pressed cover 3 cm proud, rust-bright against the oily casting,
        // hung from a hinge bar across the top of the box.
        out.push(
          bx(
            a - 0.1,
            a + 0.1,
            s * (JOURNAL_Y + 0.165),
            s * (JOURNAL_Y + 0.2),
            r - 0.07,
            r + 0.08,
            LID,
            'iron_rust',
            0.008,
          ),
          bx(
            a - 0.12,
            a + 0.12,
            s * (JOURNAL_Y + 0.165),
            s * (JOURNAL_Y + 0.215),
            r + 0.08,
            r + 0.11,
            LID,
            'iron_rust',
          ),
        );
    }
    out.push(
      bx(
        ax[0] - 0.16,
        ax[1] + 0.16,
        y - 0.06,
        y + 0.06,
        r + 0.12,
        zt + 0.07,
        steel,
        'iron_cast',
        bevel,
      ),
    ); // top member
    if (lod < 2) {
      const p: [number, number][] = [
        [ax[0] + 0.1, r - 0.08],
        [-0.34, zb],
        [0.34, zb],
        [ax[1] - 0.1, r - 0.08],
      ];
      for (let k = 0; k < 3; k++) {
        const pa: [number, number] = p[k] ?? [0, 0];
        const pb: [number, number] = p[k + 1] ?? [0, 0];
        out.push(rod([pa[0], y, pa[1]], [pb[0], y, pb[1]], 0.08, steel));
      }
      for (const d of [-1, 1])
        out.push(rod([d * 0.34, y, zb], [d * 0.62, y, zt + 0.02], 0.06, steel)); // cast window struts
      const coilSegs = lod === 0 ? 10 : 5;
      for (const d of [-0.11, 0, 0.11]) {
        out.push(
          cylinder({
            radius: 0.05,
            length: 0.17,
            segments: coilSegs,
            at: [d, y, zb + 0.125],
            color: iron,
            strip: 'iron_rust',
          }),
        );
        if (lod === 0)
          for (let k = 0; k < 2; k++)
            out.push(
              cylinder({
                radius: 0.056,
                length: 0.012,
                segments: coilSegs,
                at: [d, y, zb + 0.08 + k * 0.084],
                color: iron,
                strip: 'iron_rust',
              }),
            );
      }
    } else out.push(bx(-0.4, 0.4, y - 0.05, y + 0.05, zb, zt, steel));
    for (const d of [-1, 1])
      out.push(
        bx(d * 0.27 - 0.035, d * 0.27 + 0.035, y - 0.06, y + 0.06, zb - 0.02, zt + 0.02, steel),
      );
    out.push(bx(-0.2, 0.2, y - 0.06, y + 0.06, zb - 0.04, zb + 0.04, steel)); // spring seat
  }
  // Bolster on the spring nests, centre plate up to the car's body bolster.
  out.push(
    bx(
      -0.15,
      0.15,
      -(JOURNAL_Y + 0.12),
      JOURNAL_Y + 0.12,
      zb + 0.21,
      0.6,
      steel,
      'iron_cast',
      bevel,
    ),
  );
  out.push(
    cylinder({
      radius: 0.2,
      length: 0.04,
      segments: [12, 8, 6][lod] ?? 6,
      at: [0, 0, 0.62],
      color: steel,
      strip: 'iron_cast',
    }),
  );
  if (lod < 2)
    out.push(bx(-0.12, 0.12, -(JOURNAL_Y + 0.08), JOURNAL_Y + 0.08, zb - 0.06, zb - 0.03, steel)); // spring plank
  if (lod === 0) {
    // Brake heads and shoes inboard of each axle, just outside the flange circle, on a beam.
    for (const a of ax) {
      const d = -Math.sign(a);
      const xs = a + d * (r + FLANGE + 0.015);
      for (const s of [-1, 1])
        out.push(
          bx(
            xs,
            xs + d * 0.07,
            s * (WHEEL_Y - 0.06),
            s * (WHEEL_Y + 0.06),
            r - 0.16,
            r + 0.12,
            iron,
          ),
        );
      out.push(
        bx(
          xs + d * 0.02,
          xs + d * 0.06,
          -(WHEEL_Y - 0.06),
          WHEEL_Y - 0.06,
          r - 0.04,
          r + 0.02,
          iron,
        ),
      );
      for (const s of [-1, 1])
        out.push(
          bx(
            xs + d * 0.03,
            xs + d * 0.05,
            s * (JOURNAL_Y + 0.02),
            s * (WHEEL_Y + 0.06),
            r - 0.02,
            r + 0.0,
            iron,
          ),
        ); // hanger to the frame
    }
  }
  return merge(out);
}

// ---------------------------------------------------------------- the car
const usra = defineFamily({
  kind: 'vehicle',
  tags: ['railroad', 'freight', 'usra', '1918', 'rolling-stock'],
  license: 'CC0-1.0',
  sources: [
    'https://bostonmaine.squarespace.com/box_71000_series',
    'https://commons.wikimedia.org/wiki/File:Military_Administration_-_Transportation_-_Rail_-_Construction_-_50_TON_SINGLE_SHEATHED_BOX_CAR_being_constructed_for_U.S._Railroad_Administration_by_the_Bettendorff_Co.,_Bettendorff,_Iowa_-_NARA_-_45502055.jpg',
    'https://en.wikipedia.org/wiki/USRA_standard',
    'https://www.nasg.org/Gallery/reports/scale/cars/modeltype/StrucksAndrews.php',
    'https://kadee.com/553-ho-scale-andrews-1898-self-centering-trucks-with-33-ribbed-back-wheels-metal-fully-sprung',
    'https://rapidotrains.com/ho-scale/freight-car/usra-ss-boxcar.html',
  ],
  real: {
    length: 13.4,
    width: 2.896,
    height: 4.039,
    // Empty (light) weight. Unverified: ≈ 21 t is the usual range for a 40 ft single-sheathed
    // 50-ton car (no stencilled USRA 1001-B light weight found; see README.md "Mass").
    mass: 21000,
    massTolerance: 0.15,
    measures: [
      {
        label: 'body length (41 ft 3 in)',
        value: BODY_L,
        axis: 'x',
        parts: ['body'],
        source: 'B&M ORER table',
      },
      {
        label: 'wheel diameter (33 in)',
        value: 0.838,
        axis: 'z',
        parts: ['axle_a_0_wheel_l'],
        source: 'Kadee Andrews 33 in',
      },
      {
        label: 'truck wheelbase (5 ft 6 in)',
        value: WB,
        axis: 'x',
        between: ['axle_a_0', 'axle_a_1'],
        source: 'NASG Andrews',
      },
      {
        label: 'door width (≈ 6 ft)',
        value: 1.83,
        axis: 'x',
        parts: ['door_l'],
        tolerance: 0.05,
        why: 'scaled from a photo, not a drawing: ±5% is the scaling error',
        source: 'NARA photo, scaled',
      },
      {
        label: 'gauge-side wheel spacing',
        value: WHEEL_Y * 2,
        axis: 'y',
        between: ['axle_a_0_wheel_l', 'axle_a_0_wheel_r'],
        source: 'standard gauge 1.435 m + rail head',
      },
    ],
  },
  // Measured 19.1k / 7.7k / 1.08k (boxcar_nw, the longer road name). LOD0 spends on brake rigging,
  // the outer boards split for the grime gradient and the rust runs; LOD2 keeps the road name (a
  // block per letter), the roof sheets, the Howe-truss bracing and the door frame as flat strips.
  budget: { triangles: [21000, 8400, 1500] },
  // Truck bolster clears the body bolster: they bear only at the centre plate and side bearings.
  gaps: [
    {
      parts: ['truck_*_frame', 'underframe'],
      why: 'truck bolster clears the body bolster; they bear only at the centre plate and side bearings',
    },
  ],
  checks: [
    noOverlap('axle_*_wheel_*'),
    clear('axle_*', 'underframe', 0.01),
    symmetric('_wheel_l', '_wheel_r', 'y'),
  ],
  // Lower and more side-on than the default 3/4: the weathered side fills the frame (road name,
  // rain wash, rust runs, chalk), with the end still in view.
  hero: { azDeg: -58, elDeg: 13 },
  defaults: {
    road: 'CLINCHFIELD',
    marks: 'C.C.& O.',
    number: '8024',
    paint: hex(MINERAL_RED),
    letter: hex(LETTER_WHITE),
  } as Params,
  build(ctx, p) {
    const lod = ctx.lod;
    const bevel = ctx.pick([0.012, 0.006, 0]);
    const paint = p.paint;
    const paintDark: Vec3 = [paint[0] * 0.78, paint[1] * 0.78, paint[2] * 0.78];
    const wear = wearOf(ctx.rng.fork('age'), paint, XB);
    /** Painted steel and boards: fade, grime from the rails (darkest at the sill), rust low. */
    const dirt = (m: Mesh): Mesh => wear.painted(m);
    const runs: Run[] = [];

    // Trucks and spinning axles.
    for (const [t, x] of [
      ['a', TC / 2],
      ['b', -TC / 2],
    ] as const) {
      ctx.group(`truck_${t}`, { at: [x, 0, 0] });
      ctx.part(
        `truck_${t}_frame`,
        wear.gear(merge([truckFrame(lod, bevel), truckBrakes(lod, WB, WHEEL_R, WHEEL_Y, steel)])),
        // Cast side frames and bolster are I/U sections (≈ 25 mm), not solid blocks.
        { parent: `truck_${t}`, shell: 0.025 },
      );
      [-WB / 2, WB / 2].forEach((ax, i) => {
        const name = `axle_${t}_${i}`;
        ctx.group(name, {
          parent: `truck_${t}`,
          at: [ax, 0, WHEEL_R],
          motion: { kind: 'spin', axis: [0, 1, 0], rps: 1.5 },
        });
        ctx.part(`${name}_set`, wheelset(lod), { parent: name });
        // Cast wheels: thin plate web between hub and rim, weighed as a ~30 mm wall.
        ctx.part(`${name}_wheel_l`, tread(lod, WHEEL_Y), { parent: name, shell: 0.03 });
        ctx.part(`${name}_wheel_r`, tread(lod, -WHEEL_Y), { parent: name, shell: 0.03 });
      });
    }

    // Underframe: straight centre sill, side sills, end sills, body bolsters, crossbearers, floor.
    const uf: Mesh[] = [
      bx(-XB - 0.04, XB + 0.04, -0.2, 0.2, 0.72, 1.1, steel, 'iron_cast', bevel),
      bx(-XB, XB, -SHEATH_Y + 0.02, SHEATH_Y - 0.02, 1.1, FLOOR_Z, walk, 'wood_weathered'),
    ];
    for (const s of [-1, 1])
      uf.push(
        bx(-XB, XB, s * SHEATH_Y, s * (FRAME_Y - 0.01), 0.95, 1.18, steel, 'iron_cast', bevel),
      );
    for (const d of [-1, 1]) {
      uf.push(
        bx(d * XB, d * (XB + 0.05), -FRAME_Y, FRAME_Y, 0.74, 1.18, steel, 'iron_cast', bevel),
      ); // end sill / striker
      uf.push(
        bx(
          d * (TC / 2) - 0.2,
          d * (TC / 2) + 0.2,
          -1.25,
          1.25,
          0.64,
          1.1,
          steel,
          'iron_cast',
          bevel,
        ),
      ); // body bolster
      if (lod < 2)
        for (const x of [1.6, 3.0])
          uf.push(bx(d * x - 0.08, d * x + 0.08, -1.3, 1.3, 0.8, 1.1, steel)); // crossbearers
    }
    // Rolled channels and plate (≈ 12 mm), not solid bars: weighed as hollow shells.
    ctx.part('underframe', wear.gear(merge(uf)), { shell: 0.012 });

    // Body: vertical boards between steel frame members; steel ends.
    const bodyM: Mesh[] = [];
    const innerM: Mesh[] = [];
    const boardsZ0 = 1.18;
    for (const s of [-1, 1]) {
      // Boards face out: u = up, v = along (planks run along U → vertical boards).
      const v: Vec3 = [s < 0 ? BODY_L : -BODY_L, 0, 0];
      bodyM.push(
        tiled({
          origin: [s < 0 ? -XB : XB, s * SHEATH_Y, boardsZ0],
          u: [0, 0, EAVE_Z - boardsZ0],
          v,
          color: paint,
          // Same strip at every LOD (no colour pop); each side reads different boards.
          strip: materialVariant('wood_painted', s < 0 ? 3 : 7),
          vMetres: lod === 2 ? 2.6 : BAND,
        }),
      );
      // Inner sheathing face (the boards have thickness at the door and ends).
      innerM.push(
        bx(
          -XB,
          XB,
          s * (SHEATH_Y - 0.045),
          s * (SHEATH_Y - 0.002),
          boardsZ0,
          EAVE_Z,
          paintDark,
          'plain',
        ),
      );
    }
    for (const d of [-1, 1])
      bodyM.push(bx(d * (XB - 0.05), d * XB, -SHEATH_Y, SHEATH_Y, 1.0, EAVE_Z, paint, END_STEEL));
    // Split the full-height boards so the grime gradient has vertices to live on (the outside
    // only: the inner faces are seen through an open door at most).
    const bodyMesh = lod === 2 ? merge(bodyM) : tessellate(merge(bodyM), lod === 0 ? 0.45 : 0.9);
    // Renewed boards: single planks back at the paint chip, 5 mm proud of their faded neighbours
    // (behind the braces), where a car man let a new board in.
    const planks: Mesh[] = [];
    const plankRng = ctx.rng.fork('planks');
    for (const s of [-1, 1])
      for (let k = 0; k < (lod === 2 ? 0 : 3); k++) {
        const d = plankRng.next() < 0.5 ? -1 : 1;
        const x = d * plankRng.range(DOOR_W / 2 + 0.35, XB - 0.35);
        planks.push(
          box({
            size: [0.135, 0.005, EAVE_Z - 0.2 - boardsZ0],
            at: [x, s * (SHEATH_Y + 0.0025), boardsZ0],
            color: paint,
            strip: 'wood_painted',
            omit: ['top', 'bottom'],
          }),
        );
      }
    // Boards and their inner face are sheathing timber (≈ 600 kg/m³), not untyped paint.
    ctx.part(
      'body',
      merge([wear.painted(bodyMesh, { bands: true }), dirt(merge(innerM)), ...planks]),
      { paint: 'body', density: 600 },
    );

    // Outside steel framing: posts, diagonal braces leaning toward the door, top plate, end ribs.
    const fr: Mesh[] = [];
    const far: Vec3 = [paint[0] * 0.6, paint[1] * 0.6, paint[2] * 0.6];
    /** A flat strip on a side's boards from (x, z) to (x, z), `w` wide, tilted so one long edge
     *  sits 2 mm in the boards and the other 10 mm proud: seated, never a hovering decal. */
    const flat = (
      a: [number, number],
      b: [number, number],
      w: number,
      s: number,
      color: Vec3,
    ): Mesh => {
      const l = dmath.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const px = (-(b[1] - a[1]) / l) * (w / 2);
      const pz = ((b[0] - a[0]) / l) * (w / 2);
      const lo = s * (SHEATH_Y - 0.002);
      const hi = s * (SHEATH_Y + 0.01);
      const pts: Vec3[] = [
        [a[0] - px, lo, a[1] - pz],
        [b[0] - px, lo, b[1] - pz],
        [b[0] + px, hi, b[1] + pz],
        [a[0] + px, hi, a[1] + pz],
      ];
      // planar wants its points counter-clockwise seen from the outside (±Y).
      const e1 = [b[0] - a[0], b[1] - a[1]];
      const out = (e1[1] ?? 0) * px - (e1[0] ?? 0) * pz; // (e1 × perp)·ŷ up to sign
      return planar({ points: out * s > 0 ? pts : pts.reverse(), color, strip: 'steel_painted' });
    };
    const panel = (XB - DOOR_W / 2 - 0.08) / 4;
    const posts = [0, 1, 2, 3, 4].map((i) => XB - i * panel);
    const postW = 0.09;
    for (const s of [-1, 1]) {
      const y0 = s * SHEATH_Y;
      const y1 = s * FRAME_Y;
      for (const d of [-1, 1]) {
        for (const px of posts) {
          const x = d * px;
          if (lod < 2)
            fr.push(bx(x - postW / 2, x + postW / 2, y0, y1, 1.0, EAVE_Z, paint, 'steel_painted'));
          // Far: the post as a shadow-toned strip on the boards, so the frame still reads.
          else fr.push(flat([x, boardsZ0], [x, EAVE_Z - 0.16], postW, s, far));
        }
        // Door posts.
        fr.push(
          bx(
            d * (DOOR_W / 2 + 0.01),
            d * (DOOR_W / 2 + 0.1),
            y0,
            y1,
            1.0,
            EAVE_Z,
            paint,
            'steel_painted',
          ),
        );
        for (let i = 0; i < 4; i++) {
          const xa = d * ((posts[i] ?? 0) - postW / 2);
          const xb = d * ((posts[i + 1] ?? DOOR_W / 2) + postW / 2);
          // Pressed hat-section braces, BRACE proud of the boards: low enough that the road
          // name stencilled across them still reads from a three-quarter view.
          const ym = s * (SHEATH_Y + 0.004 + BRACE / 2);
          if (lod < 2)
            fr.push(
              beam({
                from: [xa, ym, 1.22],
                to: [xb, ym, EAVE_Z - 0.12],
                width: 0.075,
                height: BRACE,
                color: paint,
                strip: 'steel_painted',
                up: [0, s, 0],
              }),
            );
          // Far: the Howe-truss diagonals as shadow-toned strips (the side's biggest graphic).
          else fr.push(flat([xa, 1.22], [xb, EAVE_Z - 0.12], 0.09, s, far));
        }
      }
      fr.push(
        bx(-XB, XB, y0, s * (FRAME_Y + 0.01), EAVE_Z - 0.16, EAVE_Z, paint, 'steel_painted', bevel),
      ); // side plate
      if (lod === 0) {
        // Rivet heads where braces meet posts and sills.
        const rivet = cylinder({
          radius: 0.014,
          length: 0.012,
          segments: 6,
          axis: 'y',
          color: paint,
        });
        const pts: Vec3[] = [];
        for (const d of [-1, 1])
          for (const px of posts)
            for (const z of [1.08, 1.26, EAVE_Z - 0.2, EAVE_Z - 0.08])
              pts.push([d * px, s * (FRAME_Y + 0.003), z]);
        fr.push(merge(pts.map((at) => place(rivet, { at }))));
        const rivetRng = ctx.rng.fork(`rivet_runs_${s}`);
        for (const at of pts)
          if (at[2] > 3 && rivetRng.next() < 0.5)
            runs.push({
              at: [at[0], s * FRAME_Y, at[2] - 0.02],
              s,
              floor: 1.25,
              reach: 0.9,
              width: 0.07,
            });
      }
    }
    // Ends: corner angles, pressed ribs (LOD0/1).
    for (const d of [-1, 1]) {
      for (const s of [-1, 1])
        fr.push(
          bx(
            d * (XB - 0.06),
            d * (XB + 0.03),
            s * (SHEATH_Y - 0.05),
            s * FRAME_Y,
            1.0,
            EAVE_Z,
            paint,
            'steel_painted',
          ),
        );
      if (lod < 2)
        for (let k = 0; k < (lod === 0 ? 8 : 4); k++) {
          const z = 1.35 + ((EAVE_Z - 1.55) * (k + 0.5)) / (lod === 0 ? 8 : 4);
          fr.push(
            bx(
              d * XB,
              d * (XB + 0.035),
              -(SHEATH_Y - 0.12),
              SHEATH_Y - 0.12,
              z - 0.05,
              z + 0.05,
              paint,
              'steel_painted',
            ),
          );
        }
    }
    ctx.part('body_framing', dirt(merge(fr)), { paint: 'body', shell: 0.008 });

    // Roof: low steel gable with seam caps; running board on saddles; laterals at the corners.
    const roofOv = 0.04;
    // The roof as its sheets: one pair of slope quads per sheet between seams, each sheet its
    // own tone (they rust and take soot differently), so the seams still read at LOD2 as darker
    // and lighter stripes when the caps are gone. Eave fascias, gables and the underside close it.
    const sheets = lod === 0 ? 20 : 10;
    const ry = FRAME_Y + roofOv;
    const sheetRng = ctx.rng.fork('roof_sheets');
    const quad = (points: Vec3[], k: number): Mesh =>
      planar({
        points,
        color: [paintDark[0] * k, paintDark[1] * k, paintDark[2] * k],
        strip: 'steel_painted',
      });
    const roofM: Mesh[] = [];
    for (let i = 0; i < sheets; i++) {
      const x0 = i === 0 ? -XB - 0.05 : -XB + (BODY_L * i) / sheets;
      const x1 = i === sheets - 1 ? XB + 0.05 : -XB + (BODY_L * (i + 1)) / sheets;
      const k =
        lod === 2 ? (i % 2 ? 0.66 : 1) : sheetRng.range(0.6, 1) * (lod === 1 && i % 2 ? 0.8 : 1);
      roofM.push(
        quad(
          [
            [x0, ry, EAVE_Z],
            [x0, 0, RIDGE_Z],
            [x1, 0, RIDGE_Z],
            [x1, ry, EAVE_Z],
          ],
          k,
        ),
        quad(
          [
            [x0, -ry, EAVE_Z],
            [x1, -ry, EAVE_Z],
            [x1, 0, RIDGE_Z],
            [x0, 0, RIDGE_Z],
          ],
          k,
        ),
      );
    }
    const [xa, xb, zf] = [-XB - 0.05, XB + 0.05, EAVE_Z - 0.03];
    roofM.push(
      quad(
        [
          [xa, ry, zf],
          [xa, ry, EAVE_Z],
          [xb, ry, EAVE_Z],
          [xb, ry, zf],
        ],
        0.8,
      ),
      quad(
        [
          [xa, -ry, zf],
          [xb, -ry, zf],
          [xb, -ry, EAVE_Z],
          [xa, -ry, EAVE_Z],
        ],
        0.8,
      ),
      quad(
        [
          [xa, -ry, zf],
          [xa, ry, zf],
          [xb, ry, zf],
          [xb, -ry, zf],
        ],
        0.8,
      ),
    );
    for (const d of [-1, 1]) {
      const x = d * (XB + 0.05);
      const gable: Vec3[] = [
        [x, -ry, zf],
        [x, ry, zf],
        [x, ry, EAVE_Z],
        [x, 0, RIDGE_Z],
        [x, -ry, EAVE_Z],
      ];
      roofM.push(quad(d > 0 ? gable : gable.reverse(), 0.8));
    }
    if (lod === 0) {
      const seams = 20;
      for (let i = 1; i < seams; i++) {
        const x = -XB + (BODY_L * i) / seams;
        for (const s of [-1, 1])
          roofM.push(
            rod(
              [x, s * (FRAME_Y + roofOv), EAVE_Z + 0.014],
              [x, 0, RIDGE_Z + 0.014],
              0.055,
              paintDark,
            ),
          );
      }
    }
    // Locomotive smoke settles on the roof: darker, blotchy, heaviest toward the eaves.
    // Pressed-steel roof sheets (≈ 3 mm) over the carlines: a hollow shell, not a solid gable.
    ctx.part('roof', wear.roof(merge(roofM)), {
      paint: 'body',
      shell: 0.004,
    });

    const walkM: Mesh[] = [
      bx(-XB - 0.12, XB + 0.12, -0.255, 0.255, WALK_TOP - 0.045, WALK_TOP, walk, 'wood_weathered'),
    ];
    const saddles = lod === 2 ? 3 : 11;
    for (let i = 0; i < saddles; i++) {
      const x = -XB + 0.3 + ((BODY_L - 0.6) * i) / (saddles - 1);
      walkM.push(
        bx(x - 0.05, x + 0.05, -0.2, 0.2, RIDGE_Z - 0.03, WALK_TOP - 0.045, walk, 'wood_weathered'),
      );
    }
    if (lod < 2)
      for (const d of [-1, 1]) {
        // Lateral board toward the ladder corner (A end on −Y, B end on +Y).
        const s = -d;
        walkM.push(
          bx(
            d * (XB - 0.62),
            d * (XB - 0.12),
            s * 0.255,
            s * (FRAME_Y - 0.05),
            WALK_TOP - 0.045,
            WALK_TOP,
            walk,
            'wood_weathered',
          ),
        );
        walkM.push(
          bx(
            d * (XB - 0.42),
            d * (XB - 0.32),
            s * 0.4,
            s * (FRAME_Y - 0.15),
            EAVE_Z,
            WALK_TOP - 0.045,
            walk,
            'wood_weathered',
          ),
        );
      }
    ctx.part('running_board', merge(walkM));

    // Sliding doors, hung on a bottom track and held by a top guide; slide along X.
    const doorTrack: Mesh[] = [];
    for (const [side, s] of [
      ['l', 1],
      ['r', -1],
    ] as const) {
      const y0 = s * (FRAME_Y + 0.005);
      const y1 = s * (FRAME_Y + 0.05);
      const dm: Mesh[] = [
        tiled({
          origin: [s > 0 ? DOOR_W / 2 : -DOOR_W / 2, y1, DOOR_Z0],
          u: [0, 0, DOOR_Z1 - DOOR_Z0],
          v: [s > 0 ? -DOOR_W : DOOR_W, 0, 0],
          color: paint,
          strip: 'wood_painted',
        }),
        bx(
          -DOOR_W / 2,
          DOOR_W / 2,
          y0,
          y1 - s * 0.003,
          DOOR_Z0,
          DOOR_Z1,
          paintDark,
          'wood_painted',
        ),
      ];
      if (lod < 2) {
        for (const z of [DOOR_Z0, (DOOR_Z0 + DOOR_Z1) / 2 - 0.05, DOOR_Z1 - 0.1])
          dm.push(
            bx(-DOOR_W / 2, DOOR_W / 2, y1, y1 + s * 0.015, z, z + 0.1, paint, 'steel_painted'),
          ); // steel straps
        for (const x of [-DOOR_W / 2, DOOR_W / 2 - 0.08])
          dm.push(bx(x, x + 0.08, y1, y1 + s * 0.015, DOOR_Z0, DOOR_Z1, paint, 'steel_painted'));
        // What carries the door: roller hangers up to the top rail and guide shoes down onto the
        // bottom track, bedded in the door frame and bearing 3 mm into the rails they run on.
        for (const x of [-0.6, 0.6]) {
          const ya = s * (FRAME_Y + 0.012);
          const yb = y1 + s * 0.02;
          dm.push(
            bx(x - 0.06, x + 0.06, ya, yb, DOOR_Z1 - 0.1, DOOR_Z1 + 0.028, paint, 'steel_painted'),
            bx(x - 0.06, x + 0.06, ya, yb, DOOR_Z0 - 0.028, DOOR_Z0 + 0.1, paint, 'steel_painted'),
          );
        }
      } else {
        // Far: the door's steel frame as four shadow-toned strips, so the door still reads.
        const dark: Vec3 = [paint[0] * 0.6, paint[1] * 0.6, paint[2] * 0.6];
        const strip = (x0: number, x1: number, z0: number, z1: number): Mesh =>
          box({
            size: [x1 - x0, 0.012, z1 - z0],
            at: [(x0 + x1) / 2, y1 + s * 0.004, z0],
            color: dark,
            strip: 'steel_painted',
            omit: ['front', 'back', 'top', 'bottom'],
          });
        dm.push(
          strip(-DOOR_W / 2, DOOR_W / 2, DOOR_Z0, DOOR_Z0 + 0.12),
          strip(-DOOR_W / 2, DOOR_W / 2, DOOR_Z1 - 0.12, DOOR_Z1),
          strip(-DOOR_W / 2, -DOOR_W / 2 + 0.1, DOOR_Z0 + 0.12, DOOR_Z1 - 0.12),
          strip(DOOR_W / 2 - 0.1, DOOR_W / 2, DOOR_Z0 + 0.12, DOOR_Z1 - 0.12),
        );
      }
      ctx.part(`door_${side}`, dirt(merge(dm)), {
        motion: { kind: 'slide', offset: [-(DOOR_W + 0.05), 0, 0], hz: 0.25, oneWay: true },
        paint: 'body',
      });
      // Bare-iron handle / latch: its own part, so it stays out of the paint slot.
      if (lod === 0)
        ctx.part(
          `door_${side}_handle`,
          // Bolted through the boards: bedded 4 mm into the door, not hovering at strap depth.
          merge([
            bx(-0.75, -0.65, y1 - s * 0.004, y1 + s * 0.06, 2.0, 2.2, iron),
            // Hasp on the closing edge, its staple and the seal pin hanging through it.
            bx(
              DOOR_W / 2 - 0.2,
              DOOR_W / 2 - 0.02,
              y1 - s * 0.004,
              y1 + s * 0.022,
              2.06,
              2.11,
              iron,
            ),
            bx(
              DOOR_W / 2 - 0.07,
              DOOR_W / 2 - 0.04,
              y1 + s * 0.02,
              y1 + s * 0.05,
              2.04,
              2.13,
              iron,
            ),
            bx(
              DOOR_W / 2 - 0.063,
              DOOR_W / 2 - 0.047,
              y1 + s * 0.028,
              y1 + s * 0.044,
              1.96,
              2.17,
              steel,
            ),
            // Placard board with the last car card still tacked to it, bedded 4 mm in the boards.
            bx(0.2, 0.56, y1 - s * 0.004, y1 + s * 0.02, 2.3, 2.62, walk, 'wood_weathered'),
            bx(0.26, 0.5, y1 + s * 0.019, y1 + s * 0.023, 2.38, 2.56, CARD, 'plain'),
          ]),
          { parent: `door_${side}` },
        );
      // Track below the door, guide above, long enough for its one-way travel toward −X.
      doorTrack.push(
        bx(
          -(DOOR_W * 1.5 + 0.1), // the door opens toward −X
          DOOR_W / 2 + 0.1,
          s * FRAME_Y,
          s * (FRAME_Y + 0.07),
          1.08,
          DOOR_Z0 - 0.025,
          iron,
        ),
      );
      doorTrack.push(
        bx(
          -(DOOR_W * 1.5 + 0.1),
          DOOR_W / 2 + 0.1,
          s * (FRAME_Y + 0.01),
          s * (FRAME_Y + 0.08),
          DOOR_Z1 + 0.025,
          DOOR_Z1 + 0.09,
          iron,
        ),
      );
    }
    // Door stops: a block at each end of the bottom track, 4 cm clear of the door's travel.
    if (lod === 0)
      for (const s of [-1, 1])
        for (const [x0, x1] of [
          [DOOR_W / 2 + 0.04, DOOR_W / 2 + 0.1],
          [-(DOOR_W * 1.5 + 0.1), -(DOOR_W * 1.5 + 0.09)],
        ] as const)
          doorTrack.push(
            bx(x0, x1, s * FRAME_Y, s * (FRAME_Y + 0.09), DOOR_Z0 - 0.025, DOOR_Z0 + 0.08, iron),
          );
    if (lod < 2) ctx.part('door_track', merge(doorTrack), { shell: 0.01 });
    // Chalk: the yard clerk's marks on the boards beside the door (a crossed-out routing, a track
    // number, tally strokes), 1.4–2 m up where an arm reaches. Strokes 2.4 cm wide, 1 mm into
    // the boards and 2 mm proud; not paint, so they stay chalk-white on every livery.
    if (lod === 0) {
      const strokes: readonly (readonly [number, number, number, number])[] = [
        [0, 0.3, 0.2, 0.52],
        [0, 0.52, 0.2, 0.3],
        [0.3, 0.3, 0.3, 0.54],
        [0.38, 0.53, 0.53, 0.53],
        [0.53, 0.53, 0.43, 0.3],
        [0, 0.22, 0.54, 0.2],
        [0.04, 0, 0.04, 0.15],
        [0.11, 0, 0.11, 0.15],
        [0.18, 0, 0.18, 0.15],
        [0.25, 0, 0.25, 0.15],
        [0, 0.03, 0.3, 0.13],
      ];
      const chalk: Mesh[] = [];
      for (const s of [-1, 1]) {
        const dirX = s < 0 ? 1 : -1;
        const x0 = dirX > 0 ? 1.15 : 1.7;
        const y = s * (SHEATH_Y + 0.0005);
        for (const [u0, v0, u1, v1] of strokes)
          chalk.push(
            beam({
              from: [x0 + dirX * u0, y, 1.45 + v0],
              to: [x0 + dirX * u1, y, 1.45 + v1],
              width: 0.024,
              height: 0.003,
              up: [0, s, 0],
              color: CHALK,
              strip: 'plain',
            }),
          );
      }
      ctx.part('chalk_marks', merge(chalk));
    }
    // Rust bleeding down the sides: from the door posts' track ends, under the top door guide
    // (long runs, the car's dirtiest two metres), under the side plate, off the bottom track onto
    // the sill, and from the rivets. LOD1 keeps the long runs; LOD2 keeps the grime in the paint.
    if (lod < 2) {
      const pick = ctx.rng.fork('runs');
      const long: Run[] = [];
      for (const s of [-1, 1]) {
        for (const x of [-(DOOR_W / 2 + 0.055), DOOR_W / 2 + 0.055])
          long.push({
            at: [x, s * FRAME_Y, DOOR_Z1 - 0.01],
            s,
            floor: 1.25,
            reach: 1.8,
            width: 0.06,
          });
        // Under the guide where the open door stands: on the boards, between the posts.
        for (let x = -(DOOR_W * 1.5); x < -(DOOR_W / 2 + 0.2); x += 0.3) {
          const at = x + pick.range(-0.06, 0.06);
          if (posts.some((q) => Math.abs(Math.abs(at) - q) < postW / 2 + 0.06)) continue;
          long.push({ at: [at, s * SHEATH_Y, DOOR_Z1 + 0.03], s, floor: 1.3, reach: 1.7 });
        }
        if (lod > 0) continue;
        // Under the side plate, away from the door.
        for (let x = -XB + 0.4; x < XB - 0.3; x += 0.75) {
          const at = x + pick.range(-0.2, 0.2);
          if (Math.abs(at) < DOOR_W * 1.6 && at < DOOR_W / 2 + 0.2) continue;
          if (posts.some((q) => Math.abs(Math.abs(at) - q) < postW / 2 + 0.06)) continue;
          runs.push({ at: [at, s * SHEATH_Y, EAVE_Z - 0.16], s, floor: 1.4, reach: 0.9 });
        }
        // Off the bottom door track onto the side sill.
        for (let x = -(DOOR_W * 1.5); x < DOOR_W / 2; x += 0.45)
          runs.push({
            at: [x + pick.range(-0.1, 0.1), s * (FRAME_Y - 0.01), 1.08],
            s,
            floor: 0.96,
            reach: 0.3,
          });
      }
      const tint = hex('#c9a48c');
      ctx.part(
        'rust_streaks',
        merge([
          rustRuns(ctx.rng.fork('streaks_long'), long, tint, true),
          rustRuns(ctx.rng.fork('streaks'), runs, tint, false),
        ]),
      );
    }

    // Knuckle couplers on the centre sill, MCB height.
    for (const [c, d] of [
      ['a', 1],
      ['b', -1],
    ] as const) {
      const cm: Mesh[] = [
        bx(
          d * (XB + 0.05),
          d * 6.56,
          -0.08,
          0.08,
          COUPLER_Z - 0.07,
          COUPLER_Z + 0.07,
          iron,
          'iron_rust',
          bevel,
        ),
        bx(
          d * 6.5,
          d * 6.7,
          -0.17,
          0.12,
          COUPLER_Z - 0.13,
          COUPLER_Z + 0.13,
          iron,
          'iron_rust',
          bevel,
        ),
      ];
      if (lod < 2) cm.push(bx(d * 6.6, d * 6.7, 0.12, 0.2, COUPLER_Z - 0.1, COUPLER_Z + 0.1, iron)); // knuckle
      if (lod === 0) {
        // Uncoupling lever across the end sill, and the air hose hanging below.
        cm.push(
          rod(
            [d * (XB + 0.08), -0.08, COUPLER_Z + 0.12],
            [d * (XB + 0.08), -1.3, COUPLER_Z + 0.2],
            0.025,
          ),
        );
        // Two brackets on the end sill carry the lever (bedded 6 mm in the sill face).
        for (const y of [-0.45, -1.15]) {
          const z = COUPLER_Z + 0.12 + (0.08 * (-y - 0.08)) / 1.22;
          cm.push(
            bx(d * (XB + 0.044), d * (XB + 0.1), y - 0.015, y + 0.015, z - 0.03, z + 0.03, iron),
          );
        }
        // Train line out of the centre sill to the angle cock, then the hose hanging from it.
        cm.push(rod([d * (XB + 0.01), 0.15, 0.81], [d * (XB + 0.1), 0.3, 0.8], 0.04, iron, 6));
        cm.push(rod([d * (XB + 0.1), 0.3, 0.8], [d * (XB + 0.22), 0.3, 0.55], 0.05, iron, 6));
      }
      ctx.part(`coupler_${c}`, merge(cm));
    }

    // Safety appliances: grab-iron ladders at diagonally opposite corners, end ladders, steps.
    if (lod < 2) {
      const lad: Mesh[] = [];
      // `sink`: how far behind `a`/`b` the wall the legs bolt through lies (they end 1 cm in it).
      const grab = (a: Vec3, b: Vec3, n: Vec3, sink: number): void => {
        const off = 0.07;
        const pa: Vec3 = [a[0] + n[0] * off, a[1] + n[1] * off, a[2]];
        const pb: Vec3 = [b[0] + n[0] * off, b[1] + n[1] * off, b[2]];
        const into = (p: Vec3): Vec3 => [p[0] - n[0] * sink, p[1] - n[1] * sink, p[2]];
        lad.push(rod(pa, pb, 0.022, iron, lod === 0 ? 6 : 0));
        if (lod === 0) {
          lad.push(rod(into(a), pa, 0.02, iron));
          lad.push(rod(into(b), pb, 0.02, iron));
        }
      };
      for (const d of [-1, 1]) {
        const s = -d; // A end ladder on −Y, B end on +Y
        const xe = d * (XB - 0.05);
        for (let k = 0; k < 7; k++) {
          const z = 1.45 + k * 0.38;
          // Side irons bolt through the boards (behind the posts), end irons through the end wall.
          const side = FRAME_Y - SHEATH_Y + 0.01;
          grab([xe - d * 0.5, s * FRAME_Y, z], [xe - d * 0.05, s * FRAME_Y, z], [0, s, 0], side);
          grab([d * (XB + 0.035), s * 0.62, z], [d * (XB + 0.035), s * 1.12, z], [d, 0, 0], 0.045);
        }
        // Stirrup steps under the corners (both sides).
        for (const ss of [-1, 1]) {
          const x = d * (XB - 0.3);
          const y = ss * (FRAME_Y - 0.03);
          lad.push(rod([x - 0.18, y, 0.95], [x - 0.18, y, 0.55], 0.03));
          lad.push(rod([x + 0.18, y, 0.95], [x + 0.18, y, 0.55], 0.03));
          lad.push(rod([x - 0.18, y, 0.56], [x + 0.18, y, 0.56], 0.04));
        }
      }
      ctx.part('ladders', merge(lad));
    }

    // Hand brake: vertical staff on the B end, horizontal wheel at roof level.
    const bm: Mesh[] = [
      rod(
        [-(XB + 0.13), -0.85, 0.85],
        [-(XB + 0.13), -0.85, WALK_TOP - 0.06],
        0.05,
        iron,
        lod === 2 ? 0 : 6,
      ),
    ];
    for (const z of [1.0, 2.3, EAVE_Z - 0.1])
      bm.push(bx(-XB, -(XB + 0.15), -0.89, -0.81, z, z + 0.05, iron));
    const wheelSegs = [16, 10, 6][lod] ?? 6;
    bm.push(
      lathe({
        profile: [
          [0.17, WALK_TOP - 0.06],
          [0.205, WALK_TOP - 0.06],
          [0.205, WALK_TOP - 0.035],
          [0.17, WALK_TOP - 0.035],
          [0.17, WALK_TOP - 0.06],
        ],
        segments: wheelSegs,
        color: iron,
        strip: 'iron_rust',
        at: [-(XB + 0.13), -0.85, 0],
      }),
    );
    if (lod < 2)
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + 0.4;
        bm.push(
          rod(
            [-(XB + 0.13), -0.85, WALK_TOP - 0.05],
            [-(XB + 0.13) + dmath.cos(a) * 0.18, -0.85 + dmath.sin(a) * 0.18, WALK_TOP - 0.05],
            0.025,
          ),
        );
      }
    if (lod < 2) ctx.part('brake', merge(bm));

    // Air brake: reservoir, cylinder, triple valve, train line, levers and rods (LOD0/LOD1).
    if (lod < 2) {
      const ab: Mesh[] = [
        cylinder({
          radius: 0.2,
          length: 1.1,
          segments: 12,
          axis: 'x',
          at: [-0.9, 0.55, 0.9],
          color: iron,
          strip: 'iron_rust',
        }),
        cylinder({
          radius: 0.16,
          length: 0.5,
          segments: 12,
          axis: 'x',
          at: [0.4, -0.5, 0.92],
          color: iron,
          strip: 'iron_rust',
        }),
        bx(-0.25, -0.05, 0.2, 0.42, 0.85, 1.1, iron),
        rod([-0.35, 0.55, 1.08], [-0.35, 0.2, 1.08], 0.05, iron),
        rod([-1.45, 0.55, 0.9], [-1.45, 0.2, 0.9], 0.04, iron),
        rod([0.15, -0.5, 1.0], [0.15, -0.2, 1.0], 0.04, iron),
        rod([-XB, 0.3, 0.84], [XB, 0.3, 0.84], 0.035, iron, 6),
        rod([0.65, -0.5, 0.92], [1.8, -0.1, 0.8], 0.04, iron),
      ];
      // Hanger straps up to the centre sill for the reservoir / train line.
      for (const x of [-1.3, -0.5]) ab.push(bx(x - 0.03, x + 0.03, 0.2, 0.75, 1.08, 1.1, iron));
      for (const x of [-4.0, -2.0, 2.0, 4.0])
        ab.push(bx(x - 0.03, x + 0.03, 0.2, 0.33, 0.82, 1.1, iron));
      ab.push(brakeRigging(lod, TC, WB, WHEEL_R, iron));
      // Reservoir and cylinder are hollow vessels (≈ 6 mm wall).
      ctx.part('air_brake', wear.gear(merge(ab)), { shell: 0.006 });
    }

    // Livery: road name left of the door, marks + number under it (both sides, read left→right).
    // LOD2 keeps the road name as one greeked bar in a dull stencil tone (it does not vanish).
    {
      const lm: Mesh[] = [];
      /** |y| of the painted surface at x on a side: post faces or boards. A stencil pixel that
       *  only grazes a brace (by less than `graze`) stays on the boards with its corner behind
       *  the brace, instead of being lifted 65 mm off them to hang on the brace's edge. */
      const braceZ0 = 1.22;
      const braceZ1 = EAVE_Z - 0.12;
      const face = (x: number, z: number, graze: number): number => {
        const ax = Math.abs(x);
        if (lod < 2 && posts.some((q) => Math.abs(ax - q) <= postW / 2)) return FRAME_Y;
        if (ax >= DOOR_W / 2 + 0.01 && ax <= DOOR_W / 2 + 0.1) return FRAME_Y;
        // Stencils run on across the diagonal braces, as on the real car (painted after erection).
        const t = (z - braceZ0) / (braceZ1 - braceZ0);
        if (lod < 2 && t >= 0 && t <= 1)
          for (let i = 0; i < 4; i++) {
            const xa = (posts[i] ?? 0) - postW / 2;
            const xb = (posts[i + 1] ?? DOOR_W / 2) + postW / 2;
            const xc = xa + (xb - xa) * t;
            const hw = (0.0375 * dmath.hypot(xb - xa, braceZ1 - braceZ0)) / (braceZ1 - braceZ0);
            if (Math.abs(ax - xc) <= hw - graze) return SHEATH_Y + 0.004 + BRACE;
          }
        return SHEATH_Y;
      };
      // Far: each letter of the road name as a dull stencil block, the letter colour 60 % into
      // the body's: about what a stencil letter's strokes average to over the red around them
      // (a full-white bar was the brightest thing on the far car and read as a smear).
      const faint: Vec3 = [
        p.letter[0] + (paint[0] - p.letter[0]) * 0.6,
        p.letter[1] + (paint[1] - p.letter[1]) * 0.6,
        p.letter[2] + (paint[2] - p.letter[2]) * 0.6,
      ];
      for (const s of [-1, 1]) {
        const dirX = s < 0 ? 1 : -1; // read left → right for a viewer on that side
        const xl = -dirX * (XB + DOOR_W / 2) * 0.5; // centre of the left half
        const put = (str: string, cx: number, base: number, h: number, maxWidth?: number): void => {
          const m = text(str, {
            origin: [cx, s * SHEATH_Y, base],
            along: [dirX, 0, 0],
            up: [0, 0, 1],
            height: h,
            color: p.letter,
            align: 'centre',
            font: 'block',
            ...(maxWidth ? { maxWidth } : {}),
            // Painted over the proud posts and braces as on the real car.
            surface: (u, v) => face(cx + dirX * u, base + v, (h / 7) * 0.15) - SHEATH_Y,
          });
          lm.push(lod === 2 ? greeked(m, s, faint) : m);
        };
        put(p.road, xl, 3.0, 0.42, XB - DOOR_W / 2 - 0.5);
        if (lod === 2) continue;
        put(p.marks, xl, 2.43, 0.24);
        put(p.number, xl, 1.92, 0.36);
        if (lod === 0) {
          put(p.marks, -xl, 3.29, 0.12);
          put(p.number, -xl, 3.09, 0.12);
        }
      }
      ctx.part('lettering', merge(lm), { paint: 'letter' });
    }
  },
});

export const boxcar = usra.variant({
  name: 'boxcar',
  description:
    'USRA 50-ton single-sheathed 40 ft boxcar (1918), Clinchfield C.C.& O. 8024: wood sheathing in outside steel framing, sliding doors, cast trucks with spinning axles.',
  paint: { body: MINERAL_RED, letter: LETTER_WHITE },
  // Repaints of the same C.C.& O. car (another road name needs its own lettering: boxcar_nw).
  variants: {
    oxide_red: { body: OXIDE_RED },
    faded: { body: '#a0644f', letter: '#cfc6b4' },
  },
});

export const boxcar_nw = usra.variant({
  name: 'boxcar_nw',
  description: 'USRA single-sheathed boxcar in Norfolk & Western lettering, oxide red.',
  params: { road: 'NORFOLK & WESTERN', marks: 'N.& W.', number: '42574', paint: hex(OXIDE_RED) },
  paint: { body: OXIDE_RED, letter: LETTER_WHITE },
});
