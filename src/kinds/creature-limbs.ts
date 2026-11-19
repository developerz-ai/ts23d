// Limbs as sculpt edits and meshes (left side; the body sculpt mirrors): each leg is a bone chain
// through its joints (spline-smoothed skin) plus the muscle masses at its root and the joint knobs
// (elbow point, hock), ending in a foot (creature-feet.ts: paws, soles, hooves, bird toes). At LOD2
// the thin lower legs would break up at the coarse cell, so they are emitted as tubes instead:
// 8-sided, with a ring wherever the coat's colour turns (a stocking edge), on rounded paws.

import { type Mesh, MeshBuilder, merge, place, type Vec3 } from '../core/index.ts';
import { stripRect } from '../material/index.ts';
import type { SculptEdit } from '../primitives/index.ts';
import type { Bones, Limb } from './creature-bones.ts';
import { spline, v3 } from './creature-curve.ts';
import { footEdits } from './creature-feet.ts';
import { type SkinNode, skin } from './creature-skin.ts';
import { tubeMesh } from './creature-tube.ts';

/** A limb chain through its joints, radii interpolated, smoothed by a spline. */
export function limbNodes(l: Limb, per: number): SkinNode[] {
  const path = spline(l.joints, per);
  const n = path.length - 1;
  return path.map((at, i) => {
    const t = (i / n) * (l.radii.length - 1);
    const k = Math.floor(t);
    const a = l.radii[Math.min(k, l.radii.length - 1)] ?? 0.05;
    const b = l.radii[Math.min(k + 1, l.radii.length - 1)] ?? a;
    return { at, r: a + (b - a) * (t - k) };
  });
}

/** Every leg's sculpt edits (LOD2: only the muscle masses; the legs come as tubes). */
export function legEdits(b: Bones, lod: number, hoof: Vec3): SculptEdit[] {
  const out: SculptEdit[] = [];
  for (const l of b.legs) {
    const r = l.radii[0] ?? 0.05;
    const group: SculptEdit[] = [];
    if (lod < 2) group.push(skin(limbNodes(l, lod === 0 ? 5 : 3), { blend: r * 0.5 }));
    // Muscles blend wide into the chain; landmarks (`fine`) stay crisp and exist only with it.
    for (const m of l.muscles)
      if (lod < 2 || !m.fine)
        group.push({
          shape: 'ellipsoid',
          at: m.at,
          size: m.r,
          blend: m.fine ? r * 0.35 : r * 0.7,
          ...(m.rotate ? { rotate: m.rotate } : {}),
        });
    if (lod < 2) group.push(...footEdits(b, l, lod, hoof));
    out.push({ group, blend: r * 0.6 });
  }
  return out;
}

/** Sides of a far-LOD leg tube (6 read as a faceted stick against the sculpted trunk). */
export const LEG_SIDES = 8;
/** Paint samples per joint span, the most colour rings a leg may add to its joint rings, and the
 *  colour shift (linear RGB, summed) a dropped sample may cost before it earns a ring. */
const SAMPLES = 6;
const MAX_EXTRA = 4;
const COLOUR_EPS = 0.05;

/** Which samples become rings: every joint, then (greedy, worst first) each sample whose colour
 *  the rings on either side of it would interpolate wrongly: a stocking edge between two joints
 *  gets a ring above and below it instead of smearing from joint to joint. */
function ringsAt(colors: readonly Vec3[], per: number): number[] {
  const kept: number[] = [];
  for (let i = 0; i < colors.length; i += per) kept.push(i);
  for (let extra = 0; extra < MAX_EXTRA; extra++) {
    let worst = -1;
    let dev = COLOUR_EPS;
    for (let k = 0; k + 1 < kept.length; k++) {
      const [a, z] = [kept[k] ?? 0, kept[k + 1] ?? 0];
      const ca: Vec3 = colors[a] ?? [0, 0, 0];
      const cz: Vec3 = colors[z] ?? ca;
      for (let i = a + 1; i < z; i++) {
        const want = v3.lerp(ca, cz, (i - a) / (z - a));
        const c = colors[i] ?? want;
        const d = Math.abs(c[0] - want[0]) + Math.abs(c[1] - want[1]) + Math.abs(c[2] - want[2]);
        if (d > dev) [dev, worst] = [d, i];
      }
    }
    if (worst < 0) break;
    kept.push(worst);
    kept.sort((a, z) => a - z);
  }
  return kept;
}

/** A far paw: an ellipsoid as long and wide as the foot, its underside pressed flat on the
 *  ground (the flat is the support polygon), one colour per ring heel → toes. */
function pawMesh(l: Limb, paint: (p: Vec3) => Vec3): Mesh {
  const [sx, sy, sz] = l.footSize;
  const [rx, ry, rz] = [sx, sy * 1.08, sz * 0.62];
  const c: Vec3 = [l.foot[0] + sx * 0.02, l.foot[1], sz * 0.38];
  const rect = stripRect('plain');
  const uv: [number, number] = [rect.u0 + 0.001, rect.v0 + 0.002];
  const [rings, sides] = [6, 10];
  const b = new MeshBuilder();
  const rows: number[][] = [];
  for (let i = 0; i <= rings; i++) {
    const th = (i / rings) * Math.PI;
    const x = c[0] - rx * Math.cos(th);
    const color = v3.mul(paint([x, c[1] + ry * Math.sin(th), sz * 0.5]), 0.85);
    const row: number[] = [];
    for (let j = 0; j <= sides; j++) {
      const ph = (j / sides) * Math.PI * 2;
      const n = v3.norm([
        -Math.cos(th) / rx,
        (Math.sin(th) * Math.cos(ph)) / ry,
        (Math.sin(th) * Math.sin(ph)) / rz,
      ]);
      const z = c[2] + rz * Math.sin(th) * Math.sin(ph);
      const p: Vec3 = [x, c[1] + ry * Math.sin(th) * Math.cos(ph), Math.max(0, z)];
      row.push(b.vertex({ p, n: z < 0 ? [0, 0, -1] : n, uv, color }));
    }
    rows.push(row);
  }
  for (let i = 0; i < rings; i++)
    for (let j = 0; j < sides; j++) {
      const [a, d] = [rows[i]?.[j] ?? 0, rows[i]?.[j + 1] ?? 0];
      const [e, f] = [rows[i + 1]?.[j] ?? 0, rows[i + 1]?.[j + 1] ?? 0];
      if (i > 0) b.tri(a, d, e);
      if (i < rings - 1) b.tri(d, f, e);
    }
  return b.build();
}

/** LOD2 legs: the same chains as 8-sided tubes with a ring wherever the paint turns, and a
 *  rounded paw per foot; both sides, painted. */
export function legTubes(b: Bones, paint: (p: Vec3) => Vec3): Mesh | null {
  if (b.legs.length === 0) return null;
  const parts: Mesh[] = [];
  for (const l of b.legs) {
    const nodes = limbNodes(l, SAMPLES).map((n) => ({ at: n.at, r: n.r * 1.12 }));
    // The coat on the leg's outer face, where it is seen from.
    const colors = nodes.map((n) => paint(v3.add(n.at, [0, n.r, 0])));
    const keep = ringsAt(colors, SAMPLES);
    parts.push(
      tubeMesh(
        keep.map((i) => nodes[i] ?? { at: l.foot, r: 0 }),
        LEG_SIDES,
        keep.map((i) => colors[i] ?? [1, 1, 1]),
      ),
      pawMesh(l, paint),
    );
  }
  const left = merge(parts);
  return merge([left, place(left, { scale: [1, -1, 1] })]);
}
