// The parts kit on display: every part in recipes/_parts at its real-scale defaults (and a few
// sizes side by side), laid out on a plinth and a workbench, each with a raised label. A catalogue
// you can open in any glTF viewer — and the proof that parts compose: the lamp hangs from a gallows
// built from two steel_beam calls, the flange carries hex_nut, the door carries hinge + handle.
// Every item has its own slot along Y (three depth rows interleaved), so no two outlines overlap
// in FRONT; the tall flat pieces of the back row stand turned 26° so they also read in SIDE. The
// drum, crate, hose, gallows post and beams wear their use (`weather()`); LOD2 drops the labels
// and the small bench hardware.

import {
  type BuildContext,
  box,
  defineAsset,
  hex,
  type Mesh,
  place,
  text,
  type Vec3,
  type WeatherEffects,
  weather,
} from '@developerz.ai/ts23d';
import {
  barrel,
  casement_window,
  chain,
  crate,
  door_handle,
  flange,
  hex_bolt,
  hex_nut,
  hinge,
  ladder,
  lamp,
  METRIC,
  panel_door,
  pipe,
  railing,
  rivet_row,
  seat,
  spring,
  steel_beam,
  valve_wheel,
  washer,
  wheel,
} from '../_parts/index.ts';

const T = 0.1; // plinth top
const BENCH = 0.9; // workbench top above the plinth
const TT = T + BENCH; // workbench top, world z
const INK = hex('#23221f');
const WHITE = hex('#ffffff');

/** A raised label lying on a surface, read from the front (+X). Dropped at LOD2 (unreadable). */
function label(ctx: BuildContext, name: string, str: string, at: Vec3, h: number, w: number): void {
  if (ctx.lod === 2) return;
  const mesh = text(str, {
    origin: at,
    along: [0, 1, 0],
    up: [-1, 0, 0],
    height: h,
    color: INK,
    depth: 0.003,
    align: 'centre',
    maxWidth: w,
    strip: 'plastic',
  });
  ctx.part(`label_${name}`, mesh);
}

/** One weathered copy of a part's mesh, placed as `name`. */
function worn(
  ctx: BuildContext,
  name: string,
  mesh: Mesh,
  effects: WeatherEffects,
  seed: number,
  at: Vec3,
  yaw = 0,
  resolution = 0.15,
): void {
  const out = weather(
    ctx,
    { [name]: mesh },
    { name: `${name}_wear`, seed, age: 0.6, resolution: [resolution, 0, 0], effects },
  );
  ctx.part(name, out[name] ?? mesh, { at, yaw });
}

/** Floor label cap height and the bench's. */
const FLOOR_H = 0.15;
const BENCH_H = 0.035;
/** Turn of the flat back-row pieces: they read from the front and from the side. */
const TURN = -0.45;
/** Depth rows (x): tall pieces at the back, containers and furniture mid, floor pieces front. */
const BACK = -1.8;
const MID = -0.75;
const FRONT = 1.0;
/** Plinth: 5 m deep, 10 m along Y so every standing item gets its own slot. */
const PLINTH: Vec3 = [5, 10, T];

/**
 * Left to right in FRONT (−Y → +Y): each standing item's slot width (m, its outline seen from
 * +X), back and mid rows interleaved so no two outlines overlap. The floor pieces at the front
 * (pipe, hose, wheel, beams; all under 0.65 m) lie in front of the door, ladder, railing and
 * bench.
 */
const SLOTS = [
  ['door', 0.95],
  ['drum', 0.6],
  ['window', 0.95],
  ['cask', 0.7],
  ['ladder', 0.5],
  ['crate', 0.6],
  ['gallows', 0.4],
  ['chair', 0.42],
  ['stool', 0.36],
  ['railing', 0.95],
  ['bench', 2.3],
] as const;
type Slot = (typeof SLOTS)[number][0];
const GAP = 0.1;
/** Slot centres along Y, packed about y = 0 with GAP between neighbours. */
const Y: Readonly<Record<Slot, number>> = (() => {
  const total = SLOTS.reduce((t, [, w]) => t + w, 0) + GAP * (SLOTS.length - 1);
  let y = -total / 2;
  const out: Partial<Record<Slot, number>> = {};
  for (const [k, w] of SLOTS) {
    out[k] = y + w / 2;
    y += w + GAP;
  }
  return out as Record<Slot, number>;
})();

