// Head appendages, head-local (+X along the skull, left = +Y): the ears — erect blades with a pale
// cup carved at LOD0 (painted at coarse cells, where a carve leaves slivers) or round ones — grown
// from the crown along EAR_UP, and the upper canines as keratin tubes rooted above the lip line.

import { type Mesh, merge, place, type Vec3 } from '../core/index.ts';
import type { SculptEdit } from '../primitives/index.ts';
import { palette } from './creature-coat.ts';
import { v3 } from './creature-curve.ts';
import type { HeadLayout } from './creature-head.ts';
import { blade } from './creature-skin.ts';
import { type CreatureSpec, faceOf } from './creature-spec.ts';
import { keratin } from './creature-tube.ts';

/** A field edit turned into a paint stroke (colour only, no carve). */
function paintOf(e: SculptEdit, blend: number, color: Vec3): SculptEdit {
  return 'field' in e ? { field: e.field, bounds: e.bounds, op: 'paint', blend, color } : e;
}

/** Ear height ÷ head length. */
export function earHeight(s: CreatureSpec): number {
  const shape = faceOf(s).ears;
  return shape === 'none' ? 0 : (s.face?.earLength ?? (shape === 'erect' ? 0.38 : 0.2));
}

/** The ear's rising direction (left), head-local. */
export const EAR_UP: Vec3 = v3.norm([-0.25, 0.4, 1]);

export function earEdits(l: HeadLayout, s: CreatureSpec, res: number, fine: boolean): SculptEdit[] {
  const base = l.ear;
  if (!base) return [];
  const shape = faceOf(s).ears;
  const eh = l.earHeight;
  const up = EAR_UP;
  const face0 = v3.norm([1, 0.45, 0]);
  const face = v3.norm(v3.sub(face0, v3.mul(up, v3.dot(face0, up))));
  const at = (k: number): Vec3 => v3.add(base, v3.mul(up, k * eh));
  const round = shape === 'round';
  const pale = palette(s.colours).belly;
  const nodes = [
    { at: at(-0.15), r: eh * (round ? 0.42 : 0.36) },
    { at: at(0.45), r: eh * (round ? 0.38 : 0.2) },
    { at: at(round ? 0.82 : 1), r: Math.max(res * 0.5, eh * (round ? 0.2 : 0.06)) },
  ];
  const thick = Math.max(eh * 0.09, res * 0.75);
  const cup = nodes
    .slice(1)
    .map((n) => ({ at: v3.add(n.at, v3.mul(face, thick * 0.9)), r: n.r * 0.72 }));
  return [
    blade(nodes, face, thick, { blend: eh * 0.12 }),
    // The pale cup: carved at LOD0; painted at coarse cells, where a carve would leave slivers.
    fine
      ? { group: [blade(cup, face, thick * 0.8)], op: 'subtract', blend: thick * 0.4, color: pale }
      : paintOf(blade(cup, face, thick * 1.2), thick * 0.5, pale),
  ];
}

/** Upper canines, both sides: roots above the lip line, crowns outside the lower lip. */
export function fangs(l: HeadLayout, s: CreatureSpec, lod: number): Mesh | null {
  if (!s.face?.fangs) return null;
  const len = 0.11 * l.L;
  const one = keratin({
    base: [l.L - l.rt * 1.5, l.rt * 0.72, l.zm + len * 0.55],
    dir: [0.08, 0.06, -1],
    down: [-1, 0, 0],
    length: len,
    radius: 0.022 * l.L,
    curl: 18,
    segments: lod === 0 ? 6 : 3,
    sides: lod === 0 ? 8 : 5,
    colors: [
      [0.78, 0.72, 0.6],
      [0.88, 0.84, 0.74],
      [0.93, 0.9, 0.82],
    ],
  });
  return merge([one, place(one, { scale: [1, -1, 1] })]);
}
