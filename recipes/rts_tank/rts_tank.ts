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
  defineMaterial,
  dmath,
  type Lod,
  lathe,
  loft,
  type Mesh,
  merge,
  type PartOptions,
  place,
  planar,
  prism,
  symmetric,
  type Vec2,
  type Vec3,
  valueNoise,
  weather,
} from '@developerz.ai/ts23d';
import { fieldGrade, meanDishMud, wheelDirt } from '../_lib/finish/afv.ts';
import { paintOn, unitNoise } from '../_lib/finish/field.ts';
import { tessellate } from '../_lib/finish/finish.ts';
import {
  Kit,
  type Rule,
  restrip,
  role,
  SOOT_STAIN,
  teamWearOf,
  wearOf,
} from '../_lib/rts/finish.ts';
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
  TEAM_PAINT_WORN,
  TEAM_VARIANTS,
  teamShade,
  tube,
} from '../_lib/rts/style.ts';
import { hullDressing, turretBolts } from './dressing.ts';
import { STEEL_STRIP, STEEL_TINT } from './metal.ts';
import { type Add, runningGear, TRACK_W, TRACK_Y } from './running.ts';

const DECK = 1.42; // hull roof height
const TURRET_X = -0.25;
const TURRET_TOP = 2.2;
/** Turret plan scale (RTS exaggeration: the turret is the unit's read from the strategy camera). */
const K = 1.23;
const GUN_Z = 1.78;
/** Ash tool shafts (dressing.ts). */
const SHAFT: Vec3 = [0.3, 0.2, 0.1];

/** Brine mud: red-brown clay silt. Darker than the bone paint and a different hue, so the splash
 *  band reads as mud from the strategy camera (a half-dried tan vanished against the bone, and a
 *  neutral dark one read as shading once the film's sheen lit it). */
const MUD: Vec3 = [0.15, 0.062, 0.018];
/** The same mud still wet, low on the hull. */
const MUD_WET: Vec3 = [0.045, 0.02, 0.007];
/** Salt-flat dust on the deck: greyer and a value under the bone paint, so it shows on it. */
const DECK_DUST: Vec3 = [0.16, 0.135, 0.095];
/** The tyres' vertex colour on their strip (GEAR_RULES). */
const TYRE: Vec3 = [0.03, 0.03, 0.028];
/**
 * Bone and slate enamel on armour plate (vertex colour = the paint): a smooth matte film with the
 * odd flake and no rust runs. On a big pale plate the runs and dashes of `steel_painted` and of
 * the field tanks' `armour_paint` read as wood grain; wear here is laid by hand where it belongs
 * (mud from the ground up, dust on the deck, soot at the stacks).
 */
const ENAMEL = defineMaterial({
  id: 'brine_enamel',
  kind: 'metal',
  scaleMetres: 0.5,
  roughness: 0.5,
  metalness: 1,
  albedo: '#eeeeee',
  albedo2: '#5a5148',
  params: {
    paint: 1,
    paintRough: 0.42,
    chips: 0.015,
    cast: 0.2,
    streaks: 0,
    relief: 1,
    film: 0.0005,
    cavity: 0.5,
    cavityRough: 0.15,
    cavityRadius: 0.008,
  },
  description: 'Matte enamel on armour plate (vertex colour = paint): smooth film, the odd flake.',
  sources: ['https://physicallybased.info (iron, paint film roughness)'],
});
/** Salt crust on the dark track links. */
const CRUST: Vec3 = [0.8, 0.72, 0.56];
/** The hull paints: bone and slate go onto the enamel strip at true scale (`paintOn`). */
const PAINTS: readonly Vec3[] = [BONE, BONE_DARK, SLATE];
/** Materials: team plates on painted steel (their strip carries the chips, they are never
 *  weathered), cast-iron fittings, brass, rubber, ash shafts; the track links keep their own
 *  rusted-iron strip. */
const RULES: readonly Rule[] = [
  role(TEAM, 'steel_painted'),
  role(teamShade(0.95), 'steel_painted'),
  { from: IRON, strip: STEEL_STRIP, color: STEEL_TINT },
  role(BRASS, 'brass'),
  role(RUBBER, 'rubber'),
  role(SHAFT, 'oak'),
];
/** Running gear: slate-painted road-wheel discs (on the paint strip, so mud shows on them), cast
 *  sprocket teeth, brass hubs; tyres on a rough greyscale strip (`rubber` is near black: no mud
 *  would show). */
const GEAR_RULES: readonly Rule[] = [
  { from: IRON, strip: STEEL_STRIP, color: STEEL_TINT },
  role(BRASS, 'brass'),
  { from: RUBBER, strip: 'concrete', color: TYRE },
];
/** Running gear arrives finished: each wheel about its own axle (`wornWheel`), each belt link in
 *  its own space (`wornLink`). */
