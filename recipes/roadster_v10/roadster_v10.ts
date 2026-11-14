// Roadster V10 — an original front-mid-engine V10 two-seat roadster: 4.46 × 1.94 × 1.235 m,
// 2.51 m wheelbase, 295/30 ZR18 + 355/30 ZR19 tyres, 8.4 L 90° V10 under a front-hinged
// clamshell hood. Origin mid-wheelbase on the ground, +X front, +Y left. Dossier: ./README.md.
// This file wires the modules: body/ (surface, panels, details), wheels/, chassis/, engine/,
// interior/, lights/. `roadster_v10_open` is the same build with hood, doors and trunk baked open.

import {
  type Check,
  clear,
  defineFamily,
  type IntendedGap,
  type Lod,
  type Measure,
  type Mesh,
  merge,
  symmetric,
} from '@developerz.ai/ts23d';
import { body, hinges } from './body/body.ts';
import {
  badges,
  doorHandle,
  doorJambs,
  fuelDoor,
  gills,
  hoodVent,
  mirror,
  mouth,
  rearBlackout,
  rearPlate,
  splitter,
  stripes,
  trunkBadge,
  windscreen,
  wipers,
} from './body/details.ts';
import { hingeParts } from './body/hinges.ts';
import { quality, region, X_HOOD_FRONT, X_HOOD_REAR, X_TAIL_SHUT } from './body/panels.ts';
import { bodySurface, sAtX, U } from './body/shape.ts';
import { CORNERS, corner } from './chassis/points.ts';
import { structure } from './chassis/structure.ts';
import { suspension } from './chassis/suspension.ts';
import { BODY_WIDTH, HEIGHT, LENGTH, R_F, R_R, TRACK_F, TRACK_R, WHEELBASE } from './dims.ts';
import { powertrain } from './engine/engine.ts';
import { doorCard } from './interior/cabin.ts';
import { cockpit } from './interior/interior.ts';
import { C, LIVERY } from './lib/colors.ts';
import { bothSides, bx, DEG, rotateAbout, shift, sub } from './lib/geo.ts';
import { addLamps } from './lights/lamps.ts';
import { addCorner } from './wheels/corner.ts';

interface Params {
  /** 0 closed … 1 fully open (hood, doors, trunk baked in that pose). */
  readonly open: number;
}

const FUEL_DEG = 85;

const lod0 =
  (c: Check): Check =>
  (a) =>
    a.lod === 0 ? c(a) : [];

/**
 * True contacts of the closed clamshell, kept after the clashes gate swept hinged panels to
 * millimetres (D23): the bay, ancillaries and stripes sit < 2 cm under the closed skin; the pivot
 * pins turn the gooseneck arms. `nose_fascia` and the headlamps are a design note, not slack: the
 * hinge sits 13 cm behind the hood front, so the lip ahead of it dips ~9 cm into the nose as the
 * hood opens (README → Open questions).
 */
const HOOD_CLEAR = [
  'nose_fascia',
  'headlamps',
  'headlamp_l_drl',
  'headlamp_r_drl',
  'headlamp_lenses',
  'engine_bay',
  'bay_ancillaries',
  'body_stripes',
  'hinges',
] as const;

/** True contacts of the closed trunk lid (< 2 cm), plus the roll hoops and stripes in the open pose. */
const TRUNK_CLEAR = [
  'quarter_l',
  'quarter_r',
  'rear_deck',
  'roll_hoops',
  'body_stripes',
  'hinges',
] as const;

/** Luggage tub under the trunk lid: floor, walls and the drip channel round the opening. */
function trunkTub(lod: Lod): Mesh {
  const parts: Mesh[] = [
    bx([-2.0, -0.58, 0.46], [-1.36, 0.58, 0.48], C.carpet, 'canvas'),
    bx([-2.04, -0.6, 0.46], [-1.98, 0.6, 0.9], C.liner, 'plastic'),
    bx([-1.38, -0.6, 0.46], [-1.36, 0.6, 0.88], C.liner, 'plastic'),
    // Drip channel under the lid's front shut line.
    bx([-1.345, -0.64, 0.86], [-1.3, 0.64, 0.9], C.liner, 'plastic'),
  ];
  // Side liners run out to the quarters' inner flange (0.607 m): no slit beside the open lid.
  for (const s of [1, -1])
    parts.push(bx([-2.0, s * 0.58, 0.46], [-1.36, s * 0.607, 0.88], C.liner, 'plastic'));
  if (lod === 0) parts.push(bx([-1.9, -0.25, 0.48], [-1.75, 0.25, 0.5], C.black, 'rubber'));
  return merge(parts);
}