/**
 * A standing item's floor label: in a label lane in front of the mid row (so no standing item
 * hides it from the 3/4 hero), on alternate lanes slot by slot so a label may run up to its
 * neighbours' slots, centred on its own.
 */
function floorLabel(ctx: BuildContext, slot: Slot, str: string, name: string = slot): void {
  const i = SLOTS.findIndex(([k]) => k === slot);
  const w = (SLOTS[i]?.[1] ?? 0.5) + 0.5;
  label(ctx, name, str, [i % 2 === 0 ? 0.42 : 0.68, Y[slot], T], FLOOR_H, Math.min(1, w));
}

/** Tall things against the back: door, window, ladder, lamp gallows, railing. */
function backRow(ctx: BuildContext): void {
  const x = BACK;
  panel_door(ctx, 'door', {}, { at: [x, Y.door, T], yaw: TURN });
  floorLabel(ctx, 'door', 'PANEL DOOR');
  casement_window(
    ctx,
    'window',
    { width: 0.9 },
    { at: [x + 0.15, Y.window, T + 0.035], yaw: TURN },
  );
  floorLabel(ctx, 'window', 'WINDOW');
  ladder(ctx, 'ladder', { height: 2.4 }, { at: [x, Y.ladder, T], yaw: TURN });
  floorLabel(ctx, 'ladder', 'LADDER');
  // Gallows: an H-section post and an arm, both steel_beam; the pendant hangs from the arm.
  const gy = Y.gallows;
  const post = 2.58;
  const hea = { length: post, depth: 0.16, width: 0.16, web: 0.006, flange: 0.009 };
  // Base plate with four anchor nuts under the post.
  ctx.part(
    'gallows_plate',
    box({ size: [0.3, 0.3, 0.02], at: [x, gy, T], color: hex('#3e4a40'), strip: 'steel_painted' }),
  );
  for (const [dx, dy] of [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ] as const)
    if (ctx.lod < 2)
      hex_nut(
        ctx,
        `gallows_nut_${dx < 0 ? 'b' : 'f'}${dy < 0 ? 'l' : 'r'}`,
        { size: 'M16' },
        {
          at: [x + dx * 0.115, gy + dy * 0.115, T + 0.02],
        },
      );
  // The post has stood in a damp shop: paint chipped on its flange edges, rust creeping up from
  // the base plate.
  worn(
    ctx,
    'gallows_post',
    place(steel_beam.mesh(hea, ctx), { pitch: -Math.PI / 2 }),
    {
      chips: { where: 'convex-edges', amount: 0.3 },
      rust: { where: 'ground-near', amount: 0.5, streaks: false, strength: 0.85 },
    },
    61,
    [x + 0.08, gy, T + 0.02],
    0,
    0.25,
  );
  const arm = { length: 1.0, depth: 0.12, width: 0.08, web: 0.005, flange: 0.007 };
  steel_beam(ctx, 'gallows_arm', arm, { at: [x - 0.08, gy, T + 0.02 + post] });
  lamp(ctx, 'lamp', { drop: 0.7 }, { at: [x + 0.75, gy, T + 0.02 + post] });
  floorLabel(ctx, 'gallows', 'LAMP + BEAMS', 'lamp');
  railing(ctx, 'railing', { length: 0.9 }, { at: [x, Y.railing - 0.45, T] });
  floorLabel(ctx, 'railing', 'RAILING');
}

/** Containers and furniture, each in its own slot. */
function midRow(ctx: BuildContext): void {
  // The drum has stood outside: rust bleeding from the chimes and hoops, a dusty lid.
  worn(
    ctx,
    'drum',
    barrel.mesh({}, ctx),
    {
      rust: { where: 'convex-edges', amount: 0.3, streaks: true, streakLength: 0.3 },
      dust: { where: 'up-facing', amount: 0.4 },
      mud: { where: 'ground-near & side-facing', amount: 0.3 },
    },
    51,
    [MID - 0.1, Y.drum, T],
  );
  floorLabel(ctx, 'drum', 'STEEL DRUM');
  barrel(ctx, 'cask', { style: 'wood', height: 0.95, diameter: 0.58 }, { at: [MID, Y.cask, T] });
  floorLabel(ctx, 'cask', 'CASK');
  // The crate has been shipped: corners and edges knocked through to bare wood, dust on the lid,
  // dirt splashed along the bottom.
  worn(
    ctx,
    'crate',
    crate.mesh({}, ctx),
    {
      chips: { where: 'convex-edges', amount: 0.55, strength: 1 },
      dust: { where: 'up-facing', amount: 0.5 },
      mud: { where: 'ground-near & side-facing', amount: 0.6, strength: 0.9 },
    },
    53,
    [MID - 0.1, Y.crate, T],
    0,
    0.08,
  );
  floorLabel(ctx, 'crate', 'CRATE');
  seat(ctx, 'chair', {}, { at: [MID, Y.chair, T] });
  floorLabel(ctx, 'chair', 'CHAIR');
  // A bar stool: 0.75 m seat (counter stools 0.65, bar stools 0.75–0.80).
  const stool = { style: 'stool', height: 0.75, width: 0.36, depth: 0.36 } as const;
  seat(ctx, 'stool', stool, { at: [MID, Y.stool, T] });
  floorLabel(ctx, 'stool', 'STOOL');
}

