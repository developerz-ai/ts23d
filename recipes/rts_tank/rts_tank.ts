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
  valueNoise,
  weather,
} from '@developerz.ai/ts23d';
import { tessellate } from '../_lib/finish/finish.ts';
import { Kit, type Rule, restrip, role, SOOT_STAIN, wearOf } from '../_lib/rts/finish.ts';
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
  SOOT,
  TEAM,
  TEAM_PAINT,
  TEAM_VARIANTS,
  teamShade,
  tube,
} from '../_lib/rts/style.ts';
import { paintOn, smooth, tint, unitNoise, wheelMud } from '../t34/field.ts';
import { hullDressing, turretBolts } from './dressing.ts';
import { type Add, IDLER, ROAD_R, runningGear, SPROCKET, TRACK_W, TRACK_Y } from './running.ts';

const DECK = 1.42; // hull roof height
const TURRET_X = -0.25;
const TURRET_TOP = 2.2;
/** Turret plan scale (RTS exaggeration: the turret is the unit's read from the strategy camera). */
const K = 1.23;
const GUN_Z = 1.78;
/** Ash tool shafts (dressing.ts). */
const SHAFT: Vec3 = [0.3, 0.2, 0.1];

/** Brine mud, half dried: darker than the bone paint, lighter and warmer than the slate. */
const MUD: Vec3 = [0.19, 0.145, 0.09];
/** Salt crust on the dark track links. */
const CRUST: Vec3 = [0.8, 0.72, 0.56];
/** The hull paints: bone and slate go onto the matte armour-paint strip at true scale (`paintOn`:
 *  a few flakes; the edge chips are `weather()`'s). The library's `steel_painted` chips a fifth
 *  of the film in dashes that read as wood grain on a big pale plate. */
const PAINTS: readonly Vec3[] = [BONE, BONE_DARK, SLATE];
/** Materials: team plates on painted steel (their strip carries the chips, they are never
 *  weathered), cast-iron fittings, brass, rubber, ash shafts; the track links keep their own
 *  rusted-iron strip. */
const RULES: readonly Rule[] = [
  role(TEAM, 'steel_painted'),
  role(teamShade(0.95), 'steel_painted'),
  role(IRON, 'iron_cast'),
  role(BRASS, 'brass'),
  role(RUBBER, 'rubber'),
  role(SHAFT, 'oak'),
];
/** Running gear: slate-painted road-wheel discs (on the paint strip, so mud shows on them), cast
 *  sprocket teeth, brass hubs; tyres on a rough greyscale strip (`rubber` is near black: no mud
 *  would show). */
