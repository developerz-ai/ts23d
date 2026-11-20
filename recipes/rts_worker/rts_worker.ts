// Saltmarch Delver — the Accord's worker (ORIGINAL design, see README.md and
// ../rts_faction/README.md). Same chunky figure as the soldier, but soft and round where the
// soldier is chevroned: a padded work suit, a round team-colour cap with amber goggles, a big
// tool backpack (team-colour lid, cable coil, canister, spare pick-heads) and a sunstone pick held
// upright in the right fist (grip joint). Reads as "builder" from the RTS camera by the pack.

import {
  applyAffine,
  box,
  cylinder,
  defineAsset,
  dmath,
  frame,
  type Lod,
  type Mesh,
  merge,
  type PartOptions,
  place,
  sweep,
  type Vec3,
} from '@developerz.ai/ts23d';
import { type FigurePoints, figure } from '../_lib/rts/figure.ts';
import {
  band,
  CAKED,
  DUST,
  Kit,
  MUD,
  type Rule,
  restrip,
  role,
  teamWearOf,
  topDust,
  wearOf,
} from '../_lib/rts/finish.ts';
import {
  BOOT,
  BRASS,
  CLOTH,
  dome,
  ellipsoid,
  GLOW,
  IRON,
  LEATHER,
  mirrorY,
  pebble,
  SEG,
  SKIN,
  SLATE,
  SUNSTONE,
  TEAM,
  TEAM_PAINT_WORN,
  TEAM_VARIANTS,
  teamShade,
  tube,
} from '../_lib/rts/style.ts';

const HANDLE_R = 0.018;
/** The pick at port: grip low by the right hip, shaft up across the chest to the left, the head
 *  out past the left shoulder. AXIS is the shaft (in the frontal plane). */
const GRIP: Vec3 = [0.3, -0.22, 1.0];
const AXIS: Vec3 = [0, 0.62 / dmath.hypot(0.62, 0.78), 0.78 / dmath.hypot(0.62, 0.78)];
/** The left glove under the shaft, 0.42 m up it. */
const SUPPORT: Vec3 = [GRIP[0], GRIP[1] + AXIS[1] * 0.42 + 0.03, GRIP[2] + AXIS[2] * 0.42 - 0.025];
const SUIT = CLOTH;
const VEST: Vec3 = [CLOTH[0] * 0.75, CLOTH[1] * 0.72, CLOTH[2] * 0.62];
/** Ash-wood tool handle. */
const ASH: Vec3 = [0.42, 0.27, 0.14];
/** Rubber-sheathed cable. */
const CABLE: Vec3 = [0.03, 0.03, 0.028];
/** Waxed-canvas bedroll and the Delver's dark moustache. */
const TARP: Vec3 = [0.42, 0.4, 0.3];
const HAIR: Vec3 = [0.12, 0.08, 0.05];
const EYE: Vec3 = [0.04, 0.03, 0.03];

/** Materials: hard-hat plastic, painted pack shell, cast-iron tool, oak handle, brass, cable. */
const RULES: readonly Rule[] = [
  role(TEAM, 'plastic'),
  role(teamShade(0.62), 'plastic'),
  role(SLATE, 'steel_painted'),
  role(IRON, 'iron_cast'),
  role(LEATHER, 'leather'),
  role(BRASS, 'brass'),
  role(ASH, 'oak'),
  role(CABLE, 'rubber'),
  role(TARP, 'canvas'),
];

type Add = (name: string, m: Mesh, opts?: PartOptions) => void;

/** Cap, goggles and ear flaps over the head. */
function headgear(add: Add, lod: Lod, head: Vec3, r: Vec3): void {
  const z = head[2] + 0.02;
  // The cap's front surface at goggle height: brim and lenses sit on it whatever the head size.
  const capFront =
    head[0] - 0.01 + (r[0] + 0.02) * Math.sqrt(1 - dmath.pow(0.035 / (r[2] - 0.01), 2));
  // Round team cap: the worker's top-visible team mark, with a forward visor.
  add(
    'cap',
    merge([
      dome(lod, [head[0] - 0.01, 0, z], [r[0] + 0.02, r[1] + 0.02, r[2] - 0.01], TEAM),
      // The brim, darkened by years of grubby thumbs.
      pebble(lod, [0.11, 0.18, 0.02], [capFront, 0, z - 0.005], teamShade(0.62)),
    ]),
    { paint: 'team' },
  );
  if (lod === 2) return;
  const lens = cylinder({
    radius: 0.034,
    length: 0.03,
    segments: SEG(lod, 14, 8, 4),
    axis: 'x',
    at: [0, 0, 0],
    color: GLOW,
  });
  add(
    'goggles',
    merge([
      place(lens, { at: [capFront, 0.045, z + 0.035] }),
      place(lens, { at: [capFront, -0.045, z + 0.035] }),
    ]),
  );
  add(
    'goggle_strap',
    tube(
      lod,
      [capFront - 0.02, 0, z + 0.035],
      [capFront - 0.02, 0, z + 0.04],
      r[0] + 0.007,
      r[0] + 0.007,
      LEATHER,
    ),
  );
}

