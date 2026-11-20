// Railroad water tank: the Frisco's 50,000-gallon cypress-stave tank at Beaumont, Kansas (c. 1886,
// NRHP 93000843): a 22 ft × 14 ft stave tub on a 14 ft timber trestle of eight posts round a
// wooden core, six-sided shingle roof, goose-neck spout over the track (+X). Z up, ground z = 0.
// Dossier: ./README.md.

import {
  beam,
  box,
  clear,
  cylinder,
  defineAsset,
  dmath,
  hex,
  lathe,
  type Mesh,
  merge,
  place,
  planar,
  type Rng,
  tiled,
  type Vec3,
} from '@developerz.ai/ts23d';
import { restrip, type StripRule, tessellate, weatherer } from '../_lib/finish/finish.ts';
import { roofWear, type Shade, shade, tankWear, trestleWear } from './wear.ts';

const FT = 0.3048;
const TANK_R = (22 * FT) / 2; // 3.353
const TANK_H = 14 * FT; // 4.267
const FLOOR_Z = 14 * FT; // superstructure height
const TANK_TOP = FLOOR_Z + TANK_H;
const CORE_R = (10 * FT) / 2;
const POST_R = 2.75; // post circle (estimate: posts sit under the tank, inside its rim)
const POST_W = 0.3;
const FOOT_H = 0.45;
const CAP_Z0 = 3.72;
const CAP_Z1 = 4.02;
const ROOF_APOTHEM = TANK_R + 0.35;
const ROOF_RISE = 1.05;
const SPOUT_L = 3.4;
const SPOUT_REST = (25 * Math.PI) / 180;
const PIVOT: Vec3 = [TANK_R + 0.32, 0, FLOOR_Z + 0.55];

const timber = hex('#8c7b66');
const timberDark = hex('#6b5d4d');
const steel = hex('#2b2826');
const concrete = hex('#b9b3a6');
const shingle = hex('#4e463e');
/** Oiled cypress staves on the pine strip (U up the stave: grain runs vertically). */
const stave = hex('#a88a74');
/** Black wrought-iron hoops and lugs: cast-iron strip, dark so they read against the wood. */
const hoopIron = hex('#3c3734');
/** Stave count per LOD (≈ 0.18 m staves at LOD0, as cypress tank staves of the period). */
const STAVES = [120, 60, 16] as const;
/** Hoop facets per LOD: a whole divisor of the stave count, so hoop corners sit on stave joints. */
const HOOP_SEGS = [30, 30, 8] as const;

/** Authoring colour → material (the staves map themselves in `staveTub`): weathered fir trestle,
 *  rusted iron fittings, black cast-iron hoops; concrete and slate shingles keep their classic
 *  strips. */
const RULES: readonly StripRule[] = [
  { from: timber, strip: 'wood_weathered', color: hex('#d8cfc2') },
  { from: timberDark, strip: 'wood_weathered', color: hex('#a89c8c') },
  { from: steel, strip: 'iron_rust', color: hex('#6e625a') },
  { from: hoopIron, strip: 'iron_cast', color: hex('#4a4542') },
];

/** How much the board texture is stretched up a stave: real staves are one 14 ft piece, so the
 *  strip's butt joints (every ~1.2 m) must mostly fall off the stave. */
const STAVE_STRETCH = 3;

/**
 * The stave tub: one tiled quad per stave, U up the stave (vertical grain, stretched so a stave
 * is one long board), V scaled so each stave is exactly one board of the strip (the pine strip
 * holds four boards per band), each stave its own value (−14…+12 %), and `rows` vertex rows up the
 * height so the weeps and the soaked bottom course have room. The far LOD keeps the same strip,
 * the same mean colour and one band per facet.
 */
