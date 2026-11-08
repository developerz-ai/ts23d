// Saltmarch "Brinehound" light tank (ORIGINAL design, see README.md and ../rts_faction/README.md).
// Shape language: a low pebble hull with a forward chevron prow plate, a chevron-nosed turret
// whose roof is one big team-colour plate (the RTS camera's read), a stubby gun with a brass
// muzzle brake and an amber sensor lens. Engine contract: `turret` spins about Z, `gun` sways in
// elevation, `wheel_*` / `idler_*` / `sprocket_*` spin about Y; emitters muzzle (event),
// exhaust_l/_r (moving), dust_l/_r (moving); commander seat socket on the hatch.

import {
  type BuildContext,
  box,
  cylinder,
  defineAsset,
  type Lod,
  loft,
  type Mesh,
  merge,
  place,
  prism,
  symmetric,
  type Vec2,
  type Vec3,
} from '@developerz.ai/ts23d';
import { Kit, MUD, type Rule, restrip, role, SOOT_STAIN, wearOf } from '../_lib/rts/finish.ts';
import {
  BONE,
  BONE_DARK,
  BRASS,
  chevron,
  chevronPlan,
  dome,
  GLOW,
  IRON,
  pebble,
  RUBBER,
  SEG,
  SLATE,
  TEAM,
  TEAM_PAINT,
  TEAM_VARIANTS,
  teamShade,
  tube,
} from '../_lib/rts/style.ts';
import { hullDressing } from './dressing.ts';
import { type Add, runningGear, TRACK_W, TRACK_Y } from './running.ts';

const DECK = 1.42; // hull roof height
const TURRET_X = -0.25;
const TURRET_TOP = 2.08;
/** Turret plan scale. */
const K = 1.12;
const GUN_Z = 1.7;
/** Ash tool shafts (dressing.ts). */
const SHAFT: Vec3 = [0.3, 0.2, 0.1];

/** Materials: painted steel (bone, slate, team) whose chips show bare metal, cast-iron fittings,
 *  brass, rubber tyres, ash shafts; the track links keep their own rusted-iron strip. */
const RULES: readonly Rule[] = [
  role(BONE, 'steel_painted'),
  role(BONE_DARK, 'steel_painted'),
  role(SLATE, 'steel_painted'),
  role(TEAM, 'steel_painted'),
  role(teamShade(0.95), 'steel_painted'),
  role(IRON, 'iron_cast'),
  role(BRASS, 'brass'),
  role(RUBBER, 'rubber'),
  role(SHAFT, 'oak'),
];
/** Running gear: cast road-wheel discs, rubber tyres, brass hubs. */
const GEAR_RULES: readonly Rule[] = [
  role(SLATE, 'iron_cast'),
  role(IRON, 'iron_cast'),
  role(BRASS, 'brass'),
  role(RUBBER, 'rubber'),
];
const GEAR = /^(wheel|idler|sprocket)_/;

/** Plan outline of the turret: chevron nose forward (+X), squared bustle behind. */
const TURRET_PLAN: readonly Vec2[] = [
  [1.25, 0],
  [0.55, 0.92],
  [-0.95, 0.92],
  [-1.2, 0.62],
  [-1.2, -0.62],
  [-0.95, -0.92],
  [0.55, -0.92],
];

