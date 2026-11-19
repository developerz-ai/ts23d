// The parts kit on display: every part in recipes/_parts at its real-scale defaults (and a few
// sizes side by side), laid out on a plinth and a workbench, each with a raised label. A catalogue
// you can open in any glTF viewer — and the proof that parts compose: the lamp hangs from a gallows
// built from two steel_beam calls, the flange carries hex_nut, the door carries hinge + handle.
// The tall flat pieces of the back row stand turned 26° and every row is staggered in x, so each
// item reads in FRONT and in SIDE. The drum, crate and beams wear their use (`weather()`); LOD2
// drops the labels and the small bench hardware.

import {
  type BuildContext,
  box,
  defineAsset,
  hex,
  type Mesh,
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
): void {
  const out = weather(
    ctx,
    { [name]: mesh },
    { name: `${name}_wear`, seed, age: 0.6, resolution: [0.15, 0, 0], effects },
  );
  ctx.part(name, out[name] ?? mesh, { at, yaw });
}

/** Floor label cap height and the bench's. */
const FLOOR_H = 0.12;
const BENCH_H = 0.035;
/** Turn of the flat back-row pieces: they read from the front and from the side. */
const TURN = -0.45;

/** Tall things against the back: door, window, ladder, lamp gallows, railing. */
function backRow(ctx: BuildContext): void {
  const x = -1.8;
  const lx = x + 0.55;
  panel_door(ctx, 'door', {}, { at: [x, -2.6, T], yaw: TURN });
  label(ctx, 'door', 'PANEL DOOR', [lx, -2.6, T], FLOOR_H, 1);
  casement_window(ctx, 'window', {}, { at: [x + 0.15, -1.3, T + 0.035], yaw: TURN });
  label(ctx, 'window', 'WINDOW', [lx, -1.3, T], FLOOR_H, 1);
  ladder(ctx, 'ladder', { height: 2.4 }, { at: [x, -0.1, T], yaw: TURN });
  label(ctx, 'ladder', 'LADDER', [lx, -0.1, T], FLOOR_H, 0.8);
  // Gallows: an H-section post and an arm, both steel_beam; the pendant hangs from the arm.
  const post = 2.58;
  const hea = { length: post, depth: 0.16, width: 0.16, web: 0.006, flange: 0.009 };
  // Base plate with four anchor nuts under the post.
  ctx.part(
    'gallows_plate',
    box({ size: [0.3, 0.3, 0.02], at: [x, 1.1, T], color: hex('#3e4a40'), strip: 'steel_painted' }),
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
          at: [x + dx * 0.115, 1.1 + dy * 0.115, T + 0.02],
        },
      );
  steel_beam(ctx, 'gallows_post', hea, {
    at: [x + 0.08, 1.1, T + 0.02],
    place: { pitch: -Math.PI / 2 },
  });
  const arm = { length: 1.0, depth: 0.12, width: 0.08, web: 0.005, flange: 0.007 };
  steel_beam(ctx, 'gallows_arm', arm, { at: [x - 0.08, 1.1, T + 0.02 + post] });
  lamp(ctx, 'lamp', { drop: 0.7 }, { at: [x + 0.75, 1.1, T + 0.02 + post] });
  label(ctx, 'lamp', 'LAMP + BEAMS', [lx + 0.4, 1.1, T], FLOOR_H, 1);
  railing(ctx, 'railing', { length: 1.4 }, { at: [x, 1.9, T] });
  label(ctx, 'railing', 'RAILING', [lx, 2.6, T], FLOOR_H, 1);
}

/** Containers and furniture, staggered in x so none hides another from the side. */
function midRow(ctx: BuildContext): void {
  const lx = (x: number): number => x + 0.5;
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
    [-0.85, -2.8, T],
  );
  label(ctx, 'drum', 'STEEL DRUM', [lx(-0.85), -2.8, T], FLOOR_H, 0.8);
  barrel(ctx, 'cask', { style: 'wood', height: 0.95, diameter: 0.58 }, { at: [-0.45, -1.9, T] });
  label(ctx, 'cask', 'CASK', [lx(-0.45), -1.9, T], FLOOR_H, 0.7);
  // The crate has been shipped: scuffed edges, dust on the lid, dirt along the bottom.
  worn(
    ctx,
    'crate',
    crate.mesh({}, ctx),
    {
      chips: { where: 'convex-edges', amount: 0.25 },
      dust: { where: 'up-facing', amount: 0.4 },
      mud: { where: 'ground-near & side-facing', amount: 0.35 },
    },
    53,
    [-0.75, -0.95, T],
  );
  label(ctx, 'crate', 'CRATE', [lx(-0.75), -0.95, T], FLOOR_H, 0.7);
  seat(ctx, 'chair', {}, { at: [-0.3, -0.1, T] });
  label(ctx, 'chair', 'CHAIR', [lx(-0.3), -0.1, T], FLOOR_H, 0.5);
  const stool = { style: 'stool', height: 0.65, width: 0.36, depth: 0.36 } as const;
  seat(ctx, 'stool', stool, { at: [0.15, 0.55, T] });
  label(ctx, 'stool', 'STOOL', [lx(0.15), 0.55, T], FLOOR_H, 0.5);
}

