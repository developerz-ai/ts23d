// Saltmarch Warden — the Accord's line infantry (ORIGINAL design, see README.md and
// ../rts_faction/README.md). Chunky RTS proportions on the shared figure: bone ceramic armour, a
// domed helmet with a forward chevron crest and an amber visor slit, team-colour pauldrons,
// crest, chest stripe and pack flap (the top view reads team colour), and the "sunlance" carbine
// on the right-hand socket with a grip joint QA proves the fist closes round. Muzzle-flash
// emitter at the barrel tip. LOD2 ≈ 350 triangles for crowds.

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
  sweep,
  symmetric,
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
  BONE,
  BONE_DARK,
  BOOT,
  BRASS,
  CLOTH,
  chevron,
  dome,
  ellipsoid,
  GLOW,
  IRON,
  LEATHER,
  mirrorY,
  pebble,
  SLATE,
  TEAM,
  TEAM_PAINT_WORN,
  TEAM_VARIANTS,
  teamShade,
  tube,
} from '../_lib/rts/style.ts';

const HANDLE_R = 0.019;
/** Pack centre: its 0.14 m depth puts the front face at -0.15, 5 mm inside the torso's back
 *  (-0.155 at the shoulder-blade rings, z 1.24-1.36). */
const PACK_X = -0.22;

/** Materials: ceramic armour and team plates, painted gunmetal, leather, aged brass. */
const RULES: readonly Rule[] = [
  role(BONE, 'plastic'),
  role(BONE_DARK, 'plastic'),
  role(TEAM, 'plastic'),
  role(teamShade(0.92), 'plastic'),
  role(SLATE, 'steel_painted'),
  role(IRON, 'steel_painted'),
  role(LEATHER, 'leather'),
  role(BRASS, 'brass'),
];

/** A Warden part on its real materials, queued for wear. */
type Add = (name: string, m: Mesh, opts?: PartOptions) => void;
const adder =
  (kit: Kit): Add =>
  (name, m, opts) =>
    kit.add(name, restrip(m, RULES), opts);

/** The carbine's barrel shroud (local frame): x0..x1 along the barrel at height z, tapering. */
export const SHROUD = { x0: 0.28, x1: 0.62, z: 0.12, r0: 0.032, r1: 0.028 } as const;
/** Shroud radius at carbine-local x. */
export const shroudR = (x: number): number =>
  SHROUD.r0 + ((SHROUD.r1 - SHROUD.r0) * (x - SHROUD.x0)) / (SHROUD.x1 - SHROUD.x0);