function hull(add: Add, lod: Lod): void {
  // Upper hull over the tracks: chevron glacis, flat deck, sloped rear plate.
  const upper = prism({
    profile: [
      [2.62, 0.93],
      [1.55, DECK],
      [-2.3, DECK],
      [-2.62, 1.12],
      [-2.62, 0.93],
    ],
    depth: (TRACK_Y + TRACK_W / 2 + 0.03) * 2,
    plane: 'xz',
    color: BONE,
  });
  // Lower hull between the tracks.
  const lower = prism({
    profile: [
      [2.42, 0.42],
      [2.62, 0.95],
      [-2.62, 0.95],
      [-2.5, 0.42],
    ],
    depth: 1.95,
    plane: 'xz',
    color: SLATE,
  });
  add('hull', merge([upper, lower]));
  add('hull_dress', hullDressing(lod, DECK));
  // Chevron prow plate across the glacis foot (plan V, pointing forward).
  const prow = prism({
    profile: [
      [2.85, 0],
      [2.4, 0.95],
      [2.15, 0.95],
      [2.55, 0],
      [2.15, -0.95],
      [2.4, -0.95],
    ],
    depth: 0.32,
    plane: 'xy',
    centred: false,
    color: BONE_DARK,
  });
  add('prow', place(prow, { at: [0, 0, 0.66] }));
  // Engine deck: one big team panel behind the turret (outside its swept circle).
  // Team marks sit 8 mm proud of the deck: under the turret's swept circle, never z-fighting.
  add('deck_panel', pebble(lod, [0.7, 1.9, 0.05], [-1.88, 0, DECK - 0.042], TEAM), {
    paint: 'team',
  });
  // Fender chevrons: team stripes on the front fender tops (top-visible).
  for (const [s, y] of [
    ['l', TRACK_Y],
    ['r', -TRACK_Y],
  ] as const)
    add(
      `fender_mark_${s}`,
      chevronPlan([1.0, y, DECK - 0.042], 0.7, TRACK_W * 0.9, 0.22, 0.05, teamShade(0.95)),
      { paint: 'team' },
    );
  if (lod === 2) return;
  const detail: Mesh[] = [];
  // Engine grille slats, stowage bins on the fenders, tow hooks, headlamps.
  for (let i = 0; i < (lod === 0 ? 7 : 3); i++)
    detail.push(
      box({
        size: [0.05, 1.5, 0.03],
        at: [-1.3 + i * (lod === 0 ? 0.065 : 0.15), 0, DECK - 0.022],
        color: IRON,
      }),
    );
  for (const s of [1, -1]) {
    // Stowage bins on the rear plate, below the deck line (the gun sweeps over the deck).
    detail.push(pebble(lod, [0.2, 0.5, 0.24], [-2.62, s * 1.0, 1.05], SLATE));
    detail.push(
      box({
        size: [0.14, 0.08, 0.16],
        at: [2.48, s * 0.7, 0.62],
        color: IRON,
        bevel: lod === 0 ? 0.02 : 0,
      }),
    );
  }
  add('hull_kit', merge(detail));
  const lamp = cylinder({
    radius: 0.07,
    length: 0.08,
    segments: SEG(lod, 14, 8, 4),
    axis: 'x',
    color: GLOW,
  });
  add(
    'headlamps',
    merge([place(lamp, { at: [2.1, 0.75, 1.24] }), place(lamp, { at: [2.1, -0.75, 1.24] })]),
  );
  // Exhaust stacks at the rear plate.
  add(
    'exhausts',
    merge([-0.5, 0.5].map((y) => tube(lod, [-2.66, y, 1.0], [-2.66, y, 1.3], 0.06, 0.06, IRON))),
  );
}