/** The big tool pack: frame, team lid, cable coil, canister, a spare pick head. */
function backpack(add: Add, lod: Lod, back: Vec3): void {
  // 10% under the first cut: the figure no longer reads top-heavy from the rear.
  const x = back[0] - 0.11;
  const body: Mesh[] = [pebble(lod, [0.22, 0.36, 0.45], [x, 0, 0.97], SLATE)];
  if (lod < 2) {
    // Canister on the left, cable coil on the right, brass frame rails.
    body.push(
      cylinder({
        radius: 0.07,
        length: 0.36,
        segments: SEG(lod, 16, 8, 4),
        at: [x - 0.03, 0.225, 1.1],
        color: BRASS,
      }),
    );
    const coil: Vec3[] = [];
    const n = SEG(lod, 36, 18, 8);
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 6;
      coil.push([
        x - 0.02 + dmath.cos(a) * 0.08,
        -0.18 - (i / n) * 0.03,
        1.08 + dmath.sin(a) * 0.08,
      ]);
    }
    body.push(
      sweep({
        section: { radius: 0.016, segments: SEG(lod, 5, 4, 3) },
        path: coil,
        color: CABLE,
        caps: true,
      }),
    );
    body.push(tube(lod, [x + 0.11, 0.17, 0.97], [x + 0.11, 0.17, 1.42], 0.015, 0.015, BRASS));
    body.push(tube(lod, [x + 0.11, -0.17, 0.97], [x + 0.11, -0.17, 1.42], 0.015, 0.015, BRASS));
  }
  if (lod === 0) {
    // Pockets and a spare pick head strapped to the back.
    body.push(pebble(lod, [0.06, 0.15, 0.13], [x - 0.14, 0.09, 1.02], LEATHER));
    body.push(pebble(lod, [0.06, 0.15, 0.13], [x - 0.14, -0.09, 1.02], LEATHER));
    body.push(box({ size: [0.04, 0.28, 0.05], at: [x - 0.13, 0, 1.25], color: IRON, bevel: 0.01 }));
  }
  add('pack', merge(body));
  add('pack_lid', pebble(lod, [0.27, 0.42, 0.08], [x, 0, 1.42], TEAM), { paint: 'team' });
  // A rolled tarp strapped across the lid (its own top-view shape over the team lid's back half).
  if (lod < 2)
    add(
      'tarp_roll',
      cylinder({
        radius: 0.055,
        length: 0.5,
        segments: SEG(lod, 12, 8, 4),
        axis: 'y',
        at: [x - 0.06, 0, 1.555],
        color: TARP,
      }),
    );
  // Straps over the shoulders.
  if (lod < 2) {
    const strap = sweep({
      section: { radius: 0.022, segments: 4 },
      path: [
        [-0.19, 0.13, 1.4],
        [-0.05, 0.14, 1.53],
        [0.13, 0.13, 1.44],
        [0.16, 0.13, 1.18],
      ],
      color: LEATHER,
      caps: true,
    });
    add('straps', merge([strap, mirrorY(strap)]));
  }
}

/**
 * The sunstone pick, built in the grip's frame (handle along +Z through the fist at the origin)
 * and turned onto the figure's grip axis (in the XZ plane).
 */