function staveTub(rng: Rng, n: number, rows: number, far: boolean): Mesh {
  const out: Mesh[] = [];
  const width = 2 * TANK_R * dmath.sin(Math.PI / n);
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * Math.PI * 2;
    const a1 = ((k + 1) / n) * Math.PI * 2;
    const p0: Vec3 = [dmath.cos(a0) * TANK_R, dmath.sin(a0) * TANK_R, FLOOR_Z];
    const p1: Vec3 = [dmath.cos(a1) * TANK_R, dmath.sin(a1) * TANK_R, FLOOR_Z];
    const v = rng.range(0.86, 1.12);
    const u0 = rng.range(0, 4);
    const m = tiled({
      origin: p1,
      u: [0, 0, TANK_H],
      v: [p0[0] - p1[0], p0[1] - p1[1], 0],
      color: [stave[0] * v, stave[1] * v, stave[2] * v],
      strip: 'pine',
      segments: rows,
      uOffset: u0,
      vOffset: far ? 0 : (k % 4) * width,
      vMetres: far ? width * 1.01 : 4 * width,
    });
    // Stretch U about the stave's foot (the sampler repeats U; the strip spans 4 m = 1 unit).
    const uvs = new Float32Array(m.uvs);
    const base = u0 / 4;
    for (let i = 0; i < uvs.length; i += 2) uvs[i] = base + ((uvs[i] ?? 0) - base) / STAVE_STRETCH;
    out.push({ ...m, uvs });
  }
  return merge(out);
}

/** Ring of `n` flat vertical facets (outward), boards running up: staves, the core's planking. */
function staveRing(
  r: number,
  z0: number,
  h: number,
  n: number,
  color: Vec3,
  strip: 'wood' | 'plain',
): Mesh {
  const out: Mesh[] = [];
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * Math.PI * 2;
    const a1 = ((k + 1) / n) * Math.PI * 2;
    const p0: Vec3 = [dmath.cos(a0) * r, dmath.sin(a0) * r, z0];
    const p1: Vec3 = [dmath.cos(a1) * r, dmath.sin(a1) * r, z0];
    out.push(
      tiled({
        origin: p1,
        u: [0, 0, h],
        v: [p0[0] - p1[0], p0[1] - p1[1], 0],
        color,
        strip,
        ...(strip === 'plain' ? { vMetres: 100 } : {}),
      }),
    );
  }
  return merge(out);
}

const GAUGE_A = -0.7;
const gaugePaint = hex('#b9b2a4');
const ink = hex('#1e1c1a');

/**
 * Float gauge on the −Y/+X quarter (seen from the track): a painted board standing on the hoops,
 * tick bars every half metre, the target that rides up and down on its cable, and the pulley on
 * an iron bracket near the rim that carries the cable over the staves to the float inside. LOD1
 * (`full` false) keeps the board, the target and the pulley.
 */
function floatGauge(r0: number, full: boolean): Mesh {
  const h = TANK_H - 0.35;
  const z0 = FLOOR_Z + 0.15;
  const g: Mesh[] = [
    box({
      size: [0.04, 0.26, h],
      at: [r0 + 0.02, 0, z0],
      color: gaugePaint,
      strip: 'wood_painted',
    }),
  ];
  for (let z = z0 + 0.4; full && z < z0 + h - 0.2; z += 0.5)
    g.push(
      box({ size: [0.006, 0.12, 0.025], at: [r0 + 0.043, 0.05, z], color: ink, strip: 'plain' }),
    );
  // Target 2.6 m up: the tank three-fifths full.
  g.push(box({ size: [0.02, 0.36, 0.2], at: [r0 + 0.05, 0, z0 + 2.6], color: ink, strip: 'iron' }));
  g.push(
    box({
      size: [0.004, 0.26, 0.06],
      at: [r0 + 0.062, 0, z0 + 2.67],
      color: gaugePaint,
      strip: 'plain',
    }),
  );
  // Bracket, pulley and the cable from the target up over it.
  const zp = z0 + h - 0.1;
  g.push(
    box({ size: [0.16, 0.03, 0.05], at: [r0 + 0.1, 0, zp - 0.16], color: steel, strip: 'iron' }),
  );
  g.push(
    cylinder({
      radius: 0.11,
      length: 0.04,
      segments: full ? 12 : 8,
      axis: 'y',
      at: [r0 + 0.16, 0, zp],
      color: steel,
    }),
  );
  if (full)
    g.push(
      beam({
        from: [r0 + 0.16 + 0.1, 0, zp],
        to: [r0 + 0.06, 0, z0 + 2.8],
        width: 0.014,
        color: steel,
      }),
    );
  return merge(g.map((m) => place(m, { yaw: GAUGE_A })));
}

/**
 * The far gauge: the board as one quad 4 mm off the far hoop bands' face (radius `TANK_R` + 12 mm),
 * laid flat on the band facet under the gauge's bearing, so both its edges clear the band (squared
 * to the bearing instead, one edge sank 1 cm into it), its centre on that bearing as near.
 */
