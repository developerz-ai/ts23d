// LOD2 stand-ins built from THIS tree's LOD0, so the far switch keeps outline, value and the bole
// (a lathe of the crown envelope hid the trunk and popped for every species: D305).
// 'clumps': the LOD0 leaf cards clustered (vegetation-clumps.ts), each clump three crossed
// hexagonal cards sized by its own spread and tinted by its cards' mean colour, over a coarse
// trunk and the longest primary limbs. 'fronds': every LOD0 frond as one bent hexagonal card along its
// own rachis, rooted in the trunk top (palms). Everything is clamped into LOD0's crown box, so the
// tree's fit (height, spread) is the same at both ends of the switch.

import { dmath, type Mesh, MeshBuilder, merge, type Vec3 } from '../core/index.ts';
import { sweep } from '../primitives/index.ts';
import { type Clump, cluster, samples } from './vegetation-clumps.ts';
import { LEAFLET_VERTS } from './vegetation-fronds.ts';

export { fillBox } from './vegetation-fill.ts';

import type { Stem } from './vegetation-skeleton.ts';

/** Primary limbs kept under a clumped crown. */
const LIMBS = 3;
/** Triangles per clump: three crossed quads, both faces. */
const TRIS_PER_CLUMP = 12;

type V3 = [number, number, number];
const sub = (a: Vec3, b: Vec3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const lerp = (a: Vec3, b: Vec3, t: number): V3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const scaled = (a: Vec3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
function normal(a: Vec3, b: Vec3, c: Vec3): V3 {
  const [e1, e2] = [sub(b, a), sub(c, a)];
  const n: V3 = [
    e1[1] * e2[2] - e1[2] * e2[1],
    e1[2] * e2[0] - e1[0] * e2[2],
    e1[0] * e2[1] - e1[1] * e2[0],
  ];
  const l = dmath.hypot(n[0], n[1], n[2]) || 1;
  return [n[0] / l, n[1] / l, n[2] / l];
}

/** A flat fan over `pts` (first point the hub), drawn on both sides with flat normals. */
function fan(mb: MeshBuilder, pts: readonly Vec3[], colors: readonly Vec3[]): void {
  const [a, b, c] = pts;
  if (!a || !b || !c) return;
  const n = normal(a, b, c);
  for (const s of [1, -1]) {
    const ids = pts.map((p, i) =>
      mb.vertex({ p, n: scaled(n, s), uv: [0, 0], color: colors[i] ?? [1, 1, 1] }),
    );
    for (let i = 1; i + 1 < ids.length; i++) {
      const [i0 = 0, i1 = 0, i2 = 0] = [ids[0], ids[i], ids[i + 1]];
      if (s > 0) mb.tri(i0, i1, i2);
      else mb.tri(i0, i2, i1);
    }
  }
}

/** The trunk at 6 path points and 5 sides, at the skeleton's radius (the fit widens it). */
export function farTrunk(trunk: Stem, bark: Vec3): Mesh {
  const n = trunk.pts.length - 1;
  const idx = [...new Set([0, 1, 2, 3, 4, 5].map((i) => Math.round((i * n) / 5)))];
  return sweep({
    section: { radius: 1, segments: 5 },
    path: idx.map((i): Vec3 => trunk.pts[i] ?? [0, 0, 0]),
    scale: idx.map((i) => trunk.radii[i] ?? 0.1),
    color: bark,
    strip: 'wood',
    caps: 'end',
  });
}

/** The longest first-order limbs as 3-sided two-segment sweeps (null: none, or they are fronds). */
export function farLimbs(stems: readonly Stem[], bark: Vec3): Mesh | null {
  const limbs = stems
    .filter((s) => s.level === 1 && s.pts.length >= 3)
    .sort((a, b) => b.length - a.length)
    .slice(0, LIMBS);
  if (limbs.length === 0) return null;
  return merge(
    limbs.map((s) => {
      const idx = [0, Math.round((s.pts.length - 1) / 2), s.pts.length - 1];
      return sweep({
        section: { radius: 1, segments: 3 },
        path: idx.map((i): Vec3 => s.pts[i] ?? [0, 0, 0]),
        // A triangle inscribed in r reads ~0.75 as wide as the round limb.
        scale: idx.map((i) => (s.radii[i] ?? 0.02) * 1.3),
        color: bark,
        strip: 'wood',
        caps: 'end',
      });
    }),
  );
}

/** Weighted `q`-quantile of `v` (pairs of value and weight, sorted in place). */
function quantile(v: [number, number][], q: number): number {
  v.sort((a, b) => a[0] - b[0]);
  const total = v.reduce((s, x) => s + x[1], 0);
  let acc = 0;
  for (const [x, w] of v) {
    acc += w;
    if (acc >= q * total) return x;
  }
  return v[v.length - 1]?.[0] ?? 0;
}

/** Far card size over the trimmed spread of its clump (tuned on the 32 px silhouette IoU). */
const GROW = 1.3;
/** Percentile trimmed off both ends of a clump's spread: stray cards do not size it. */
const TRIM = 0.03;
/** Far card area over the one-sided LOD0 leaf area it stands for, at most (sparse clumps). */
const FILL = 0.5;
/**
 * A clump of cards seen from afar: x across (−0.5…0.5), y foot to top. Narrow foot, wide
 * shoulders, no edge level (every other card is mirrored), so the crown's skyline stays ragged.
 */
const QUAD: readonly (readonly [number, number])[] = [
  [-0.36, 0],
  [0.36, 0.06],
  [0.5, 0.86],
  [-0.42, 1],
];
/** Share of its 1 × 1 cell the quad covers. */
const QUAD_AREA = 0.76;

/** Three crossed quads per clump, each sized by the spread of the clump's cards in its plane. */
function crossed(clumps: readonly Clump[]): Mesh {
  const mb = new MeshBuilder();
  for (const cl of clumps) {
    const c = cl.centre;
    const color: V3 = [0, 0, 0];
    for (const q of cl.members)
      for (let a = 0; a < 3; a++) color[a] = (color[a] ?? 0) + (q.w * (q.c[a] ?? 0)) / cl.w;
    const span = (axis: Vec3): [number, number] => {
      const v = cl.members.map((q): [number, number] => {
        const d = sub(q.p, c);
        return [d[0] * axis[0] + d[1] * axis[1] + d[2] * axis[2], q.w];
      });
      return [quantile(v, TRIM) * GROW, quantile(v, 1 - TRIM) * GROW];
    };
    const [z0, z1] = span([0, 0, 1]);
    for (let j = 0; j < 3; j++) {
      const a = (j / 3) * Math.PI + (c[0] * 0.7 + c[1] * 1.3);
      const flip = j === 1 ? -1 : 1;
      const across: Vec3 = [dmath.cos(a), dmath.sin(a), 0];
      const [x0, x1] = span(across);
      // Flat pads (pine) still need a body from the side: at least a quarter of their width.
      const h0 = Math.max(z1 - z0, (x1 - x0) / 4);
      // A sparse clump (birch) must not become a solid one: a card is no larger than the leaf
      // area it stands for (`w` counts both faces of every card).
      const k = Math.min(1, Math.sqrt((FILL * GROW * cl.w) / 2 / (QUAD_AREA * (x1 - x0) * h0)));
      const [w, h] = [(x1 - x0) * k, h0 * k];
      const mid = (x0 + x1) / 2;
      // Cards lean back from vertical, so the crown is also covered from above.
      const dir: Vec3 = [-dmath.sin(a) * 0.45 * h, dmath.cos(a) * 0.45 * h, h];
      const foot: Vec3 = [
        c[0] + across[0] * mid - dir[0] / 2,
        c[1] + across[1] * mid - dir[1] / 2,
        c[2] + (z0 + z1) / 2 - dir[2] / 2,
      ];
      fan(
        mb,
        QUAD.map(
          ([x, y]): Vec3 => [
            foot[0] + across[0] * w * x * flip + dir[0] * y,
            foot[1] + across[1] * w * x * flip + dir[1] * y,
            foot[2] + across[2] * w * x * flip + dir[2] * y,
          ],
        ),
        // Darker at the foot, lighter at the top, the clump's own mean in the middle.
        QUAD.map(([, y]) => scaled(color, 0.85 + 0.3 * y)),
      );
    }
  }
  return mb.build();
}

/**
 * The far crown: the LOD0 cards `near` in as many clumps as `budget` triangles buy, three crossed
 * quads each, fitted to the spread of the clump's own cards and tinted by their mean colour.
 */
export function clumpCards(near: Mesh, budget: number): Mesh {
  return crossed(cluster(samples(near), Math.max(1, Math.floor(budget / TRIS_PER_CLUMP))));
}

/** Far frond half-width over the LOD0 leaflet reach (tuned on the 32 px silhouette IoU). */
const FROND_WIDTH = 0.7;
/** Triangles of the simplest far frond: two 4-point fans, both faces. */
const KITE = 8;

/**
 * One folded card per LOD0 frond, read back from the leaflet mesh `near` (`perSide` leaflet pairs
 * per frond, in the order of `fronds`): root on the frond's first rachis point (inside the trunk
 * top), the ridge along the bent rachis, each side out to the leaflet tips mid-frond, then in to
 * the rachis end. At most `budget` triangles: beyond that fronds are skipped evenly.
 */
export function frondCards(
  near: Mesh,
  fronds: readonly Stem[],
  perSide: number,
  budget: number,
): Mesh {
  const mb = new MeshBuilder();
  const at = (a: Float32Array, i: number): V3 => [
    a[i * 3] ?? 0,
    a[i * 3 + 1] ?? 0,
    a[i * 3 + 2] ?? 0,
  ];
  const perFrond = perSide * 2 * LEAFLET_VERTS;
  // Every frond gets a kite (8 triangles); what is left buys a second ridge point (+4) for as
  // many as it reaches, spread evenly over the crown: the bent rachis is what the outline follows.
  const n = Math.min(fronds.length, Math.floor(budget / KITE));
  const pick = (count: number, of: number): Set<number> =>
    new Set(Array.from({ length: count }, (_, i) => Math.floor((i * of) / Math.max(1, count))));
  const kept = pick(n, fronds.length);
  const bent = pick(Math.min(n, Math.max(0, Math.floor((budget - n * KITE) / 4))), fronds.length);
  fronds.forEach((st, f) => {
    const root = st.pts[0];
    const end = st.pts[st.pts.length - 1];
    if (!kept.has(f) || !root || !end || (f + 1) * perFrond > near.positions.length / 3) return;
    // Leaflet `i` on side `s` (0 | 1): vertices [root−, root+, tip] × two faces.
    const leaflet = (i: number, s: number): number => f * perFrond + (i * 2 + s) * LEAFLET_VERTS;
    const station = (t: number) => {
      const i = Math.min(perSide - 1, Math.round(perSide * t));
      const [l, r] = [leaflet(i, 0), leaflet(i, 1)];
      const ridge = lerp(at(near.positions, l), at(near.positions, r), 0.5);
      // The far card is solid where the frond is a comb of leaflets: narrower, to weigh the same.
      return {
        ridge,
        left: lerp(ridge, at(near.positions, l + 2), FROND_WIDTH),
        right: lerp(ridge, at(near.positions, r + 2), FROND_WIDTH),
      };
    };
    const [a, m, b] = [station(0.3), station(0.4), station(0.75)];
    // Mean leaflet colour of this frond: darker along the rachis, lighter at the leaflet tips.
    const c: V3 = [0, 0, 0];
    for (let k = 0; k < perSide; k++) {
      const [c0, c1] = [at(near.colors, leaflet(k, 0)), at(near.colors, leaflet(k, 0) + 2)];
      for (let x = 0; x < 3; x++) c[x] = (c[x] ?? 0) + ((c0[x] ?? 0) + (c1[x] ?? 0)) / 2 / perSide;
    }
    const [low, high] = [scaled(c, 0.85), scaled(c, 1.15)];
    if (bent.has(f)) {
      fan(mb, [m.left, end, b.ridge, a.ridge, root], [high, high, low, low, low]);
      fan(mb, [m.right, root, a.ridge, b.ridge, end], [high, low, low, low, high]);
    } else {
      fan(mb, [m.left, end, m.ridge, root], [high, high, low, low]);
      fan(mb, [m.right, root, m.ridge, end], [high, low, low, high]);
    }
  });
  return mb.build();
}