/** The workbench (2.3 m along Y) with the small hardware, labels on its front half. */
function bench(ctx: BuildContext): void {
  const x = -0.4;
  const yc = Y.bench;
  const y0 = yc - 1.05; // first item slot on the bench
  const ix = x - 0.12; // items on the back half
  const lx = x + 0.25; // labels on the front half
  const bevel = ctx.pick([0.006, 0.003, 0]);
  ctx.part(
    'bench_top',
    box({ size: [0.8, 2.3, 0.04], at: [x, yc, TT - 0.04], color: WHITE, strip: 'oak', bevel }),
  );
  for (const [dx, dy] of [
    [-0.33, -1.08],
    [0.33, -1.08],
    [-0.33, 1.08],
    [0.33, 1.08],
  ] as const) {
    const leg = box({
      size: [0.06, 0.06, BENCH - 0.04],
      at: [x + dx, yc + dy, T],
      color: WHITE,
      strip: 'oak',
    });
    ctx.part(`bench_leg_${dx < 0 ? 'b' : 'f'}_${dy < 0 ? 'l' : 'r'}`, leg);
  }
  // The bench mat and its labels are the far read; the small hardware is LOD0/1 only.
  const small = ctx.lod < 2;
  // Fasteners: four bolt sizes standing on their heads, with a nut and a washer each.
  const sizes = ['M8', 'M12', 'M16', 'M24'] as const;
  if (small)
    sizes.forEach((size, i) => {
      const y = y0 - 0.06 + i * 0.07;
      const id = size.toLowerCase();
      const k = METRIC[size].k;
      const bolt = { size, length: 0.02 + i * 0.02 };
      hex_bolt(ctx, `bolt_${id}`, bolt, { at: [ix - 0.12, y, TT + k], place: { roll: Math.PI } });
      hex_nut(ctx, `nut_${id}`, { size }, { at: [ix, y, TT] });
      washer(ctx, `washer_${id}`, { size }, { at: [ix + 0.12, y, TT] });
    });
  label(ctx, 'fasteners', 'BOLTS NUTS', [lx, y0 + 0.05, TT], BENCH_H, 0.3);
  ctx.part(
    'rivet_plate',
    box({ size: [0.1, 0.36, 0.01], at: [ix, y0 + 0.45, TT], color: WHITE, strip: 'steel_painted' }),
  );
  if (small)
    rivet_row(
      ctx,
      'rivets',
      { count: 7, pitch: 0.05 },
      { at: [ix, y0 + 0.3, TT + 0.01], yaw: Math.PI / 2 },
    );
  label(ctx, 'rivets', 'RIVETS', [lx, y0 + 0.45, TT], BENCH_H, 0.3);
  hinge(ctx, 'hinge', {}, { at: [ix, y0 + 0.8, TT + 0.003], clearOf: ['bench_top'] });
  label(ctx, 'hinge', 'HINGE', [lx, y0 + 0.8, TT], BENCH_H, 0.3);
  const block = box({
    size: [0.04, 0.18, 0.24],
    at: [ix - 0.05, y0 + 1.1, TT],
    color: hex('#2f4c3c'),
    strip: 'wood_painted',
    bevel: ctx.pick([0.004, 0.002, 0]),
  });
  ctx.part('handle_block', block);
  door_handle(ctx, 'handle', {}, { at: [ix - 0.03, y0 + 1.17, TT + 0.15] });
  label(ctx, 'handle', 'HANDLE', [lx, y0 + 1.1, TT], BENCH_H, 0.3);
  if (small)
    chain(ctx, 'chain', { links: 9, wire: 0.01 }, { at: [ix - 0.12, y0 + 1.35, TT + 0.0175] });
  label(ctx, 'chain', 'CHAIN', [lx, y0 + 1.37, TT], BENCH_H, 0.3);
  if (small)
    spring(
      ctx,
      'spring',
      { diameter: 0.06, wire: 0.007, coils: 6, length: 0.1 },
      { at: [ix, y0 + 1.57, TT] },
    );
  label(ctx, 'spring', 'SPRING', [lx, y0 + 1.57, TT], BENCH_H, 0.3);
  valve_wheel(ctx, 'valve', {}, { at: [ix, y0 + 1.77, TT] });
  label(ctx, 'valve', 'VALVE', [lx, y0 + 1.77, TT], BENCH_H, 0.3);
  flange(ctx, 'flange', {}, { at: [ix, y0 + 2.03, TT] });
  label(ctx, 'flange', 'FLANGE', [lx, y0 + 2.03, TT], BENCH_H, 0.3);
}

