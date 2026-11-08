// The parts kit on display: every part in recipes/_parts at its real-scale defaults (and a few
// sizes side by side), laid out on a plinth and a workbench, each with a raised label. A catalogue
// you can open in any glTF viewer — and the proof that parts compose: the lamp hangs from a gallows
// built from two steel_beam calls, the flange carries hex_nut, the door carries hinge + handle.

import { type BuildContext, box, defineAsset, hex, text, type Vec3 } from '@developerz.ai/ts23d';
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

/** A raised label lying on a surface, read from the front (+X). */
function label(ctx: BuildContext, name: string, str: string, at: Vec3, h: number, w: number): void {
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

/** Tall things against the back: door, window, ladder, lamp gallows, railing. */
function backRow(ctx: BuildContext): void {
  const x = -1.8;
  const lx = x + 0.45;
  panel_door(ctx, 'door', {}, { at: [x, -2.6, T] });
  label(ctx, 'door', 'PANEL DOOR', [lx, -2.6, T], 0.08, 1);
  casement_window(ctx, 'window', {}, { at: [x, -1.3, T + 0.035] });
  label(ctx, 'window', 'WINDOW', [lx, -1.3, T], 0.08, 1);
  ladder(ctx, 'ladder', { height: 2.4 }, { at: [x, -0.1, T] });
  label(ctx, 'ladder', 'LADDER', [lx, -0.1, T], 0.08, 0.8);
  // Gallows: an H-section post and an arm, both steel_beam; the pendant hangs from the arm.
  const post = 2.6;
  const hea = { length: post, depth: 0.16, width: 0.16, web: 0.006, flange: 0.009 };
  steel_beam(ctx, 'gallows_post', hea, { at: [x + 0.08, 1.1, T], place: { pitch: -Math.PI / 2 } });
  const arm = { length: 1.0, depth: 0.12, width: 0.08, web: 0.005, flange: 0.007 };
  steel_beam(ctx, 'gallows_arm', arm, { at: [x - 0.08, 1.1, T + post] });
  lamp(ctx, 'lamp', { drop: 0.7 }, { at: [x + 0.75, 1.1, T + post] });
  label(ctx, 'lamp', 'LAMP + BEAMS', [lx + 0.5, 1.1, T], 0.08, 1);
  railing(ctx, 'railing', { length: 1.4 }, { at: [x, 1.9, T] });
  label(ctx, 'railing', 'RAILING', [lx, 2.6, T], 0.08, 1);
}

/** Containers and furniture. */
function midRow(ctx: BuildContext): void {
  const x = -0.4;
  const lx = x + 0.45;
  barrel(ctx, 'drum', {}, { at: [x, -2.8, T] });
  label(ctx, 'drum', 'STEEL DRUM', [lx, -2.8, T], 0.08, 0.8);
  barrel(ctx, 'cask', { style: 'wood', height: 0.95, diameter: 0.58 }, { at: [x, -1.9, T] });
  label(ctx, 'cask', 'CASK', [lx, -1.9, T], 0.08, 0.7);
  crate(ctx, 'crate', {}, { at: [x, -0.95, T] });
  label(ctx, 'crate', 'CRATE', [lx, -0.95, T], 0.08, 0.7);
  seat(ctx, 'chair', {}, { at: [x, -0.1, T] });
  label(ctx, 'chair', 'CHAIR', [lx, -0.1, T], 0.08, 0.5);
  const stool = { style: 'stool', height: 0.65, width: 0.36, depth: 0.36 } as const;
  seat(ctx, 'stool', stool, { at: [x, 0.55, T] });
  label(ctx, 'stool', 'STOOL', [lx, 0.55, T], 0.08, 0.5);
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
  // Fasteners: four bolt sizes standing on their heads, with a nut and a washer each.
  const sizes = ['M8', 'M12', 'M16', 'M24'] as const;
  sizes.forEach((size, i) => {
    const y = 1.1 + i * 0.07;
    const id = size.toLowerCase();
    const k = METRIC[size].k;
    const bolt = { size, length: 0.02 + i * 0.02 };
    hex_bolt(ctx, `bolt_${id}`, bolt, { at: [ix - 0.12, y, TT + k], place: { roll: Math.PI } });
    hex_nut(ctx, `nut_${id}`, { size }, { at: [ix, y, TT] });
    washer(ctx, `washer_${id}`, { size }, { at: [ix + 0.12, y, TT] });
  });
  label(ctx, 'fasteners', 'BOLTS NUTS', [lx, 1.2, TT], 0.025, 0.3);
  ctx.part(
    'rivet_plate',
    box({ size: [0.1, 0.36, 0.01], at: [ix, 1.6, TT], color: WHITE, strip: 'steel_painted' }),
  );
  rivet_row(
    ctx,
    'rivets',
    { count: 7, pitch: 0.05 },
    { at: [ix, 1.45, TT + 0.01], yaw: Math.PI / 2 },
  );
  label(ctx, 'rivets', 'RIVETS', [lx, 1.6, TT], 0.025, 0.3);
  hinge(ctx, 'hinge', {}, { at: [ix, 1.95, TT + 0.003], clearOf: ['bench_top'] });
  label(ctx, 'hinge', 'HINGE', [lx, 1.95, TT], 0.025, 0.3);
  const block = box({
    size: [0.04, 0.18, 0.24],
    at: [ix - 0.05, 2.25, TT],
    color: hex('#2f4c3c'),
    strip: 'wood_painted',
    bevel: ctx.pick([0.004, 0.002, 0]),
  });
  ctx.part('handle_block', block);
  door_handle(ctx, 'handle', {}, { at: [ix - 0.03, 2.32, TT + 0.15] });
  label(ctx, 'handle', 'HANDLE', [lx, 2.25, TT], 0.025, 0.3);
  chain(ctx, 'chain', { links: 9, wire: 0.01 }, { at: [ix - 0.12, 2.5, TT + 0.0175] });
  label(ctx, 'chain', 'CHAIN', [lx, 2.52, TT], 0.025, 0.3);
  spring(
    ctx,
    'spring',
    { diameter: 0.06, wire: 0.007, coils: 6, length: 0.1 },
    { at: [ix, 2.72, TT] },
  );
  label(ctx, 'spring', 'SPRING', [lx, 2.72, TT], 0.025, 0.3);
  valve_wheel(ctx, 'valve', {}, { at: [ix, 2.92, TT] });
  label(ctx, 'valve', 'VALVE', [lx, 2.92, TT], 0.025, 0.3);
  flange(ctx, 'flange', {}, { at: [ix, 3.18, TT] });
  label(ctx, 'flange', 'FLANGE', [lx, 3.18, TT], 0.025, 0.3);
}

/** Things that lie on the floor at the front: pipe, hose, wheel, beams. */
function frontRow(ctx: BuildContext): void {
  const x = 1.4;
  const lx = x + 0.45;
  pipe(ctx, 'pipe', {}, { at: [x, -3.2, T + 0.1085], yaw: Math.PI / 2 });
  label(ctx, 'pipe', 'PIPE', [lx, -2.7, T], 0.08, 0.5);
  const hose = {
    style: 'hose',
    diameter: 0.05,
    path: [0, 0, 0, 0.1, 0.5, 0, -0.15, 1.0, 0, 0.05, 1.5, 0],
  } as const;
  pipe(ctx, 'hose', hose, { at: [x, -1.7, T + 0.025] });
  label(ctx, 'hose', 'HOSE', [lx, -0.95, T], 0.08, 0.5);
  const spin = { kind: 'spin', axis: [0, 1, 0], rps: 0.25 } as const;
  wheel(ctx, 'wheel', {}, { at: [x, 0.2, T + 0.32], motion: spin, clearOf: ['plinth'] });
  label(ctx, 'wheel', 'WHEEL', [lx, 0.2, T], 0.08, 0.6);
  steel_beam(ctx, 'beam_i', { length: 1.2 }, { at: [x - 0.1, 1.0, T], yaw: Math.PI / 2 });
  const upn = {
    section: 'C',
    length: 1.2,
    depth: 0.12,
    width: 0.055,
    web: 0.007,
    flange: 0.009,
  } as const;
  steel_beam(ctx, 'beam_c', upn, { at: [x + 0.1, 1.0, T], yaw: Math.PI / 2 });
  label(ctx, 'beams', 'I + C BEAMS', [lx, 1.6, T], 0.08, 0.9);
}

export const parts_catalogue = defineAsset({
  name: 'parts_catalogue',
  kind: 'scene',
  description:
    'every part of the recipes/_parts kit at real scale, labelled, on a plinth and bench',
  tags: ['catalogue', 'parts', 'showcase'],
  budget: { triangles: [120000, 40000, 12000] },
  glow: [{ parts: ['lamp_glow'], color: hex('#ffd9a0'), strength: 6 }],
  build(ctx) {
    const bevel = ctx.pick([0.02, 0.01, 0]);
    ctx.part('plinth', box({ size: [5, 7, T], color: hex('#9a9890'), strip: 'concrete', bevel }));
    backRow(ctx);
    midRow(ctx);
    bench(ctx);
    frontRow(ctx);
  },
});