export function farGauge(): Mesh {
  const step = (Math.PI * 2) / STAVES[2];
  // The far hoops' facets are centred half a step off the lathe's vertices (multiples of a step).
  const off = (((GAUGE_A % step) + step) % step) - step / 2;
  const facet = GAUGE_A - off;
  const apothem = (TANK_R + 0.012) * dmath.cos(step / 2);
  // Where the bearing meets the facet, measured along the facet from its centre.
  const along = (apothem * dmath.sin(off)) / dmath.cos(off);
  const z0 = FLOOR_Z + 0.15;
  return place(
    tiled({
      origin: [apothem + 0.004, along - 0.13, z0],
      u: [0, 0.26, 0],
      v: [0, 0, TANK_H - 0.35],
      color: gaugePaint,
      strip: 'wood_painted',
      vMetres: TANK_H,
    }),
    { yaw: facet },
  );
}

/** The far hoop facet a far gauge lies on: its centre bearing and its distance from the axis. */
export const FAR_HOOP = { segments: STAVES[2], radius: TANK_R + 0.012, gauge: GAUGE_A } as const;

/** Axis-aligned box from two corners. */
const bx = (
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
  color: Vec3,
  strip: 'wood' | 'iron' | 'concrete' | 'plain' = 'wood',
  bevel = 0,
): Mesh => {
  const small = Math.min(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
  return box({
    size: [Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)],
    at: [(x0 + x1) / 2, (y0 + y1) / 2, Math.min(z0, z1)],
    color,
    strip,
    ...(bevel > 0 && bevel < small / 2 ? { bevel } : {}),
  });
};

