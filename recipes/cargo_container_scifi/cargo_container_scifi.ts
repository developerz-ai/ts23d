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
  type Check,
  type CheckFinding,
  cylinder,
  defineAsset,
  dmath,
  hex,
  type Mesh,
  merge,
  place,
  symmetric,
  text,
  translate,
  type Vec3,
  valueNoise,
  weather as weatherPass,
} from '@developerz.ai/ts23d';
import { rustStreaks, type StreakSource } from '../_lib/finish/aging.ts';
import { reproject, restrip, tessellate, weatherer } from '../_lib/finish/finish.ts';
import { mix, shade, smooth } from '../_lib/finish/wear.ts';
import { buildFar } from './far.ts';
import {
  ACCENT,
  BLACK,
  bevelled,
  CAST,
  CH,
  CL,
  CW,
  DARK,
  DEG,
  DOOR_T,
  DOOR_X,
  DOOR_Z0,
  DOOR_Z1,
  doorMount,
  FRAME,
  GLOW,
  GRIME,
  H,
  HAZARD,
  HINGE_OUT,
  HINGE_Y,
  HL,
  HW,
  ID_LINES,
  L,
  LEAF,
  LEAF_X,
  METAL,
  POST,
  quad,
  RECESS,
  RULES,
  RUST_STAIN,
  SHELL,
  SHELL_DARK,
  STENCIL,
  SWING,
  W,
} from './shared.ts';

/** Ground dirt splashed up the sills and the lowest panels. */
const MUD: Vec3 = [0.05, 0.036, 0.022];

/**
 * A plate's visible face as a regular grid of `cell`-sized quads, 1 mm proud of the plate it
 * lies on (outward normal = u × v). Weathering lives in vertex colour: on a plate that is two
 * triangles, or bisected along its longest edges, the stains take the triangles' shapes; on a
 * square grid they are free to be stains.
 */
