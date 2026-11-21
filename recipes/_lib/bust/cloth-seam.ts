// Seams as a tailor sews them, for the busts' garments: where two panels meet (a shoulder seam
// from the neck to the shoulder point, a side seam down from the armpit) the cloth dips into a
// groove between two pressed welts, and a row of running stitches in a paler thread sits on one
// side of it. On a patch, the same stitches run round its turned-under edge. Stitches are a few
// millimetres long: real geometry meshed on a fine cell of their own (`stitchLayer`), not vertex
// paint, which a garment's 7–10 mm cell cannot hold (D582).

import type { Field, SculptEdit, StripId } from '@developerz.ai/ts23d';
import { dmath } from '@developerz.ai/ts23d';
import { crease, type Surface, spline, sub, type V } from './kit.ts';
import type { GarmentLayer } from './layers.ts';

/** A seam's centre line ON the cloth: `ctrl` smoothed and laid `lift` metres off the body. */
export function seamLine(s: Surface, ctrl: readonly V[], lift: number, n = 12): V[] {
  return spline(ctrl, n).map((p) => s.off(p, lift));
}

/** The seam's groove: the cloth pulled in along the stitching line, `width` metres either side,
 *  in `color` (the seam's own shade). */
export function seamGroove(line: readonly V[], width: number, color: V): SculptEdit {
  return crease(line, width, { blend: width * 0.6, color, mirror: true, tips: 0.5 });
}

/** Running stitches along `line` (on the cloth's surface, so each is half sunk into it; `on`
 *  seats each on the garment's finished surface), one every `pitch` metres, each `length` long and
 *  `r` thick, shifted `side` metres level and square to the line, away from the midline (beside a
 *  seam's groove, not in it). */
export function stitches(
  line: readonly V[],
  o: {
    readonly pitch: number;
    readonly length: number;
    readonly r: number;
    readonly color: V;
    readonly side?: number;
    readonly mirror?: boolean;
    /** The garment as made (≤ 0 inside): each stitch seated on its surface (the line only guides
     *  them). */
    readonly on?: Field;
    /** Only the stitches whose centre passes (a rim clipped by the garment's edge). */
    readonly keep?: (p: V) => boolean;
  },
): SculptEdit[] {
  const out: SculptEdit[] = [];
  const side = o.side ?? 0;
  let s0 = 0;
  let next = o.pitch / 2;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i];
    const b = line[i + 1];
    if (!a || !b) continue;
    const d = sub(b, a);
    const l = dmath.hypot(d[0], d[1], d[2]);
    if (l < 1e-9) continue;
    const u: V = [d[0] / l, d[1] / l, d[2] / l];
    const hl = dmath.hypot(u[0], u[1]);
    const away = Math.sign(a[1]) || 1;
    const off: V = hl > 1e-6 ? [(-u[1] / hl) * side, (u[0] / hl) * side, 0] : [0, side * away, 0];
    // (Flip the shift so it always leads away from the midline.)
    const k = off[1] * away < 0 ? -1 : 1;
    for (; next < s0 + l; next += o.pitch) {
      const t = next - s0;
      const guide: V = [
        a[0] + u[0] * t + off[0] * k,
        a[1] + u[1] * t + off[1] * k,
        a[2] + u[2] * t + off[2] * k,
      ];
      const c = o.on ? seat(o.on, guide) : guide;
      if (o.keep && !o.keep(c)) continue;
      const h = o.length / 2;
      out.push({
        shape: 'capsule',
        at: [c[0] - u[0] * h, c[1] - u[1] * h, c[2] - u[2] * h],
        to: [c[0] + u[0] * h, c[1] + u[1] * h, c[2] + u[2] * h],
        size: o.r,
        color: o.color,
        ...(o.mirror === undefined ? {} : { mirror: o.mirror }),
      });
    }
    s0 += l;
  }
  return out;
}

/** Where the outward line through `p` (along `field`'s gradient) first enters it, searched 4 cm
 *  either side in half-millimetre steps: the garment's outer face near `p`. A Newton projection
 *  on a garment's slope-normalised field slid the stitches together along it. `p` if none. */
export function seat(field: Field, p: V): V {
  const e = 5e-4;
  const g: V = [
    field([p[0] + e, p[1], p[2]]) - field([p[0] - e, p[1], p[2]]),
    field([p[0], p[1] + e, p[2]]) - field([p[0], p[1] - e, p[2]]),
    field([p[0], p[1], p[2] + e]) - field([p[0], p[1], p[2] - e]),
  ];
  const l = dmath.hypot(g[0], g[1], g[2]);
  if (!(l > 0)) return p;
  const n: V = [g[0] / l, g[1] / l, g[2] / l];
  for (let t = 0.04; t >= -0.04; t -= 0.0005) {
    const q: V = [p[0] + n[0] * t, p[1] + n[1] * t, p[2] + n[2] * t];
    if (field(q) <= 0) return q;
  }
  return p;
}

/** The stitches as their own garment layer: meshed fine (LOD0 only: at LOD1's cell a 1 mm thread
 *  is gone), merged into `part`. */
export function stitchLayer(
  edits: readonly SculptEdit[],
  o: { readonly strip: StripId; readonly color: V; readonly part: string },
): GarmentLayer {
  return {
    name: 'stitches',
    part: o.part,
    strip: o.strip,
    color: o.color,
    cell: [0.0016, 0.002, 0.004],
    edits: [...edits],
  };
}

/** The first point inside `field` from `from` along the unit `dir`, 1 mm steps over `reach`
 *  metres (a stitch row laid onto a garment's face from outside it: never the nearest other
 *  surface a projection could snap to, nor a point slid along the face); undefined on a miss. */
export function castOnto(field: Field, from: V, dir: V, reach: number): V | undefined {
  for (let t = 0; t <= reach; t += 0.001) {
    const q: V = [from[0] + dir[0] * t, from[1] + dir[1] * t, from[2] + dir[2] * t];
    if (field(q) <= 0) return q;
  }
  return undefined;
}

/** `castOnto` straight down from (x, y, `top`) to `bottom`. */
export function dropOnto(
  field: Field,
  x: number,
  y: number,
  top: number,
  bottom: number,
): V | undefined {
  return castOnto(field, [x, y, top], [0, 0, -1], top - bottom);
}
