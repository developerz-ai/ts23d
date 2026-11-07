// VTD-20 "Kite" — an ORIGINAL VTOL troop dropship (no franchise design): a 20 m hard-surface
// fuselage with a chamfered, tumblehomed section, armoured gear sponsons, a dorsal drive hump, two
// tilting ducted-fan nacelles on stub wings, a rear loading ramp under an upswept V-tail boom and
// skid-pad gear. Scale from real tiltrotor / tandem-rotor transports (V-22 fuselage 17.5 m, CH-47
// fuselage 15.9 m × 3.8 m, cabin 9.3 × 2.29 × 1.98 m): see README.md. +X front, Z up, metres.
//
// Engine contract: `nacelle_l/_r` sway ±30° about Y (thrust vectoring) › `fan_l/_r` spin,
// `thruster_l/_r` glow; `ramp` rests closed (40°), one-way swing to the ground (−22.5°);
// `turret` › `gun`; light sockets `nav_l` (red, port = +Y), `nav_r` (green), `nav_tail` (white
// strobe), `cabin_light`, `landing_light`; emitters `thrust_*`, `downwash_*`, `muzzle`.

import {
  bakeAo,
  beam,
  box,
  type Check,
  type CheckFinding,
  cylinder,
  defineAsset,
  grime,
  hex,
  insideSolid,
  lathe,
  loft,
  type Mesh,
  merge,
  noOverlap,
  place,
  planar,
  prism,
  symmetric,
  text,
  type Vec2,
  type Vec3,
  weightedNormals,
  worldMeshes,
} from '@developerz-ai/ts23d';

// ── palette: gunmetal two-tone, dark belly, orange accent, yellow/black hazard ──────────────────
const HULL = hex('#636b71');
const HULL_LIGHT = hex('#788086');
const PANEL = hex('#4b5258');
const BELLY = hex('#2c3135');
const SEAM = hex('#1f2326');
const DARK = hex('#222528');
const METAL = hex('#555a60');
const ACCENT = hex('#c8641c');
const HAZARD = hex('#d9a421');
const BLACK = hex('#17181a');
const GLASS = hex('#3f7598');
const GLOW = hex('#6fd2ff');
const INTERIOR = hex('#4a5157');
const STENCIL = hex('#d6d3c8');
/** Hull number, stencilled on the sponsons and both faces of the fins. */
const HULL_NO = '07';

// ── layout ───────────────────────────────────────────────────────────────────────────────────────
type Station = {
  readonly x: number;
  readonly zb: number; // belly
  readonly zw: number; // waist (lower side ends, tumblehome begins)
  readonly zt: number; // roof
  readonly hw: number; // half width at the waist
};
/** Nose stations, tip → front bulkhead. The cabin runs from the last one to CABIN_END. */
const NOSE: readonly Station[] = [
  { x: 10.0, zb: 2.3, zw: 2.45, zt: 2.6, hw: 0.32 },
  { x: 9.4, zb: 1.9, zw: 2.45, zt: 3.05, hw: 0.82 },
  { x: 8.4, zb: 1.6, zw: 2.55, zt: 3.55, hw: 1.3 },
  { x: 7.0, zb: 1.4, zw: 2.7, zt: 4.05, hw: 1.66 },
  { x: 5.6, zb: 1.3, zw: 2.8, zt: 4.3, hw: 1.85 },
];
const CABIN: Station = { x: 5.6, zb: 1.3, zw: 2.8, zt: 4.3, hw: 1.85 };
const CABIN_END = -4.3;
const WALL = 0.08;
const BOOM: readonly Station[] = [
  { x: -4.3, zb: 3.45, zw: 3.8, zt: 4.3, hw: 1.7 },
  { x: -7.2, zb: 3.85, zw: 4.02, zt: 4.38, hw: 1.25 },
  { x: -9.6, zb: 3.95, zw: 4.05, zt: 4.3, hw: 0.72 },
];
const BOOM_END = -9.6;
const WING_Z = 3.5;
const WING_TIP = 4.3;
const POD_X = 0.2;
const POD_Y = 5.55;
const POD_R = 1.1;
const HINGE: Vec3 = [-4.5, 0, 1.35];
const RAMP_LEN = 3.2;
const RAMP_HW = 1.4;
const RAMP_CLOSED = 40;
const RAMP_OPEN = -22.5; // lip on the ground
const RAMP_SWING = RAMP_CLOSED - RAMP_OPEN;
const SPONSON = { x0: 3.8, x1: -3.8, zb: 1.45, zt: 2.78, y0: 1.8, y1: 2.3 };
const MAIN_GEAR: Vec3 = [-1.4, 2.05, 0];
const NOSE_GEAR: Vec3 = [7.1, 0, 0];
const DEG = Math.PI / 180;
const SIDES = [
  [1, 'l'],
  [-1, 'r'],
] as const;

/** 10-point chamfered, tumblehomed section (y, z) at a station, −Y belly corner first. */
function section(s: Station, inset = 0): Vec2[] {
  const hw = s.hw - inset;
  const zb = s.zb + inset;
  const zt = s.zt - inset;
  const h = zt - zb;
  const cb = Math.min(0.32, h * 0.18, hw * 0.3);
  const ct = Math.min(0.32, h * 0.2, hw * 0.3);
  const tum = Math.min(0.26, hw * 0.15);
  const zw = Math.min(Math.max(s.zw, zb + cb + 0.02), zt - ct - 0.02);
  const half: Vec2[] = [
    [hw - cb, zb],
    [hw, zb + cb],
    [hw, zw],
    [hw - tum, zt - ct],
    [hw - tum - ct, zt],
  ];
  return [...half.map(([y, z]): Vec2 => [-y, z]), ...[...half].reverse()];
}

const ringOf = (s: Station): Vec3[] => section(s).map(([y, z]): Vec3 => [s.x, y, z]);

