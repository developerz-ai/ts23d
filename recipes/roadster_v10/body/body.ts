// Body nodes: the static shell (cowl, fenders, sills, quarters, deck, fascias) and the moving
// panels as hinged pivots — `hood` (clamshell on rear goosenecks at the cowl), `door_l/_r` (A-pillar hinges),
// `trunk_lid`. `open` (0..1) bakes the panels part-way open for the `_open` showcase asset; its
// motion clips then swing the panels shut again (the same sector, the other way), never past
// their stops.

import type { BuildContext, Mesh, Motion, Vec3 } from '@developerz.ai/ts23d';
import { dmath, merge } from '@developerz.ai/ts23d';
import { X_DOOR_FRONT } from '../dims.ts';
import { PIPE_TIP } from '../engine/exhaust.ts';
import { C } from '../lib/colors.ts';
import { bothSides, DEG, mirrorY, mul, rotateAbout, shift, smooth, sub } from '../lib/geo.ts';
import type { Surface } from '../lib/grid.ts';
import { filmed, roadFilm } from '../lib/wear.ts';
import { bodyPanels, quality, X_HOOD_REAR, X_TRUNK_FRONT } from './panels.ts';
import { U } from './shape.ts';

export interface Hinges {
  readonly hood: Vec3;
  readonly door: Vec3;
  readonly trunk: Vec3;
}

export const HOOD_DEG = 50;
/** The hood lifts its nose: it turns about −Y at the cowl. */
export const HOOD_AXIS: Vec3 = [0, -1, 0];
export const DOOR_DEG = 65;
export const TRUNK_DEG = 50;

export function hinges(S: Surface): Hinges {
  const doorSkin = S.row(X_DOOR_FRONT)(U.side);
  return {
    // Gooseneck pins under the cowl, 3 cm behind the hood's rear edge and 2–3 cm under the skin:
    // the rear edge rises as it swings back, so it clears the cowl and the wipers.
    hood: [X_HOOD_REAR - 0.03, 0, 0.87],
    door: [X_DOOR_FRONT - 0.004, doorSkin[1] + 0.006, 0.5],
    // The goosenecks' pins on the deck bulkhead: the lid turns about them, not about its skin.
    trunk: [X_TRUNK_FRONT - 0.02, 0, 0.84],
  };
}

export interface BodyOptions {
  /** 0 = closed, 1 = fully open (baked into the meshes; for the open showcase). */
  readonly open: number;
  /** Body-colour detail merged into each panel group (paint slot `body`). */
  readonly extras?: {
    readonly hood?: Mesh[];
    readonly door?: Mesh[];
    readonly trunk?: Mesh[];
    readonly shell?: Mesh[];
  };
  /** Non-paint detail riding on a moving panel (left-door frame for `door`), in the car frame:
   *  added as `<panel>_trim` children so liveries never tint them. */
  readonly trim?: {
    readonly hood?: Mesh[];
    readonly door?: Mesh[];
    readonly trunk?: Mesh[];
  };
  /** Twin stripes (paint slot `stripe`): static, on the hood, on the trunk lid. */
  readonly stripes?: { readonly shell: Mesh; readonly hood: Mesh; readonly trunk: Mesh };
  /** The part carrying the door hinge pins the doors' leaves turn on (when it is built). */
  readonly doorHinge?: string;
  readonly hoodClearOf: readonly string[];
  readonly doorClearOf: readonly string[];
  readonly trunkClearOf: readonly string[];
}