function pick(add: Add, lod: Lod, grip: Vec3, axis: Vec3): void {
  // Local +Z → the shaft, local +X (the blade) → outward and down, away from the face, in the
  // frontal plane so the head reads in the front view; local Y completes the frame.
  const bx: Vec3 = [0, axis[2], -axis[1]];
  const by: Vec3 = [
    axis[1] * bx[2] - axis[2] * bx[1],
    axis[2] * bx[0] - axis[0] * bx[2],
    axis[0] * bx[1] - axis[1] * bx[0],
  ];
  const onAxis = (m: Mesh): Mesh => applyAffine(m, frame(bx, by, axis, grip));
  add(
    'tool_handle',
    onAxis(
      cylinder({
        radius: HANDLE_R,
        // A full 0.9 m haft: carried across the body, the head stands out past the shoulder.
        length: 0.9,
        // Never 4-sided: a square handle measures Ø 2.5–3.6 cm by heading against the fist's
        // 3.6 cm opening, so a scene that turns the worker broke the grip joint at LOD2 (D310).
        segments: SEG(lod, 12, 6, 6),
        at: [0, 0, 0.12],
        color: ASH,
      }),
    ),
  );
  const top = 0.57;
  const head: Mesh[] = [
    pebble(lod, [0.12, 0.09, 0.11], [0, 0, top - 0.055], IRON),
    // Pick blade forward, hammer face back: big enough to read from the strategy camera.
    sweep({
      section: { radius: 0.034, segments: SEG(lod, 8, 5, 4) },
      path: [
        [0.05, 0, top],
        [0.3, 0, top - 0.1],
      ],
      scale: [1, 0.25],
      color: IRON,
      caps: true,
    }),
    pebble(lod, [0.12, 0.095, 0.095], [-0.11, 0, top - 0.0475], SLATE),
  ];
  add('tool_head', onAxis(merge(head)));
  if (lod < 2)
    add(
      'tool_gem',
      onAxis(ellipsoid(lod === 0 ? 1 : lod, [0, 0, top + 0.06], [0.03, 0.03, 0.05], SUNSTONE)),
    );
}

/**
 * The face under the cap: a brow, eyes, ears and a heavy moustache, so the Delver reads as a
 * person at hero distance (LOD0; ears down to LOD1). Placed in head radii, so the features stay
 * on the skin when the shared figure's head changes size.
 */
function face(add: Add, lod: Lod, head: Vec3, r: Vec3): void {
  if (lod === 2) return;
  const ear = ellipsoid(
    1,
    [head[0] - 0.005, r[1] + 0.002, head[2] - 0.01],
    [0.022, 0.014, 0.034],
    SKIN,
  );
  const parts: Mesh[] = [ear, mirrorY(ear)];
  if (lod === 0) {
    const eye = box({
      size: [0.01, 0.024, 0.014],
      at: [head[0] + r[0] * 0.93, r[1] * 0.4, head[2] - r[2] * 0.17],
      color: EYE,
    });
    parts.push(
      pebble(lod, [0.03, 0.16, 0.024], [head[0] + r[0] * 0.87, 0, head[2] - r[2] * 0.046], SKIN),
      eye,
      mirrorY(eye),
    );
    add(
      'moustache',
      ellipsoid(1, [head[0] + r[0] * 0.974, 0, head[2] - r[2] * 0.54], [0.022, 0.055, 0.015], HAIR),
    );
  }
  add('face', merge(parts));
}

/** Work kit on the suit: knee pads, chest pockets with flaps, gloves' big cuffs (the hands read
 *  bigger), a rolled bedroll under the pack and a shovel slung across it over the shoulder. */