/** The workbench (y 1.0 → 3.3) with the small hardware, labels on its front half. */
function bench(ctx: BuildContext): void {
  const x = -0.4;
  const ix = x - 0.12; // items on the back half
  const lx = x + 0.25; // labels on the front half
  const bevel = ctx.pick([0.006, 0.003, 0]);
  ctx.part(
    'bench_top',
    box({ size: [0.8, 2.3, 0.04], at: [x, 2.15, TT - 0.04], color: WHITE, strip: 'oak', bevel }),
  );
  for (const [dx, dy] of [
    [-0.33, -1.08],
    [0.33, -1.08],
    [-0.33, 1.08],
    [0.33, 1.08],
  ] as const) {
    const leg = box({
      size: [0.06, 0.06, BENCH - 0.04],
      at: [x + dx, 2.15 + dy, T],
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
      const y = 1.1 + i * 0.07;
      const id = size.toLowerCase();
      const k = METRIC[size].k;
      const bolt = { size, length: 0.02 + i * 0.02 };
      hex_bolt(ctx, `bolt_${id}`, bolt, { at: [ix - 0.12, y, TT + k], place: { roll: Math.PI } });
      hex_nut(ctx, `nut_${id}`, { size }, { at: [ix, y, TT] });
      washer(ctx, `washer_${id}`, { size }, { at: [ix + 0.12, y, TT] });
    });
  label(ctx, 'fasteners', 'BOLTS NUTS', [lx, 1.2, TT], BENCH_H, 0.3);
  ctx.part(
    'rivet_plate',
    box({ size: [0.1, 0.36, 0.01], at: [ix, 1.6, TT], color: WHITE, strip: 'steel_painted' }),
  );
  if (small)
    rivet_row(
      ctx,
      'rivets',
      { count: 7, pitch: 0.05 },
      { at: [ix, 1.45, TT + 0.01], yaw: Math.PI / 2 },
    );
  label(ctx, 'rivets', 'RIVETS', [lx, 1.6, TT], BENCH_H, 0.3);
  hinge(ctx, 'hinge', {}, { at: [ix, 1.95, TT + 0.003], clearOf: ['bench_top'] });
  label(ctx, 'hinge', 'HINGE', [lx, 1.95, TT], BENCH_H, 0.3);
  const block = box({
    size: [0.04, 0.18, 0.24],
    at: [ix - 0.05, 2.25, TT],
    color: hex('#2f4c3c'),
    strip: 'wood_painted',
    bevel: ctx.pick([0.004, 0.002, 0]),
  });
  ctx.part('handle_block', block);
  door_handle(ctx, 'handle', {}, { at: [ix - 0.03, 2.32, TT + 0.15] });
  label(ctx, 'handle', 'HANDLE', [lx, 2.25, TT], BENCH_H, 0.3);
  if (small) chain(ctx, 'chain', { links: 9, wire: 0.01 }, { at: [ix - 0.12, 2.5, TT + 0.0175] });
  label(ctx, 'chain', 'CHAIN', [lx, 2.52, TT], BENCH_H, 0.3);
  if (small)
    spring(
      ctx,
      'spring',
      { diameter: 0.06, wire: 0.007, coils: 6, length: 0.1 },
      { at: [ix, 2.72, TT] },
    );
  label(ctx, 'spring', 'SPRING', [lx, 2.72, TT], BENCH_H, 0.3);
  valve_wheel(ctx, 'valve', {}, { at: [ix, 2.92, TT] });
  label(ctx, 'valve', 'VALVE', [lx, 2.92, TT], BENCH_H, 0.3);
  flange(ctx, 'flange', {}, { at: [ix, 3.18, TT] });
  label(ctx, 'flange', 'FLANGE', [lx, 3.18, TT], BENCH_H, 0.3);
}

/** Things that lie on the floor at the front: pipe, hose, wheel, beams. */
function frontRow(ctx: BuildContext): void {
  const x = 1.4;
  const lx = x + 0.5;
  pipe(ctx, 'pipe', {}, { at: [x + 0.2, -3.2, T + 0.1085], yaw: Math.PI / 2 });
  label(ctx, 'pipe', 'PIPE', [lx, -2.7, T], FLOOR_H, 0.5);
  const hose = {
    style: 'hose',
    diameter: 0.05,
    path: [0, 0, 0, 0.1, 0.5, 0, -0.15, 1.0, 0, 0.05, 1.5, 0],
  } as const;
  pipe(ctx, 'hose', hose, { at: [x - 0.2, -1.7, T + 0.025] });
  label(ctx, 'hose', 'HOSE', [lx, -0.95, T], FLOOR_H, 0.5);
  const spin = { kind: 'spin', axis: [0, 1, 0], rps: 0.25 } as const;
  wheel(ctx, 'wheel', {}, { at: [x, 0.2, T + 0.32], motion: spin, clearOf: ['plinth'] });
  label(ctx, 'wheel', 'WHEEL', [lx, 0.2, T], FLOOR_H, 0.6);
  // Stock beams from the yard: mill scale gone to rust on the flange edges, dust on top.
  const yard: WeatherEffects = {
    rust: { where: 'convex-edges & !up-facing', amount: 0.15, strength: 0.6 },
    dust: { where: 'up-facing', amount: 0.35 },
  };
  worn(
    ctx,
    'beam_i',
    steel_beam.mesh({ length: 1.2 }, ctx),
    yard,
    57,
    [x - 0.1, 1.0, T],
    Math.PI / 2,
  );
  const upn = {
    section: 'C',
    length: 1.2,
    depth: 0.12,
    width: 0.055,
    web: 0.007,
    flange: 0.009,
  } as const;
  worn(ctx, 'beam_c', steel_beam.mesh(upn, ctx), yard, 59, [x + 0.1, 1.0, T], Math.PI / 2);
  label(ctx, 'beams', 'I + C BEAMS', [lx, 1.6, T], FLOOR_H, 0.9);
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
    ctx.part('plinth', box({ size: [5, 7, T], color: hex('#9a9890'), strip: 'concrete', bevel }));
    backRow(ctx);
    midRow(ctx);
    bench(ctx);
    frontRow(ctx);
  },
});