/** The sunlance carbine, local frame: grip axis +Z through the origin, muzzle toward +X. */
export function carbine(lod: Lod): {
  body: Mesh;
  grip: Mesh;
  cell: Mesh | null;
  sling: Mesh | null;
  muzzle: Vec3;
} {
  const body: Mesh[] = [
    // Receiver above the grip, barrel shroud forward.
    pebble(lod, [0.42, 0.07, 0.1], [0.08, 0, 0.07], IRON),
    tube(lod, [SHROUD.x0, 0, SHROUD.z], [SHROUD.x1, 0, SHROUD.z], SHROUD.r0, SHROUD.r1, SLATE),
  ];
  // The stock at every LOD: the side silhouette keeps the whole weapon.
  body.push(pebble(lod, [0.2, 0.055, 0.12], [-0.2, 0, 0.03], SLATE));
  if (lod < 2) {
    body.push(
      // Barrel, brass muzzle collar, front sight, magazine.
      tube(lod, [0.6, 0, 0.12], [0.72, 0, 0.12], 0.016, 0.016, IRON),
      tube(lod, [0.7, 0, 0.12], [0.74, 0, 0.12], 0.022, 0.022, BRASS),
      box({ size: [0.03, 0.012, 0.05], at: [0.55, 0, 0.145], color: BRASS }),
      // Magazine a hand's width ahead of the grip: the 15%-chunky fist (style.ts) must not leave
      // a see-through slit against it.
      pebble(lod, [0.08, 0.05, 0.12], [0.18, 0, -0.04], SLATE),
    );
  }
  if (lod === 0)
    // Cooling rings on the shroud, a sight rail on the receiver.
    for (let i = 0; i < 5; i++)
      body.push(
        // Cooling rings: 8-sided is round enough at a 3 cm radius.
        tube(1, [0.32 + i * 0.06, 0, 0.12], [0.335 + i * 0.06, 0, 0.12], 0.036, 0.036, IRON),
      );
  if (lod === 0) body.push(box({ size: [0.2, 0.02, 0.025], at: [0.06, 0, 0.17], color: IRON }));
  const grip = cylinder({
    radius: HANDLE_R,
    length: 0.17,
    // Never 4-sided: a square grip measures a different Ø at every heading (D310).
    segments: lod === 2 ? 6 : 12,
    color: LEATHER,
  });
  // Amber sunstone cell on the receiver: the weapon's glow accent.
  const cell =
    lod < 2
      ? cylinder({
          radius: 0.026,
          length: 0.08,
          segments: 12,
          axis: 'x',
          at: [0.17, 0, 0.17],
          color: GLOW,
        })
      : null;
  // Leather sling from the stock's heel, sagging under the grip, to a swivel under the shroud.
  const sling =
    lod < 2
      ? sweep({
          section: { radius: 0.012, segments: 4 },
          path: [
            [-0.27, 0, 0.0],
            [-0.1, 0, -0.08],
            [0.14, 0, -0.09],
            [0.36, 0, 0.09],
          ],
          color: LEATHER,
          caps: true,
        })
      : null;
  return { body: merge(body), grip, cell, sling, muzzle: [0.74, 0, 0.12] };
}

/**
 * Helmet: a bone dome down to the brow, a raked brow ridge, ear guards, a team chevron crest, and
 * an amber visor band across the eyes just under the rim (the focal accent).
 */
function helmet(add: Add, lod: Lod, head: Vec3, headR: Vec3): void {
  const rim = head[2] + 0.025; // helmet rim just above the eyes
  const front = head[0] + headR[0];
  add(
    'helmet',
    // 6 cm over the skull: the RTS read wants a big head, so the helmet carries it.
    dome(lod, [head[0] - 0.01, 0, rim], [headR[0] + 0.06, headR[1] + 0.06, headR[2] + 0.01], BONE),
  );
  // Dark visor housing with a bright amber slit: the strongest value contrast sits on the face.
  if (lod < 2)
    add('visor_frame', pebble(lod, [0.05, 0.21, 0.07], [front - 0.02, 0, rim - 0.06], IRON));
  add(
    'visor',
    // LOD2 has no housing: the slit sinks into the face instead of jutting out like a beak.
    lod === 2
      ? box({ size: [0.06, 0.17, 0.03], at: [front - 0.035, 0, rim - 0.047], color: GLOW })
      : box({ size: [0.03, 0.17, 0.028], at: [front + 0.002, 0, rim - 0.046], color: GLOW }),
  );
  if (lod < 2) {
    // Cheek guards hanging from the rim (mid-res: small forms do not need 240 triangles).
    const guard = ellipsoid(
      lod === 0 ? 1 : lod,
      [head[0] - 0.005, headR[1] + 0.02, rim - 0.055],
      [0.085, 0.035, 0.09],
      BONE_DARK,
    );
    add(
      'helmet_trim',
      merge([
        // Brow ridge over the visor, raked forward like the crest.
        pebble(lod, [0.07, 0.22, 0.035], [front + 0.005, 0, rim - 0.005], BONE_DARK),
        guard,
        mirrorY(guard),
      ]),
    );
  }
  // Crest: the chevron fin plus a long swept tail for the back view.
  add(
    'crest',
    merge([
      chevron([head[0] - 0.02, 0, rim + headR[2] - 0.01], 0.32, 0.11, 0.035, TEAM),
      chevron([head[0] - 0.2, 0, rim + headR[2] - 0.07], 0.26, 0.07, 0.03, teamShade(0.85)),
    ]),
    { paint: 'team' },
  );
}

