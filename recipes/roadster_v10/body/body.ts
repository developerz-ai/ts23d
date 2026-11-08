// Body nodes: the static shell (cowl, fenders, sills, quarters, deck, fascias) and the moving
// panels as hinged pivots — `hood` (front-hinged clamshell), `door_l/_r` (A-pillar hinges),
// `trunk_lid`. `open` (0..1) bakes the panels part-way open for the `_open` showcase asset; the
// motion clips still swing from closed.

import type { BuildContext, Mesh, Vec3 } from '@developerz.ai/ts23d';
import { merge } from '@developerz.ai/ts23d';
import { X_DOOR_FRONT } from '../dims.ts';
import { C } from '../lib/colors.ts';
import { bothSides, DEG, mirrorY, rotateAbout, shift, sub } from '../lib/geo.ts';
import type { Surface } from '../lib/grid.ts';
import { bodyPanels, quality, X_HOOD_FRONT, X_TRUNK_FRONT } from './panels.ts';
import { U } from './shape.ts';

export interface Hinges {
  readonly hood: Vec3;
  readonly door: Vec3;
  readonly trunk: Vec3;
}

export const HOOD_DEG = 58;
export const DOOR_DEG = 65;
export const TRUNK_DEG = 50;

export function hinges(S: Surface): Hinges {
  const doorSkin = S.row(X_DOOR_FRONT)(U.side);
  return {
    hood: [X_HOOD_FRONT + 0.13, 0, 0.52],
    door: [X_DOOR_FRONT - 0.004, doorSkin[1] + 0.006, 0.5],
    trunk: [X_TRUNK_FRONT - 0.02, 0, 0.9],
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
  readonly hoodClearOf: readonly string[];
  readonly doorClearOf: readonly string[];
  readonly trunkClearOf: readonly string[];
}

/** Adds the static panels, hood, door_l, door_r, trunk_lid (+ trims, stripes). Returns the hinges. */
export function body(ctx: BuildContext, S: Surface, o: BodyOptions): Hinges {
  const q = quality(ctx.lod, C.paint);
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
  // Hood: authored around its hinge, opened about +Y.
  const hood = shift(merge([bothSides(p.hood), ...(ex.hood ?? [])]), sub([0, 0, 0], h.hood));
  const hoodRot = (m: Mesh): Mesh => rotateAbout(m, [0, 0, 0], [0, 1, 0], o.open * HOOD_DEG * DEG);
  ctx.part('hood', hoodRot(hood), {
    at: h.hood,
    motion: { kind: 'sway', axis: [0, 1, 0], degrees: HOOD_DEG, hz: 0.25, oneWay: true },
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
    motion: { kind: 'sway', axis: [0, 1, 0], degrees: TRUNK_DEG, hz: 0.25, oneWay: true },
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
      motion: { kind: 'sway', axis, degrees: DOOR_DEG, hz: 0.25, oneWay: true },
      // The quarter's front flange sits 4.5 mm behind the door's rear edge (the shut line).
      clearOf: [...o.doorClearOf, `quarter_${side > 0 ? 'l' : 'r'}`],
      paint: 'body',
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