const FINISHED = /^(wheel|idler|sprocket|wheels|track)_/;
/** The big plates the mud's edge crosses. */
const SPLASHED = /^(skirts|prow)$/;
/** Parts in hull space that take the field dirt (mud from the ground, deck dust, stack soot). */
const HULL_SPACE = /^(hull|hull_dress|hull_kit|prow|skirts|exhausts|lamp_housings)$/;

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
  if (lod === 2) {
    // Far: the two headlamps stay as amber hexagons lying on the glacis (4 triangles each), so
    // the front keeps its two amber points from the strategy camera. Plain amber, not emissive:
    // they draw with the static body (a glowing part would cost every far unit a draw).
    const up: Vec3 = [-0.909, 0, 0.416];
    add(
      'lamps_far',
      merge(
        [0.75, -0.75].map((y) =>
          planar({
            points: Array.from({ length: 6 }, (_, i): Vec3 => {
              const a = (i / 6) * Math.PI * 2;
              const r = 0.09;
              return [
                2.082 + up[0] * dmath.sin(a) * r,
                y + dmath.cos(a) * r,
                1.181 + up[2] * dmath.sin(a) * r,
              ];
            }),
            color: GLOW,
          }),
        ),
      ),
    );
    return;
  }
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

  // Headlamps on the glacis: a slate bucket sunk into the plate, an iron bezel ring and, set back
  // inside it, a small domed amber lens (the only part that glows).
  const lampAt: readonly Vec3[] = [
    [2.08, 0.75, 1.25],
    [2.08, -0.75, 1.25],
  ];
  const bucket = lathe({
    profile: [
      [0, -0.1],
      [0.07, -0.1],
      [0.1, -0.04],
      [0.1, 0.05],
      [0.078, 0.05],
      [0.078, 0.02],
    ],
    segments: SEG(lod, 16, 8, 6),
    axis: 'x',
    color: SLATE,
  });
  const bezel = lathe({
    profile: [
      [0.074, 0.045],
      [0.106, 0.045],
      [0.106, 0.062],
      [0.074, 0.062],
    ],
    segments: SEG(lod, 16, 8, 6),
    axis: 'x',
    color: IRON,
  });
  const lens = lathe({
    profile: [
      [0.078, 0.02],
      [0.06, 0.04],
      [0.03, 0.05],
      [0, 0.052],
    ],
    segments: SEG(lod, 14, 8, 6),
    axis: 'x',
    color: GLOW,
  });
  add(
    'lamp_housings',
    merge(lampAt.flatMap((at) => [place(bucket, { at }), place(bezel, { at })])),
  );
  add('headlamps', merge(lampAt.map((at) => place(lens, { at }))));
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
    // The housing and its iron bezel are plain parts; only the domed lens glows.
    const sy = -(0.92 * K + 0.075);
    add(
      'sensor_housing',
      merge([
        pebble(lod, [0.26, 0.17, 0.2], [0.2, sy, 0.08], SLATE),
        lathe({
          profile: [
            [0.05, 0],
            [0.075, 0],
            [0.075, 0.02],
            [0.05, 0.02],
          ],
          segments: SEG(lod, 14, 8, 6),
          axis: 'x',
          at: [0.325, sy, 0.18],
          color: IRON,
        }),
      ]),
      { parent: 'turret' },
    );
    add(
      'sensor',
      lathe({
        profile: [
          [0.052, 0],
          [0.04, 0.018],
          [0, 0.026],
        ],
        segments: SEG(lod, 14, 8, 6),
        axis: 'x',
        at: [0.325, sy, 0.18],
        color: GLOW,
      }),
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
  // LOD0/1 measured 30.5k / 8.1k: hull dressing plus the 25 / 60 cm cut of the plates near the
  // ground, so chips, mud and soot have vertices, and the team plates cut for their wear. Trimmed
  // where the RTS camera never looks (D596, was 37.5k / 9.4k): 20-sided road wheels with bolts on
  // their outer face only, 10-sided at LOD1, the hull's wear cells at 32 cm. LOD2 (590) stays at
  // the crowd budget.
  budget: { triangles: [31000, 8200, 600] },
  paint: TEAM_PAINT_WORN,
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
    // Field dirt, graded: brine mud opaque at the ground and gone a little above the skirts
    // (over the rear plate at the tail), wet mud lowest, salt dust only on the deck and the
    // turret roof's rim, soot fanning from the two stacks over the rear plate and deck.
    const grade = fieldGrade(grain, fine, { earth: MUD, wet: MUD_WET, dust: DECK_DUST });
    // Soot fans from the two stacks: over the rear plate, up the rear deck to the team panel.
    const soot = [0.5, -0.5].map((y) => ({
      at: [-2.55, y, 1.3] as Vec3,
      radius: 1.15,
      strength: 1,
    }));
    const dress = (name: string, m: Mesh, opts?: PartOptions): Mesh => {
      if (FINISHED.test(name)) return m;
      const painted = paintOn(
        // The big plates near the ground are cut to 25 cm (the hull to 60 cm at LOD1 too), so
        // the mud's ragged upper edge and the soot have vertices to end on.
        tessellate(
          restrip(m, RULES),
          name === 'hull'
            ? ([0.25, 0.6, 10][lod] ?? 10)
            : SPLASHED.test(name) && lod === 0
              ? 0.25
              : 10,
        ),
        PAINTS,
        ENAMEL,
      );
      // The engine-deck team panel takes the stacks' soot (a darkening the slot keeps; full soot
      // is bare and stays black in every livery); lenses glow; other team plates stay clean here.
      if (name === 'deck_panel') return grade(painted, { soot });
      if (opts?.paint !== undefined || name === 'headlamps' || name === 'sensor') return painted;
      if (HULL_SPACE.test(name))
        return grade(painted, {
          // Far: the hull's only corners are at the fender line, so the band ends under them
          // (the skirt strip and the prow carry the mud, as up close) instead of browning the side.
          mud: lod === 2 ? 0.98 : 1.22,
          mudFade: 0.3,
          mudStrength: 0.95,
          dust: 0.5,
          soot,
        });
      // The turret rides high: dust on what faces the sky, no mud.
      if (opts?.parent === 'turret')
        return grade(painted, { at: [TURRET_X, 0, DECK + 0.005], dust: 0.5 });
      return painted;
    };
    const add: Add = (name, m, opts) => kit.add(name, m && dress(name, m, opts), opts);
    /** One wheel about its own axle: slate disc on the enamel, dark tyre, brine mud packed in
     *  the outer dish (the far disc takes that dish's mean as one flat block). */
    const wornWheel = (m: Mesh, r: number, far: boolean): Mesh =>
      wheelDirt(paintOn(tessellate(restrip(m, GEAR_RULES), 10), [SLATE], ENAMEL), {
        r,
        tyre: TYRE,
        earth: MUD,
        noise: fine,
        ...(far ? { flat: meanDishMud(0.78) } : {}),
      });
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
    runningGear(add, lod, wornLink, wornWheel);
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
    // Measured wear on top of the graded dirt, one weather() per space: sparse chips on plate
    // edges (the big bone plates stay clean of the dashes a heavier chip pass smears along the
    // tessellation) and the measured soot stain running down from the stacks.
    const exhaust = [0.5, -0.5].map((y) => ({ at: [-2.66, y, 1.3] as Vec3, radius: 0.16 }));
    const chips = { where: 'convex-edges', amount: 0.05, strength: 0.7 } as const;
    const base = (name: string, seed: number) => {
      const { effects: _, ...w } = wearOf('vehicle', name, seed, false);
      return w;
    };
    kit.commit(ctx, [
      {
        wear: {
          ...base('brinehound_hull', 61),
          // 32 cm cells: chips still land on every plate edge, 2.2k triangles under 22 cm (D596).
          resolution: [0.32, 0.6, 0],
          ground: 0,
          fasteners: exhaust,
          effects: { chips, ...(lod < 2 ? { rust: SOOT_STAIN } : {}) },
        },
        // Far: the one skirt strip wears with the hull.
        pick: (n) => /^(hull|prow|exhausts)$/.test(n) || (lod === 2 && n === 'skirts'),
      },
      {
        // Small parts already carry the vertices wear needs: no extra tessellation.
        wear: {
          ...base('brinehound_kit', 65),
          ground: 0,
          resolution: [0, 0, 0],
          effects: { chips },
        },
        pick: (n) =>
          /^(hull_kit|hull_dress|skirts|lamp_housings)/.test(n) && !(lod === 2 && n === 'skirts'),
      },
      {
        // Round, smooth-shaded shells: chips on their own corners only, or they ring the turret.
        wear: { ...base('brinehound_turret', 63), resolution: [0, 0, 0], effects: { chips } },
        pick: (n) =>
          /^(turret_body|turret_fin|turret_bolts|hatch|sensor_housing|antenna|gun_barrel)$/.test(n),
      },
      {
        // Team plates (wear slot): chips to bare steel round their edges and salt dust on top,
        // which keep their own colour in every livery while the red recolours.
        painted: true,
        wear: { ...teamWearOf('brinehound_team', 67, [0.18, 1.2, 0]), ground: 0 },
        pick: (n) => lod < 2 && /^(deck_panel|turret_roof)$/.test(n),
      },
    ]);
  },
});
