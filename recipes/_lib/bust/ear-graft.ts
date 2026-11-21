// A pointed ear on a skull-stage bust (elf, goblin): the base mesh's ear, drawn out by its race's
// deformer (recipes/_lib/face/ears.ts), is a film a few tenths of a millimetre thick at the tip,
// ragged where the mesh cell loses it. `tipPull` keeps that pull in the ear's own plane (out of
// it the auricle becomes a hollow tent), and `earGraft` builds a leaf of real cartilage over it
// with ear.ts's anatomy (`sheet`: blade, rolled helix, antihelix, concha, notches) from the ear's
// root to the deformer's tip. face-check.ts `measureEar` measures the result on the built skin.

import type { SculptEdit } from '@developerz.ai/ts23d';
import { dmath } from '@developerz.ai/ts23d';
import { type EarSpec, sheet } from './ear.ts';
import { add, cone2, cross, dot, type Frame, len, lerp, mul, norm, sub, type V } from './kit.ts';

/** The base ear's landmarks before the race's deformer, and its tip after it (a skull's, left). */
export interface EarPoints {
  readonly tragion: V;
  readonly earTop: V;
  readonly earLobe: V;
  readonly earBack: V;
  readonly earTip: V;
}

export interface EarGraft {
  /** The race's ear swing (its FaceSpec `ears.out`), degrees. */
  readonly out: number;
  /** Blade width at its widest, metres, and where along the blade that is (0 … 1). */
  readonly width: number;
  readonly belly: number;
  /** Cartilage thickness, metres (the rim rolls a little thicker). */
  readonly thick: number;
  /** The leading (front, upper) edge at the root, metres ahead of the root → tip line; it runs
   *  straight from there to the tip and the leaf's belly hangs on the trailing side. The bust's
   *  fine ear box (bust.ts `earBoxes`) ends 1 cm past the base ear and the tip: a blade bellied
   *  beyond the tip leaves it and its thin edge is lost in the head's coarse cell. */
  readonly lead: number;
  readonly notches?: EarSpec['notches'];
  readonly simple?: boolean;
}

/** The ear's own swing (recipes/_lib/face/ears.ts): a vector turned `out` degrees about the root
 *  axis u0 (lobe → top). */
function swung(u0: V, out: number): (d: V) => V {
  const a = (-out * Math.PI) / 180;
  return (d) => {
    const al = dot(d, u0);
    const perp = sub(d, mul(u0, al));
    return add(add(mul(u0, al), mul(perp, dmath.cos(a))), mul(cross(u0, perp), dmath.sin(a)));
  };
}

/**
 * A race's ear-tip pull (FaceSpec `ears.tip`: back, out, up, × H) that stays IN the swung ear's
 * plane: `reach` head heights from the helix top, raked `rake` degrees from the ear's axis toward
 * its back edge. A pull out of that plane drags the auricle into a hollow tent (the old goblin
 * ear: a paper cone, D574); in it, the ear stays one flat sheet a graft can enclose.
 */
export function tipPull(
  k0: Omit<EarPoints, 'earTip'>,
  out: number,
  rake: number,
  reach: number,
): V {
  const u0 = norm(sub(k0.earTop, k0.earLobe));
  const b0 = sub(k0.earBack, k0.tragion);
  const b = swung(u0, out)(norm(sub(b0, mul(u0, dot(b0, u0)))));
  const r = (rake * Math.PI) / 180;
  const d = add(mul(u0, reach * dmath.cos(r)), mul(b, reach * dmath.sin(r)));
  return [-d[0], d[1], d[2]];
}

/** The graft's frame on a skull's ear: u root → tip, v across toward the trailing (back, lower)
 *  edge, w out of the ear's face; and the blade's length. The blade lies in the plane of its own
 *  axis and the base ear's (lobe → top), where the deformer leaves the stretched sheet. The root
 *  sits half-way up the base ear, swung with it (the blade's broad base covers the whole of it). */
export function graftFrame(k0: EarPoints, g: EarGraft): { f: Frame; length: number } {
  const u0 = norm(sub(k0.earTop, k0.earLobe));
  const swing = swung(u0, g.out);
  const root = add(k0.tragion, swing(sub(lerp(k0.earLobe, k0.earTop, 0.5), k0.tragion)));
  const tip: V = [k0.earTip[0], Math.abs(k0.earTip[1]), k0.earTip[2]];
  const u = norm(sub(tip, root));
  const w0 = norm(cross(u, u0));
  const face = swing(cross(sub(k0.earBack, k0.tragion), u0));
  const w = dot(w0, face) < 0 ? mul(w0, -1) : w0;
  const v0 = cross(w, u);
  const trail = sub(norm(swing(sub(k0.earBack, k0.tragion))), u0);
  const v = dot(v0, trail) < 0 ? mul(v0, -1) : v0;
  return { f: { o: root, u, v, w }, length: len(sub(tip, root)) };
}

/** The leaf's midline (u, v) and half-widths, root → tip. */
function leaf(g: EarGraft, length: number): { mid: Array<[number, number]>; half: number[] } {
  const n = 11;
  const mid: Array<[number, number]> = [];
  const half: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const rise = dmath.sin((Math.PI / 2) * Math.min(1, t / g.belly));
    const fall = t <= g.belly ? 1 : 1 - dmath.pow((t - g.belly) / (1 - g.belly), 1.7);
    const h = Math.max(g.thick * 0.8, (g.width / 2) * (0.6 + 0.4 * rise) * fall);
    mid.push([length * t, h - g.lead * (1 - t)]);
    half.push(h);
  }
  return { mid, half };
}

/** A leaf blade over a skull-stage head's stretched ear: widest at `belly`, tapering (fuller
 *  than the deformer's film, which it encloses) to a round tip no thinner than the cartilage,
 *  with the helix, antihelix and concha of `sheet`. */
export function earGraft(k0: EarPoints, g: EarGraft): SculptEdit[] {
  const { f, length } = graftFrame(k0, g);
  const { mid, half } = leaf(g, length);
  const edits = sheet(f, mid, half, {
    thick: g.thick,
    reach: length,
    w: g.width,
    leaf: true,
    ...(g.simple ? { simple: true } : {}),
    ...(g.notches ? { notches: g.notches } : {}),
  });
  return [{ group: edits, blend: g.thick }];
}

/** The blade's midline, root → tip, in the bust's frame (its intended creases follow it, and
 *  face-check.ts `measureEar` gauges the cartilage on it, between the rims). */
export function graftLine(k0: EarPoints, g: EarGraft): V[] {
  const { f, length } = graftFrame(k0, g);
  return leaf(g, length).mid.map(([u, v]) => add(add(f.o, mul(f.u, u)), mul(f.v, v)));
}

/** The far LOD's ear: one tapered blade from the graft's root to its tip, never thinner than the
 *  coarse cell (`root` and `tip`: its radii, × the cell). Features are not sculpted at the far
 *  LOD, and the base's stretched film is far below its cell: without this the ear is gone. */
export function farEar(
  k0: EarPoints,
  g: EarGraft,
  cell: number,
  o: { readonly root: number; readonly tip: number; readonly color: V },
): SculptEdit[] {
  const { f, length } = graftFrame(k0, g);
  const tip = add(f.o, mul(f.u, length));
  return [cone2(f.o, tip, cell * o.root, cell * o.tip, { blend: cell * 0.4, color: o.color })];
}
