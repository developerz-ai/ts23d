// Sci-fi cargo container — an ORIGINAL futuristic take on the ISO 668 1CC box (20 ft): the real
// envelope 6.058 × 2.438 × 2.591 m and ISO 1161 corner castings (178 × 162 × 118 mm), so it stacks
// and twist-locks with every other container in a scene; the skin is hard-surface sci-fi: a
// chamfered frame, armoured bays with seams and vents instead of corrugation, a glowing status
// strip and keypad, lock bars, hazard bands. +X = blind end, −X = doors. See README.md.
//
// Engine contract: `door_l` / `door_r` rest closed and swing one way, outward, to 90° about
// their hinge posts (real ISO doors swing 270°; the engine drives the rest); `status_light` +
// `keypad` glow; light socket `status_lamp`; `twistlock_*` attach sockets at the top castings.

import {
  bakeAo,
  box,
  type Check,
  type CheckFinding,
  cylinder,
  defineAsset,
  hex,
  type Mesh,
  merge,
  place,
  planar,
  symmetric,
  text,
  translate,
  type Vec3,
  weather as weatherPass,
} from '@developerz.ai/ts23d';
import { rustStreaks, type StreakSource } from '../_lib/finish/aging.ts';
import {
  reproject,
  restrip,
  type StripRule,
  tessellate,
  weatherer,
} from '../_lib/finish/finish.ts';

// Authoring colour → material: painted steel shell and frame (chips show steel), cast corner
// castings, galvanised lock bars/hinges/bolts. Plain strips stay for stencils, hazard and glow.

// ── palette: deep teal shell, off-white frame, orange accent ────────────────────────────────────
const SHELL = hex('#2f5c63');
const SHELL_DARK = hex('#244a50');
const FRAME = hex('#c9c8bf');
const CAST = hex('#3a3d40');
const DARK = hex('#1c1f21');
const METAL = hex('#6b7075');
const ACCENT = hex('#d0661e');
const HAZARD = hex('#d9a421');
const BLACK = hex('#17181a');
const GLOW = hex('#5dffb0');
const STENCIL = hex('#e4e2d8');
const RULES: readonly StripRule[] = [
  { from: SHELL, strip: 'steel_painted' },
  { from: SHELL_DARK, strip: 'steel_painted' },
  { from: FRAME, strip: 'steel_painted' },
  { from: CAST, strip: 'iron_cast', color: hex('#b8b4ae') },
  { from: METAL, strip: 'steel_galvanised', color: hex('#c8ccd0') },
  { from: DARK, strip: 'rubber', color: hex('#9a9a9a') },
];
/** ISO 6346-style marking for an invented owner code; check digit computed (AXSU 204118 → 1). */
const ID_LINES = ['AXSU', '204118 1', '22G1'] as const;

// ── ISO 668 / ISO 1161 numbers ─────────────────────────────────────────────────────────────────
const L = 6.058;
const W = 2.438;
const H = 2.591;
const CL = 0.178; // casting length (X)
const CW = 0.162; // casting width (Y)
const CH = 0.118; // casting height (Z)
const POST = 0.16;
const HL = L / 2;
const HW = W / 2;
const RECESS = 0.07; // side skin sits this far inside the frame face
// Door leaves fill the rear opening like a real ISO box: between the corner posts, from the sill
// (bottom end rail, top at 0.182 m) to the header (top end rail, underside at 2.441 m), outer
// face flush with the frame's rear face. The hinge axis sits just outside the posts, so the leaf
// swings out without its edge ever entering the post.
const HINGE_OUT = 0.035; // hinge axis behind the rear frame face (pin radius)
const DOOR_T = 0.06; // leaf thickness
const DOOR_X = -HL - HINGE_OUT; // hinge axis x
const LEAF_X = HINGE_OUT + DOOR_T / 2; // leaf mid-plane, in hinge space (+X = into the box)
const HINGE_Y = HW - POST - 0.003; // leaf hinge edge: 3 mm off the post inner face (swing clearance)
const LEAF = HINGE_Y - 0.002; // leaf width to the centre line: a 4 mm gasket seam between leaves
const DOOR_Z0 = 0.182; // sill top
const DOOR_Z1 = 2.441; // header underside
const SWING = 90; // doors rest closed and swing one way, outward, to square with the box
const DEG = Math.PI / 180;