/** Adds the static panels, hood, door_l, door_r, trunk_lid (+ trims, stripes). Returns the hinges. */
export function body(ctx: BuildContext, S: Surface, o: BodyOptions): Hinges {
  // Lacquer under the road film the tyres throw up, and the soot the side pipes leave behind
  // their tips: baked into the tone, so every LOD and livery carries it.
  const film = filmed(C.paint, roadFilm(ctx.rng.fork('road_film')));
  const q = quality(ctx.lod, (at) => {
    const c = film(at);
    const tip: Vec3 = [PIPE_TIP[0], Math.abs(at[1]) < 0.01 ? 0 : PIPE_TIP[1], PIPE_TIP[2]];
    const back = (tip[0] - at[0]) / 0.55;
    if (back < -0.2 || back > 1) return c;
    const d = dmath.hypot((Math.abs(at[1]) - tip[1]) / 0.2, (at[2] - tip[2] - 0.1 * back) / 0.2);
    const k = 1 - 0.8 * (1 - smooth(0.25, 1, d)) * (1 - smooth(0.35, 1, back));
    return [c[0] * k, c[1] * k, c[2] * k];
  });
  const p = bodyPanels(S, q);
  const h = hinges(S);
  const ex = o.extras ?? {};
  // Static panels as separate named parts (damage models, decals and QA bind to them).
  const pair = (name: string, m: Mesh): void => {
    ctx.part(`${name}_l`, m, { paint: 'body' });
    ctx.part(`${name}_r`, mirrorY(m), { paint: 'body' });
  };
  pair('fender', p.fender);
  pair('sill', p.sill);
  pair('quarter', p.quarter);
  ctx.part('cowl', bothSides(p.cowl), { paint: 'body' });
  ctx.part('rear_deck', bothSides(p.deck), { paint: 'body' });
  ctx.part('nose_fascia', merge([bothSides(p.noseFascia), ...(ex.shell ?? [])]), { paint: 'body' });
  ctx.part('tail_fascia', bothSides(p.tailFascia), { paint: 'body' });
  // Hood: authored around its hinge at the cowl, nose lifting.
  const hood = shift(merge([bothSides(p.hood), ...(ex.hood ?? [])]), sub([0, 0, 0], h.hood));
  const hoodRot = (m: Mesh): Mesh => rotateAbout(m, [0, 0, 0], HOOD_AXIS, o.open * HOOD_DEG * DEG);
  // A panel baked open swings shut: the opening sector, travelled back to closed.
  const swing = (axis: Vec3, degrees: number): Motion =>
    o.open > 0
      ? { kind: 'sway', axis: mul(axis, -1), degrees: degrees * o.open, hz: 0.25, oneWay: true }
      : { kind: 'sway', axis, degrees, hz: 0.25, oneWay: true };
  ctx.part('hood', hoodRot(hood), {
    at: h.hood,
    motion: swing(HOOD_AXIS, HOOD_DEG),
    clearOf: o.hoodClearOf,
    paint: 'body',
  });
  const tr = o.trim ?? {};
  if (tr.hood?.length)
    ctx.part('hood_trim', hoodRot(shift(merge(tr.hood), sub([0, 0, 0], h.hood))), {
      parent: 'hood',
    });
  const st = o.stripes;
  if (st) {
    ctx.part('body_stripes', st.shell, { paint: 'stripe' });
    ctx.part('hood_stripes', hoodRot(shift(st.hood, sub([0, 0, 0], h.hood))), {
      parent: 'hood',
      paint: 'stripe',
    });
  }
  const trunk = shift(merge([bothSides(p.trunk), ...(ex.trunk ?? [])]), sub([0, 0, 0], h.trunk));
  const trunkRot = (m: Mesh): Mesh =>
    rotateAbout(m, [0, 0, 0], [0, 1, 0], o.open * TRUNK_DEG * DEG);
  ctx.part('trunk_lid', trunkRot(trunk), {
    at: h.trunk,
    motion: swing([0, 1, 0], TRUNK_DEG),
    clearOf: o.trunkClearOf,
    paint: 'body',
  });
  if (tr.trunk?.length)
    ctx.part('trunk_lid_trim', trunkRot(shift(merge(tr.trunk), sub([0, 0, 0], h.trunk))), {
      parent: 'trunk_lid',
    });
  if (st)
    ctx.part('trunk_lid_stripes', trunkRot(shift(st.trunk, sub([0, 0, 0], h.trunk))), {
      parent: 'trunk_lid',
      paint: 'stripe',
    });
  const doorL = shift(merge([p.door, ...(ex.door ?? [])]), sub([0, 0, 0], h.door));
  const doorTrimL = tr.door?.length ? shift(merge(tr.door), sub([0, 0, 0], h.door)) : null;
  for (const side of [1, -1] as const) {
    const name = side > 0 ? 'door_l' : 'door_r';
    const axis: Vec3 = [0, 0, -side];
    const local = side > 0 ? doorL : mirrorY(doorL);
    ctx.part(name, rotateAbout(local, [0, 0, 0], axis, o.open * DOOR_DEG * DEG), {
      at: [h.door[0], side * h.door[1], h.door[2]],
      motion: swing(axis, DOOR_DEG),
      // The quarter's front flange sits 4.5 mm behind the door's rear edge (the shut line).
      clearOf: [...o.doorClearOf, `quarter_${side > 0 ? 'l' : 'r'}`],
      paint: 'body',
      ...(o.doorHinge ? { connect: { as: 'hinge', to: o.doorHinge } } : {}),
    });
    if (doorTrimL) {
      const lt = side > 0 ? doorTrimL : mirrorY(doorTrimL);
      ctx.part(`${name}_trim`, rotateAbout(lt, [0, 0, 0], axis, o.open * DOOR_DEG * DEG), {
        parent: name,
      });
    }
  }
  return h;
}