const MEASURES: Measure[] = [
  {
    label: 'wheelbase',
    axis: 'x',
    value: WHEELBASE,
    between: ['wheel_fl', 'wheel_rl'],
    source: 'README: class envelope 2.44–2.69 m',
  },
  {
    label: 'front track',
    axis: 'y',
    value: TRACK_F,
    between: ['wheel_fl', 'wheel_fr'],
    source: 'README',
  },
  {
    label: 'rear track',
    axis: 'y',
    value: TRACK_R,
    between: ['wheel_rl', 'wheel_rr'],
    source: 'README',
  },
  {
    label: 'front tyre 295/30 ZR18 diameter',
    axis: 'z',
    value: 2 * R_F,
    parts: ['wheel_fl'],
    source: 'https://en.wikipedia.org/wiki/Tire_code',
  },
  {
    label: 'rear tyre 355/30 ZR19 diameter',
    axis: 'z',
    value: 2 * R_R,
    parts: ['wheel_rl'],
    source: 'https://en.wikipedia.org/wiki/Tire_code',
  },
  {
    label: 'body width (no mirrors)',
    axis: 'y',
    value: BODY_WIDTH,
    parts: ['quarter', 'fender', 'sill'],
    source: 'README: class envelope 1.85–1.95 m',
  },
  {
    label: 'overall length',
    axis: 'x',
    value: LENGTH,
    parts: ['nose_fascia', 'tail_fascia'],
    source: 'README',
  },
];

const GAPS: IntendedGap[] = [
  {
    parts: ['wheel_*', 'rim_*'],
    why: 'inboard of the wheel: the tyre bead sits on the rim seat, the open slot is the barrel seen past the inner flange',
  },
];

