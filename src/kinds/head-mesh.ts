// Head edit lists → meshes. One skull field is split by the jaw cutter into `head` (skull − cut,
// smooth-unioned with the ears) and `jaw` (skull ∩ cut, with the tusks), so the two parts share
// the exact same outer surface; their cut faces are painted mouth-dark for when the jaw opens.
// Eyeballs are their own spheres: sclera, iris, pupil by angle from the +X gaze.

import type { Mesh, Vec3 } from '../core/index.ts';
import { type Field, type SculptEdit, sculptField, sd, sdf } from '../primitives/index.ts';
import type { HeadLayout } from './head-layout.ts';
import type { HeadParams } from './head-params.ts';
import { creaseNormals, sharpenRim } from './head-rim.ts';
import { toned } from './head-tone.ts';

/** Cavity probe of the painted tone, head units: about one fold. */
const REACH = 0.05;
/** Default plinth colour (dark slate). */
export const PLINTH: Vec3 = [0.16, 0.15, 0.15];

/** The jaw region (head units): an ellipsoid around chin and lower lip, cut flat at the mouth
 *  line. Its skin seam runs along the lips, down the marionette lines and under the chin — creases
 *  a face already has — instead of across the cheek. */
export function jawRegion(
  p: HeadParams,
  l: HeadLayout,
): { field: Field; centre: Vec3; radii: Vec3 } {
  const chin = l.chin;
  const reach = Math.max(p.mouth.width * 1.08, (p.tusks?.spread ?? 0) + p.mouth.width * 0.5);
  const centre: Vec3 = [l.mouthX - 0.15, 0, l.mouthZ];
  const radii: Vec3 = [Math.max(0.27, l.mouthX - chin[0] + 0.2), reach, l.mouthZ - chin[2] + 0.1];
  const e = sd.ellipsoid(centre, radii);
  return { field: (q) => Math.max(q[2] - l.mouthZ, e(q)), centre, radii };
}

const unionBounds = (a: readonly [Vec3, Vec3], b?: readonly [Vec3, Vec3]): [Vec3, Vec3] =>
  b
    ? [
        [Math.min(a[0][0], b[0][0]), Math.min(a[0][1], b[0][1]), Math.min(a[0][2], b[0][2])],
        [Math.max(a[1][0], b[1][0]), Math.max(a[1][1], b[1][1]), Math.max(a[1][2], b[1][2])],
      ]
    : [a[0], a[1]];

/** The jaw region as a sculpt group (ellipsoid ∩ below the mouth line), grown by `grow`. */
function regionGroup(l: HeadLayout, r: { centre: Vec3; radii: Vec3 }, grow: number): SculptEdit {
  const cx = r.centre[0];
  const [rx, ry, rz] = r.radii;
  return {
    group: [
      { shape: 'ellipsoid', at: r.centre, size: [rx + grow, ry + grow, rz + grow] },
      {
        shape: 'roundBox',
        at: [cx, 0, l.mouthZ + grow - 1],
        size: [4, 4, 2],
        op: 'intersect',
      },
    ],
    mirror: false,
    blend: 0,
  };
}

export interface HeadEditSet {
  readonly skull: readonly SculptEdit[];
  readonly ears: readonly SculptEdit[];
  readonly tusks: readonly SculptEdit[];
  readonly bust: readonly SculptEdit[];
  /** The bust-cut region (≈ 0 on the cut faces), painted as bare plinth material. */
  readonly bustCut?: Field;
}

/** `head` and `jaw` meshes in head units at cell size `res` (units). Each is ONE sculpt (skull +
 *  ears − region, skull ∩ region + tusks), so the sculpt's range skipping covers every edit. */