function sheet(origin: Vec3, u: Vec3, v: Vec3, cell: number, color: Vec3): Mesh {
  const nu = Math.max(1, Math.round(dmath.norm(u) / cell));
  const nv = Math.max(1, Math.round(dmath.norm(v) / cell));
  const at = (i: number, j: number): Vec3 => [
    origin[0] + (u[0] * i) / nu + (v[0] * j) / nv,
    origin[1] + (u[1] * i) / nu + (v[1] * j) / nv,
    origin[2] + (u[2] * i) / nu + (v[2] * j) / nv,
  ];
  const out: Mesh[] = [];
  for (let i = 0; i < nu; i++)
    for (let j = 0; j < nv; j++)
      out.push(quad(at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1), color, 0.001));
  return merge(out);
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
        const wx = DOOR_X + x * dmath.cos(t) - y * dmath.sin(t);
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
  // Regular grids on the read faces (roof, bays, blind end) carry the weathering; nothing is
  // refined blindly. Measured 16.2k / 6.95k / 170 (the far LOD is far.ts: a box with baked colour).
  budget: { triangles: [19000, 8000, 200] },
  checks: [symmetric('door_l', 'door_r', 'y'), doorArc],
  // Indicator LEDs: green and lit, not blown white with a halo over the door frame.
  glow: [{ parts: ['status_light', 'keypad'], color: GLOW, strength: 1.5 }],
  build(ctx) {
    const lod = ctx.lod;
    const bv = ctx.pick([0.012, 0.006, 0]);
    const statics: [string, Mesh][] = [];
    const weather = weatherer(ctx.rng.fork('weather'));
    const soft = valueNoise(ctx.rng.fork('stain'), { scale: 0.45, octaves: 2 });
    /**
     * Soft stains for the grid faces: rust blooms and rain-run grime from noise stretched down
     * the face (features 0.3-1 m, several cells each), so they read as stains, not facets.
     */
    const stained = (m: Mesh): Mesh =>
      shade(m, (p, n, c) => {
        // The roof takes broad stains (pooled water, 1–2 m across): at half the frequency the
        // tone steps from one 16 cm cell to the next stay under what reads as blocks.
        const roof = Math.abs(n[2]) > 0.7;
        const k = roof ? soft([p[0] * 0.5, p[1] * 0.5, p[2]]) : soft([p[0], p[1], p[2] * 0.3]);
        const run = mix(c, GRIME, 0.3 * smooth(0.35, 0.75, k));
        return mix(run, RUST_STAIN, 0.6 * smooth(0.58, 0.8, k));
      });
    /** Materials, at true scale (box-projected per triangle), then dust on the roof, dirt splashed up the bottom rail. Mesh is in root space
     *  (the root is turned half a turn, which does not change heights or up-facing). */
    const finish = (m: Mesh, z0 = 0): Mesh => {
      const mapped = reproject(restrip(tessellate(m, ctx.pick([1.2, 2.0, 4.0])), RULES));
      // Dust from the noise field; the dirt splashed up the bottom 60 cm is a function of height
      // alone, so it cannot take the shape of the triangles it is interpolated on (a noisy mud
      // line drew brown saw teeth along the feet of the lower panels).
      // `z0`: the height of the mesh's own origin (a door leaf is built in hinge space).
      return shade(
        weather(mapped, { dust: 0.45 }),
        (p, _n, c) => mix(c, MUD, 0.42 * (1 - smooth(0.05, 0.62, p[2]))),
        [0, 0, z0],
      );
    };
    // Built with the doors at −X, then turned half a turn so the door end faces +X (the front
    // the gallery's 3/4 shot looks at). Moving doors are children of this yawed root.
    const root = 'container';
    ctx.group(root, { yaw: Math.PI });
    // Far, the container is a box with baked colour (far.ts); everything below is LOD0 and LOD1.
    if (lod === 2) {
      buildFar(ctx, root);
      return;
    }

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
    for (const sy of [-1, 1])
      for (const x of [-1.03, 1.03])
        frame.push(bevelled([0.36, 0.02, 0.1], DARK, 0, [x, sy * (HW + 0.002), 0.04]));
    statics.push(['frame', merge(frame)]);

    // ── corner castings (ISO 1161): dark oval apertures on the three outer faces ────────────
    const casting = (sx: number, sy: number, top: boolean): Mesh => {
      const m: Mesh[] = [bevelled([CL, CW, CH], CAST, ctx.pick([0.008, 0.004, 0]))];
      {
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
          if (top)
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
    // The faces the weather is read on, as regular grids: roof and blind end (the bays and door
    // panels add their own). The far LOD has no grids: its weather is even by construction.
    // Grids take soft, low-frequency stains only (`stained`), never the edge-scale cover effects
    // (chips, rust, bleach: 3-35 cm noise), which on 12-16 cm cells alias into whole-triangle
    // blotches and sawtooth along every grid border.
    const grids: Mesh[] = [];
    {
      const cell = ctx.pick([0.16, 0.4, 1]);
      const rx = (L - 0.26) / 2;
      const ry = (W - 0.24) / 2;
      grids.push(sheet([-rx, -ry, H - 0.12], [2 * rx, 0, 0], [0, 2 * ry, 0], cell, SHELL_DARK));
      grids.push(
        sheet(
          [HL - RECESS + 0.02, -(W - 0.3) / 2, 0.17],
          [0, W - 0.3, 0],
          [0, 0, H - 0.32],
          cell,
          SHELL,
        ),
      );
    }

    // ── armoured bays on the long sides (medium), seams + vents + bolts (small) ──────────────
    {
      const bays = 6;
      const span = L - 2 * CL;
      const bay = span / bays;
      for (const sy of [-1, 1]) {
        const y = sy * (HW - RECESS + 0.02);
        for (let i = 0; i <= bays; i++)
          // Ribs between the bays: from the side plate out to the frame face.
          shell.push(
            bevelled([0.08, RECESS - 0.02, H - 0.34], SHELL_DARK, bv, [
              -span / 2 + i * bay,
              sy * (HW - (RECESS - 0.02) / 2),
              0.17,
            ]),
          );
        for (let i = 0; i < bays; i++) {
          const cx = -span / 2 + (i + 0.5) * bay;
          shell.push(bevelled([bay - 0.2, 0.03, 0.95], SHELL, bv, [cx, y + sy * 0.015, 1.3]));
          shell.push(bevelled([bay - 0.2, 0.03, 0.85], SHELL, bv, [cx, y + sy * 0.015, 0.33]));
          // Each armour panel's face as a grid (inside its bevel).
          const hw = (bay - 0.2) / 2 - 0.02;
          for (const [z0, z1] of [
            [1.32, 2.23],
            [0.35, 1.16],
          ] as const)
            grids.push(
              sheet(
                [cx + sy * hw, y + sy * 0.03, z0],
                [-sy * 2 * hw, 0, 0],
                [0, 0, z1 - z0],
                ctx.pick([0.16, 0.4, 1]),
                SHELL,
              ),
            );
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
      if (lod === 0) {
        // Roof fasteners: four hex heads on every rib, where it is bolted through the roof plate.
        const head = cylinder({ radius: 0.014, length: 0.01, segments: 6, color: METAL });
        for (let i = 0; i < 7; i++)
          for (const y of [-0.9, -0.3, 0.3, 0.9])
            shell.push(place(head, { at: [-HL + 0.5 + i * 0.84, y, H - 0.07 + 0.004] }));
      }
      shell.push(bevelled([0.05, 1.4, 1.5], SHELL_DARK, bv, [HL - RECESS + 0.03, 0, 0.5]));
      // Hazard band painted on the service panel's face (x = HL − RECESS + 0.055): drawn 1 mm
      // inside it and lifted 3 mm by quad(), below the panel's top bevel (z 1.988).
      if (lod === 0)
        shell.push(
          hazard(
            [HL - RECESS + 0.054, -0.7, 1.85],
            [HL - RECESS + 0.054, 0.7, 1.85],
            [0, 0, 0.12],
            10,
          ),
        );
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
      const leafGrids: Mesh[] = [];
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
      {
        // Raised armour panel, two lock bars with cams and handles.
        leaf.push(bevelled([0.03, LEAF - 0.2, 1.0], SHELL_DARK, bv, [-0.04, -s * (LEAF / 2), 1.1]));
        leaf.push(
          bevelled([0.03, LEAF - 0.2, 0.75], SHELL_DARK, bv, [-0.04, -s * (LEAF / 2), 0.2]),
        );
        // Both armour panels' outer faces (x −0.055) as grids, inside their bevels.
        const pw = LEAF - 0.24;
        for (const [z0, z1] of [
          [1.12, 2.08],
          [0.22, 0.93],
        ] as const)
          leafGrids.push(
            sheet(
              [-0.055, -s * (LEAF / 2) + pw / 2, z0],
              [0, -pw, 0],
              [0, 0, z1 - z0],
              ctx.pick([0.16, 0.4, 1]),
              SHELL_DARK,
            ),
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
        if (lod === 0) {
          // What every box carries on its doors besides the owner code: the weight panel on the
          // right-hand leaf, and on the left one the last inspector's mark, sprayed by hand a
          // little off level.
          const marks: readonly (readonly [string, number, number, readonly [number, number]])[] =
            s > 0
              ? [
                  ['MAX 30480', 0.74, 0.05, [0, 1]],
                  ['TARE 2180', 0.63, 0.05, [0, 1]],
                ]
              : [['OK 7', 1.5, 0.11, [0.12, 0.99]]];
          for (const [line, z, height, [uy, uz]] of marks)
            leaf.push(
              text(line, {
                origin: [-0.055, -s * 0.55, z],
                along: [0, -uz, uy],
                up: [0, uy, uz],
                height,
                align: 'centre',
                color: STENCIL,
              }),
            );
        }
        for (const y of [0.32, 0.78]) {
          if (lod === 0) {
            leaf.push(bevelled([0.05, 0.08, 0.1], METAL, 0.008, [-0.08, -s * y, 0.05]));
            leaf.push(
              bevelled([0.05, 0.08, 0.1], METAL, 0.008, [-0.08, -s * y, DOOR_Z1 - DOOR_Z0 - 0.15]),
            );
            // Cam handle welded to its lock bar: the lever's inner edge runs 9 mm into the bar.
            leaf.push(bevelled([0.04, 0.05, 0.3], DARK, 0.008, [-0.09, -s * (y + 0.04), 0.95]));
          }
        }
        if (lod === 0)
          leaf.push(
            hazard(
              // Run along −Y so (b − a) × up = −X: the leaf's outer face (−0.030); drawn 1 mm
              // inside it, quad() lifts the band 3 mm out, so the paint sits 2 mm proud.
              [-0.029, s > 0 ? -0.02 : LEAF - 0.02, 0.02],
              [-0.029, s > 0 ? -LEAF + 0.02 : -0.02, 0.02],
              [0, 0, 0.12],
              8,
            ),
          );
      }
      // Gasket: the rubber lip down the meeting edge, bedded 2 mm in the leaf's outer face.
      leaf.push(
        bevelled([0.01, 0.025, DOOR_Z1 - DOOR_Z0 - 0.04], DARK, 0, [
          -0.033,
          -s * (LEAF - 0.0125),
          0.02,
        ]),
      );
      // Customs bolt seal through the right leaf's inner cam handle (the one opened first).
      if (s > 0 && lod === 0)
        leaf.push(
          cylinder({
            radius: 0.012,
            length: 0.06,
            segments: 6,
            color: HAZARD,
            at: [-0.09, -s * (0.78 + 0.04), 0.93],
          }),
        );
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
      // The leaf weathers in its own hinge space (it moves): chipped edges, rust runs, dirt at
      // the sill, and paint rubbed through where hands work the cam handles.
      const grips = [0.32, 0.78].map((y): { at: Vec3; radius: number } => ({
        at: [LEAF_X - 0.09, -s * (y + 0.04), 1.1],
        radius: 0.28,
      }));
      const built = finish(merge([translate(merge(leaf), [LEAF_X, 0, 0]), ...knuckles]), DOOR_Z0);
      const aged = weatherPass(
        ctx,
        { leaf: built },
        {
          name: `door_${side}`,
          seed: s > 0 ? 11 : 13,
          age: 0.8,
          climate: 'coastal',
          // The armour panels' faces are grids already; nothing else needs splitting.
          resolution: 0,
          touched: grips,
          effects: {
            chips: { where: 'convex-edges', amount: 0.15 },
            rust: { where: 'convex-edges & side-facing', amount: 0.08, streaks: true },
            scratches: { where: 'touched', amount: 0.35 },
          },
        },
      );
      const leafFaces = stained(finish(translate(merge(leafGrids), [LEAF_X, 0, 0]), DOOR_Z0));
      ctx.part(`door_${side}`, merge([aged.leaf, leafFaces]), doorMount(root, s, side));
      if (s > 0)
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
    const plates = { body: done.get('body') ?? merge([]), frame: done.get('frame') ?? merge([]) };
    const worn = weatherPass(ctx, plates, {
      name: 'container',
      seed: 7,
      age: 0.8,
      climate: 'coastal',
      // No refinement: the read faces are regular grids already, and the bevelled frame only
      // needs its own edges (chips), not thousands of split rail triangles.
      resolution: 0,
      effects: {
        chips: { where: 'convex-edges', amount: 0.15 },
        rust: { where: 'convex-edges & side-facing', amount: 0.08, streaks: true },
        // Thin films, not paint: a stain moves the colour part of the way, so neighbouring
        // cells differ by a tone, not by a colour.
        dust: { where: 'up-facing', amount: 0.3, strength: 0.4 },
        bleach: { where: 'up-facing', amount: 0.2, strength: 0.3 },
        dents: { where: 'exposed-panels', count: [2, 4], depth: 0.012 },
      },
    });
    const faces =
      lod === 0
        ? bakeAo(merge(grids), { samples: 16, radius: 0.6, strength: 0.5 }, occ)
        : merge(grids);
    done.set('body', merge([worn.body, stained(finish(faces))]));
    done.set('frame', worn.frame);
    for (const [name, mesh] of done) ctx.part(name, mesh, { parent: root });
  },
});