/** Pauldrons, chest plates, belt, knee and shin guards, elbow pads. */
function armour(add: Add, lod: Lod, pts: FigurePoints): void {
  const shoulder = pts.shoulder;
  // Pauldrons: big team-colour domes, the read from the RTS camera.
  const p = dome(
    lod,
    [shoulder[0], shoulder[1] + 0.02, shoulder[2] - 0.04],
    [0.13, 0.12, 0.12],
    TEAM,
  );
  add('pauldron_l', p, { paint: 'team' });
  add('pauldron_r', mirrorY(p), { paint: 'team' });
  add('chest_stripe', pebble(lod, [0.05, 0.12, 0.3], [0.17, 0, 1.1], teamShade(0.92)), {
    paint: 'team',
  });
  if (lod === 2) return;
  const plates: Mesh[] = [
    // Chest plates either side of the stripe, abdomen bands, a brass collar ring.
    pebble(lod, [0.05, 0.13, 0.17], [0.16, 0.12, 1.24], BONE_DARK),
    pebble(lod, [0.05, 0.13, 0.17], [0.16, -0.12, 1.24], BONE_DARK),
    tube(lod, [0, 0, 1.46], [0, 0, 1.5], 0.12, 0.1, BRASS),
  ];
  if (lod === 0)
    for (const z of [1.0, 1.06])
      plates.push(pebble(lod, [0.04, 0.2, 0.045], [0.14, 0, z], BONE_DARK));
  add('chest_plates', merge(plates));
  const belt: Mesh[] = [tube(lod, [0, 0, 0.93], [0, 0, 0.99], 0.17, 0.17, LEATHER)];
  if (lod === 0)
    for (const y of [-0.12, 0, 0.12])
      belt.push(pebble(lod, [0.06, 0.08, 0.09], [0.15, y, 0.9], y === 0 ? BRASS : LEATHER));
  add('belt', merge(belt));
  const knee = merge([
    ellipsoid(lod === 0 ? 1 : lod, [0.07, 0.13, 0.5], [0.055, 0.08, 0.085], BONE),
    pebble(lod, [0.05, 0.1, 0.24], [0.07, 0.13, 0.2], BONE_DARK),
  ]);
  add('greave_l', knee);
  add('greave_r', mirrorY(knee));
  // Elbow cops behind each elbow joint (the left one reaches across the body at port arms).
  const cop = (e: Vec3, side: number): Mesh =>
    ellipsoid(
      lod === 0 ? 1 : lod,
      [e[0] - 0.04, e[1] + side * 0.01, e[2]],
      [0.05, 0.06, 0.06],
      BONE,
    );
  add('elbow_l', cop(pts.elbowL, 1));
  add('elbow_r', cop(pts.elbowR, -1));
}

/**
 * Port arms: the carbine diagonal across the chest, muzzle up by the left shoulder, grip low by
 * the right hip, its side to the front (the FRONT view reads the whole weapon). Carbine frame:
 * barrel along D, grip axis (the gun's "up") along U, both in the frontal plane.
 */
const GRIP: Vec3 = [0.31, -0.24, 1.0];
const D: Vec3 = [0, 0.75, 0.66].map((v, _, a) => v / dmath.norm(a)) as unknown as Vec3;
const U: Vec3 = [0, -D[2], D[1]];
/** The forward-facing side: completes the right-handed port frame (D × side = U). */
const SIDE: Vec3 = [
  U[1] * D[2] - U[2] * D[1],
  U[2] * D[0] - U[0] * D[2],
  U[0] * D[1] - U[1] * D[0],
];
/** The carbine's local frame onto the port pose at `grip`: x → D, y → SIDE, z → U. */
const portFrame = (grip: Vec3) => frame(D, SIDE, U, grip);
/** A carbine-local point at port arms with the grip at `grip`. */
export const onPort = (grip: Vec3, p: Vec3): Vec3 => {
  const f = (k: 0 | 1 | 2): number => grip[k] + D[k] * p[0] + SIDE[k] * p[1] + U[k] * p[2];
  return [f(0), f(1), f(2)];
};
/** Where along the shroud (carbine-local x) the left glove holds it. */
const HOLD_X = 0.42;
/** The fore-end where the left glove holds it: the shroud's underside at HOLD_X. */
export const SUPPORT: Vec3 = onPort(GRIP, [HOLD_X, 0, SHROUD.z - shroudR(HOLD_X)]);