export const water_tower = defineAsset({
  name: 'water_tower',
  kind: 'building',
  description:
    'Frisco 50,000-gallon cypress-stave railroad water tank (Beaumont, Kansas, c. 1886): hooped tub on an eight-post timber trestle with a central core, six-sided shingle roof, goose-neck spout.',
  tags: ['railroad', 'water-tank', 'lineside', '1880s', 'usa'],
  license: 'CC0-1.0',
  sources: [
    'https://npgallery.nps.gov/GetAsset/f632b7b3-36b4-4a36-be22-47bb617fad0d',
    'https://commons.wikimedia.org/wiki/File:Beaumont_Kansas_Water_Tower.jpg',
    'https://en.wikipedia.org/wiki/Beaumont_St._Louis_and_San_Francisco_Railroad_Water_Tank',
    'https://davesriogrande.net/Structures/WaterTanks/watertanks.htm',
  ],
  real: {
    // Overall box: tank + roof eave (−X) to the spout mouth (+X); roof apex + finial on Z.
    length: 4.27 + PIVOT[0] + SPOUT_L * dmath.cos(SPOUT_REST) + 0.1,
    width: 2 * ROOF_APOTHEM,
    height: TANK_TOP + 0.15 + ROOF_RISE + 0.9,
    measures: [
      {
        label: 'tank diameter (22 ft)',
        value: 22 * FT,
        axis: 'y',
        parts: ['tank'],
        source: 'NRHP 93000843 §7',
      },
      {
        label: 'tank height (14 ft)',
        value: TANK_H,
        axis: 'z',
        parts: ['tank'],
        source: 'NRHP 93000843 §7',
      },
      {
        label: 'superstructure height (14 ft)',
        value: FLOOR_Z,
        axis: 'z',
        parts: ['trestle'],
        source: 'NRHP 93000843 §7',
      },
      {
        label: 'core diameter (10 ft)',
        value: 10 * FT,
        axis: 'y',
        parts: ['core'],
        source: 'NRHP 93000843 §7',
      },
      {
        label: 'core height (14 ft)',
        value: 14 * FT,
        axis: 'z',
        parts: ['core'],
        source: 'NRHP 93000843 §7',
      },
    ],
  },
  budget: { triangles: [7900, 3350, 590] },
  checks: [clear('spout_*', 'tank', 0.02), clear('spout_*', 'roof', 0.05)],
  build(ctx) {
    const lod = ctx.lod;
    const bevel = ctx.pick([0.02, 0.01, 0]);
    const weather = weatherer(ctx.rng.fork('weather'));
    const drips = trestleWear(ctx.rng.fork('trestle-wear'), {
      floorZ: FLOOR_Z,
      footH: FOOT_H,
      sun: [-0.6, 0.8],
      spillX: POST_R * 0.6,
    });
    /** Materials, then the part's water story, splash-back mud low down and dust on top faces. */
    const part = (
      name: string,
      m: Mesh,
      wear?: Shade,
      o?: Parameters<typeof ctx.part>[2],
    ): void => {
      const mat = restrip(m, RULES);
      const worn = wear ? shade(mat, wear) : mat;
      ctx.part(name, weather(worn, { dust: 0.25, mud: 0.7, mudStrength: 0.6 }), o);
    };

    // ---- trestle: footings, eight posts, cap ring, X bracing, joists under the tank floor.
    const tr: Mesh[] = [];
    const postAt = Array.from({ length: 8 }, (_, k) => {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
      return [dmath.cos(a) * POST_R, dmath.sin(a) * POST_R] as const;
    });
    // Posts and footings face the centre (one face out), so the strap plates sit flat on them.
    // Far, the faces nobody sees go: the post ends (on the footing, under the cap beam) and the
    // footing's base.
    const post = box({
      size: [POST_W, POST_W, CAP_Z0 - FOOT_H],
      at: [0, 0, 0],
      color: timber,
      strip: 'wood',
      ...(lod < 2 ? { bevel: bevel / 2 } : { omit: ['top', 'bottom'] }),
    });
    const footing = box({
      size: [0.66, 0.66, FOOT_H],
      at: [0, 0, 0],
      color: concrete,
      strip: 'concrete',
      ...(lod < 2 ? { bevel } : { omit: ['bottom'] }),
    });
    // Iron strap plate over the post head and the cap beam, two bolts through each.
    const strap: Mesh[] = [
      box({
        size: [0.012, 0.2, 0.5],
        at: [POST_W / 2 + 0.006, 0, CAP_Z0 - 0.25],
        color: steel,
        strip: 'iron',
      }),
    ];
    for (const z of [CAP_Z0 - 0.15, CAP_Z0 + 0.13])
      strap.push(
        box({
          size: [0.03, 0.05, 0.05],
          at: [POST_W / 2 + 0.025, 0, z - 0.025],
          color: steel,
          strip: 'iron',
        }),
      );
    postAt.forEach(([x, y], k) => {
      const yaw = (k / 8) * Math.PI * 2 + Math.PI / 8;
      tr.push(place(footing, { at: [x, y, 0], yaw }));
      tr.push(place(post, { at: [x, y, FOOT_H], yaw }));
      if (lod === 0) tr.push(place(merge(strap), { at: [x, y, 0], yaw }));
    });
    postAt.forEach(([x, y], k) => {
      const [nx, ny] = postAt[(k + 1) % 8] ?? [x, y];
      // Cap beam post → post (ring), sitting on the post tops.
      tr.push(
        beam({
          from: [x, y, CAP_Z0 + 0.15],
          to: [nx, ny, CAP_Z0 + 0.15],
          width: 0.3,
          height: 0.3,
          color: timberDark,
          strip: 'wood',
          up: [0, 0, 1],
          // Far, the ends meet inside the neighbouring beams: no caps.
          ...(lod === 2 ? { caps: false } : {}),
        }),
      );
      // X brace on the outer face of the bay, foot of one post to the head of the next.
      const mx = (x + nx) / 2;
      const my = (y + ny) / 2;
      const ml = dmath.hypot(mx, my);
      const off = 0.2 / ml;
      const o = (px: number, py: number, z: number): Vec3 => [px + mx * off, py + my * off, z];
      if (lod === 2) {
        // Far: each brace one double-sided board quad, so the trestle keeps its X read.
        for (const [from, to] of [
          [o(x, y, FOOT_H + 0.25), o(nx, ny, CAP_Z0 - 0.1)],
          [o(nx, ny, FOOT_H + 0.25), o(x, y, CAP_Z0 - 0.1)],
        ] as const) {
          const d: Vec3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
          // Across the brace in the bay's plane: n × d, scaled to the 0.2 m board width.
          const c: Vec3 = [
            (my / ml) * d[2],
            (-mx / ml) * d[2],
            (mx / ml) * d[1] - (my / ml) * d[0],
          ];
          const cl = dmath.hypot(c[0], c[1], c[2]);
          const v: Vec3 = [(c[0] / cl) * 0.2, (c[1] / cl) * 0.2, (c[2] / cl) * 0.2];
          tr.push(
            tiled({
              origin: [from[0] - v[0] / 2, from[1] - v[1] / 2, from[2] - v[2] / 2],
              u: d,
              v,
              color: timber,
              strip: 'wood',
              vMetres: 1,
              doubleSided: true,
            }),
          );
        }
      }
      if (lod < 2) {
        tr.push(
          beam({
            from: o(x, y, FOOT_H + 0.25),
            to: o(nx, ny, CAP_Z0 - 0.1),
            width: 0.2,
            height: 0.1,
            color: timber,
            strip: 'wood',
            up: [mx / ml, my / ml, 0],
          }),
        );
        tr.push(
          beam({
            from: o(nx, ny, FOOT_H + 0.25),
            to: o(x, y, CAP_Z0 - 0.1),
            width: 0.2,
            height: 0.1,
            color: timber,
            strip: 'wood',
            up: [mx / ml, my / ml, 0],
          }),
        );
        if (lod === 0) {
          // Through-bolt at the crossing and at each brace end.
          // Square nut and washer face, as period trestle bolts.
          const bolt = box({
            size: [0.06, 0.065, 0.065],
            at: [0, 0, -0.0325],
            color: steel,
            strip: 'iron',
          });
          const n = [mx / ml, my / ml];
          for (const [px, py, z] of [
            [mx, my, (FOOT_H + 0.25 + CAP_Z0 - 0.1) / 2],
            [x, y, FOOT_H + 0.3],
            [nx, ny, FOOT_H + 0.3],
            [x, y, CAP_Z0 - 0.15],
            [nx, ny, CAP_Z0 - 0.15],
          ] as const) {
            const at = o(px, py, z);
            tr.push(
              place(bolt, {
                at: [at[0] + (n[0] ?? 0) * 0.06, at[1] + (n[1] ?? 0) * 0.06, at[2]],
                yaw: dmath.atan2(n[1] ?? 0, n[0] ?? 1),
              }),
            );
          }
        }
      }
    });
    // Joists along X across the tank floor, ends showing past the staves.
    // The outermost pair sits over the flat ±Y cap beams (not beyond them on nothing).
    const joistStep = ctx.pick([0.55, 0.9, 1.6]);
    const yMax = POST_R * dmath.sin((3 * Math.PI) / 8);
    const joists = Math.round((2 * yMax) / joistStep) + 1;
    for (let j = 0; j < joists; j++) {
      const y = -yMax + (2 * yMax * j) / (joists - 1);
      const half = Math.sqrt(Math.max(0, TANK_R * TANK_R - y * y)) + 0.15;
      tr.push(bx(-half, half, y - 0.1, y + 0.1, CAP_Z1, FLOOR_Z, timberDark, 'wood'));
    }
    part('trestle', merge(tr), drips);

    // ---- central core: vertical planking round a 10 ft cylinder, with its access door.
    const coreN = ctx.pick([12, 12, 8]);
    // Silvered board-and-batten (the trestle's weathered fir, not the tank's oiled staves), so the
    // 10 ft core reads as the timber housing round the outlet pipe, not a second tub.
    const core: Mesh[] = [
      staveRing(CORE_R, 0, 14 * FT, coreN, timber, lod === 2 ? 'plain' : 'wood'),
    ];
    core.push(
      lathe({
        profile: [
          [0, 14 * FT - 0.01],
          [CORE_R, 14 * FT - 0.01],
          [CORE_R, 14 * FT],
        ],
        segments: coreN,
        color: timberDark,
      }),
    ); // lid
    if (lod < 2) {
      const da = Math.PI; // door faces −X, away from the track
      const dx = dmath.cos(da) * CORE_R * dmath.cos(Math.PI / coreN);
      core.push(bx(dx - 0.06, dx + 0.002, -0.4, 0.4, 0.05, 2.0, timber, 'wood'));
      if (lod === 0) {
        core.push(bx(dx - 0.09, dx - 0.06, -0.45, 0.45, 1.98, 2.06, timberDark, 'wood'));
        for (const z of [0.4, 1.6])
          core.push(bx(dx - 0.08, dx - 0.06, 0.05, 0.38, z, z + 0.05, steel, 'iron')); // strap hinges
      }
    }
    part('core', merge(core), drips);
    const battens: Mesh[] = [];
    if (lod === 0)
      for (let k = 0; k < coreN; k++) {
        // A batten over every board joint (the facet corners), bedded 1 cm into them: their own
        // part, so the core's measured 10 ft is the boarding.
        const a = (k / coreN) * Math.PI * 2;
        battens.push(
          place(box({ size: [0.05, 0.09, 14 * FT - 0.02], at: [0, 0, 0], color: timberDark }), {
            at: [dmath.cos(a) * (CORE_R + 0.015), dmath.sin(a) * (CORE_R + 0.015), 0],
            yaw: a,
          }),
        );
      }
    if (battens.length) part('housing_battens', merge(battens), drips);

    // ---- tank: stave tub, hoops (closer near the bottom), lugs; weeping water stains.
    const nStaves = STAVES[lod] ?? 16;
    const wetTank = tankWear(ctx.rng.fork('tank-wear'), {
      floorZ: FLOOR_Z,
      topZ: TANK_TOP,
      outletAngle: 0,
      outletZ: PIVOT[2],
    });
    part(
      'tank',
      staveTub(ctx.rng.fork('staves'), nStaves, ctx.pick([6, 2, 1]), lod === 2),
      wetTank,
    );
    if (lod === 2) {
      // Far: three hoops as flat iron bands on the stave polygon, so the tub stays hooped.
      const band: Mesh[] = [];
      for (const t of [0.12, 0.45, 0.8])
        band.push(
          lathe({
            profile: [
              [TANK_R + 0.012, FLOOR_Z + TANK_H * t],
              [TANK_R + 0.012, FLOOR_Z + TANK_H * t + 0.07],
            ],
            segments: nStaves,
            color: hoopIron,
            strip: 'iron',
          }),
        );
      part('tank_hoops', merge(band));
      part('float_gauge', farGauge());
    }
    if (lod < 2) {
      const hoops: Mesh[] = [];
      // Eight heavy hoops (five at LOD1): few enough that the vertical staves lead.
      const n = lod === 0 ? 8 : 5;
      const segs = HOOP_SEGS[lod] ?? 30;
      // Round iron rods drawn tight onto the staves: a half-round profile on `segs` facets whose
      // chord midpoints bed 1 mm into the stave polygon (corners stand proud by the chord sag).
      const rr = (TANK_R * dmath.cos(Math.PI / nStaves)) / dmath.cos(Math.PI / segs) - 0.001;
      const faceR = (a: number): number => {
        const step = (Math.PI * 2) / segs;
        const off = (((a % step) + step) % step) - step / 2;
        return (rr * dmath.cos(Math.PI / segs)) / dmath.cos(off);
      };
      for (let i = 0; i < n; i++) {
        // Spacing grows with height: pressure falls off toward the top.
        const t = (i + 0.5) / n;
        const z = FLOOR_Z + 0.12 + (TANK_H - 0.3) * dmath.pow(t, 1.35);
        hoops.push(
          lathe({
            profile: [
              [rr, z],
              [rr + 0.024, z + 0.022],
              [rr, z + 0.044],
            ],
            segments: segs,
            color: hoopIron,
            strip: 'iron',
          }),
        );
        if (lod === 0) {
          // Lug (the hoop's tightening nut), staggered round the tank, bedded on its hoop.
          const a = (i * 2.399) % (Math.PI * 2);
          const lr = faceR(a) + 0.012;
          hoops.push(
            place(
              box({ size: [0.05, 0.16, 0.07], at: [0, 0, -0.02], color: hoopIron, strip: 'iron' }),
              { at: [dmath.cos(a) * lr, dmath.sin(a) * lr, z], yaw: a },
            ),
          );
        }
      }
      part('tank_hoops', merge(hoops));
      // The board's back sinks 6 mm into the hoops' rounded faces where it crosses them.
      part('float_gauge', floatGauge(faceR(GAUGE_A) + 0.01, lod === 0));
    }

    // ---- roof: low six-sided pyramid of shingles, fascia, finial and lightning rod, hatch.
    // Wall plate: a ring set into the stave tops that the rafters (and the soffit) bear on.
    // Wall plate: a ring set on the stave tops that the rafters (and the soffit) bear on; its
    // facets' chord midpoints sit 3 mm proud of the staves (near LODs; far, the soffit rests).
    const roofM: Mesh[] = [];
    const slopes: Mesh[] = [];
    if (lod < 2) {
      const segs = HOOP_SEGS[lod] ?? 30;
      const rp = (TANK_R * dmath.cos(Math.PI / nStaves)) / dmath.cos(Math.PI / segs) + 0.003;
      roofM.push(
        lathe({
          profile: [
            [rp, TANK_TOP - 0.1],
            [rp, TANK_TOP],
            [TANK_R - 0.15, TANK_TOP],
          ],
          segments: segs,
          color: timberDark,
          strip: 'wood',
        }),
      );
    }
    const circ = ROOF_APOTHEM / dmath.cos(Math.PI / 6);
    const eaveZ = TANK_TOP + 0.15;
    const apex: Vec3 = [0, 0, eaveZ + ROOF_RISE];
    const corner = (k: number, z: number, r = circ): Vec3 => [
      dmath.cos((k * Math.PI) / 3) * r,
      dmath.sin((k * Math.PI) / 3) * r,
      z,
    ];
    for (let k = 0; k < 6; k++) {
      slopes.push(
        planar({
          points: [corner(k, eaveZ), corner(k + 1, eaveZ), apex],
          color: shingle,
          strip: 'slate',
        }),
      );
      roofM.push(
        tiled({
          origin: corner(k + 1, TANK_TOP),
          u: [corner(k, 0)[0] - corner(k + 1, 0)[0], corner(k, 0)[1] - corner(k + 1, 0)[1], 0],
          v: [0, 0, 0.15],
          color: timberDark,
          strip: 'wood',
        }),
      ); // fascia
      roofM.push(
        planar({
          points: [corner(k + 1, TANK_TOP), corner(k, TANK_TOP), [0, 0, TANK_TOP]],
          color: timberDark,
          strip: 'wood',
        }),
      ); // soffit
    }
    if (lod < 2) {
      roofM.push(
        lathe({
          profile: [
            [0.12, apex[2] - 0.05],
            [0.12, apex[2] + 0.12],
            [0.06, apex[2] + 0.25],
            [0, apex[2] + 0.3],
          ],
          segments: 8,
          color: steel,
        }),
      ); // finial cap
      roofM.push(
        cylinder({
          radius: 0.012,
          length: 0.62,
          segments: 4,
          at: [0, 0, apex[2] + 0.58],
          color: steel,
        }),
      ); // lightning rod
    }
    if (lod === 0) {
      // Hip caps (ridge boards) and a hatch on the −X slope.
      for (let k = 0; k < 6; k++)
        roofM.push(
          beam({
            from: corner(k, eaveZ + 0.02),
            to: [0, 0, apex[2] + 0.02],
            width: 0.1,
            height: 0.04,
            color: timberDark,
            strip: 'wood',
          }),
        );
      const slope = dmath.atan2(ROOF_RISE, ROOF_APOTHEM);
      roofM.push(
        place(
          box({ size: [0.7, 0.7, 0.12], at: [0, 0, -0.04], color: timberDark, strip: 'wood' }),
          { at: [-ROOF_APOTHEM * 0.55, 0, eaveZ + ROOF_RISE * 0.45], pitch: -slope },
        ),
      );
    }
    // Split the shingle planes (near LODs) so the lichen and run-off have vertices to live on.
    const roofMesh = merge([
      ...roofM,
      lod < 2 ? tessellate(merge(slopes), ctx.pick([0.9, 1.8, 0])) : merge(slopes),
    ]);
    part(
      'roof',
      roofMesh,
      roofWear(ctx.rng.fork('roof-wear'), { eaveZ, apexZ: apex[2], sun: [-0.6, 0.8] }),
    );

    // ---- outlet + hinge on the track side; the spout swings on it.
    const outlet: Mesh[] = [
      cylinder({
        radius: 0.2,
        length: PIVOT[0] - TANK_R + 0.08,
        segments: ctx.pick([14, 10, 6]),
        axis: 'x',
        at: [(TANK_R - 0.08 + PIVOT[0]) / 2, 0, PIVOT[2]],
        color: steel,
      }),
    ];
    if (lod < 2)
      outlet.push(
        cylinder({
          radius: 0.27,
          length: 0.06,
          segments: ctx.pick([14, 10, 6]),
          axis: 'x',
          at: [TANK_R + 0.03, 0, PIVOT[2]],
          color: steel,
        }),
      ); // flange
    part('outlet', merge(outlet));

    ctx.group('spout', {
      at: PIVOT,
      motion: { kind: 'sway', axis: [0, 1, 0], degrees: 15, hz: 0.1 },
      clearOf: ['outlet'], // the hinge knuckle turns inside the outlet flange by design
    });
    const dir: Vec3 = [dmath.cos(SPOUT_REST), 0, dmath.sin(SPOUT_REST)];
    const along = (d: number, z = 0): Vec3 => [dir[0] * d, 0, dir[2] * d + z];
    const sp: Mesh[] = [
      beam({
        from: along(0),
        to: along(SPOUT_L * 0.72),
        width: 0.4,
        segments: ctx.pick([12, 8, 6]),
        color: steel,
      }),
      beam({
        from: along(SPOUT_L * 0.7),
        to: along(SPOUT_L),
        width: 0.32,
        segments: ctx.pick([12, 8, 6]),
        color: steel,
      }),
    ];
    if (lod < 2) {
      sp.push(cylinder({ radius: 0.25, length: 0.42, segments: 10, axis: 'y', color: steel })); // hinge knuckle
      sp.push(
        place(
          lathe({
            profile: [
              [0.16, 0],
              [0.24, 0.16],
              [0.24, 0.2],
            ],
            segments: 10,
            color: steel,
          }),
          { at: along(SPOUT_L - 0.05), pitch: Math.PI / 2 - SPOUT_REST },
        ),
      );
      for (const d of [0.9, 1.9])
        sp.push(
          place(cylinder({ radius: 0.215, length: 0.05, segments: 10, axis: 'x', color: steel }), {
            at: along(d),
            pitch: -SPOUT_REST,
          }),
        ); // bands
    }
    if (lod === 0) {
      // Pull chain hanging from the mouth (the fireman pulls it down over the tender).
      // Links hang through one another: each 12 cm link reaches 1 cm into the next (crossed 90°).
      const tip = along(SPOUT_L - 0.1, -0.2);
      for (let i = 0; i < 10; i++)
        sp.push(
          place(box({ size: [0.03, 0.06, 0.12], color: steel, strip: 'iron' }), {
            at: [tip[0], 0, tip[2] - i * 0.11],
            yaw: (i % 2) * (Math.PI / 2),
          }),
        );
    }
    part('spout_body', merge(sp), undefined, { parent: 'spout' });
    ctx.socket('water_fill', {
      kind: 'interact',
      parent: 'spout',
      at: along(SPOUT_L),
      dir: [0, 0, -1],
    });

    // ---- ladder up the −X side to the eave, with stays to the tank and the cap ring.
    if (lod < 2) {
      const lx = -(TANK_R + 0.42);
      const top = TANK_TOP - 0.1;
      const lad: Mesh[] = [];
      for (const y of [-0.22, 0.22])
        lad.push(bx(lx - 0.05, lx + 0.05, y - 0.03, y + 0.03, 0, top, timber, 'wood'));
      const rung = ctx.pick([0.3, 0.6, 1]);
      for (let z = 0.3; z < top - 0.1; z += rung)
        lad.push(
          cylinder({
            radius: 0.018,
            length: 0.44,
            segments: lod === 0 ? 6 : 4,
            axis: 'y',
            at: [lx, 0, z],
            color: timber,
          }),
        );
      for (const z of [CAP_Z0 + 0.15, FLOOR_Z + 1.5, TANK_TOP - 0.4])
        for (const y of [-0.22, 0.22]) {
          // A stay runs from inside its stile to 1.5 cm inside what it is spiked to: the stave
          // faces either side of the tank's −X corner, or the −X cap beam of the trestle.
          const fa = Math.PI / nStaves;
          const r =
            z > FLOOR_Z
              ? TANK_R - Math.abs(y * 0.6) * dmath.tan(fa) - 0.015 / dmath.cos(fa)
              : POST_R * dmath.cos(Math.PI / 8) + 0.05;
          lad.push(
            beam({
              from: [lx, y, z],
              to: [-r, y * 0.6, z],
              width: 0.05,
              height: 0.03,
              color: steel,
              strip: 'iron',
            }),
          );
        }
      part('ladder', merge(lad), drips);
    }
  },
});