function turret(ctx: BuildContext, add: Add): void {
  const lod = ctx.lod;
  ctx.group('turret', {
    at: [TURRET_X, 0, DECK + 0.005],
    motion: { kind: 'spin', axis: [0, 0, 1], rps: 0.05 },
  });
  const ring = (k: number, z: number): Vec3[] =>
    TURRET_PLAN.map(([x, y]): Vec3 => [x * k * K, y * k * K, z]);
  const top = TURRET_TOP - DECK - 0.005;
  const body = loft({
    rings: [ring(1, 0), ring(1, top * 0.45), ring(0.8, top)],
    color: BONE,
    capStart: true,
    capEnd: true,
    uv: 'row',
  });
  add('turret_body', body, { parent: 'turret' });
  // The roof: one team plate, inset from the edge.
  add(
    'turret_roof',
    prism({
      profile: TURRET_PLAN.map(([x, y]): Vec2 => [x * 0.74 * K, y * 0.74 * K]),
      depth: 0.05,
      plane: 'xy',
      centred: false,
      color: TEAM,
    }),
    {
      parent: 'turret',
      at: [0, 0, top - 0.01],
      paint: 'team',
    },
  );
  // Rear crest fin (the faction chevron) and commander hatch.
  add('turret_fin', chevron([-0.75, 0, top + 0.03], 0.7, 0.28, 0.08, BONE_DARK), {
    parent: 'turret',
  });
  const hatch: Mesh[] = [dome(lod, [-0.2, 0.42, top + 0.035], [0.28, 0.28, 0.12], SLATE)];
  if (lod < 2)
    hatch.push(tube(lod, [-0.2, 0.42, top + 0.03], [-0.2, 0.42, top + 0.07], 0.3, 0.3, BRASS));
  add('hatch', merge(hatch), { parent: 'turret' });
  ctx.socket('commander', { kind: 'seat', parent: 'turret', at: [-0.2, 0.42, top + 0.15] });
  // Sensor lens on the left cheek (amber glow) and an antenna.
  if (lod < 2) {
    add(
      'sensor',
      merge([
        pebble(lod, [0.26, 0.17, 0.2], [0.2, -0.995 * K, 0.08], SLATE),
        cylinder({
          radius: 0.06,
          length: 0.05,
          segments: SEG(lod, 14, 8, 4),
          axis: 'x',
          at: [0.345, -0.995 * K, 0.18],
          color: GLOW,
        }),
      ]),
      { parent: 'turret' },
    );
    add(
      'antenna',
      tube(lod, [-0.9, -0.6, top - 0.02], [-0.95, -0.6, top + 1.1], 0.015, 0.008, IRON),
      { parent: 'turret' },
    );
  }
  // Gun: trunnion at the turret face, mantlet + barrel + brass muzzle brake, elevation sway.
  const gz = GUN_Z - DECK;
  // The trunnion sits 1.5 cm ahead of the turret's chevron nose: the round mantlet seats on the
  // nose edge and its ±4° elevation sway clears the turret (no clearOf, so it survives ctx.use).
  const nose = TURRET_PLAN[0]?.[0] ?? 1.25;
  ctx.group('gun', {
    parent: 'turret',
    at: [nose * K + 0.015, 0, gz],
    motion: { kind: 'sway', axis: [0, 1, 0], degrees: 4, hz: 0.2 },
  });
  const gun: Mesh[] = [
    cylinder({
      radius: 0.26,
      length: 0.34,
      segments: SEG(lod, 20, 10, 6),
      axis: 'x',
      at: [0.17, 0, 0],
      color: BONE_DARK,
    }),
    tube(lod, [0.3, 0, 0], [2.0, 0, 0], 0.085, 0.07, SLATE),
  ];
  if (lod < 2) {
    gun.push(tube(lod, [1.95, 0, 0], [2.25, 0, 0], 0.11, 0.11, BRASS));
    for (const x of [2.06, 2.16])
      gun.push(box({ size: [0.04, 0.26, 0.06], at: [x, 0, -0.03], color: IRON }));
  }
  if (lod === 0) gun.push(tube(lod, [0.8, 0, 0], [1.2, 0, 0], 0.1, 0.1, IRON));
  // The gun is pinned on its trunnion axis (the elevation sway): a line contact by design.
  add('gun_barrel', merge(gun), { parent: 'gun', connect: { as: 'hinge', to: 'turret_body' } });
  ctx.emitter('muzzle', {
    kind: 'muzzle',
    parent: 'gun',
    at: [2.28, 0, 0],
    dir: [1, 0, 0],
    rate: 200,
    life: 0.1,
    size: [0.3, 0.9],
    color: [1, 0.72, 0.3],
    speed: 6,
    spreadDeg: 15,
    when: 'event',
  });
}