const GEAR_RULES: readonly Rule[] = [
  role(IRON, 'iron_cast'),
  role(BRASS, 'brass'),
  { from: RUBBER, strip: 'concrete', color: [0.03, 0.03, 0.028] },
];
const GEAR = /^(wheel|idler|sprocket)_/;
/** The running belts: their links arrive finished (materials and wear per link, `wornLink`). */
const BELT = /^track_[lr]$/;

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
  // Side skirts: three plates a side hung from the hull edge over the track's top run, a hand's
  // gap between them, the front one cut back. They break the long slab of the side profile.
  // Far: one strip a side (its outer face and ends: 6 triangles).
  const skirts: Mesh[] = [];
  const sy = TRACK_Y + TRACK_W / 2 + 0.03;
  for (const s of [1, -1]) {
    if (lod === 2) {
      skirts.push(
        box({
          size: [3.84, 0.035, 0.33],
          at: [0, s * (sy + 0.0055), 0.62],
          color: BONE_DARK,
          omit: ['top', 'bottom', s > 0 ? 'right' : 'left'],
        }),
      );
      continue;
    }
    [-1.3, 0, 1.3].forEach((x, i) => {
      const plate = prism({
        profile: [
          [x - 0.62, 0.95],
          [x - 0.62, 0.62],
          [x + (i === 2 ? 0.3 : 0.62), 0.62],
          [x + 0.62, i === 2 ? 0.8 : 0.62],
          [x + 0.62, 0.95],
        ],
        depth: 0.035,
        plane: 'xz',
        centred: false,
        color: BONE_DARK,
      });
      skirts.push(place(plate, { at: [0, s > 0 ? sy - 0.012 : -sy - 0.023, 0] }));
      // Two hanger bolts a plate.
      if (lod === 0)
        for (const dx of [-0.4, 0.4])
          skirts.push(
            box({
              size: [0.05, 0.02, 0.05],
              at: [x + dx, s * (sy + 0.03), 0.86],
              color: IRON,
              bevel: 0.006,
            }),
          );
    });
  }
  add('skirts', merge(skirts));
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
  // Bolt heads round the roof plate's edge (LOD0): what holds the team plate down.
  const bolts = turretBolts(
    lod,
    TURRET_PLAN.map(([x, y]): Vec2 => [x * 0.77 * K, y * 0.77 * K]),
    top,
  );
  if (bolts) add('turret_bolts', bolts, { parent: 'turret' });
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
        pebble(lod, [0.26, 0.17, 0.2], [0.2, -(0.92 * K + 0.075), 0.08], SLATE),
        cylinder({
          radius: 0.06,
          length: 0.05,
          segments: SEG(lod, 14, 8, 4),
          axis: 'x',
          at: [0.345, -(0.92 * K + 0.075), 0.18],
          color: GLOW,
        }),
      ]),
      { parent: 'turret' },
    );
    add(
      'antenna',
      tube(lod, [-0.9, -0.6, top - 0.02], [-0.95, -0.6, top + 0.98], 0.015, 0.008, IRON),
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
    tube(lod, [0.3, 0, 0], [1.85, 0, 0], 0.085, 0.07, SLATE),
  ];
  if (lod < 2) {
    gun.push(tube(lod, [1.8, 0, 0], [2.1, 0, 0], 0.11, 0.11, BRASS));
    for (const x of [1.91, 2.01])
      gun.push(box({ size: [0.04, 0.26, 0.06], at: [x, 0, -0.03], color: IRON }));
  }
  if (lod === 0) gun.push(tube(lod, [0.8, 0, 0], [1.2, 0, 0], 0.1, 0.1, IRON));
  // The gun is pinned on its trunnion axis (the elevation sway): a line contact by design.
  add('gun_barrel', merge(gun), { parent: 'gun', connect: { as: 'hinge', to: 'turret_body' } });
  ctx.emitter('muzzle', {
    kind: 'muzzle',
    parent: 'gun',
    at: [2.13, 0, 0],
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
  // Saltmarch lamps glow at 1.2 across the RTS set: lit amber, not blown to white.
  glow: [{ parts: ['headlamps', 'sensor'], color: GLOW, strength: 1.2 }],
  // Measured: the pebble hull's rounded taper reads 'friendly'; hull + gun hold the contrast.
  art: { focal: ['hull', 'gun_barrel', 'turret'], shape: 'friendly' },
  checks: [symmetric('wheel_l_', 'wheel_r_', 'y')],
  gaps: [
    { parts: ['hull', 'track_*'], why: 'running clearance: the tracks run under the fenders' },
  ],
  build(ctx) {
    const lod = ctx.lod;
    const kit = new Kit();
    const grain = unitNoise(valueNoise(ctx.rng.fork('grime'), { scale: 0.3, octaves: 3 }));
    const fine = unitNoise(valueNoise(ctx.rng.fork('mud'), { scale: 0.09, octaves: 2 }));
    /** Radius of a running-gear part, for its radial mud. */
    const gearR = (name: string): number =>
      name.startsWith('wheel') ? ROAD_R : name.startsWith('idler') ? IDLER.r : SPROCKET.r;
    /** Exhaust soot on the hull: a plume over each stack onto the rear deck, and a streak down
     *  the rear plate under it. The hull is cut to 25 / 60 cm first, so the stain has vertices. */
    const sooted = (m: Mesh): Mesh =>
      [0.5, -0.5].reduce(
        (acc, y) =>
          tint(acc, SOOT, (p) => {
            const d = Math.hypot((p[0] + 2.5) * 0.9, p[1] - y, (p[2] - 1.38) * 1.6) / 0.62;
            const plume = d < 1 ? 0.9 * (1 - smooth(0.2, 1, d + 0.3 * (grain(p) - 0.5))) : 0;
            const run =
              p[0] < -2.55 && p[2] < 1.2
                ? 0.75 * (1 - smooth(0.05, 0.2, Math.abs(p[1] - y))) * smooth(0.4, 1.1, p[2])
                : 0;
            return Math.max(plume, run * (0.6 + 0.4 * fine(p)));
          }),
        m,
      );
    const dress = (name: string, m: Mesh): Mesh => {
      if (BELT.test(name)) return m;
      if (GEAR.test(name))
        // Wheels spin: mud packed round the rim and into the dish, the same all the way round.
        return wheelMud(
          paintOn(tessellate(restrip(m, GEAR_RULES), 10), [SLATE]),
          gearR(name),
          fine,
          lod === 2 ? 0.45 : 0.85,
          MUD,
        );
      const painted = paintOn(
        tessellate(restrip(m, RULES), name === 'hull' ? ([0.25, 0.6, 10][lod] ?? 10) : 10),
        PAINTS,
      );
      return name === 'hull' ? sooted(painted) : painted;
    };
    const add: Add = (name, m, opts) => kit.add(name, m && dress(name, m), opts);
    // One track link, worn in its own space (chipped edges, brine mud over half of it; no dust:
    // no face of a running link stays up). Every link of both belts is this one, so the belt
    // looks the same one pitch on and the run clip wraps unseen.
    const wornLink = (link: Mesh): Mesh =>
      weather(restrip(link, RULES), {
        name: 'brinehound_track',
        seed: 66,
        age: 0.6,
        lod,
        resolution: [0, 0, 0],
        groundBand: 0.9,
        effects: {
          chips: { where: 'convex-edges', amount: 0.13, strength: 0.75 },
          mud: { where: 'ground-near', amount: 0.55, color: CRUST, strength: 0.75 },
        },
      }).mesh;
    hull(add, lod);
    runningGear(add, lod, wornLink);
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
    // Measured wear, one weather() per space: the hull (chips on plate edges, salt dust on the
    // deck, brine mud up the lower hull, soot streaking down from the exhausts; the track links
    // carry their own, see `wornLink`),
    // the wheels in their own pivots (mud), the turret and the gun (chips and dust, no mud).
    const exhaust = [0.5, -0.5].map((y) => ({ at: [-2.66, y, 1.3] as Vec3, radius: 0.16 }));
    const hullWear = wearOf('vehicle', 'brinehound_hull', 61);
    const kitWear = wearOf('vehicle', 'brinehound_kit', 65);
    // Heavier than the faction preset: brine mud up the lower hull and the skirts (four fifths
    // of the 1.1 m splash band), salt dust on the deck.
    const mud = {
      // Not the belly: nobody sees it, and it would take the lowest (first-covered) share.
      where: 'ground-near & !down-facing',
      amount: 0.8,
      color: MUD,
      strength: 0.85,
    } as const;
    kit.commit(ctx, [
      {
        wear: {
          ...hullWear,
          ground: 0,
          groundBand: 1.1,
          fasteners: exhaust,
          effects: { ...hullWear.effects, mud, ...(lod < 2 ? { rust: SOOT_STAIN } : {}) },
        },
        // Far: the one skirt strip wears with the hull (alone it has no top face for the dust).
        pick: (n) => /^(hull|prow|exhausts)$/.test(n) || (lod === 2 && n === 'skirts'),
      },
      {
        // Small parts already carry the vertices wear needs: no extra tessellation.
        wear: {
          ...kitWear,
          ground: 0,
          groundBand: 1.1,
          resolution: [0, 0, 0],
          effects: { ...kitWear.effects, mud },
        },
        pick: (n) => /^(hull_kit|hull_dress|skirts)/.test(n) && !(lod === 2 && n === 'skirts'),
      },
      {
        // Round, smooth-shaded shells: chips on their own corners only, or they ring the turret.
        wear: { ...wearOf('vehicle', 'brinehound_turret', 63, false), resolution: [0, 0, 0] },
        pick: (n) =>
          /^(turret_body|turret_fin|turret_bolts|hatch|sensor|antenna|gun_barrel)$/.test(n),
      },
    ]);
  },
});