const roadster = defineFamily({
  kind: 'vehicle',
  tags: ['car', 'roadster', 'v10', 'sports-car', 'hero', 'original-design'],
  license: 'CC0-1.0',
  budget: { triangles: [1200000, 90000, 9000] },
  defaults: { open: 0 } as Params,
  sources: [
    'https://en.wikipedia.org/wiki/Tire_code',
    'https://en.wikipedia.org/wiki/V10_engine',
    'https://en.wikipedia.org/wiki/Double_wishbone_suspension',
    'https://en.wikipedia.org/wiki/Disc_brake',
    'https://en.wikipedia.org/wiki/Roll_bar',
    'https://en.wikipedia.org/wiki/Front-engine,_rear-wheel-drive_layout',
    'https://www.sae.org/standards/content/j1100_202311/',
  ],
  real: {
    length: LENGTH,
    width: 2.22,
    height: HEIGHT,
    measures: MEASURES,
  },
  checks: [
    symmetric('_l', '_r', 'y'),
    // Panels are closed (thick) skins only at LOD0; LOD1/2 are single sheets, which the
    // point-in-solid test would read as solid on one side.
    lod0(clear('wheel_*', 'fender_*')),
    lod0(clear('wheel_*', 'quarter_*')),
    lod0(clear('wheel_*', 'sill_*')),
    clear('seats', 'floor_pan'),
  ],
  paint: {
    body: { colour: LIVERY.crimson, clearcoat: 1, clearcoatRoughness: 0.03, metallicFlake: 0.5 },
    stripe: { colour: LIVERY.crimson, clearcoat: 1, clearcoatRoughness: 0.03, metallicFlake: 0.5 },
  },
  finishes: {
    brushed: { metallic: 1, roughness: 0.25, anisotropy: { strength: 0.8 } },
    carpet: { roughness: 0.95, sheen: { colour: '#6a6a70', roughness: 0.55 } },
  },
  optics: { glass: { ior: 1.52, thickness: 0.005 } },
  gaps: GAPS,

  variants: {
    cobalt_stripes: { body: LIVERY.cobalt, stripe: LIVERY.white },
    sun_yellow: { body: LIVERY.sunYellow, stripe: LIVERY.sunYellow },
    gloss_black: { body: LIVERY.black, stripe: LIVERY.black },
  },
  glow: [
    { parts: ['headlamp_*_drl'], color: [1, 0.95, 0.85], strength: 6 },
    { parts: ['taillight_*_led'], color: [1, 0.08, 0.04], strength: 5 },
    { parts: ['gauge_faces'], color: [1, 0.6, 0.25], strength: 1.5 },
  ],
  build(ctx, p) {
    const lod = ctx.lod;
    const S = bodySurface();
    const sHoodFront = sAtX(X_HOOD_FRONT, 0);
    const sTail = sAtX(X_TAIL_SHUT, 0);
    const mir = mirror(S, lod);
    const hoodTrim: Mesh[] = [bothSides(hoodVent(S, lod))];
    if (lod < 2)
      // Insulation pad under the hood skin.
      hoodTrim.push(
        bothSides(
          region(
            S,
            {
              s0: X_HOOD_REAR + 0.06,
              s1: sHoodFront - 0.08,
              lo: () => 0,
              hi: () => U.valley + 0.3,
              rims: { lo: false },
              lift: -0.022,
            },
            { ...quality(lod, C.liner), thickness: 0, step: lod === 0 ? 0.05 : 0.12 },
          ),
        ),
      );
    const h = hinges(S);
    const hg = hingeParts(S, lod, h);
    // Far and shut, hinges are invisible: keep them only where they can be seen.
    const showHinges = lod < 2 || p.open > 0;
    if (showHinges) ctx.part('hinges', merge([hg.brackets, bothSides(hg.doorBrackets)]));
    body(ctx, S, {
      open: p.open,
      extras: { door: [mir.paint] },
      trim: {
        hood: [...hoodTrim, ...(showHinges ? [hg.hoodArms] : [])],
        door: [
          mir.trim,
          doorHandle(S, lod),
          ...(showHinges ? [hg.doorLeaves] : []),
          ...(lod < 2 ? [doorCard(S, lod)] : []),
        ],
        trunk: [...(showHinges ? [hg.trunkArms] : []), ...(lod < 2 ? [trunkBadge(S)] : [])],
      },
      stripes: stripes(S, lod, sHoodFront, sTail),
      hoodClearOf: HOOD_CLEAR,
      // The jambs and quarters touch the closed door card (< 2 cm): true contacts.
      doorClearOf: ['door_jambs', 'quarter_l', 'quarter_r'],
      trunkClearOf: TRUNK_CLEAR,
    });
    // Static body trim: splitter, screen surround, wipers, gills, mouth, badges, plate.
    const ws = windscreen(S, lod);
    const g = gills(S, lod);
    ctx.part(
      'body_trim',
      merge([
        splitter(S, lod),
        bothSides(g.black),
        bothSides(mouth(S, lod)),
        bothSides(rearBlackout(S, lod)),
        badges(S, lod),
        rearPlate(S, lod),
      ]),
    );
    ctx.part('windscreen_frame', ws.frame);
    ctx.part('door_jambs', bothSides(doorJambs(S, lod)), { paint: 'body' });
    if (lod < 2) ctx.part('wipers', wipers(S, lod));
    if (lod < 2) ctx.part('trunk_tub', trunkTub(lod));
    ctx.part('windscreen', ws.glass, { surface: 'glass' });
    // Fuel filler door (left rear deck), hinged on its inboard edge.
    const fd = fuelDoor(S);
    const fdOpen = (m: Mesh): Mesh => rotateAbout(m, [0, 0, 0], fd.axis, p.open * FUEL_DEG * DEG);
    if (lod < 2) {
      ctx.part('fuel_door', fdOpen(shift(fd.flap, sub([0, 0, 0], fd.hinge))), {
        at: fd.hinge,
        motion: { kind: 'sway', axis: fd.axis, degrees: FUEL_DEG, hz: 0.25, oneWay: true },
        // The flap lies on its seat in the quarter; it only ever lifts away from it.
        paint: 'body',
      });
      ctx.part('fuel_door_seal', fd.ring);
    }
    addLamps(ctx, S);
    // Ball joints and tie-rod ends sit inside the wheel barrel: the arms legitimately meet the
    // steering upright and pass through the wheel's swept cylinder.
    for (const id of CORNERS)
      addCorner(ctx, corner(id), { spinRps: 2, clearOf: [`suspension_${id}`] });
    const st = structure(lod);
    ctx.part('floor_pan', st.floor);
    ctx.part('wheel_liners', st.liners);
    ctx.part('frame', st.frame);
    ctx.part('engine_bay', st.bay, { paint: 'body' });
    ctx.part('under_tray', st.tray);
    if (lod < 2) {
      // Hidden under the body from far away: the far LOD drops the links entirely.
      const su = suspension(lod);
      for (const id of CORNERS) ctx.part(`suspension_${id}`, su.arms[id] ?? null);
      ctx.part('front_axle', su.front);
      ctx.part('rear_axle', su.rear);
    }
    powertrain(ctx);
    cockpit(ctx);
  },
});

export const roadster_v10 = roadster.variant({
  name: 'roadster_v10',
  description:
    'Original front-mid-engine V10 roadster: clamshell hood over a detailed 8.4 L V10 bay, opening doors and trunk, double-wishbone suspension, drilled discs, leather cockpit, four liveries.',
});

export const roadster_v10_open = roadster.variant({
  name: 'roadster_v10_open',
  description:
    'The V10 roadster with hood, doors and trunk lid open: engine bay and cockpit on show.',
  params: { open: 1 },
  // Open pose envelope, from the hinge geometry: doors 1.08 m long swung 65° out of 0.92 m
  // hinge lines; the hood's 1.45 m radius lifted 58° about its 0.52 m pivot.
  real: { length: LENGTH, width: 3.8, height: 1.93, measures: MEASURES },
  gaps: [
    ...GAPS,
    {
      parts: ['door_*', 'door_jambs'],
      why: 'door swung open: the shut line between door and jamb is wide open',
    },
    {
      parts: ['tail_fascia', 'trunk_tub'],
      why: 'trunk open: the lid seal channel round the opening',
    },
  ],
});