/**
 * Load-bearing kit over the armour: webbing straps from the shoulders over the chest plates to
 * the belt, two magazine pouches on the chest rig, panel grooves on the chest plates, and
 * gauntlets (cuff + back plate) that make the hands read bigger at strategy scale.
 */
function harness(add: Add, lod: Lod, pts: FigurePoints): void {
  if (lod === 2) return;
  // Gauntlets: a cuff over the last quarter of each forearm.
  const along = (e: Vec3, w: Vec3, k: number): Vec3 => [
    e[0] + (w[0] - e[0]) * k,
    e[1] + (w[1] - e[1]) * k,
    e[2] + (w[2] - e[2]) * k,
  ];
  const cuff = (e: Vec3, w: Vec3): Mesh =>
    tube(lod, along(e, w, 0.72), along(e, w, 0.98), 0.066, 0.072, BONE_DARK);
  add('gauntlet_l', cuff(pts.elbowL, pts.wristL));
  add('gauntlet_r', cuff(pts.elbowR, pts.wristR));
  const strap = sweep({
    section: { radius: 0.017, segments: lod === 0 ? 5 : 4 },
    path: [
      [-0.16, 0.12, 1.4],
      [-0.06, 0.13, 1.5],
      [0.09, 0.12, 1.46],
      [0.19, 0.095, 1.32],
      [0.19, 0.08, 1.1],
      [0.165, 0.07, 0.97],
    ],
    color: LEATHER,
    caps: true,
  });
  const kit: Mesh[] = [strap, mirrorY(strap)];
  for (const y of [-0.1, 0.1]) kit.push(pebble(lod, [0.065, 0.085, 0.11], [0.17, y, 1.0], LEATHER));
  if (lod === 0)
    // Pouch flap and its brass press-stud.
    for (const y of [-0.1, 0.1])
      kit.push(
        box({ size: [0.02, 0.09, 0.04], at: [0.205, y, 1.08], color: LEATHER }),
        box({ size: [0.012, 0.02, 0.02], at: [0.218, y, 1.09], color: BRASS }),
      );
  add('webbing', merge(kit));
  if (lod === 0)
    // A panel groove across each chest plate (the plates read as fitted shells, not slabs).
    add(
      'panel_lines',
      merge([
        ...[-0.12, 0.12].map((y) =>
          box({ size: [0.012, 0.12, 0.012], at: [0.184, y, 1.31], color: IRON }),
        ),
      ]),
    );
}