/** Things that lie on the floor at the front, each running along X (depth), in its own slot. */
function frontRow(ctx: BuildContext): void {
  const lx = FRONT + 1.42;
  // A short riser (0.4 m) at the far end, so the elbow does not hide the label lane behind it.
  const run = { path: [0, 0, 0, 0.9, 0, 0, 0.9, 0, 0.4] };
  pipe(ctx, 'pipe', run, { at: [FRONT, Y.door, T + 0.1085] });
  label(ctx, 'pipe', 'PIPE', [lx, Y.door, T], FLOOR_H, 0.5);
  const hose = {
    style: 'hose',
    diameter: 0.05,
    path: [0, 0, 0, 0.45, 0.1, 0, 0.9, -0.1, 0, 1.3, 0.04, 0],
  } as const;
  // Rubber left on a shop floor: a film of grey dust over its top takes the shine off.
  worn(
    ctx,
    'hose',
    pipe.mesh(hose, ctx),
    { dust: { where: 'up-facing', amount: 0.7, strength: 0.6 } },
    63,
    [FRONT, Y.ladder, T + 0.025],
    0,
    0,
  );
  label(ctx, 'hose', 'HOSE', [lx, Y.ladder, T], FLOOR_H, 0.5);
  const spin = { kind: 'spin', axis: [0, 1, 0], rps: 0.25 } as const;
  wheel(
    ctx,
    'wheel',
    {},
    { at: [FRONT + 0.5, Y.railing, T + 0.32], motion: spin, clearOf: ['plinth'] },
  );
  label(ctx, 'wheel', 'WHEEL', [lx, Y.railing, T], FLOOR_H, 0.6);
  // Stock beams left out in the yard: the paint gone at every edge and rust bloomed and run over
  // the webs, dust on top.
  const yard: WeatherEffects = {
    chips: { where: 'convex-edges', amount: 0.4 },
    rust: { where: 'side-facing | convex-edges', amount: 0.55, streaks: true, strength: 0.85 },
    dust: { where: 'up-facing', amount: 0.35 },
  };
  worn(ctx, 'beam_i', steel_beam.mesh({ length: 1.2 }, ctx), yard, 57, [FRONT, Y.bench - 0.5, T]);
  const upn = {
    section: 'C',
    length: 1.2,
    depth: 0.12,
    width: 0.055,
    web: 0.007,
    flange: 0.009,
  } as const;
  worn(ctx, 'beam_c', steel_beam.mesh(upn, ctx), yard, 59, [FRONT, Y.bench - 0.3, T]);
  label(ctx, 'beams', 'I + C BEAMS', [lx, Y.bench - 0.4, T], FLOOR_H, 0.9);
}

export const parts_catalogue = defineAsset({
  name: 'parts_catalogue',
  kind: 'scene',
  description:
    'every part of the recipes/_parts kit at real scale, labelled, on a plinth and bench',
  tags: ['catalogue', 'parts', 'showcase'],
  budget: { triangles: [120000, 40000, 12000] },
  // A warm workshop bulb under its shade: lit, not a white bloom.
  glow: [{ parts: ['lamp_glow'], color: hex('#ffd9a0'), strength: 2 }],
  build(ctx) {
    const bevel = ctx.pick([0.02, 0.01, 0]);
    ctx.part('plinth', box({ size: PLINTH, color: hex('#9a9890'), strip: 'concrete', bevel }));
    backRow(ctx);
    midRow(ctx);
    bench(ctx);
    frontRow(ctx);
  },
});
