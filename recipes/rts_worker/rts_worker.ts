// Saltmarch Delver — the Accord's worker (ORIGINAL design, see README.md and
// ../rts_faction/README.md). Same chunky figure as the soldier, but soft and round where the
// soldier is chevroned: a padded work suit, a round team-colour cap with amber goggles, a big
// tool backpack (team-colour lid, cable coil, canister, spare pick-heads) and a sunstone pick held
// upright in the right fist (grip joint). Reads as "builder" from the RTS camera by the pack.

import {
  box,
  cylinder,
  defineAsset,
  type Lod,
  type Mesh,
  merge,
  type PartOptions,
  place,
  sweep,
  type Vec3,
} from '@developerz.ai/ts23d';
import { type FigurePoints, figure } from '../_lib/rts/figure.ts';
import { Kit, MUD, type Rule, restrip, role, wearOf } from '../_lib/rts/finish.ts';
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
  TEAM_PAINT,
  TEAM_VARIANTS,
  teamShade,
  tube,
} from '../_lib/rts/style.ts';

const HANDLE_R = 0.018;
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
  const capFront = head[0] - 0.01 + (r[0] + 0.02) * Math.sqrt(1 - (0.035 / (r[2] - 0.01)) ** 2);
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
  const x = back[0] - 0.12;
  const body: Mesh[] = [pebble(lod, [0.24, 0.4, 0.5], [x, 0, 0.92], SLATE)];
  if (lod < 2) {
    // Canister on the left, cable coil on the right, brass frame rails.
    body.push(
      cylinder({
        radius: 0.07,
        length: 0.36,
        segments: SEG(lod, 16, 8, 4),
        at: [x - 0.03, 0.245, 1.1],
        color: BRASS,
      }),
    );
    const coil: Vec3[] = [];
    const n = SEG(lod, 36, 18, 8);
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 6;
      coil.push([x - 0.02 + Math.cos(a) * 0.08, -0.2 - (i / n) * 0.03, 1.08 + Math.sin(a) * 0.08]);
    }
    body.push(
      sweep({
        section: { radius: 0.016, segments: SEG(lod, 5, 4, 3) },
        path: coil,
        color: CABLE,
        caps: true,
      }),
    );
    body.push(tube(lod, [x + 0.12, 0.19, 0.95], [x + 0.12, 0.19, 1.42], 0.015, 0.015, BRASS));
    body.push(tube(lod, [x + 0.12, -0.19, 0.95], [x + 0.12, -0.19, 1.42], 0.015, 0.015, BRASS));
  }
  if (lod === 0) {
    // Pockets and a spare pick head strapped to the back.
    body.push(pebble(lod, [0.06, 0.16, 0.14], [x - 0.15, 0.1, 1.0], LEATHER));
    body.push(pebble(lod, [0.06, 0.16, 0.14], [x - 0.15, -0.1, 1.0], LEATHER));
    body.push(box({ size: [0.04, 0.3, 0.05], at: [x - 0.14, 0, 1.25], color: IRON, bevel: 0.01 }));
  }
  add('pack', merge(body));
  add('pack_lid', pebble(lod, [0.3, 0.46, 0.09], [x, 0, 1.42], TEAM), { paint: 'team' });
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
  const onAxis = (m: Mesh): Mesh => place(m, { at: grip, pitch: Math.atan2(axis[0], axis[2]) });
  add(
    'tool_handle',
    onAxis(
      cylinder({
        radius: HANDLE_R,
        length: 0.7,
        // Never 4-sided: a square handle measures Ø 2.5–3.6 cm by heading against the fist's
        // 3.6 cm opening, so a scene that turns the worker broke the grip joint at LOD2 (D310).
        segments: SEG(lod, 12, 6, 6),
        at: [0, 0, 0.12],
        color: ASH,
      }),
    ),
  );
  const top = 0.47;
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
  const cuffL = tube(lod, [0.02, 0.32, 0.85], [0.02, 0.32, 0.94], 0.066, 0.072, LEATHER);
  add('glove_cuff_l', cuffL);
  const e = pts.elbowR;
  const w = pts.wristR;
  const t = (k: number): Vec3 => [
    e[0] + (w[0] - e[0]) * k,
    e[1] + (w[1] - e[1]) * k,
    e[2] + (w[2] - e[2]) * k,
  ];
  add('glove_cuff_r', tube(lod, t(0.72), t(0.98), 0.066, 0.074, LEATHER));
  if (lod === 2) return;
  const pockets: Mesh[] = [];
  for (const y of [-0.1, 0.1]) {
    pockets.push(pebble(lod, [0.035, 0.09, 0.1], [0.165, y, 1.17], VEST));
    if (lod === 0)
      pockets.push(box({ size: [0.02, 0.1, 0.035], at: [0.18, y, 1.255], color: LEATHER }));
  }
  add('pockets', merge(pockets));
  const x = back[0] - 0.12;
  const roll: Mesh[] = [
    cylinder({
      radius: 0.075,
      length: 0.44,
      segments: SEG(lod, 12, 8, 4),
      axis: 'y',
      at: [x, 0, 0.85],
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
          at: [x, y, 0.85],
          color: LEATHER,
        }),
      );
  add('bedroll', merge(roll));
  // Shovel across the pack's back, its D-grip standing up over the right shoulder.
  const bx = x - 0.135;
  const foot: Vec3 = [bx, 0.2, 0.78];
  const top: Vec3 = [bx, -0.24, 1.78];
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
  real: { length: 1.06, width: 0.75, height: 1.83 },
  sources: [
    'recipes/rts_faction/README.md (original design brief: proportions, shape language, palette)',
  ],
  // LOD0 measured 10.1k: weather() splits edges past 16 cm so the wear has vertices.
  budget: { triangles: [11500, 3000, 380] },
  paint: TEAM_PAINT,
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
      // Upright in the fist, not over the shoulder (figure's `shoulder` pose, tried): shouldered,
      // the pick head piles up against the cap and the slung shovel and the top view loses it.
      right: 'hold',
      handleR: HANDLE_R,
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
    // Measured wear: scuffed edges, salt dust on the shoulders and pack, mud up the boots.
    // A digger's wear: mud to the knees (he kneels on the pads), scuffed boots and shovel, salt
    // dust over the shoulders and pack.
    const bare = new Set(['head', 'neck', 'goggles', 'tool_gem', 'face', 'moustache']);
    const hard = /^(boot|pack$|cap|tool_head|helmet|shovel)/;
    const unit = wearOf('unit', 'delver', 23);
    const cloth = wearOf('cloth', 'delver_kit', 24);
    kit.commit(ctx, [
      {
        wear: {
          ...unit,
          groundBand: 0.35,
          effects: {
            ...unit.effects,
            chips: { where: 'convex-edges', amount: 0.2, strength: 0.85 },
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
