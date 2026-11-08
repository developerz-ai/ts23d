// Limbs as sculpt edits and meshes (left side; the body sculpt mirrors): each leg is a bone chain
// through its joints (spline-smoothed skin) plus the muscle masses at its root and the joint knobs
// (elbow point, hock), ending in a paw with toes, a long plantigrade sole, a hoof or a bird's
// three-forward-one-back toes. Claws/talons are separate keratin tubes rooted in the toes. At LOD2
// the thin lower legs would break up at the coarse cell, so they are emitted as tubes instead.

import { type Mesh, merge, place, type Vec3 } from '../core/index.ts';
import type { SculptEdit } from '../primitives/index.ts';
import type { Bones, Limb } from './creature-bones.ts';
import { spline, v3 } from './creature-curve.ts';
import { type SkinNode, skin } from './creature-skin.ts';
import { keratin, tubeMesh } from './creature-tube.ts';

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

/** Toe tips of a foot (front arc, where the claws grow), left side. */
export function toes(b: Bones, l: Limb): Vec3[] {
  const f = l.foot;
  const [sx, , sz] = l.footSize;
  if (b.skeleton === 'bird')
    return [-25, 0, 25, 180].map((a) => {
      const r = (a * Math.PI) / 180;
      const len = a === 180 ? sx * 0.55 : sx;
      return [f[0] + Math.cos(r) * len, f[1] + Math.sin(r) * len, sz * 0.5];
    });
  return knuckles(l).map((k) => [k[0] + sx * 0.16, k[1], sz * 0.36]);
}

/** Toe knuckle centres: the two middle toes lead, the outer two sit back and splay (canid/felid). */
function knuckles(l: Limb): Vec3[] {
  const f = l.foot;
  const [sx, sy, sz] = l.footSize;
  return [-1.5, -0.5, 0.5, 1.5].map((k) => [
    f[0] + sx * (0.62 - 0.22 * Math.abs(k)),
    f[1] + k * sy * 0.5,
    sz * 0.45,
  ]);
}

function footEdits(b: Bones, l: Limb, lod: number, hoof: Vec3): SculptEdit[] {
  const [sx, sy, sz] = l.footSize;
  const f = l.foot;
  if (b.skeleton === 'bird')
    return toes(b, l).map((t) =>
      skin(
        [
          { at: [f[0], f[1], sz], r: sz * 0.9 },
          { at: t, r: sz * 0.55 },
        ],
        { blend: sz * 0.5 },
      ),
    );
  if (l.toes === 0)
    // Hoof: a keratin cone on the ground, the coronet blending into the pastern.
    return [
      {
        shape: 'cone',
        at: [f[0], f[1], 0],
        size: [sx * 1.05, sx * 0.8, sz * 1.1],
        blend: sz * 0.15,
        color: hoof,
      },
    ];
  // Paw: the palm pad block behind, four arched toes in front, each its own knuckle so the
  // partings between them read; at LOD2 one rounded block.
  const out: SculptEdit[] = [
    {
      shape: 'ellipsoid',
      at: [f[0] - sx * 0.12, f[1], sz * 0.55],
      size: lod < 2 ? [sx * 0.62, sy * 0.82, sz * 0.6] : [sx, sy, sz * 0.9],
      blend: sz * 0.4,
    },
  ];
  if (lod < 2)
    for (const k of knuckles(l))
      out.push({
        shape: 'ellipsoid',
        at: k,
        size: [sx * 0.32, sy * 0.27, sz * 0.45],
        rotate: [0, 16, 0],
        blend: sz * 0.12,
      });
  // Pads: the bare soles dark (keratin colour); the furred toes above keep the leg's coat.
  if (lod < 2)
    out.push({
      shape: 'ellipsoid',
      at: [f[0] + sx * 0.1, f[1], 0],
      size: [sx * 1.2, sy * 1.1, sz * 0.32],
      op: 'paint',
      blend: sz * 0.08,
      color: hoof,
    });
  return out;
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

/** Claws (digitigrade/plantigrade) or talons (bird), both sides; none for hooves or LOD2. */
export function clawMesh(
  b: Bones,
  lod: 0 | 1 | 2,
  colors: readonly [Vec3, Vec3, Vec3],
): Mesh | null {
  if (lod === 2) return null;
  const parts: Mesh[] = [];
  for (const l of b.legs) {
    if (l.toes === 0) continue;
    const [, , sz] = l.footSize;
    const bird = b.skeleton === 'bird';
    toes(b, l).forEach((t) => {
      const out = v3.norm([t[0] - l.foot[0], t[1] - l.foot[1], 0]);
      const dir: Vec3 = v3.norm([out[0], out[1], bird ? -0.35 : -0.9]);
      parts.push(
        keratin({
          base: bird ? v3.add(t, v3.mul(out, -sz * 0.1)) : t,
          dir,
          down: [0, 0, -1],
          length: sz * (bird ? 1.9 : 0.45),
          radius: sz * (bird ? 0.26 : 0.17),
          curl: bird ? 80 : 35,
          segments: lod === 0 ? 5 : 3,
          sides: lod === 0 ? 7 : 5,
          colors,
        }),
      );
    });
  }
  if (parts.length === 0) return null;
  const left = merge(parts);
  return merge([left, place(left, { scale: [1, -1, 1] })]);
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