function workKit(add: Add, lod: Lod, pts: FigurePoints): void {
  const back = pts.back;
  const pad = pebble(lod, [0.06, 0.11, 0.11], [0.098, 0.13, 0.39], LEATHER);
  add('knee_pad_l', pad);
  add('knee_pad_r', mirrorY(pad));
  const along = (e: Vec3, w: Vec3, k: number): Vec3 => [
    e[0] + (w[0] - e[0]) * k,
    e[1] + (w[1] - e[1]) * k,
    e[2] + (w[2] - e[2]) * k,
  ];
  const cuff = (e: Vec3, w: Vec3): Mesh =>
    tube(lod, along(e, w, 0.72), along(e, w, 0.98), 0.066, 0.074, LEATHER);
  add('glove_cuff_l', cuff(pts.elbowL, pts.wristL));
  add('glove_cuff_r', cuff(pts.elbowR, pts.wristR));
  const x = back[0] - 0.11;
  // Shovel across the pack's back, its D-grip standing up over the right shoulder.
  const bx = x - 0.125;
  const foot: Vec3 = [bx, 0.2, 0.78];
  const top: Vec3 = [bx, -0.24, 1.78];
  if (lod === 2) {
    // Far: the shovel's haft alone (its line over the shoulder is the side silhouette's).
    add('shovel', tube(lod, foot, top, 0.016, 0.016, ASH));
    return;
  }
  const pockets: Mesh[] = [];
  for (const y of [-0.1, 0.1]) {
    pockets.push(pebble(lod, [0.035, 0.09, 0.1], [0.165, y, 1.17], VEST));
    if (lod === 0)
      pockets.push(box({ size: [0.02, 0.1, 0.035], at: [0.18, y, 1.255], color: LEATHER }));
  }
  add('pockets', merge(pockets));
  const roll: Mesh[] = [
    cylinder({
      radius: 0.075,
      length: 0.44,
      segments: SEG(lod, 12, 8, 4),
      axis: 'y',
      at: [x, 0, 0.895],
      color: TARP,
    }),
  ];
  if (lod === 0)
    for (const y of [-0.13, 0.13])
      roll.push(
        cylinder({
          radius: 0.079,
          length: 0.03,
          segments: 12,
          axis: 'y',
          at: [x, y, 0.895],
          color: LEATHER,
        }),
      );
  add('bedroll', merge(roll));
  const shovel: Mesh[] = [
    // 8-sided: a 3 cm handle needs no more.
    tube(lod === 0 ? 1 : lod, foot, top, 0.016, 0.016, ASH),
    place(pebble(lod, [0.025, 0.2, 0.24], [0, 0, -0.24], IRON), { at: foot, roll: -0.41 }),
  ];
  if (lod === 0)
    shovel.push(
      place(box({ size: [0.03, 0.12, 0.02], at: [0, 0, 0], color: ASH }), { at: top, roll: -0.41 }),
    );
  add('shovel', merge(shovel));
}

