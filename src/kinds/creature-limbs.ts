// Limbs as sculpt edits and meshes (left side; the body sculpt mirrors): each leg is a bone chain
// through its joints (spline-smoothed skin) plus the muscle masses at its root and the joint knobs
// (elbow point, hock), ending in a foot (creature-feet.ts: paws, soles, hooves, bird toes). At LOD2
// the thin lower legs would break up at the coarse cell, so they are emitted as tubes instead.

import { type Mesh, merge, place, type Vec3 } from '../core/index.ts';
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

/** LOD2 legs: the same chains as tubes (and a sole tube per foot), both sides, painted. */
export function legTubes(b: Bones, paint: (p: Vec3) => Vec3): Mesh | null {
  if (b.legs.length === 0) return null;
  const parts: Mesh[] = [];
  for (const l of b.legs) {
    const nodes = limbNodes(l, 1).map((n) => ({ at: n.at, r: n.r * 1.12 }));
    parts.push(
      tubeMesh(
        nodes,
        6,
        nodes.map((n) => paint(v3.add(n.at, [0, n.r, 0]))),
      ),
    );
    const [sx, sy, sz] = l.footSize;
    const f = l.foot;
    const rr = Math.max(sy, sz) * 0.9;
    // The paw as a short tapered spindle resting on the ground (heel, ball, toes), not a box.
    // Closing radii at both ends round it off instead of leaving flat caps.
    const sole = [
      // Every ring sits on the ground (z = r): the whole sole is the support polygon.
      { at: [f[0] - sx * 0.75, f[1], rr * 0.4] as Vec3, r: rr * 0.4 },
      { at: [f[0] - sx * 0.4, f[1], rr * 0.8] as Vec3, r: rr * 0.8 },
      { at: [f[0] + sx * 0.25, f[1], rr * 0.9] as Vec3, r: rr * 0.9 },
      { at: [f[0] + sx * 0.75, f[1], rr * 0.55] as Vec3, r: rr * 0.55 },
      { at: [f[0] + sx * 0.98, f[1], rr * 0.25] as Vec3, r: rr * 0.25 },
    ];
    parts.push(
      tubeMesh(
        sole,
        8,
        sole.map((n) => v3.mul(paint(n.at), 0.85)),
      ),
    );
  }
  const left = merge(parts);
  return merge([left, place(left, { scale: [1, -1, 1] })]);
}