/** y of the cabin's outer skin at height z on the +Y side (vertical below the waist). */
function skinY(z: number): number {
  const [, , w, t] = section(CABIN).slice(5).reverse();
  if (!w || !t || z <= w[1]) return CABIN.hw;
  return w[0] + ((t[0] - w[0]) * (z - w[1])) / (t[1] - w[1]);
}

/** Lofted closed shell, weighted-normal shaded so every panel reads flat and crisp. */
function shell(rings: readonly (readonly Vec3[])[], color: (p: Vec3) => Vec3, hard = 25): Mesh {
  const m = loft({
    rings,
    color: (_r, _i, p) => color(p),
    capStart: true,
    capEnd: true,
    uv: 'row',
  });
  return weightedNormals(m, { hardAngle: hard });
}

const hullColor = (p: Vec3): Vec3 => (p[2] < 1.75 ? BELLY : p[2] > 3.95 ? HULL_LIGHT : HULL);

/** A flat quad lifted `off` metres along its normal (CCW seen from the side it faces). */
function quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, color: Vec3, off = 0.015): Mesh {
  const u: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v: Vec3 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
  const n: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const l = Math.hypot(...n) || 1;
  const lift = (p: Vec3): Vec3 => [
    p[0] + (n[0] / l) * off,
    p[1] + (n[1] / l) * off,
    p[2] + (n[2] / l) * off,
  ];
  return planar({ points: [lift(a), lift(b), lift(c), lift(d)], color });
}

/** `quad`, wound so its normal points away from `centre` (seams around a ring). */
function quadOut(a: Vec3, b: Vec3, c: Vec3, d: Vec3, color: Vec3, centre: Vec3, off: number): Mesh {
  const u: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v: Vec3 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
  const n: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const out = (a[0] - centre[0]) * n[0] + (a[1] - centre[1]) * n[1] + (a[2] - centre[2]) * n[2];
  return out >= 0 ? quad(a, b, c, d, color, off) : quad(a, d, c, b, color, off);
}

/** Yellow/black stripe band: `stripes` cells from a→b, each `up` tall (CCW: (b−a) × up = out). */
function hazard(a: Vec3, b: Vec3, up: Vec3, stripes: number, off = 0.012): Mesh {
  const step = [0, 1, 2].map((k) => ((b[k] ?? 0) - (a[k] ?? 0)) / stripes);
  const at = (k: number, t: number): Vec3 => [
    a[0] + (step[0] ?? 0) * k + up[0] * t,
    a[1] + (step[1] ?? 0) * k + up[1] * t,
    a[2] + (step[2] ?? 0) * k + up[2] * t,
  ];
  return merge(
    Array.from({ length: stripes }, (_, k) =>
      quad(at(k, 0), at(k + 1, 0), at(k + 1, 1), at(k, 1), k % 2 ? BLACK : HAZARD, off),
    ),
  );
}

const bevelled = (size: Vec3, color: Vec3, bevel: number, at: Vec3 = [0, 0, 0]): Mesh =>
  box({ size, color, at, bevel: bevel > 0 && bevel < Math.min(...size) / 2 ? bevel : 0 });

/** A ring of a cross-section squeezed toward an anchor (loft end fairings). */
const squeeze = (pts: readonly Vec2[], anchor: Vec2, ky: number, kz: number, x: number): Vec3[] =>
  pts.map(
    ([y, z]): Vec3 => [x, anchor[0] + (y - anchor[0]) * ky, anchor[1] + (z - anchor[1]) * kz],
  );

/** Hexagonal airfoil ring in XZ at span y: leading edge xl, trailing xt, thickness th. */
function airfoil(y: number, xl: number, xt: number, th: number): Vec3[] {
  const c = xl - xt;
  return [
    [xl, y, WING_Z],
    [xl - 0.18 * c, y, WING_Z + th / 2],
    [xt + 0.12 * c, y, WING_Z + th / 2],
    [xt, y, WING_Z],
    [xt + 0.12 * c, y, WING_Z - th / 2],
    [xl - 0.18 * c, y, WING_Z - th / 2],
  ];
}

/**
 * The ramp's arc (closed → open, every 6°) never enters the hull and never digs into the ground.
 * `clashes` already sweeps the real sector; this adds the ground, which is not geometry.
 */
const rampArc: Check = (asset) => {
  const world = worldMeshes(asset.parts);
  const out: CheckFinding[] = [];
  const corners: Vec3[] = [];
  for (const t of [0.02, 0.5, 1])
    for (const y of [-RAMP_HW + 0.05, 0, RAMP_HW - 0.05])
      for (const z of [-0.11, 0.13]) corners.push([-0.05 - t * (RAMP_LEN - 0.05), y, z]);
  for (let a = RAMP_OPEN; a <= RAMP_CLOSED + 1e-9; a += 6) {
    const c = Math.cos(a * DEG);
    const sn = Math.sin(a * DEG);
    for (const [x, y, z] of corners) {
      const p: Vec3 = [HINGE[0] + x * c + z * sn, y, HINGE[2] - x * sn + z * c];
      if (p[2] < -0.02)
        out.push({
          message: `ramp at ${a.toFixed(0)}° digs ${(-p[2]).toFixed(2)} m into the ground`,
          fix: 'shorten the ramp or raise RAMP_OPEN',
          part: 'ramp',
        });
      for (const name of ['fuselage', 'tail_boom', 'dorsal']) {
        const m = world.get(name);
        if (m && insideSolid(p, m))
          out.push({
            message: `ramp at ${a.toFixed(0)}° enters '${name}' at x ${p[0].toFixed(2)} z ${p[2].toFixed(2)}`,
            fix: 'lower RAMP_CLOSED or move the boom',
            part: 'ramp',
          });
      }
    }
  }
  return out.slice(0, 3);
};