export function headAndJaw(
  p: HeadParams,
  l: HeadLayout,
  set: HeadEditSet,
  res: number,
): { head: Mesh; jaw: Mesh } {
  const opts = { color: p.colors.skin, mirror: 'y' as const };
  const region = jawRegion(p, l);
  const cut = region.field;
  // The jaw reaches a little past the cut and sits a hair proud of the skin, so it laps over the
  // head like a lip: no gap opens along the seam where meshing leaves the two rims a cell apart.
  const lap = res * 0.75;
  const proud = res * 0.03;
  const ears: SculptEdit[] = set.ears.length > 0 ? [{ group: set.ears, blend: 0.02 }] : [];
  const tusks: SculptEdit[] = set.tusks.length > 0 ? [{ group: set.tusks, blend: 0.01 }] : [];
  const h = sculptField(
    [...set.skull, ...ears, { ...regionGroup(l, region, 0), op: 'subtract' }],
    opts,
  );
  const jRaw = sculptField(
    [...set.skull, { ...regionGroup(l, region, lap), op: 'intersect' }, ...tusks],
    opts,
  );
  const jField: Field = (q) => jRaw.field(q) - proud;
  const mouth = p.colors.mouth;
  // Only the skin-only skull is needed near the cut (paint + rim snapping): evaluated lazily.
  const skull = sculptField(set.skull, opts).field;
  // The painted tone reads the uncut surface (skin + ears, skin + tusks): the cut faces' normals
  // would light the jaw rim up as a pale outline.
  const extra = (e: readonly SculptEdit[]): Field =>
    e.length > 0
      ? (
          (f: Field): Field =>
          (q) =>
            Math.min(skull(q), f(q))
        )(sculptField(e, opts).field)
      : skull;
  const headTone = extra(set.ears);
  const jawTone = extra(set.tusks);
  const deep = -Math.max(res * 4, 0.03);
  const paint =
    (colorAt: (q: Vec3) => Vec3) =>
    (q: Vec3): Vec3 =>
      Math.abs(cut(q)) < res * 1.5 && skull(q) < deep ? mouth : colorAt(q);
  const [ec, er] = [region.centre, region.radii];
  const jb: [Vec3, Vec3] = [
    [ec[0] - er[0] - lap, -er[1] - lap, ec[2] - er[2] - lap],
    [ec[0] + er[0] + lap, er[1] + lap, ec[2] + lap + 0.01],
  ];
  const tb = set.tusks.length > 0 ? sculptField(set.tusks, opts).bounds : undefined;
  const head = sdf({
    field: h.field,
    bounds: h.bounds,
    resolution: res,
    color: toned(headTone, paint(h.colorAt), { reach: REACH }),
    symmetry: 'y',
  });
  const jaw = sdf({
    field: jField,
    bounds: unionBounds(jb, tb),
    resolution: res,
    color: toned(jawTone, paint(jRaw.colorAt), { reach: REACH }),
    symmetry: 'y',
  });
  // Coarse cells: snapping folds triangles over, and nobody sees a seam at that distance.
  if (res > 0.03) return { head: creaseNormals(head), jaw: creaseNormals(jaw) };
  const jawSkull: Field = (q) => skull(q) - proud;
  return {
    // The head's rim lies under the jaw's lap, so only the jaw rim (the visible one) is snapped.
    head: creaseNormals(head),
    jaw: creaseNormals(sharpenRim(jaw, jawSkull, (q) => cut(q) - lap, jField, res)),
  };
}

/** A surface point lies on a cut face: on the cut boundary, facing out of the cut region. */
function onCut(cut: Field, q: Vec3, n: Vec3, res: number): boolean {
  if (Math.abs(cut(q)) > res * 0.8) return false;
  const e = res * 0.5;
  const g: Vec3 = [
    cut([q[0] + e, q[1], q[2]]) - cut([q[0] - e, q[1], q[2]]),
    cut([q[0], q[1] + e, q[2]]) - cut([q[0], q[1] - e, q[2]]),
    cut([q[0], q[1], q[2] + e]) - cut([q[0], q[1], q[2] - e]),
  ];
  const l = Math.hypot(g[0], g[1], g[2]) || 1;
  return (g[0] * n[0] + g[1] * n[1] + g[2] * n[2]) / l > 0.85;
}

export function bustMesh(p: HeadParams, set: HeadEditSet, res: number): Mesh {
  const s = sculptField(set.bust, { color: p.colors.skin, mirror: 'y' });
  const tone = toned(s.field, s.colorAt, { reach: REACH * 1.4 });
  const cut = set.bustCut;
  const base = p.colors.plinth ?? PLINTH;
  const face: Vec3 = [base[0] * 1.3, base[1] * 1.3, base[2] * 1.3];
  return sdf({
    field: s.field,
    bounds: s.bounds,
    resolution: res,
    // Cut faces read as the bare material of a sculpted bust, not as sliced layers.
    color: cut ? (q, n) => (onCut(cut, q, n, res) ? face : tone(q)) : tone,
    symmetry: 'y',
  });
}

/** Eyeball of radius `r` centred on the origin, gazing +X. */
export function eyeMesh(p: HeadParams, r: number, res: number): Mesh {
  const c = p.colors;
  const iris = Math.cos(0.62);
  const limbus = Math.cos(0.7);
  const pupil = Math.cos(0.3);
  return sdf({
    field: (q) => Math.hypot(q[0], q[1], q[2]) - r,
    bounds: [
      [-r * 1.3, -r * 1.3, -r * 1.3],
      [r * 1.3, r * 1.3, r * 1.3],
    ],
    resolution: res,
    color: (q) => {
      const cos = q[0] / (Math.hypot(q[0], q[1], q[2]) || 1);
      if (cos > pupil) return c.pupil;
      if (cos > iris) return c.iris;
      if (cos > limbus) return [c.iris[0] * 0.45, c.iris[1] * 0.45, c.iris[2] * 0.45];
      return c.sclera;
    },
  });
}