const bevelled = (size: Vec3, color: Vec3, bevel: number, at: Vec3 = [0, 0, 0]): Mesh =>
  box({ size, color, at, bevel: bevel > 0 && bevel < Math.min(...size) / 2 ? bevel : 0 });

/** A flat quad lifted `off` along its normal; CCW seen from the side it faces. */
function quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, color: Vec3, off = 0.003): Mesh {
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

/** Yellow/black band from a→b, `up` tall; outward normal = (b − a) × up. */
function hazard(a: Vec3, b: Vec3, up: Vec3, n: number): Mesh {
  const at = (k: number, t: number): Vec3 => [
    a[0] + ((b[0] - a[0]) * k) / n + up[0] * t,
    a[1] + ((b[1] - a[1]) * k) / n + up[1] * t,
    a[2] + ((b[2] - a[2]) * k) / n + up[2] * t,
  ];
  return merge(
    Array.from({ length: n }, (_, k) =>
      quad(at(k, 0), at(k + 1, 0), at(k + 1, 1), at(k, 1), k % 2 ? BLACK : HAZARD),
    ),
  );
}

/**
 * The doors' arc (closed → SWING) keeps every leaf corner outside the box (x ≤ rear face): a sign
 * error on the swing axis would push them into the cargo. Mirrors the motion in `build`.
 */
const doorArc: Check = () => {
  const out: CheckFinding[] = [];
  for (const s of [1, -1])
    for (let a = 0; a <= SWING; a += 5) {
      const t = -s * a * DEG;
      for (const [x, y] of [
        [LEAF_X + DOOR_T / 2, -s * LEAF],
        [LEAF_X - DOOR_T / 2, -s * LEAF],
      ] as const) {
        const wx = DOOR_X + x * Math.cos(t) - y * Math.sin(t);
        if (wx > -HL + 0.075)
          out.push({
            message: `door ${s > 0 ? 'r' : 'l'} at ${a}° reaches x ${wx.toFixed(3)} inside the box`,
            fix: 'flip the swing axis so leaves open outward (−X)',
            part: s > 0 ? 'door_r' : 'door_l',
          });
      }
    }
  return out.slice(0, 2);
};

export const cargo_container_scifi = defineAsset({
  name: 'cargo_container_scifi',
  kind: 'prop',
  description:
    'Original sci-fi 20 ft cargo container on the real ISO 668 envelope with ISO 1161 corner castings; hinged doors',
  tags: ['sci-fi', 'prop', 'container', 'cargo', 'hard-surface'],
  license: 'CC0-1.0',
  sources: [
    'https://en.wikipedia.org/wiki/ISO_668',
    'https://www.kscranegroup.com/posts/shipping-container-dimensions-types-and-corner-casting-guide/',
    'https://marine.albertjagger.co.uk/our-products/cargo-control/corner-castings/iso-corner-casting-top-left-fitment',
    'https://hz-containers.com/en/technical-information/corner-castings-technical-documentation/',
  ],
  real: {
    length: L,
    width: W,
    height: H,
    measures: [
      { label: 'body length', axis: 'x', value: L, parts: ['frame'], source: 'ISO 668 1CC' },
      { label: 'body width', axis: 'y', value: W, parts: ['frame'], source: 'ISO 668 1CC' },
      { label: 'body height', axis: 'z', value: H, parts: ['frame'], source: 'ISO 668 8 ft 6 in' },
      {
        label: 'corner casting length',
        axis: 'x',
        value: CL,
        parts: ['casting_0'],
        source: 'ISO 1161 (178 mm)',
      },
      {
        label: 'corner casting height',
        axis: 'z',
        value: CH,
        parts: ['casting_0'],
        source: 'ISO 1161 (118 mm)',
      },
      {
        label: 'casting centres, width',
        axis: 'y',
        value: W - CW,
        between: ['casting_0', 'casting_1'],
        source: 'ISO 1161 (2259 mm)',
      },
    ],
  },
  // Measured 23k / 8.3k / 0.74k: UV split + weather() refinement (vertices for chips, rust, dents).
  budget: { triangles: [24000, 8600, 820] },
  checks: [symmetric('door_l', 'door_r', 'y'), doorArc],
  glow: [{ parts: ['status_light', 'keypad'], color: GLOW, strength: 6 }],
  build(ctx) {
    const lod = ctx.lod;
    const bv = ctx.pick([0.012, 0.006, 0]);
    const statics: [string, Mesh][] = [];
    const weather = weatherer(ctx.rng.fork('weather'));
    /** Materials, at true scale (box-projected per triangle), then dust on the roof, dirt splashed up the bottom rail. Mesh is in root space
     *  (the root is turned half a turn, which does not change heights or up-facing). */
    const finish = (m: Mesh): Mesh =>
      weather(reproject(restrip(tessellate(m, ctx.pick([1.2, 2.0, 4.0])), RULES)), {
        dust: 0.45,
        mud: 0.45,
        mudStrength: 0.55,
      });
    // Built with the doors at −X, then turned half a turn so the door end faces +X (the front
    // the gallery's 3/4 shot looks at). Moving doors are children of this yawed root.
    const root = 'container';
    ctx.group(root, { yaw: Math.PI });

    // ── frame: posts, side + end rails (big) ──────────────────────────────────────────────────
    const frame: Mesh[] = [];
    for (const sx of [-1, 1])
      for (const sy of [-1, 1])
        frame.push(
          bevelled([POST, POST, H - 2 * CH], FRAME, bv, [
            sx * (HL - POST / 2),
            sy * (HW - POST / 2),
            CH,
          ]),
        );
    for (const sy of [-1, 1]) {
      frame.push(bevelled([L - 2 * CL, 0.13, 0.16], FRAME, bv, [0, sy * (HW - 0.065), 0.012]));
      frame.push(bevelled([L - 2 * CL, 0.12, 0.14], FRAME, bv, [0, sy * (HW - 0.06), H - 0.15]));
    }
    for (const sx of [-1, 1]) {
      frame.push(bevelled([0.14, W - 2 * CW, 0.17], FRAME, bv, [sx * (HL - 0.07), 0, 0.012]));
      frame.push(bevelled([0.14, W - 2 * CW, 0.14], FRAME, bv, [sx * (HL - 0.07), 0, H - 0.15]));
    }
    // Forklift pockets in the bottom side rails.
    if (lod < 2)
      for (const sy of [-1, 1])
        for (const x of [-1.03, 1.03])
          frame.push(bevelled([0.36, 0.02, 0.1], DARK, 0, [x, sy * (HW + 0.002), 0.04]));
    statics.push(['frame', merge(frame)]);

    // ── corner castings (ISO 1161): dark oval apertures on the three outer faces ────────────
    const casting = (sx: number, sy: number, top: boolean): Mesh => {
      const m: Mesh[] = [bevelled([CL, CW, CH], CAST, ctx.pick([0.008, 0.004, 0]))];
      if (lod < 2) {
        const t = 0.006; // aperture plates stand 3 mm proud: orientation-free dark insets
        m.push(bevelled([t, 0.064, 0.05], DARK, 0, [(sx * CL) / 2, 0, CH / 2 - 0.025]));
        m.push(bevelled([0.08, t, 0.05], DARK, 0, [0, (sy * CW) / 2, CH / 2 - 0.025]));
        if (top) m.push(bevelled([0.124, 0.064, 0.003], DARK, 0, [0, 0, CH - 0.0015]));
      }
      return merge(m);
    };
    let ci = 0;
    for (const top of [false, true])
      for (const sx of [1, -1])
        for (const sy of [1, -1]) {
          const at: Vec3 = [sx * (HL - CL / 2), sy * (HW - CW / 2), top ? H - CH : 0];
          statics.push([`casting_${ci}`, place(casting(sx, sy, top), { at })]);
          if (top && lod < 2)
            ctx.socket(`twistlock_${ci - 4}`, {
              parent: root,
              kind: 'attach',
              at: [at[0], at[1], H],
              dir: [0, 0, 1],
            });
          ci++;
        }

    // ── shell: thin plates inside the frame (a hollow the doors open onto) ─────────────────────
    const shell: Mesh[] = [
      // Floor and roof plates run into the rails (no slot of daylight along their edges).
      bevelled([L - 0.26, W - 0.24, 0.04], DARK, 0, [0, 0, 0.15]),
      bevelled([L - 0.26, W - 0.24, 0.04], SHELL_DARK, 0, [0, 0, H - 0.16]),
      bevelled([0.04, W - 0.3, H - 0.32], SHELL, 0, [HL - RECESS, 0, 0.17]),
    ];
    for (const sy of [-1, 1])
      shell.push(bevelled([L - 0.32, 0.04, H - 0.32], SHELL, 0, [0, sy * (HW - RECESS), 0.17]));

    // ── armoured bays on the long sides (medium), seams + vents + bolts (small) ──────────────
    if (lod < 2) {
      const bays = 6;
      const span = L - 2 * CL;
      const bay = span / bays;
      for (const sy of [-1, 1]) {
        const y = sy * (HW - RECESS + 0.02);
        for (let i = 0; i <= bays; i++)
          shell.push(
            bevelled([0.08, 0.05, H - 0.34], SHELL_DARK, bv, [
              -span / 2 + i * bay,
              sy * (HW - RECESS + 0.045),
              0.17,
            ]),
          );
        for (let i = 0; i < bays; i++) {
          const cx = -span / 2 + (i + 0.5) * bay;
          shell.push(bevelled([bay - 0.2, 0.03, 0.95], SHELL, bv, [cx, y + sy * 0.015, 1.3]));
          shell.push(bevelled([bay - 0.2, 0.03, 0.85], SHELL, bv, [cx, y + sy * 0.015, 0.33]));
          if (i === 0)
            // Container ID on the upper panel of the bay next to the doors (faces ±Y).
            shell.push(
              ...ID_LINES.map((line, k) =>
                text(line, {
                  origin: [cx, y + sy * 0.03, 2.05 - k * 0.15],
                  along: [-sy, 0, 0],
                  height: k === 0 ? 0.11 : 0.09,
                  align: 'centre',
                  color: STENCIL,
                }),
              ),
            );
          if (lod === 0) {
            if (i % 2 === 1)
              for (let k = 0; k < 6; k++)
                shell.push(
                  bevelled([bay - 0.45, 0.02, 0.035], DARK, 0, [cx, y + sy * 0.035, 1.5 + k * 0.1]),
                );
            const bolt = cylinder({
              radius: 0.014,
              length: 0.012,
              segments: 6,
              axis: 'y',
              color: METAL,
            });
            for (const bx of [-1, 1])
              for (const bz of [0.36, 1.14, 1.42, 2.2])
                shell.push(place(bolt, { at: [cx + bx * (bay / 2 - 0.15), y + sy * 0.035, bz] }));
          }
        }
        // Accent band along each side (the strongest colour block: kept at every LOD).
        {
          const ax = sy > 0 ? [HL - CL - 0.1, -HL + CL + 0.1] : [-HL + CL + 0.1, HL - CL - 0.1];
          shell.push(
            quad(
              [ax[0] ?? 0, sy * (HW - RECESS + 0.051), 1.21],
              [ax[1] ?? 0, sy * (HW - RECESS + 0.051), 1.21],
              [ax[1] ?? 0, sy * (HW - RECESS + 0.051), 1.27],
              [ax[0] ?? 0, sy * (HW - RECESS + 0.051), 1.27],
              ACCENT,
              0.002,
            ),
          );
        }
      }
      // Roof ribs and blind-end service panel.
      for (let i = 0; i < 7; i++)
        shell.push(
          bevelled([0.1, W - 0.3, 0.05], SHELL_DARK, bv, [-HL + 0.5 + i * 0.84, 0, H - 0.12]),
        );
      shell.push(bevelled([0.05, 1.4, 1.5], SHELL_DARK, bv, [HL - RECESS + 0.03, 0, 0.5]));
      if (lod === 0)
        shell.push(
          hazard([HL - RECESS + 0.06, -0.7, 1.9], [HL - RECESS + 0.06, 0.7, 1.9], [0, 0, 0.12], 10),
        );
    }
    if (lod === 2)
      // Far: the orange band and the bay grid as flush quads on the recessed side plates.
      for (const sy of [-1, 1]) {
        const y = sy * (HW - RECESS + 0.02);
        const x0 = sy > 0 ? HL - CL - 0.1 : -HL + CL + 0.1;
        const x1 = -x0;
        shell.push(quad([x0, y, 1.21], [x1, y, 1.21], [x1, y, 1.27], [x0, y, 1.27], ACCENT, 0.002));
        const span = L - 2 * CL;
        for (let i = 0; i <= 6; i++) {
          const x = -span / 2 + (i * span) / 6;
          const [a, b] = sy > 0 ? [x + 0.04, x - 0.04] : [x - 0.04, x + 0.04];
          shell.push(
            quad([a, y, 0.2], [b, y, 0.2], [b, y, H - 0.2], [a, y, H - 0.2], SHELL_DARK, 0.003),
          );
        }
      }
    // Rust bleeding from vents, bolts and the bottom rail; scuffed, dusty, dirty from the ground.
    if (lod === 0) {
      const src: StreakSource[] = [];
      const span = L - 2 * CL;
      const bay = span / 6;
      for (const sy of [-1, 1])
        for (let i = 0; i < 6; i++) {
          const cx = -span / 2 + (i + 0.5) * bay;
          // From the panel bolts (±(bay/2 − 0.15)) and between them, on the upper bay panel's
          // face (y + 0.03), 2 mm into it, ending on that panel (its foot is z 1.3).
          for (const dx of [-(bay / 2 - 0.15), -0.15, 0.12, bay / 2 - 0.15])
            src.push({
              at: [cx + dx, sy * (HW - RECESS + 0.048), i % 2 ? 1.48 : 2.2],
              s: sy,
              floor: 1.32,
            });
        }
      shell.push(rustStreaks(ctx.rng.fork('rust'), src, hex('#c79a7e')));
    }
    statics.push(['body', merge(shell)]);

    // ── status strip over the doors (glow) + light socket ────────────────────────────────────
    ctx.part('status_light', bevelled([0.03, 1.6, 0.05], GLOW, 0, [-HL - 0.012, 0, H - 0.12]), {
      parent: root,
    });
    ctx.socket('status_lamp', {
      parent: root,
      kind: 'light',
      at: [-HL - 0.25, 0, H - 0.1],
      dir: [-1, 0, -0.3],
      data: { light: 'point', color: '#5dffb0', intensity: 6, range: 5 },
    });

    // ── doors: leaf built closed in hinge space, then yawed to its ajar rest pose ─────────────
    // Local +Y ends up on world −Y after the root's half turn: name by the world side.
    for (const [s, side] of [
      [1, 'r'],
      [-1, 'l'],
    ] as const) {
      // Built about the leaf's mid-plane (outer face at −DOOR_T/2), then moved onto LEAF_X.
      const leaf: Mesh[] = [
        bevelled([DOOR_T, LEAF, DOOR_Z1 - DOOR_Z0], SHELL, bv, [0, -s * (LEAF / 2), 0]),
      ];
      // Two cam lock bars per leaf, kept at every LOD (the door end's signature at distance).
      for (const y of [0.32, 0.78])
        leaf.push(
          cylinder({
            radius: 0.024,
            length: DOOR_Z1 - DOOR_Z0 - 0.02,
            segments: ctx.pick([8, 6, 3]),
            color: METAL,
            at: [-0.075, -s * y, (DOOR_Z1 - DOOR_Z0) / 2],
          }),
        );
      if (lod < 2) {
        // Raised armour panel, two lock bars with cams and handles.
        leaf.push(bevelled([0.03, LEAF - 0.2, 1.0], SHELL_DARK, bv, [-0.04, -s * (LEAF / 2), 1.1]));
        leaf.push(
          bevelled([0.03, LEAF - 0.2, 0.75], SHELL_DARK, bv, [-0.04, -s * (LEAF / 2), 0.2]),
        );
        if (s > 0)
          // The same ID between the lock bars of the right-hand leaf (faces −X).
          leaf.push(
            ...ID_LINES.map((line, k) =>
              text(line, {
                origin: [-0.055, -s * 0.55, 1.9 - k * 0.12],
                along: [0, -1, 0],
                height: 0.055,
                align: 'centre',
                color: STENCIL,
              }),
            ),
          );
        for (const y of [0.32, 0.78]) {
          if (lod === 0) {
            leaf.push(bevelled([0.05, 0.08, 0.1], METAL, 0.008, [-0.08, -s * y, 0.05]));
            leaf.push(
              bevelled([0.05, 0.08, 0.1], METAL, 0.008, [-0.08, -s * y, DOOR_Z1 - DOOR_Z0 - 0.15]),
            );
            leaf.push(bevelled([0.04, 0.05, 0.3], DARK, 0.008, [-0.11, -s * (y + 0.06), 0.95]));
          }
        }
        if (lod === 0)
          leaf.push(
            hazard(
              // Run along −Y so (b − a) × up = −X: the leaf's outer face.
              [-0.031, s > 0 ? -0.02 : LEAF - 0.02, 0.02],
              [-0.031, s > 0 ? -LEAF + 0.02 : -0.02, 0.02],
              [0, 0, 0.12],
              8,
            ),
          );
      }
      // Hinge knuckles on the axis, their rims on the leaf's outer face at the hinge edge.
      const knuckles = [0.25, 1.15, 2.05].map((z) =>
        cylinder({
          radius: HINGE_OUT,
          length: 0.14,
          segments: ctx.pick([10, 6, 4]),
          color: METAL,
          at: [0, 0, z],
        }),
      );
      // Rests closed; a one-way swing about −s·Z opens the leaf outward (−X) to 90°.
      ctx.part(
        `door_${side}`,
        finish(merge([translate(merge(leaf), [LEAF_X, 0, 0]), ...knuckles])),
        {
          parent: root,
          at: [DOOR_X, s * HINGE_Y, DOOR_Z0],
          motion: { kind: 'sway', axis: [0, 0, -s], degrees: SWING, hz: 0.15, oneWay: true },
          clearOf: [`hinge_${side}`], // knuckles turn on the hinge pins: a real interlock
        },
      );
      if (s > 0 && lod < 2)
        // Seated on the upper armour panel (outer face at −0.055 before the leaf offset).
        ctx.part(
          'keypad',
          bevelled([0.025, 0.12, 0.16], GLOW, 0, [LEAF_X - 0.0675, -s * 0.55, 1.2]),
          {
            parent: `door_${side}`,
          },
        );
    }
    // Hinge pins on the rear posts (static), coaxial with the knuckles.
    // Local +Y ends up on world −Y after the root's half turn: name by the world side.
    for (const [s, side] of [
      [1, 'r'],
      [-1, 'l'],
    ] as const) {
      const pins = [0.7, 1.6].map((z) =>
        cylinder({
          radius: 0.03,
          length: 0.6,
          segments: ctx.pick([10, 6, 4]),
          color: METAL,
          at: [DOOR_X, s * HINGE_Y, DOOR_Z0 + z],
        }),
      );
      statics.push([
        `hinge_${side}`,
        merge([
          ...pins,
          bevelled([0.08, 0.1, 2.0], FRAME, 0, [
            DOOR_X - 0.0,
            s * (HINGE_Y + 0.05),
            DOOR_Z0 + 0.15,
          ]),
        ]),
      ]);
    }

    // ── a few crates inside, seen through the ajar doors (LOD0 only) ──────────────────────────
    if (lod === 0) {
      const rng = ctx.rng.fork('cargo');
      const crates: Mesh[] = [];
      for (let i = 0; i < 6; i++) {
        const sz = rng.range(0.6, 1.0);
        crates.push(
          bevelled(
            [sz, sz, sz * 0.8],
            rng.pick([hex('#4b5320'), hex('#555a60'), hex('#7a6a4a')]),
            0.02,
            [-1.9 + (i % 3) * 1.2, (i < 3 ? -1 : 1) * 0.5, 0.19],
          ),
        );
      }
      statics.push(['cargo', merge(crates)]);
    }

    const occ = merge(statics.map(([, m]) => m));
    const done = new Map<string, Mesh>();
    for (const [name, mesh] of statics) {
      const lit = lod === 0 ? bakeAo(mesh, { samples: 16, radius: 0.6, strength: 0.5 }, occ) : mesh;
      done.set(name, finish(lit));
    }
    // Measured wear on the shell and frame (manifest + QA `weather`): chipped edges, rust streaking
    // down from side edges, two or three dents per side, dust on top, dirt at the sill.
    const worn = weatherPass(
      ctx,
      { body: done.get('body') ?? merge([]), frame: done.get('frame') ?? merge([]) },
      {
        name: 'container',
        seed: 7,
        age: 0.8,
        climate: 'coastal',
        resolution: [0.6, 1.2, 0],
        effects: {
          chips: { where: 'convex-edges', amount: 0.15 },
          rust: { where: 'convex-edges & side-facing', amount: 0.08, streaks: true },
          dust: { where: 'up-facing', amount: 0.3 },
          mud: { where: 'ground-near', amount: 0.25 },
          bleach: { where: 'up-facing', amount: 0.2 },
          dents: { where: 'exposed-panels', count: [2, 4], depth: 0.012 },
        },
      },
    );
    done.set('body', worn.body);
    done.set('frame', worn.frame);
    for (const [name, mesh] of done) ctx.part(name, mesh, { parent: root });
  },
});