export const rts_soldier = defineAsset({
  name: 'rts_soldier',
  kind: 'character',
  description:
    'Saltmarch Warden: original RTS line infantry. Bone ceramic armour, team-colour pauldrons and crest, amber visor, sunlance carbine on the hand socket; 8 team liveries.',
  tags: ['rts', 'saltmarch', 'infantry', 'character', 'team-colour'],
  // Design envelope from the faction brief (an invented unit: the brief is the source).
  // As built at port arms (the carbine across the chest, not pointing forward).
  // Length and width are the design brief's figure in its port-arms carry pose (the carbine
  // across the chest sets both); the pauldron span is the body's own, which no pose changes.
  real: {
    length: 0.72,
    width: 0.97,
    height: 1.95,
    measures: [
      {
        label: 'pauldron span (infantry shoulders 0.75–0.82 m, design brief)',
        axis: 'y',
        value: 0.82,
        parts: ['pauldron'],
        source: 'recipes/rts_faction/README.md (original design brief)',
      },
    ],
  },
  sources: [
    'recipes/rts_faction/README.md (original design brief: proportions, shape language, palette)',
  ],
  // LOD0 measured 12.7k: weather() splits edges past 16 cm so chips, dust and mud have vertices.
  budget: { triangles: [14000, 3000, 380] },
  paint: TEAM_PAINT_WORN,
  variants: TEAM_VARIANTS,
  // Saltmarch lamps glow at 1.2 across the RTS set: lit amber, not blown to white.
  glow: [{ parts: ['visor', 'rifle_cell'], color: GLOW, strength: 1.2 }],
  gaps: [
    { parts: ['thigh_l', 'thigh_r'], why: 'stance: the legs stand apart' },
    { parts: ['shin_l', 'shin_r'], why: 'stance: the legs stand apart' },
    { parts: ['boot_l', 'boot_r'], why: 'stance: the legs stand apart' },
    { parts: ['greave_l', 'greave_r'], why: 'stance: the legs stand apart' },
  ],
  // Measured, not wished: at RTS scale a planted trooper reads 'stable'; small units carry dense
  // kit everywhere, so the calm-surface floor is 20%, not the 25% hero default.
  art: { focal: ['helmet', 'visor', 'crest'], shape: 'stable', grounded: true, restShare: 0.2 },
  checks: [symmetric('pauldron_l', 'pauldron_r', 'y')],
  build(ctx) {
    const lod = ctx.lod;
    const kit = new Kit();
    const add = adder(kit);
    const pts = figure(kit, lod, {
      suit: CLOTH,
      torso: BONE,
      torsoStrip: 'plastic',
      boots: BOOT,
      hands: LEATHER,
      right: 'port',
      handleR: HANDLE_R,
      mud: 0.34,
      port: { grip: GRIP, axis: U, support: SUPPORT },
    });
    helmet(add, lod, pts.head, pts.headR);
    armour(add, lod, pts);
    // The carbine rides the right-hand socket: grip centre at the fist, muzzle forward.
    ctx.socket('hand_r_socket', {
      kind: 'mount',
      at: pts.grip,
      dir: [1, 0, 0],
      data: { weapon: 'sunlance' },
    });
    const gun = carbine(lod);
    // One grip drives the weapon's pose, its grip joint and its muzzle: the figure's fist.
    const at = pts.grip;
    // At port arms across the chest (the grip's own axis tilted onto U, so the fist still closes
    // round it): the front view reads the whole weapon, not a muzzle pointing at the lens.
    const port = portFrame(at);
    const pose = (m: Mesh): Mesh => applyAffine(m, port);
    add('rifle_grip', pose(gun.grip));
    add('rifle', pose(gun.body));
    if (gun.cell) add('rifle_cell', pose(gun.cell));
    if (gun.sling) add('rifle_sling', pose(gun.sling));
    ctx.joint('grip_r', { from: 'hand_r', to: 'rifle_grip', at, axis: U, kind: 'grip' });
    const m = gun.muzzle;
    ctx.emitter('muzzle', {
      kind: 'muzzle',
      at: onPort(at, m),
      dir: D,
      rate: 120,
      life: 0.08,
      size: [0.08, 0.25],
      color: [1, 0.75, 0.35],
      speed: 2,
      spreadDeg: 12,
      when: 'event',
    });
    harness(add, lod, pts);
    // Back: a power pack with vents and a whip antenna; team flap on top (top-visible). Its front
    // face sits 5 mm into the torso's back at the shoulder blades, where the harness pulls it.
    const px = PACK_X;
    const pack: Mesh[] = [pebble(lod, [0.14, 0.3, 0.34], [px, 0, 1.06], SLATE)];
    if (lod < 2)
      pack.push(tube(lod, [px - 0.06, 0.1, 1.38], [px - 0.08, 0.1, 1.95], 0.008, 0.005, IRON));
    if (lod === 0)
      for (let i = 0; i < 4; i++)
        pack.push(
          box({ size: [0.03, 0.22, 0.02], at: [px - 0.07, 0, 1.12 + i * 0.05], color: IRON }),
        );
    add('pack', merge(pack));
    add('pack_flap', pebble(lod, [0.17, 0.33, 0.06], [px, 0, 1.38], TEAM), {
      paint: 'team',
    });
    // Caked brine mud up the boots and shins, splashes on the knee guards; salt dust on the
    // shoulders, helmet and pack tops (after weathering, so nothing paints over them).
    kit.post(
      (n) => /^(boot|shin|greave)_/.test(n),
      (m) =>
        // Pale dried mud to mid-shin, wet and dark at the soles.
        band(
          band(m, { top: 0.52, full: 0.12, color: CAKED, k: 0.9 }, 0.06),
          { top: 0.12, full: 0.02, color: MUD, k: 0.75 },
          0.02,
        ),
    );
    kit.post(
      (n) => /^(torso|helmet|helmet_trim|pack|chest_plates|webbing)$/.test(n),
      (m) => topDust(m, 1.2, DUST, 0.55),
    );
    // Grime where he goes prone: brine mud smeared up the belly plates and the pack's foot.
    kit.post(
      (n) => /^(torso|chest_plates|pack)$/.test(n),
      (m) => band(m, { top: 1.42, full: 1.12, color: MUD, k: 0.5 }, 0.08),
    );
    // Measured wear on everything but skin, lenses and team plates: chipped ceramic edges,
    // salt dust on the tops, brine mud up the boots.
    const bare = new Set(['head', 'neck', 'visor', 'rifle_cell']);
    const hard = /^(boot|helmet|torso|chest_plates|greave|elbow|gauntlet|rifle$|pack$)/;
    // A line trooper back from the salt marsh: brine mud to mid-shin, chipped and scuffed knee
    // guards and gauntlets (where he kneels and grips), salt dust on the shoulders.
    const unit = wearOf('unit', 'warden', 41);
    const cloth = wearOf('cloth', 'warden_kit', 42);
    kit.commit(ctx, [
      {
        // Team plates (wear slot): pauldron rims and the crest knocked to bare steel where they
        // hit doors and rifles, salt dust on the tops; kept in every livery.
        painted: true,
        // Near only: on LOD1's coarse plates the chips' cut borders cost more triangles than
        // the mid-distance view can show.
        wear: teamWearOf('warden_team', 43, [0.12, 0, 0], { chips: 0.4, dust: 0.3 }),
        pick: (n) => lod === 0 && /^(pauldron_[lr]|pack_flap)$/.test(n),
      },
      {
        // The crest and chest stripe are the team read: a few chips, no dust.
        painted: true,
        wear: teamWearOf('warden_crest', 44, [0, 0, 0], { chips: 0.15, dust: 0 }),
        pick: (n) => lod < 2 && /^(crest|chest_stripe)$/.test(n),
      },
      {
        wear: {
          ...unit,
          groundBand: 0.5,
          ...(lod < 2 ? { touched: ['greave_*', 'gauntlet_*', 'elbow_*'] } : {}),
          effects: {
            ...unit.effects,
            chips: { where: 'convex-edges', amount: 0.15, strength: 0.8 },
            ...(lod < 2
              ? { scratches: { where: 'touched', amount: 0.3, color: MUD, strength: 0.7 } }
              : {}),
            mud: { where: 'ground-near', amount: 0.7, color: MUD, strength: 0.95 },
          },
        },
        pick: (n) => hard.test(n),
      },
      {
        wear: {
          ...cloth,
          groundBand: 0.6,
          effects: {
            ...cloth.effects,
            mud: { where: 'ground-near', amount: 0.7, color: MUD, strength: 0.75 },
          },
        },
        pick: (n) => !bare.has(n),
      },
    ]);
  },
});
