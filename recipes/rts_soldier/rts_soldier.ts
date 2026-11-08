// Saltmarch Warden — the Accord's line infantry (ORIGINAL design, see README.md and
// ../rts_faction/README.md). Chunky RTS proportions on the shared figure: bone ceramic armour, a
// domed helmet with a forward chevron crest and an amber visor slit, team-colour pauldrons,
// crest, chest stripe and pack flap (the top view reads team colour), and the "sunlance" carbine
// on the right-hand socket with a grip joint QA proves the fist closes round. Muzzle-flash
// emitter at the barrel tip. LOD2 ≈ 350 triangles for crowds.

import {
  box,
  cylinder,
  defineAsset,
  type Lod,
  type Mesh,
  merge,
  type PartOptions,
  place,
  symmetric,
  type Vec3,
} from '@developerz.ai/ts23d';
import { figure } from '../_lib/rts/figure.ts';
import { Kit, type Rule, restrip, role, wearOf } from '../_lib/rts/finish.ts';
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
  TEAM_PAINT,
  TEAM_VARIANTS,
  teamShade,
  tube,
} from '../_lib/rts/style.ts';

const HANDLE_R = 0.019;

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

/** The sunlance carbine, local frame: grip axis +Z through the origin, muzzle toward +X. */
export function carbine(lod: Lod): { body: Mesh; grip: Mesh; cell: Mesh | null; muzzle: Vec3 } {
  const body: Mesh[] = [
    // Receiver above the grip, barrel shroud forward.
    pebble(lod, [0.42, 0.07, 0.1], [0.08, 0, 0.07], IRON),
    tube(lod, [0.28, 0, 0.12], [0.62, 0, 0.12], 0.032, 0.028, SLATE),
  ];
  if (lod < 2) {
    body.push(
      // Stock back to the hip, barrel, brass muzzle collar, front sight, magazine.
      pebble(lod, [0.2, 0.055, 0.12], [-0.2, 0, 0.03], SLATE),
      tube(lod, [0.6, 0, 0.12], [0.72, 0, 0.12], 0.016, 0.016, IRON),
      tube(lod, [0.7, 0, 0.12], [0.74, 0, 0.12], 0.022, 0.022, BRASS),
      box({ size: [0.03, 0.012, 0.05], at: [0.55, 0, 0.145], color: BRASS }),
      pebble(lod, [0.08, 0.05, 0.12], [0.16, 0, -0.04], SLATE),
    );
  }
  if (lod === 0)
    // Cooling rings on the shroud, a sight rail on the receiver.
    for (let i = 0; i < 5; i++)
      body.push(
        tube(lod, [0.32 + i * 0.06, 0, 0.12], [0.335 + i * 0.06, 0, 0.12], 0.036, 0.036, IRON),
      );
  if (lod === 0) body.push(box({ size: [0.2, 0.02, 0.025], at: [0.06, 0, 0.17], color: IRON }));
  const grip = cylinder({
    radius: HANDLE_R,
    length: 0.17,
    segments: lod === 2 ? 4 : 12,
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
  return { body: merge(body), grip, cell, muzzle: [0.74, 0, 0.12] };
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
    dome(lod, [head[0] - 0.01, 0, rim], [headR[0] + 0.04, headR[1] + 0.04, headR[2] - 0.005], BONE),
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
    const guard = ellipsoid(
      lod,
      [head[0] - 0.015, headR[1], rim - 0.03],
      [0.07, 0.03, 0.07],
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
  add('crest', chevron([head[0] - 0.02, 0, rim + headR[2] - 0.02], 0.3, 0.1, 0.035, TEAM), {
    paint: 'team',
  });
}

/** Pauldrons, chest plates, belt, knee and shin guards, elbow pads. */
function armour(add: Add, lod: Lod, shoulder: Vec3): void {
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
    ellipsoid(lod, [0.07, 0.13, 0.5], [0.05, 0.075, 0.08], BONE),
    pebble(lod, [0.05, 0.1, 0.24], [0.07, 0.13, 0.2], BONE_DARK),
  ]);
  add('greave_l', knee);
  add('greave_r', mirrorY(knee));
  const elbow = ellipsoid(lod, [-0.06, 0.31, 1.12], [0.05, 0.06, 0.06], BONE);
  add('elbow_l', elbow);
  add('elbow_r', mirrorY(elbow));
}

export const rts_soldier = defineAsset({
  name: 'rts_soldier',
  kind: 'character',
  description:
    'Saltmarch Warden: original RTS line infantry. Bone ceramic armour, team-colour pauldrons and crest, amber visor, sunlance carbine on the hand socket; 8 team liveries.',
  tags: ['rts', 'saltmarch', 'infantry', 'character', 'team-colour'],
  // Design envelope from the faction brief (an invented unit: the brief is the source).
  real: { length: 1.36, width: 0.82, height: 1.95 },
  sources: [
    'recipes/rts_faction/README.md (original design brief: proportions, shape language, palette)',
  ],
  // LOD0 measured 12.7k: weather() splits edges past 16 cm so chips, dust and mud have vertices.
  budget: { triangles: [14000, 3000, 380] },
  paint: TEAM_PAINT,
  variants: TEAM_VARIANTS,
  glow: [{ parts: ['visor', 'rifle_cell'], color: GLOW, strength: 3 }],
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
      right: 'hold',
      handleR: HANDLE_R,
    });
    helmet(add, lod, pts.head, pts.headR);
    armour(add, lod, pts.shoulder);
    // The carbine rides the right-hand socket: grip centre at the fist, muzzle forward.
    ctx.socket('hand_r_socket', {
      kind: 'mount',
      at: pts.grip,
      dir: [1, 0, 0],
      data: { weapon: 'sunlance' },
    });
    const gun = carbine(lod);
    const at = pts.grip;
    add('rifle_grip', place(gun.grip, { at }));
    add('rifle', place(gun.body, { at }));
    if (gun.cell) add('rifle_cell', place(gun.cell, { at }));
    ctx.joint('grip_r', { from: 'hand_r', to: 'rifle_grip', at, axis: [0, 0, 1], kind: 'grip' });
    const m = gun.muzzle;
    ctx.emitter('muzzle', {
      kind: 'muzzle',
      at: [at[0] + m[0], at[1] + m[1], at[2] + m[2]],
      dir: [1, 0, 0],
      rate: 120,
      life: 0.08,
      size: [0.08, 0.25],
      color: [1, 0.75, 0.35],
      speed: 2,
      spreadDeg: 12,
      when: 'event',
    });
    // Back: a power pack with vents and a whip antenna; team flap on top (top-visible).
    const pack: Mesh[] = [pebble(lod, [0.14, 0.3, 0.34], [-0.24, 0, 1.06], SLATE)];
    if (lod < 2) pack.push(tube(lod, [-0.3, 0.1, 1.38], [-0.32, 0.1, 1.95], 0.008, 0.005, IRON));
    if (lod === 0)
      for (let i = 0; i < 4; i++)
        pack.push(box({ size: [0.03, 0.22, 0.02], at: [-0.31, 0, 1.12 + i * 0.05], color: IRON }));
    add('pack', merge(pack));
    add('pack_flap', pebble(lod, [0.17, 0.33, 0.06], [-0.24, 0, 1.38], TEAM), {
      paint: 'team',
    });
    // Measured wear on everything but skin, lenses and team plates: chipped ceramic edges,
    // salt dust on the tops, brine mud up the boots.
    const bare = new Set(['head', 'neck', 'visor', 'rifle_cell']);
    const hard = /^(boot|helmet|torso|chest_plates|greave|elbow|rifle$|pack$)/;
    kit.commit(ctx, [
      { wear: wearOf('unit', 'warden', 41), pick: (n) => hard.test(n) },
      { wear: wearOf('cloth', 'warden_kit', 42), pick: (n) => !bare.has(n) },
    ]);
  },
});