export const dropship = defineAsset({
  name: 'dropship',
  kind: 'vehicle',
  description:
    'Original VTOL troop dropship: chamfered hard-surface fuselage, tilting ducted-fan nacelles, rear ramp, skid gear',
  tags: ['sci-fi', 'vehicle', 'aircraft', 'vtol', 'hard-surface'],
  license: 'CC0-1.0',
  sources: [
    'https://www.boeing.com/defense/military-rotorcraft/v-22-osprey',
    'https://thedefensepost.com/2026/08/03/v-22-osprey-guide/',
    'https://www.boeing.com/defense/military-rotorcraft/h-47-chinook',
    'https://www.inetres.com/gp/military/ar/rotor/CH-47.html',
    'recipes/dropship/README.md (design spec)',
  ],
  real: {
    length: 20.2,
    width: 13.4,
    height: 6.0,
    measures: [
      {
        label: 'fuselage width',
        axis: 'y',
        value: 3.7,
        parts: ['fuselage'],
        source: 'design spec (CH-47 fuselage 3.78 m)',
      },
      {
        label: 'fuselage depth',
        axis: 'z',
        value: 3.0,
        parts: ['fuselage'],
        source: 'design spec (CH-47 cabin 1.98 m + floor and roof structure)',
      },
      {
        label: 'nacelle centres',
        axis: 'y',
        value: 11.1,
        between: ['thruster_l', 'thruster_r'],
        source: 'design spec (V-22 rotor centres ≈ 14.2 m, ducted fans sit closer)',
      },
      {
        label: 'main gear track',
        axis: 'y',
        value: 4.1,
        between: ['gear_l', 'gear_r'],
        source: 'design spec',
      },
      {
        label: 'nacelle length',
        axis: 'z',
        value: 4.2,
        parts: ['nacelle_r'],
        source: 'design spec',
      },
      { label: 'ramp width', axis: 'y', value: 2.8, parts: ['ramp'], source: 'design spec' },
    ],
  },
  // Measured 12558 / 4872 / 1792; headroom ≤ 17%.
  budget: { triangles: [14400, 5500, 2100] },
  checks: [symmetric('_l', '_r', 'y'), noOverlap('nacelle_*'), rampArc],
  glow: [
    { parts: ['thruster_*'], color: GLOW, strength: 8 },
    { parts: ['navlight_l'], color: hex('#ff2a20'), strength: 6 },
    { parts: ['navlight_r'], color: hex('#22ff5a'), strength: 6 },
    { parts: ['navlight_tail', 'cabin_lamp'], color: hex('#fff4e0'), strength: 5 },
  ],
  build(ctx) {
    const lod = ctx.lod;
    const bv = ctx.pick([0.03, 0.015, 0]);
    const seg = ctx.pick([20, 12, 8]);
    const rng = ctx.rng.fork('greeble');
    /** Static parts are collected, then AO-baked against each other before they are emitted. */
    const statics: [string, Mesh][] = [];
    const solid = (name: string, mesh: Mesh): void => {
      statics.push([name, mesh]);
    };

    // ── fuselage: lofted nose + thick-walled cabin plates (a real hollow behind the ramp) ────
    const fus: Mesh[] = [shell(NOSE.map(ringOf), hullColor)];
    const outer = section(CABIN);
    const inner = section(CABIN, WALL);
    for (let i = 0; i < outer.length; i++) {
      const j = (i + 1) % outer.length;
      const profile: Vec2[] = [outer[i], outer[j], inner[j], inner[i]].map(
        (p): Vec2 => p ?? [0, 0],
      );
      const mid = ((profile[0]?.[1] ?? 0) + (profile[1]?.[1] ?? 0)) / 2;
      fus.push(
        place(
          prism({
            plane: 'yz',
            depth: CABIN.x - CABIN_END,
            profile,
            color: hullColor([0, 0, mid]),
          }),
          { at: [(CABIN.x + CABIN_END) / 2, 0, 0] },
        ),
      );
    }
    // Ramp cheeks close the triangles beside the ramp, outboard of its swing.
    for (const s of [-1, 1]) {
      const cheek = prism({
        plane: 'xz',
        depth: 0.3,
        profile: [
          [-4.25, 1.3],
          [-4.5, 1.3],
          [-7.0, 3.86],
          [-4.25, 3.6],
        ],
        color: PANEL,
      });
      fus.push(place(cheek, { at: [0, s * 1.64, 0] }));
    }
    solid(
      'fuselage',
      grime(merge(fus), {
        ground: 2.2,
        groundStrength: 0.35,
        zones: [{ at: [-4.4, 0, 1.3], radius: 1.5, strength: 0.3 }],
      }),
    );

    // ── sponsons (big): armoured gear housings along the lower flanks ─────────────────────────
    const sp = SPONSON;
    const spSec: Vec2[] = [
      [sp.y0, sp.zb],
      [sp.y1 - 0.18, sp.zb],
      [sp.y1, sp.zb + 0.18],
      [sp.y1, sp.zt - 0.26],
      [sp.y1 - 0.22, sp.zt],
      [sp.y0, sp.zt],
    ];
    const anchor: Vec2 = [sp.y0, (sp.zb + sp.zt) / 2];
    for (const [s, side] of SIDES) {
      const sec = spSec.map(([y, z]): Vec2 => [s * y, z]);
      const anc: Vec2 = [s * anchor[0], anchor[1]];
      const rings = [
        squeeze(sec, anc, 0.15, 0.55, sp.x0),
        squeeze(sec, anc, 1, 1, sp.x0 - 0.8),
        squeeze(sec, anc, 1, 1, sp.x1 + 0.6),
        squeeze(sec, anc, 0.2, 0.6, sp.x1),
      ];
      const bits: Mesh[] = [shell(rings, (p) => (p[2] < 1.7 ? BELLY : HULL), 30)];
      if (lod < 2) {
        // Armour plates (medium) with 6 cm seams, accent stripe, hazard on the rear plate.
        const runs: [number, number][] = [
          [2.9, 1.0],
          [0.94, -0.9],
          [-0.96, -2.9],
        ];
        for (const [x0, x1] of runs) {
          bits.push(
            bevelled([x0 - x1, 0.05, 0.78], PANEL, bv / 2, [
              (x0 + x1) / 2,
              s * (sp.y1 + 0.02),
              1.7,
            ]),
          );
          if (lod === 0)
            bits.push(
              bevelled([x0 - x1, 0.02, 0.07], ACCENT, 0, [(x0 + x1) / 2, s * (sp.y1 + 0.05), 2.38]),
            );
        }
        if (lod === 0) {
          // Bolt heads along the plate tops, a step and a grab handle by the crew door.
          const bolt = cylinder({
            radius: 0.025,
            length: 0.02,
            segments: 6,
            axis: 'y',
            color: METAL,
          });
          for (let i = 0; i < 18; i++)
            bits.push(place(bolt, { at: [2.8 - i * 0.33, s * (sp.y1 + 0.055), 2.32] }));
          bits.push(
            hazard(
              s > 0 ? [-1.0, sp.y1 + 0.046, 1.76] : [-2.85, -sp.y1 - 0.046, 1.76],
              s > 0 ? [-2.85, sp.y1 + 0.046, 1.76] : [-1.0, -sp.y1 - 0.046, 1.76],
              [0, 0, 0.16],
              10,
              0.002,
            ),
          );
        }
      }
      if (lod < 2)
        // Hull number on the forward armour plate, reading front → back on each side.
        bits.push(
          text(HULL_NO, {
            origin: [1.95, s * (sp.y1 + 0.045), 1.82],
            along: [-s, 0, 0],
            height: 0.45,
            align: 'centre',
            color: STENCIL,
          }),
        );
      solid(`sponson_${side}`, grime(merge(bits), { ground: 2, groundStrength: 0.3 }));
    }

    // ── dorsal drive hump + tail boom + V-tail ────────────────────────────────────────────────
    const humpSec: Vec2[] = [
      [-1.0, 4.22],
      [1.0, 4.22],
      [1.0, 4.5],
      [0.72, 4.78],
      [-0.72, 4.78],
      [-1.0, 4.5],
    ];
    const hump: Mesh[] = [
      shell(
        [
          squeeze(humpSec, [0, 4.22], 0.7, 0.15, 3.2),
          squeeze(humpSec, [0, 4.22], 1, 1, 2.0),
          squeeze(humpSec, [0, 4.22], 1, 1, -2.2),
          squeeze(humpSec, [0, 4.22], 0.75, 0.2, -3.4),
        ],
        (p) => (p[2] > 4.6 ? HULL_LIGHT : HULL),
      ),
    ];
    if (lod < 2) {
      // Side intakes: dark recess + slats (small), both sides.
      for (const s of [-1, 1]) {
        hump.push(bevelled([1.6, 0.05, 0.22], DARK, 0, [0.6, s * 1.0, 4.27]));
        if (lod === 0)
          for (let i = 0; i < 9; i++)
            hump.push(bevelled([0.05, 0.04, 0.22], METAL, 0, [-0.1 + i * 0.18, s * 1.03, 4.27]));
      }
      if (lod === 0) {
        const slat = bevelled([0.06, 0.9, 0.05], DARK, 0);
        for (let i = 0; i < 12; i++) hump.push(place(slat, { at: [-1.6 + i * 0.13, 0, 4.78] }));
        hump.push(
          lathe({
            profile: [
              [0.3, 0],
              [0.28, 0.12],
              [0.16, 0.24],
              [0, 0.27],
            ],
            segments: 14,
            color: DARK,
            at: [1.0, 0, 4.78],
          }),
        );
        for (const [x, y, h] of [
          [-1.9, 0.4, 0.9],
          [-2.1, -0.4, 0.6],
        ] as const)
          hump.push(
            beam({ from: [x, y, 4.6], to: [x - 0.18, y, 4.6 + h], width: 0.04, color: METAL }),
          );
      }
    }
    solid('dorsal', merge(hump));

    const tail: Mesh[] = [shell(BOOM.map(ringOf), (p) => (p[2] > 4.1 ? HULL_LIGHT : HULL))];
    const fin = prism({
      plane: 'xz',
      depth: 0.18,
      profile: [
        [-6.7, 0],
        [-9.4, 0],
        [-10.2, 2.2],
        [-9.0, 2.2],
      ],
      color: HULL,
    });
    for (const s of [-1, 1]) {
      tail.push(place(fin, { at: [0, s * 0.3, 4.2], roll: s * -35 * DEG }));
      if (lod < 2)
        // Fin number on both faces (fin-local: faces at y = ±0.09), placed with the fin.
        tail.push(
          place(
            merge(
              [1, -1].map((f) =>
                text(HULL_NO, {
                  origin: [-8.75, f * 0.09, 0.75],
                  along: [-f, 0, 0],
                  height: 0.5,
                  align: 'centre',
                  color: STENCIL,
                }),
              ),
            ),
            { at: [0, s * 0.3, 4.2], roll: s * -35 * DEG },
          ),
        );
      if (lod === 0)
        tail.push(
          place(
            merge([
              hazard([-9.02, 0.09, 1.98], [-10.15, 0.09, 1.98], [0, 0, 0.18], 6, 0.004),
              hazard([-10.15, -0.09, 1.98], [-9.02, -0.09, 1.98], [0, 0, 0.18], 6, 0.004),
            ]),
            { at: [0, s * 0.3, 4.2], roll: s * -35 * DEG },
          ),
        );
    }
    const nozzle = lathe({
      profile: [
        [0.22, 0.3],
        [0.3, 0.05],
        [0.34, -0.2],
        [0.38, -0.32],
      ],
      segments: ctx.pick([14, 10, 6]),
      color: METAL,
      axis: 'x',
    });
    for (const s of [-1, 1]) tail.push(place(nozzle, { at: [BOOM_END + 0.05, s * 0.36, 4.12] }));
    if (lod === 0)
      for (let i = 0; i < 5; i++) {
        const g = bevelled(
          [rng.range(0.3, 0.7), rng.range(0.3, 0.6), 0.08],
          rng.pick([PANEL, METAL]),
          0.015,
        );
        tail.push(place(g, { at: [-4.9 - i * 0.75, rng.range(-0.35, 0.35), 4.3] }));
      }
    solid('tail_boom', merge(tail));
    for (const [s, side] of SIDES) {
      ctx.part(
        `thruster_tail_${side}`,
        cylinder({
          radius: 0.24,
          length: 0.04,
          segments: ctx.pick([14, 10, 6]),
          axis: 'x',
          color: GLOW,
          at: [BOOM_END + 0.25, s * 0.36, 4.12],
        }),
      );
      ctx.emitter(`thrust_tail_${side}`, {
        kind: 'fire',
        at: [BOOM_END - 0.35, s * 0.36, 4.12],
        dir: [-1, 0, 0],
        rate: 60,
        life: 0.25,
        size: [0.4, 0.1],
        color: GLOW,
        speed: 12,
        spreadDeg: 6,
        when: 'moving',
      });
    }

    // ── hull detail: canopy frames, portholes, crew door, nose sensor, greebles ──────────────
    const glass: Mesh[] = [];
    const detail: Mesh[] = [];
    const rings = NOSE.map(ringOf);
    for (const i of [1, 2]) {
      const r0 = rings[i] ?? [];
      const r1 = rings[i + 1] ?? [];
      for (const k of [2, 3, 4, 5, 6]) {
        if ((k === 2 || k === 6) && i === 1) continue;
        const [a0, a1, b0, b1] = [r0[k], r0[k + 1], r1[k], r1[k + 1]];
        if (!a0 || !a1 || !b0 || !b1) continue;
        glass.push(quad(a0, a1, b1, b0, GLASS, 0.02));
        if (lod === 0)
          for (const [p, q] of [
            [a0, b0],
            [a1, b1],
            [b0, b1],
          ] as const)
            detail.push(beam({ from: p, to: q, width: 0.07, color: DARK }));
      }
    }
    ctx.part('canopy', merge(glass), { surface: 'glass' });
    if (lod === 0) {
      // Panel seams (small): dark 3 cm lines around the skin at frame stations.
      const seam = (x: number, faces: readonly number[]): void => {
        const r0 = ringOf({ ...CABIN, x: x + 0.015 });
        const r1 = ringOf({ ...CABIN, x: x - 0.015 });
        for (const k of faces) {
          const [a, b, c, d] = [r0[k], r0[(k + 1) % 10], r1[(k + 1) % 10], r1[k]];
          if (a && b && c && d) detail.push(quadOut(a, b, c, d, SEAM, [x, 0, 2.8], 0.004));
        }
      };
      for (const x of [5.0, 2.95, 0.95, -0.95, -2.95]) seam(x, [2, 3, 4, 5, 6, 7]);
      for (const x of [5.45, -4.2]) seam(x, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
      // Nose: a seam ring at the windscreen station, lower faces only.
      const nr = ringOf({ ...(NOSE[3] ?? CABIN), x: 6.98 });
      const nq = ringOf({ ...(NOSE[3] ?? CABIN), x: 7.02 });
      for (const k of [0, 1, 7, 8, 9]) {
        const [a, b, c, d] = [nr[k], nr[(k + 1) % 10], nq[(k + 1) % 10], nq[k]];
        if (a && b && c && d) detail.push(quadOut(a, b, c, d, SEAM, [7, 0, 2.7], 0.01));
      }
    }
    if (lod < 2) {
      // Portholes on the tumblehome (scale cue: a 2 m tall cabin, 0.32 m windows).
      const z0 = 3.15;
      const z1 = 3.47;
      for (const s of [-1, 1])
        for (let i = 0; i < 8; i++) {
          const x = 3.2 - i * 0.95;
          const w = 0.34 * s;
          const P = (px: number, z: number): Vec3 => [px, s * skinY(z), z];
          detail.push(quad(P(x, z0), P(x - w, z0), P(x - w, z1), P(x, z1), GLASS, 0.012));
          if (lod === 0)
            detail.push(
              quad(
                P(x + 0.05 * s, z0 - 0.05),
                P(x - w - 0.05 * s, z0 - 0.05),
                P(x - w - 0.05 * s, z1 + 0.05),
                P(x + 0.05 * s, z1 + 0.05),
                DARK,
                0.006,
              ),
            );
        }
      // Crew door (+Y, port), forward of the sponson: frame, window, handle.
      detail.push(bevelled([1.15, 0.04, 2.0], PANEL, 0.012, [4.75, CABIN.hw + 0.02, 1.55]));
      if (lod === 0) {
        detail.push(bevelled([0.5, 0.03, 0.4], GLASS, 0, [4.75, CABIN.hw + 0.045, 2.95 - 0.6]));
        detail.push(bevelled([0.3, 0.06, 0.07], METAL, 0, [4.4, CABIN.hw + 0.05, 2.2]));
        detail.push(
          hazard(
            [5.35, CABIN.hw + 0.042, 1.6],
            [4.15, CABIN.hw + 0.042, 1.6],
            [0, 0, 0.12],
            8,
            0.002,
          ),
        );
        // Nose sensor turret and pitot probes.
        detail.push(
          lathe({
            profile: [
              [0.26, 0],
              [0.24, 0.22],
              [0, 0.26],
            ],
            segments: 12,
            axis: 'x',
            color: DARK,
            at: [9.72, 0, 2.15],
          }),
        );
        for (const s of [-1, 1])
          detail.push(
            beam({
              from: [9.3, s * 0.7, 2.3],
              to: [10.1, s * 0.75, 2.3],
              width: 0.03,
              color: METAL,
            }),
          );
        // Roof greebles on the chamfers, seeded.
        for (const s of [-1, 1])
          for (let i = 0; i < 7; i++) {
            const g = bevelled(
              [rng.range(0.3, 0.7), rng.range(0.18, 0.3), rng.range(0.06, 0.12)],
              rng.pick([PANEL, METAL, DARK]),
              0.015,
            );
            const x = i < 3 ? 5.2 - i * 0.8 : -2.7 - (i - 3) * 0.4;
            detail.push(
              place(g, { at: [x + rng.range(-0.1, 0.1), s * 1.43, 4.12], roll: s * -0.6 }),
            );
          }
      }
      solid('hull_detail', merge(detail));
    }

    // ── cabin interior: deck, wall panels, troop seats, lamp ──────────────────────────────────
    if (lod < 2) {
      const inside: Mesh[] = [
        bevelled([CABIN.x - CABIN_END - 0.1, 3.3, 0.04], DARK, 0, [0.6, 0, 1.38]),
      ];
      for (const s of [-1, 1])
        for (let i = 0; i < 4; i++)
          inside.push(
            bevelled([2.2, 0.04, 1.1], INTERIOR, 0.01, [
              4.0 - i * 2.35,
              s * (CABIN.hw - WALL - 0.02),
              1.5,
            ]),
          );
      if (lod === 0) {
        const seat = merge([
          bevelled([0.5, 0.45, 0.08], DARK, 0.01, [0, 0, 0.45]),
          bevelled([0.45, 0.06, 0.6], DARK, 0.01, [0, 0.2, 0.55]),
          beam({ from: [0, 0, 0], to: [0, 0, 0.45], width: 0.04, color: METAL }),
        ]);
        for (let i = 0; i < 12; i++)
          for (const s of [-1, 1])
            inside.push(
              place(seat, { at: [-3.5 + i * 0.7, s * 1.45, 1.42], yaw: s > 0 ? 0 : Math.PI }),
            );
        for (const y of [-0.6, 0.6])
          inside.push(bevelled([9.2, 0.08, 0.03], METAL, 0, [0.4, y, 1.42]));
        ctx.part('cabin_lamp', bevelled([6, 0.12, 0.04], hex('#fff4e0'), 0, [0.5, 0, 4.18]));
      }
      solid('cabin', merge(inside));
      ctx.socket('cabin_light', {
        kind: 'light',
        at: [0, 0, 3.9],
        dir: [0, 0, -1],
        data: { light: 'point', color: '#ff6a50', intensity: 40, range: 8 },
      });
    }

    // ── stub wings, nacelles, fans, thrusters ─────────────────────────────────────────────────
    const cowl = weightedNormals(
      lathe({
        profile: [
          [0.7, -1.6],
          [0.78, -2.1],
          [0.88, -2.1],
          [0.98, -1.7],
          [POD_R, -1.25],
          [POD_R, 1.6],
          [1.03, 1.98],
          [0.94, 2.1],
          [0.85, 1.98],
          [0.83, 1.3],
        ],
        segments: ctx.pick([24, 14, 8]),
        color: HULL,
      }),
      { hardAngle: 35 },
    );
    for (const [s, side] of SIDES) {
      const wing: Mesh[] = [
        shell(
          [
            airfoil(s * 1.5, 1.8, -1.4, 0.5),
            airfoil(s * 1.675, 1.79, -1.38, 0.5),
            airfoil(s * WING_TIP, 1.35, -0.95, 0.36),
          ],
          (p) => (p[2] > WING_Z ? HULL : PANEL),
          20,
        ),
        // Bearing collar at the tip, where the nacelle shaft enters.
        place(cylinder({ radius: 0.3, length: 0.3, segments: seg, axis: 'y', color: METAL }), {
          at: [POD_X, s * (WING_TIP - 0.12), WING_Z],
        }),
      ];
      if (lod < 2) {
        wing.push(bevelled([1.6, 1.5, 0.04], PANEL, bv / 2, [0.25, s * 2.95, WING_Z + 0.2]));
        if (lod === 0)
          // Walkway warning, letters' tops outboard (along × up = +Z).
          wing.push(
            text('NO STEP', {
              origin: [0.25, s * 2.95, WING_Z + 0.24],
              along: [s, 0, 0],
              up: [0, s, 0],
              height: 0.14,
              align: 'centre',
              color: STENCIL,
            }),
          );
        if (lod === 0)
          wing.push(
            hazard(
              [s > 0 ? -0.75 : 1.15, s * (WING_TIP - 0.2), WING_Z + 0.18],
              [s > 0 ? 1.15 : -0.75, s * (WING_TIP - 0.2), WING_Z + 0.18],
              [0, s * 0.15, 0],
              10,
              0.004,
            ),
          );
      }
      solid(`wing_${side}`, merge(wing));

      const pod: Mesh[] = [
        cowl,
        cylinder({ radius: 0.84, length: 0.04, segments: seg, color: DARK, at: [0, 0, 1.26] }),
        // Pivot shaft into the wing bearing + a pylon fairing on the inboard side.
        place(cylinder({ radius: 0.2, length: 0.75, segments: seg, axis: 'y', color: METAL }), {
          at: [0, -s * (POD_R + 0.15), 0],
        }),
        bevelled([1.1, 0.3, 1.3], PANEL, bv, [0, -s * (POD_R - 0.05), -0.65]),
      ];
      if (lod < 2) {
        // Open armour rings (no caps), so they stay out of the fan's swept disc.
        for (const z of [1.05, -0.95])
          pod.push(
            lathe({
              profile: [
                [POD_R, z - 0.1],
                [POD_R + 0.035, z - 0.07],
                [POD_R + 0.035, z + 0.07],
                [POD_R, z + 0.1],
              ],
              segments: ctx.pick([24, 14, 8]),
              color: PANEL,
            }),
          );
        const vent = merge([
          bevelled([0.07, 0.55, 1.1], PANEL, bv / 2),
          ...(lod === 0
            ? Array.from({ length: 7 }, (_, i) =>
                bevelled([0.04, 0.44, 0.03], DARK, 0, [0.04, 0, 0.14 + i * 0.13]),
              )
            : []),
        ]);
        for (const a of [40, 0, -40].map((d) => d * DEG))
          pod.push(
            place(vent, {
              yaw: s * a,
              at: [POD_R * Math.cos(s * a), POD_R * Math.sin(s * a), -0.55],
            }),
          );
        if (lod === 0) {
          // Hazard ring under the intake lip; exhaust vanes across the nozzle.
          // One stripe per cowl facet (lathe rings start at −90°), so each lies on its face.
          const facets = 24;
          for (let k = 0; k < facets; k++) {
            const a0 = -Math.PI / 2 + (k / facets) * Math.PI * 2;
            const a1 = -Math.PI / 2 + ((k + 1) / facets) * Math.PI * 2;
            const R = POD_R;
            pod.push(
              quad(
                [R * Math.cos(a0), R * Math.sin(a0), 1.38],
                [R * Math.cos(a1), R * Math.sin(a1), 1.38],
                [R * Math.cos(a1), R * Math.sin(a1), 1.52],
                [R * Math.cos(a0), R * Math.sin(a0), 1.52],
                k % 2 ? BLACK : HAZARD,
                0.006,
              ),
            );
          }
          for (let i = 0; i < 4; i++)
            pod.push(bevelled([0.05, 1.3, 0.22], DARK, 0, [-0.45 + i * 0.3, 0, -2.0]));
        }
      }
      ctx.part(
        `nacelle_${side}`,
        grime(merge(pod), { zones: [{ at: [0, 0, -2.1], radius: 1.0, strength: 0.45 }] }),
        {
          at: [POD_X, s * POD_Y, WING_Z],
          motion: { kind: 'sway', axis: [0, 1, 0], degrees: 30, hz: 0.1 },
          clearOf: [`wing_${side}`],
        },
      );
      if (lod < 2) {
        const blades = ctx.pick([16, 9, 0]);
        const blade = place(bevelled([0.62, 0.16, 0.025], METAL, 0), {
          at: [0.43, 0, 0],
          roll: 0.5,
        });
        ctx.part(
          `fan_${side}`,
          merge([
            lathe({
              profile: [
                [0.24, 0],
                [0.24, 0.18],
                [0.12, 0.32],
                [0, 0.36],
              ],
              segments: 12,
              color: DARK,
            }),
            ...Array.from({ length: blades }, (_, i) =>
              place(blade, { yaw: (i / blades) * Math.PI * 2, at: [0, 0, 0.1] }),
            ),
          ]),
          {
            parent: `nacelle_${side}`,
            at: [0, 0, 1.28],
            motion: { kind: 'spin', axis: [0, 0, 1], rps: 6 },
          },
        );
      }
      ctx.part(
        `thruster_${side}`,
        cylinder({ radius: 0.7, length: 0.04, segments: seg, color: GLOW, at: [0, 0, -1.62] }),
        { parent: `nacelle_${side}` },
      );
      ctx.emitter(`thrust_${side}`, {
        kind: 'fire',
        parent: `nacelle_${side}`,
        at: [0, 0, -2.2],
        dir: [0, 0, -1],
        rate: 120,
        life: 0.3,
        size: [1.2, 0.2],
        color: GLOW,
        speed: 18,
        spreadDeg: 8,
        when: 'always',
      });
      ctx.emitter(`downwash_${side}`, {
        kind: 'dust',
        at: [POD_X, s * POD_Y, 0.1],
        rate: 40,
        life: 1.5,
        size: [0.5, 3],
        speed: 4,
        spreadDeg: 80,
        when: 'moving',
      });
      // Wingtip nav light: lens on the wing top, light socket just above it.
      ctx.part(
        `navlight_${side}`,
        lathe({
          profile: [
            [0.07, 0],
            [0.07, 0.04],
            [0, 0.08],
          ],
          segments: 8,
          color: s > 0 ? hex('#ff3020') : hex('#30ff60'),
          at: [0.95, s * (WING_TIP - 0.2), WING_Z + 0.16],
        }),
      );
      ctx.socket(`nav_${side}`, {
        kind: 'light',
        at: [0.95, s * (WING_TIP - 0.2), WING_Z + 0.35],
        data: { light: 'point', color: s > 0 ? '#ff2020' : '#20ff50', intensity: 8, range: 12 },
      });
    }
    ctx.part(
      'navlight_tail',
      lathe({
        profile: [
          [0.06, 0],
          [0.06, 0.04],
          [0, 0.07],
        ],
        segments: 8,
        color: hex('#fff4e0'),
        at: [-9.0, 0, 4.31],
      }),
    );
    ctx.socket('nav_tail', {
      kind: 'light',
      at: [-9.0, 0, 4.5],
      data: { light: 'point', color: '#ffffff', intensity: 10, range: 14, strobe: 1 },
    });
    ctx.socket('landing_light', {
      kind: 'light',
      at: [8.6, 0, 1.6],
      dir: [0.4, 0, -1],
      data: { light: 'spot', color: '#fff2d8', intensity: 400, range: 40, cone: 30 },
    });

    // ── ramp: hinged at the cabin floor edge, rest = half way between closed and open ────────
    const rampPlate: Mesh[] = [
      bevelled([RAMP_LEN - 0.05, RAMP_HW * 2, 0.12], PANEL, bv / 2, [
        -(RAMP_LEN + 0.05) / 2,
        0,
        -0.12,
      ]),
      ...[-1.1, 0, 1.1].map((y) =>
        cylinder({
          radius: 0.09,
          length: 0.4,
          segments: ctx.pick([10, 8, 6]),
          axis: 'y',
          color: METAL,
          at: [0, y, 0],
        }),
      ),
    ];
    if (lod < 2) {
      for (const s of [-1, 1])
        rampPlate.push(
          bevelled([RAMP_LEN - 0.1, 0.1, 0.16], METAL, bv / 2, [
            -(RAMP_LEN + 0.1) / 2,
            s * (RAMP_HW - 0.05),
            -0.02,
          ]),
        );
      if (lod === 0) {
        const rib = bevelled([0.05, RAMP_HW * 2 - 0.3, 0.025], DARK, 0);
        for (let i = 0; i < 12; i++) rampPlate.push(place(rib, { at: [-0.35 - i * 0.22, 0, 0] }));
        rampPlate.push(
          hazard(
            [-RAMP_LEN + 0.3, -RAMP_HW + 0.12, 0.002],
            [-RAMP_LEN + 0.3, RAMP_HW - 0.12, 0.002],
            [-0.28, 0, 0],
            14,
          ),
        );
      }
    }
    solid(
      'hinge_ramp',
      cylinder({ radius: 0.05, length: 3.6, segments: 8, axis: 'y', color: METAL, at: HINGE }),
    );
    // Rests CLOSED; a one-way swing about −Y lowers it to the ground and back.
    ctx.part('ramp', place(merge(rampPlate), { pitch: RAMP_CLOSED * DEG }), {
      at: HINGE,
      motion: { kind: 'sway', axis: [0, -1, 0], degrees: RAMP_SWING, hz: 0.1, oneWay: true },
      clearOf: ['hinge_ramp'], // knuckles ride on the hinge rod: a real interlock
    });

    // ── landing gear: oleo struts on skid pads, bay plate on top ─────────────────────────────
    const gearLeg = (top: number, pad: Vec3): Mesh => {
      const sr = ctx.pick([12, 8, 6]);
      const parts: Mesh[] = [
        bevelled(pad, DARK, bv),
        cylinder({
          radius: 0.15,
          length: top - 0.6,
          segments: sr,
          color: METAL,
          at: [0, 0, (top + 0.6) / 2],
        }),
        cylinder({ radius: 0.1, length: 0.5, segments: sr, color: HULL_LIGHT, at: [0, 0, 0.45] }),
        bevelled([1.3, 0.7, 0.08], BELLY, bv / 2, [0, 0, top - 0.04]),
      ];
      if (lod < 2) {
        parts.push(
          beam({ from: [0, 0, 0.6], to: [-0.55, 0, top - 0.02], width: 0.09, color: METAL }),
        );
        parts.push(bevelled([0.34, 0.34, 0.14], METAL, 0.01, [0, 0, pad[2]]));
        if (lod === 0)
          parts.push(
            hazard(
              [-pad[0] / 2 + 0.05, -pad[1] / 2, 0.04],
              [pad[0] / 2 - 0.05, -pad[1] / 2, 0.04],
              [0, 0, 0.1],
              8,
              0.004,
            ),
          );
      }
      return merge(parts);
    };
    solid('gear_l', place(gearLeg(SPONSON.zb, [1.0, 0.75, 0.2]), { at: MAIN_GEAR }));
    solid(
      'gear_r',
      place(gearLeg(SPONSON.zb, [1.0, 0.75, 0.2]), { at: [MAIN_GEAR[0], -MAIN_GEAR[1], 0] }),
    );
    solid('gear_nose', place(gearLeg(1.4, [0.85, 0.65, 0.18]), { at: NOSE_GEAR }));

    // ── chin turret: yaws ±50°, twin guns pitch ±12° ──────────────────────────────────────────
    const tSeg = ctx.pick([16, 10, 6]);
    solid(
      'turret_ring',
      cylinder({ radius: 0.36, length: 0.08, segments: tSeg, color: DARK, at: [8.55, 0, 1.64] }),
    );
    ctx.part(
      'turret',
      lathe({
        profile: [
          [0, -0.36],
          [0.16, -0.34],
          [0.29, -0.25],
          [0.32, -0.1],
          [0.3, 0],
        ],
        segments: tSeg,
        color: PANEL,
      }),
      {
        at: [8.55, 0, 1.6],
        motion: { kind: 'sway', axis: [0, 0, 1], degrees: 50, hz: 0.15 },
        clearOf: ['turret_ring'], // the turret turns in its ring: a real interlock
      },
    );
    ctx.part(
      'gun',
      merge([
        bevelled([0.34, 0.3, 0.16], DARK, ctx.pick([0.02, 0.01, 0]), [0.12, 0, -0.08]),
        ...[-0.08, 0.08].map((y) =>
          beam({
            from: [0.25, y, 0],
            to: [1.0, y, 0],
            width: 0.055,
            segments: ctx.pick([8, 6, 4]),
            color: METAL,
          }),
        ),
      ]),
      {
        parent: 'turret',
        at: [0.12, 0, -0.2],
        motion: { kind: 'sway', axis: [0, 1, 0], degrees: 12, hz: 0.2 },
        clearOf: ['turret'], // the gun's trunnion housing sits inside the turret ball
      },
    );
    ctx.socket('muzzle_gun', {
      kind: 'mount',
      parent: 'gun',
      at: [1.02, 0, 0],
      data: { caliber: 20 },
    });
    ctx.emitter('muzzle', {
      kind: 'muzzle',
      parent: 'gun',
      at: [1.05, 0, 0],
      dir: [1, 0, 0],
      rate: 200,
      life: 0.08,
      size: [0.2, 0.5],
      when: 'event',
    });

    // ── baked AO across every static part (sponson tops, wing roots, gear bays darken) ───────
    const occluder = merge(statics.map(([, m]) => m));
    for (const [name, mesh] of statics)
      ctx.part(
        name,
        lod < 2
          ? bakeAo(mesh, { samples: ctx.pick([20, 10, 0]), radius: 1.2, strength: 0.5 }, occluder)
          : mesh,
      );
  },
});