export const rts_worker = defineAsset({
  name: 'rts_worker',
  kind: 'character',
  description:
    'Saltmarch Delver: original RTS worker. Padded work suit, team-colour cap and pack lid, amber goggles, tool backpack and a sunstone pick on a grip joint; 8 team liveries.',
  tags: ['rts', 'saltmarch', 'worker', 'character', 'team-colour'],
  // Design envelope from the faction brief (an invented unit: the brief is the source).
  // As built with the pick carried across the body.
  // Length and width are the design brief's figure in its work pose (the pick carried across the
  // body sets both); boot sole to cap crown is the body's own, which no pose changes.
  real: {
    length: 0.83,
    width: 0.75,
    height: 1.83,
    measures: [
      {
        label: 'standing height, boot sole to cap crown (design brief)',
        axis: 'z',
        value: 1.83,
        parts: ['boot', 'cap'],
        source: 'recipes/rts_faction/README.md (original design brief)',
      },
    ],
  },
  sources: [
    'recipes/rts_faction/README.md (original design brief: proportions, shape language, palette)',
  ],
  // LOD0 measured 10.1k: weather() splits edges past 16 cm so the wear has vertices.
  budget: { triangles: [11500, 3000, 380] },
  paint: TEAM_PAINT_WORN,
  variants: TEAM_VARIANTS,
  // Saltmarch lamps glow at 1.2 across the RTS set: lit amber, not blown to white.
  glow: [{ parts: ['goggles', 'tool_gem'], color: GLOW, strength: 1.2 }],
  gaps: [
    { parts: ['thigh_l', 'thigh_r'], why: 'stance: the legs stand apart' },
    { parts: ['shin_l', 'shin_r'], why: 'stance: the legs stand apart' },
    { parts: ['boot_l', 'boot_r'], why: 'stance: the legs stand apart' },
  ],
  // Measured: the team cap + goggles hold the head's contrast; a planted figure reads 'stable'.
  art: { focal: ['cap', 'goggles'], shape: 'stable', grounded: true, restShare: 0.2 },
  build(ctx) {
    const lod = ctx.lod;
    const kit = new Kit();
    const add: Add = (name, m, opts) => kit.add(name, restrip(m, RULES), opts);
    const pts = figure(kit, lod, {
      suit: SUIT,
      torso: VEST,
      torsoStrip: 'canvas',
      boots: BOOT,
      hands: LEATHER,
      // Carried across the body in both hands (figure's `port` pose): the shaft breaks the front
      // outline and the head stands out past the left shoulder. Over the shoulder (tried) piled
      // the head against the cap and the slung shovel.
      right: 'port',
      handleR: HANDLE_R,
      mud: 0.34,
      port: { grip: GRIP, axis: AXIS, support: SUPPORT },
    });
    headgear(add, lod, pts.head, pts.headR);
    face(add, lod, pts.head, pts.headR);
    backpack(add, lod, pts.back);
    workKit(add, lod, pts);
    ctx.socket('hand_r_socket', {
      kind: 'mount',
      at: pts.grip,
      dir: pts.gripAxis,
      data: { tool: 'pick' },
    });
    pick(add, lod, pts.grip, pts.gripAxis);
    if (lod < 2) {
      // Tool belt with a pouch and a mallet hanging at the left hip.
      const belt: Mesh[] = [tube(lod, [0, 0, 0.92], [0, 0, 0.98], 0.165, 0.165, LEATHER)];
      if (lod === 0)
        belt.push(
          pebble(lod, [0.08, 0.06, 0.1], [0.13, 0.08, 0.86], LEATHER),
          tube(lod, [0.05, 0.19, 0.95], [0.05, 0.2, 0.7], 0.014, 0.014, ASH),
          pebble(lod, [0.1, 0.05, 0.06], [0.05, 0.2, 0.66], IRON),
        );
      add('belt', merge(belt));
    }
    ctx.joint('grip_r', {
      from: 'hand_r',
      to: 'tool_handle',
      at: pts.grip,
      axis: pts.gripAxis,
      kind: 'grip',
    });
    // Dust where the pick strikes (engine fires it on a work cycle).
    ctx.emitter('work_dust', {
      kind: 'dust',
      at: [pts.grip[0] + 0.2, pts.grip[1], 0.05],
      rate: 30,
      life: 0.8,
      size: [0.05, 0.3],
      when: 'event',
    });
    // Caked brine mud to the knees (he kneels on the pads), salt dust over the shoulders, the
    // pack and the tarp: after weathering, so nothing paints over them.
    kit.post(
      (n) => /^(boot|shin|knee_pad)_/.test(n),
      (m) =>
        // Pale dried mud to mid-shin, wet and dark at the soles.
        band(
          band(m, { top: 0.56, full: 0.14, color: CAKED, k: 0.9 }, 0.06),
          { top: 0.12, full: 0.02, color: MUD, k: 0.75 },
          0.02,
        ),
    );
    kit.post(
      (n) => /^(torso|arm_[lr]_upper|pack|tarp_roll|straps|pockets|shovel)$/.test(n),
      (m) => topDust(m, 1.15, DUST, 0.6),
    );
    // Measured wear: scuffed edges (dented pack corners, a chipped pick head), mud up the boots.
    const bare = new Set(['head', 'neck', 'goggles', 'tool_gem', 'face', 'moustache']);
    const hard = /^(boot|pack$|cap|tool_head|helmet|shovel)/;
    const unit = wearOf('unit', 'delver', 23);
    const cloth = wearOf('cloth', 'delver_kit', 24);
    kit.commit(ctx, [
      {
        // The team hard hat and pack lid (wear slot): a scuffed rim and visor and fine scratches
        // to the bare shell, sized for the part (not the hero framing, which made the chips
        // blotches a third of the dome); they keep their colour in every livery.
        painted: true,
        wear: teamWearOf('delver_team', 25, [0, 0, 0], {
          chips: 0.16,
          dust: 0,
          scratches: 0.08,
          read: 'close',
        }),
        pick: (n) => lod < 2 && /^(cap|pack_lid)$/.test(n),
      },
      {
        wear: {
          ...unit,
          groundBand: 0.35,
          effects: {
            ...unit.effects,
            chips: { where: 'convex-edges', amount: 0.28, strength: 0.9 },
            mud: { where: 'ground-near', amount: 0.75, color: MUD, strength: 0.95 },
          },
        },
        pick: (n) => hard.test(n),
      },
      {
        wear: {
          ...cloth,
          groundBand: 0.6,
          ...(lod < 2 ? { touched: ['knee_pad_*'] } : {}),
          effects: {
            ...cloth.effects,
            mud: { where: 'ground-near', amount: 0.75, color: MUD, strength: 0.85 },
            ...(lod < 2
              ? { scratches: { where: 'touched', amount: 0.6, color: MUD, strength: 0.8 } }
              : {}),
          },
        },
        pick: (n) => !bare.has(n),
      },
    ]);
  },
});