export const rts_tank = defineAsset({
  name: 'rts_tank',
  kind: 'vehicle',
  description:
    'Saltmarch Brinehound: original RTS light tank. Pebble hull with a chevron prow, team-colour turret roof and deck, spinning turret, wheels and sprocket, link-by-link tracks; 8 team liveries.',
  tags: ['rts', 'saltmarch', 'vehicle', 'tank', 'team-colour'],
  // Design envelope from the faction brief (a light tank in the 15–20 t class: invented, not a copy).
  real: {
    length: 6.13,
    width: 3.05,
    height: 3.2,
    measures: [
      {
        label: 'road wheel diameter',
        value: 0.6,
        axis: 'z',
        parts: ['wheel_l_0'],
        source: 'recipes/rts_faction/README.md',
      },
    ],
  },
  sources: [
    'recipes/rts_faction/README.md (original design brief)',
    'docs/playbooks/vehicles/afv.md (light-tank ranges)',
  ],
  // LOD0/1 measured 36.3k / 9.0k: hull dressing plus weather() tessellation (22 / 60 cm) so chips,
  // dust, mud and soot have vertices. LOD2 stays at the crowd budget.
  budget: { triangles: [38000, 9500, 600] },
  paint: TEAM_PAINT,
  variants: TEAM_VARIANTS,
  glow: [{ parts: ['headlamps', 'sensor'], color: GLOW, strength: 3 }],
  // Measured: the pebble hull's rounded taper reads 'friendly'; hull + gun hold the contrast.
  art: { focal: ['hull', 'gun_barrel', 'turret'], shape: 'friendly' },
  checks: [symmetric('wheel_l_', 'wheel_r_', 'y')],
  gaps: [
    { parts: ['hull', 'track_*'], why: 'running clearance: the tracks run under the fenders' },
  ],
  build(ctx) {
    const lod = ctx.lod;
    const kit = new Kit();
    const add: Add = (name, m, opts) =>
      kit.add(name, m && restrip(m, GEAR.test(name) ? GEAR_RULES : RULES), opts);
    hull(add, lod);
    runningGear(add, lod);
    turret(ctx, add);
    for (const [s, y] of [
      ['l', 0.5],
      ['r', -0.5],
    ] as const) {
      ctx.emitter(`exhaust_${s}`, {
        kind: 'smoke',
        at: [-2.66, y, 1.32],
        dir: [0, 0, 1],
        rate: 14,
        life: 1.8,
        size: [0.15, 0.9],
        when: 'moving',
      });
      ctx.emitter(`dust_${s}`, {
        kind: 'dust',
        at: [-2.5, y * 2.45, 0.05],
        dir: [-1, 0, 0.3],
        rate: 25,
        life: 1.2,
        size: [0.3, 1.4],
        when: 'moving',
      });
    }
    // Measured wear, one weather() per space: the hull and tracks (chips on plate edges, salt dust
    // on the deck, brine mud up the tracks and lower hull, soot streaking down from the exhausts),
    // the wheels in their own pivots (mud), the turret and the gun (chips and dust, no mud).
    const exhaust = [0.5, -0.5].map((y) => ({ at: [-2.66, y, 1.3] as Vec3, radius: 0.16 }));
    const hullWear = wearOf('vehicle', 'brinehound_hull', 61);
    kit.commit(ctx, [
      {
        wear: {
          ...hullWear,
          ground: 0,
          fasteners: exhaust,
          effects: { ...hullWear.effects, ...(lod < 2 ? { rust: SOOT_STAIN } : {}) },
        },
        pick: (n) => /^(hull|prow|exhausts)$/.test(n),
      },
      {
        // Small parts already carry the vertices wear needs: no extra tessellation.
        wear: { ...wearOf('vehicle', 'brinehound_kit', 65), ground: 0, resolution: [0, 0, 0] },
        pick: (n) => /^(hull_kit|hull_dress|track_)/.test(n),
      },
      {
        wear: {
          name: 'brinehound_wheels',
          seed: 62,
          resolution: [0, 0, 0],
          groundBand: 0.22,
          effects: { mud: { where: 'ground-near', amount: 0.4, color: MUD, strength: 0.75 } },
        },
        pick: (n) => GEAR.test(n),
      },
      {
        // Round, smooth-shaded shells: chips on their own corners only, or they ring the turret.
        wear: { ...wearOf('vehicle', 'brinehound_turret', 63, false), resolution: [0, 0, 0] },
        pick: (n) => /^(turret_body|turret_fin|hatch|sensor|antenna|gun_barrel)$/.test(n),
      },
    ]);
  },
});
