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
import { figure } from '../_lib/rts/figure.ts';
import { Kit, type Rule, restrip, role, wearOf } from '../_lib/rts/finish.ts';
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

/** Materials: hard-hat plastic, painted pack shell, cast-iron tool, oak handle, brass, cable. */
const RULES: readonly Rule[] = [
  role(TEAM, 'plastic'),
  role(teamShade(0.8), 'plastic'),
  role(SLATE, 'steel_painted'),
  role(IRON, 'iron_cast'),
  role(LEATHER, 'leather'),
  role(BRASS, 'brass'),
  role(ASH, 'oak'),
  role(CABLE, 'rubber'),
];

type Add = (name: string, m: Mesh, opts?: PartOptions) => void;

/** Cap, goggles and ear flaps over the head. */
function headgear(add: Add, lod: Lod, head: Vec3, r: Vec3): void {
  const z = head[2] + 0.02;
  // Round team cap: the worker's top-visible team mark, with a forward visor.
  add(
    'cap',
    merge([
      dome(lod, [head[0] - 0.01, 0, z], [r[0] + 0.02, r[1] + 0.02, r[2] - 0.01], TEAM),
      pebble(lod, [0.11, 0.18, 0.02], [head[0] + 0.12, 0, z - 0.005], teamShade(0.8)),
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
      place(lens, { at: [head[0] + 0.12, 0.045, z + 0.035] }),
      place(lens, { at: [head[0] + 0.12, -0.045, z + 0.035] }),
    ]),
  );
  add(
    'goggle_strap',
    tube(lod, [head[0] + 0.1, 0, z + 0.035], [head[0] + 0.1, 0, z + 0.04], 0.122, 0.122, LEATHER),
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
    const n = SEG(lod, 48, 18, 8);
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 6;
      coil.push([x - 0.02 + Math.cos(a) * 0.08, -0.2 - (i / n) * 0.03, 1.08 + Math.sin(a) * 0.08]);
    }
    body.push(
      sweep({
        section: { radius: 0.016, segments: SEG(lod, 6, 4, 3) },
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

/** The sunstone pick, local frame: handle along +Z through the grip at the origin. */
function pick(add: Add, lod: Lod, grip: Vec3): void {
  add(
    'tool_handle',
    cylinder({
      radius: HANDLE_R,
      length: 0.7,
      segments: SEG(lod, 12, 6, 4),
      at: [grip[0], grip[1], grip[2] + 0.12],
      color: ASH,
    }),
  );
  const top = grip[2] + 0.47;
  const head: Mesh[] = [
    pebble(lod, [0.12, 0.09, 0.11], [grip[0], grip[1], top - 0.055], IRON),
    // Pick blade forward, hammer face back: big enough to read from the strategy camera.
    sweep({
      section: { radius: 0.034, segments: SEG(lod, 8, 5, 4) },
      path: [
        [grip[0] + 0.05, grip[1], top],
        [grip[0] + 0.3, grip[1], top - 0.1],
      ],
      scale: [1, 0.25],
      color: IRON,
      caps: true,
    }),
    pebble(lod, [0.12, 0.095, 0.095], [grip[0] - 0.11, grip[1], top - 0.0475], SLATE),
  ];
  add('tool_head', merge(head));
  if (lod < 2)
    add('tool_gem', ellipsoid(lod, [grip[0], grip[1], top + 0.06], [0.03, 0.03, 0.05], SUNSTONE));
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
  glow: [{ parts: ['goggles', 'tool_gem'], color: GLOW, strength: 2.5 }],
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
      right: 'hold',
      handleR: HANDLE_R,
    });
    headgear(add, lod, pts.head, pts.headR);
    backpack(add, lod, pts.back);
    ctx.socket('hand_r_socket', {
      kind: 'mount',
      at: pts.grip,
      dir: [0, 0, 1],
      data: { tool: 'pick' },
    });
    pick(add, lod, pts.grip);
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
      axis: [0, 0, 1],
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
    const bare = new Set(['head', 'neck', 'goggles', 'tool_gem']);
    const hard = /^(boot|pack$|cap|tool_head|helmet)/;
    kit.commit(ctx, [
      { wear: wearOf('unit', 'delver', 23), pick: (n) => hard.test(n) },
      { wear: wearOf('cloth', 'delver_kit', 24), pick: (n) => !bare.has(n) },
    ]);
  },
});
