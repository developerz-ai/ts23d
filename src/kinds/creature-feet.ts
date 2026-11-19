// Feet (left side; the body sculpt and the claw mesh mirror): paws with any number of clawed toes
// in an arc (wolf 4, bear 5), the dewclaw (digit I) high on the inside of a digitigrade fore paw,
// a long plantigrade sole, a single hoof (horse) or a cloven one — two hoofed digits III + IV with
// the interdigital cleft at the front and dewclaws II + V behind the fetlock (cattle, deer, pig) —
// and a bird's three-forward-one-back toes. Claws/talons are keratin tubes rooted in the toes.
// Digits per foot come from the family (creature-family.ts); everything here is LOD0/1 only
// (LOD2 legs are tubes with a sole, creature-limbs.ts).

import { type Mesh, merge, place, type Vec3 } from '../core/index.ts';
import type { SculptEdit } from '../primitives/index.ts';
import type { Bones, Limb } from './creature-bones.ts';
import { v3 } from './creature-curve.ts';
import { skin } from './creature-skin.ts';
import { keratin } from './creature-tube.ts';

/** Toe knuckle centres in an arc: the middle toes lead, the outer ones sit back and splay. The
 *  spread is the same for any count (a five-toed bear foot is as wide as a four-toed paw). */
function knuckles(l: Limb): Vec3[] {
  const f = l.foot;
  const [sx, sy, sz] = l.footSize;
  const n = l.toes;
  const k = n > 1 ? 3 / (n - 1) : 0;
  return Array.from({ length: n }, (_, i) => i - (n - 1) / 2).map((j) => [
    f[0] + sx * (0.62 - 0.22 * Math.abs(j) * k),
    f[1] + j * sy * 0.5 * k,
    sz * 0.45,
  ]);
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

export interface Dewclaw {
  /** Knuckle centre (blended into the leg) and its radius scale. */
  readonly at: Vec3;
  readonly r: number;
}

/** Dewclaws of a foot, left side. A paw's digit I sits on the inside of the metacarpus about
 *  halfway between the paw and the carpus (dog; tiger ≈ 0.1 H); a cloven hoof's II + V hang
 *  behind the fetlock, either side of its back. */
export function dewclaws(l: Limb): Dewclaw[] {
  if (l.dewclaws === 0) return [];
  const C = l.joints[2] ?? l.foot;
  const P = l.joints[3] ?? l.foot;
  const rr = l.radii[2] ?? 0.02;
  if (l.hoof === 'cloven')
    return [1, -1].map((side) => ({
      at: v3.add(P, [-rr * 0.85, side * rr * 0.5, rr * 0.45]),
      r: rr,
    }));
  const top = l.footSize[2];
  const z = top + 0.45 * (C[2] - top);
  const t = Math.min(1, Math.max(0, (C[2] - z) / Math.max(1e-6, C[2] - P[2])));
  const on = v3.lerp(C, P, t);
  return Array.from({ length: l.dewclaws }, (_, i) => ({
    at: v3.add(on, [-rr * 0.15 - i * rr * 0.5, -rr * 1.0, 0]),
    r: rr,
  }));
}

/** The foot's sculpt edits (LOD0/1). `hoof` is the keratin colour (hooves, pads, dewclaws). */
export function footEdits(b: Bones, l: Limb, lod: number, hoof: Vec3): SculptEdit[] {
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
  if (l.hoof === 'cloven')
    // Two hoofed digits splayed a little, the cleft between them open at the front; the
    // dewclaws as small horn knobs behind the fetlock.
    return [
      ...[1, -1].map(
        (side): SculptEdit => ({
          shape: 'cone',
          // Each claw as long as it is tall, the front wall raked back (top leans −X).
          at: [f[0] + sx * 0.15, f[1] + side * sy * 0.5, 0],
          size: [sx * 0.8, sx * 0.42, sz * 0.8],
          rotate: [0, -14, side * 8],
          blend: sz * 0.12,
          color: hoof,
        }),
      ),
      {
        shape: 'roundBox',
        at: [f[0] + sx * 0.75, f[1], sz * 0.35],
        size: [sx * 1.2, sy * 0.22, sz * 0.7],
        op: 'subtract',
        blend: sz * 0.04,
        color: hoof,
      },
      ...dewclaws(l).map(
        (d): SculptEdit => ({
          shape: 'ellipsoid',
          at: d.at,
          size: [d.r * 0.32, d.r * 0.26, d.r * 0.4],
          rotate: [0, -25, 0],
          blend: d.r * 0.15,
          color: hoof,
        }),
      ),
    ];
  if (l.hoof === 'single')
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
  // Paw: the palm pad block behind, arched toes in front, each its own knuckle so the partings
  // between them read; at LOD2 one rounded block.
  const wide = 4 / Math.max(4, l.toes);
  const out: SculptEdit[] = [
    {
      shape: 'ellipsoid',
      at: [f[0] - sx * 0.12, f[1], sz * 0.55],
      size: lod < 2 ? [sx * 0.62, sy * 0.82, sz * 0.6] : [sx, sy, sz * 0.9],
      blend: sz * 0.4,
    },
  ];
  if (lod < 2) {
    for (const k of knuckles(l))
      out.push({
        shape: 'ellipsoid',
        at: k,
        size: [sx * 0.32, sy * 0.27 * wide, sz * 0.45],
        rotate: [0, 16, 0],
        blend: sz * 0.12,
      });
    // Dewclaw knuckle: a small furred knob on the inside of the pastern.
    for (const d of dewclaws(l))
      out.push({
        shape: 'ellipsoid',
        at: d.at,
        size: [d.r * 0.42, d.r * 0.42, d.r * 0.6],
        blend: d.r * 0.2,
      });
    // Pads: the bare soles dark (keratin colour); the furred toes above keep the leg's coat.
    out.push({
      shape: 'ellipsoid',
      at: [f[0] + sx * 0.1, f[1], 0],
      size: [sx * 1.2, sy * 1.1, sz * 0.32],
      op: 'paint',
      blend: sz * 0.08,
      color: hoof,
    });
  }
  return out;
}

/** QA `connections` wants a grown piece's root ring buried this deep all round, metres. */
const BURIED = 0.003;

/**
 * Where a claw roots in its toe or dewclaw knob (an ellipsoid at `k` with semi-axes `semi`): the
 * root ring (no wider than the knuckle leaves room for) is sunk from the tip `t` toward the
 * centre until all of it lies `BURIED` inside the knuckle's own ellipsoid, so it scales with the
 * toe: a fox's 2 cm paw buries its claws as surely as a bear's, at any chest width, limb
 * thickness or sculpt cell.
 */
function clawRoot(
  semi: Vec3,
  k: Vec3,
  t: Vec3,
  dir: Vec3,
  wide: number,
): { base: Vec3; radius: number; sunk: number } {
  const radius = Math.min(wide, Math.min(semi[1], semi[2]) - BURIED);
  const u = v3.norm(v3.cross(dir, [0, 0, 1]));
  const w = v3.cross(dir, u);
  const inside = (c: Vec3): boolean => {
    for (let j = 0; j < 8; j++) {
      const a = (j / 8) * Math.PI * 2;
      const p = v3.add(c, v3.add(v3.mul(u, radius * Math.cos(a)), v3.mul(w, radius * Math.sin(a))));
      const q = [0, 1, 2].map((i) => ((p[i] ?? 0) - (k[i] ?? 0)) / ((semi[i] ?? 1) - BURIED));
      if (Math.hypot(...q) > 1) return false;
    }
    return true;
  };
  let base = t;
  for (let s = 0.05; s <= 1 && !inside(base); s += 0.05) base = v3.lerp(t, k, s);
  return { base, radius, sunk: v3.len(v3.sub(base, t)) };
}

/** Claws (paws, dewclaws included) or talons (bird), both sides; none for hooves or LOD2. */
export function clawMesh(
  b: Bones,
  lod: 0 | 1 | 2,
  colors: readonly [Vec3, Vec3, Vec3],
): Mesh | null {
  if (lod === 2) return null;
  const parts: Mesh[] = [];
  const shape = { segments: lod === 0 ? 5 : 3, sides: lod === 0 ? 7 : 5, colors };
  for (const l of b.legs) {
    if (l.hoof) continue;
    const [sx, sy, sz] = l.footSize;
    const bird = b.skeleton === 'bird';
    // The toe knuckles' semi-axes, as footEdits sculpts them.
    const semi: Vec3 = [sx * 0.32, sy * 0.27 * (4 / Math.max(4, l.toes)), sz * 0.45];
    const ks = knuckles(l);
    toes(b, l).forEach((t, i) => {
      const out = v3.norm([t[0] - l.foot[0], t[1] - l.foot[1], 0]);
      const dir: Vec3 = v3.norm([out[0], out[1], bird ? -0.35 : -0.9]);
      const root = bird ? null : clawRoot(semi, ks[i] ?? t, t, dir, sz * 0.17);
      parts.push(
        keratin({
          base: root ? root.base : v3.add(t, v3.mul(out, -sz * 0.1)),
          dir,
          down: [0, 0, -1],
          // What the root sinks into the toe the claw gains in length: the same claw shows.
          length: sz * (bird ? 1.9 : 0.45) + (root?.sunk ?? 0),
          radius: root ? root.radius : sz * 0.26,
          curl: bird ? 80 : 35,
          ...shape,
        }),
      );
    });
    // Dewclaw: a short claw from the knob, down and a little forward, curling back to the leg.
    for (const d of dewclaws(l)) {
      const dir = v3.norm([0.4, -0.25, -1]);
      const tip = v3.add(d.at, [d.r * 0.05, -d.r * 0.12, -d.r * 0.22]);
      const root = clawRoot([d.r * 0.42, d.r * 0.42, d.r * 0.6], d.at, tip, dir, sz * 0.16);
      parts.push(
        keratin({
          base: root.base,
          dir,
          down: [-1, 0.4, 0],
          length: sz * 0.6 + root.sunk,
          radius: root.radius,
          curl: 40,
          ...shape,
        }),
      );
    }
  }
  if (parts.length === 0) return null;
  const left = merge(parts);
  return merge([left, place(left, { scale: [1, -1, 1] })]);
}
