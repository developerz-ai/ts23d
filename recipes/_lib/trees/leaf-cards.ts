// Foliage as alpha-cut twig cards (the oak's, and the pine's needle sprays). The tree kind lays
// geometric cards (`strand` diamonds, `needles` brushes; double-sided) with its crown shading baked
// into vertex colour. `toCutout` turns each into one hexagonal card on a foliage cell (a painted twig of
// leaves, anchor bottom-centre): same root, length and shade, so the crown keeps its form and
// value but reads as leaves instead of paper polygons. The hexagon follows the painted cluster's
// outline, so the empty cell corners are not drawn even where alpha is not tested (the flat contact
// sheet), and a cutout surface is double-sided in the GLB and the beauty render, so one side does.
// `clumpCards` is the far LOD: the LOD0 cards clustered (../pine/clumps.ts) and each clump drawn
// as three crossed cards sized by its own spread and tinted by its cards' mean colour.

import {
  boundsOf,
  cellRect,
  type FoliageCellId,
  type Mesh,
  MeshBuilder,
  type Vec2,
  type Vec3,
} from '@developerz.ai/ts23d';
import { cluster, samples } from './clumps.ts';

/** Where a kind card's frame sits in its vertices: card size, root, tip and the two across. */
export interface CardLayout {
  readonly verts: number;
  readonly root: number;
  readonly tip: number;
  readonly across: readonly [number, number];
}
/** Kind `strand` card: 4 outline points (root, shoulder, tip, shoulder), front then back. */
export const STRAND: CardLayout = { verts: 8, root: 0, tip: 2, across: [1, 3] };
/** Kind needle brush card: 14 outline points (tip at 7, widest pair 3 / 11), front then back. */
export const NEEDLE: CardLayout = { verts: 28, root: 0, tip: 7, across: [3, 11] };
/** The painted twig's outline in cell space (x across 0..1, y up 0..1 from the anchor). */
const HEX: readonly Vec2[] = [
  [0.5, 0.0],
  [0.86, 0.26],
  [0.88, 0.72],
  [0.5, 0.99],
  [0.12, 0.72],
  [0.14, 0.26],
];

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

function at(m: Mesh, i: number): Vec3 {
  return [m.positions[i * 3] ?? 0, m.positions[i * 3 + 1] ?? 0, m.positions[i * 3 + 2] ?? 0];
}
function col(m: Mesh, i: number): Vec3 {
  return [m.colors[i * 3] ?? 0, m.colors[i * 3 + 1] ?? 0, m.colors[i * 3 + 2] ?? 0];
}

/**
 * One hexagonal twig card: anchor `root`, `side` the full width edge (cell U), `dir` the full
 * length edge (cell V). Colour `low` at the anchor blending to `high` at the tip.
 */
export function twigCard(
  mb: MeshBuilder,
  cellId: FoliageCellId,
  root: Vec3,
  side: Vec3,
  dir: Vec3,
  low: Vec3,
  high: Vec3,
): void {
  const r = cellRect(cellId);
  const e = 0.5 / 4096;
  const nRaw = cross(side, dir);
  const nl = len(nRaw) || 1;
  const n: Vec3 = [nRaw[0] / nl, nRaw[1] / nl, nRaw[2] / nl];
  const ids = HEX.map(([x, y]) => {
    const p = add(add(root, scale(side, x - 0.5)), scale(dir, y));
    const color: Vec3 = [
      low[0] + (high[0] - low[0]) * y,
      low[1] + (high[1] - low[1]) * y,
      low[2] + (high[2] - low[2]) * y,
    ];
    const uv: Vec2 = [r.u0 + e + x * (r.u1 - r.u0 - 2 * e), r.v0 + e + y * (r.v1 - r.v0 - 2 * e)];
    return mb.vertex({ p, n, uv, color });
  });
  const [a = 0, b = 0, c = 0, d = 0, f = 0, g = 0] = ids;
  mb.tri(a, b, c);
  mb.tri(a, c, d);
  mb.tri(a, d, f);
  mb.tri(a, f, g);
}

/** Kind colour ÷ the species leaf colour = the shade and hue jitter the kind baked in. */
function shadeOf(c: Vec3, leaf: Vec3, tint: Vec3): Vec3 {
  return [
    Math.min(1, (c[0] / Math.max(1e-3, leaf[0])) * tint[0]),
    Math.min(1, (c[1] / Math.max(1e-3, leaf[1])) * tint[1]),
    Math.min(1, (c[2] / Math.max(1e-3, leaf[2])) * tint[2]),
  ];
}

export interface CutoutOptions {
  readonly cell: FoliageCellId;
  readonly layout: CardLayout;
  /** The species leaf colour the kind tinted with (divided out: the cell is already painted). */
  readonly leaf: Vec3;
  /** Multiplier on the painted cell (near white keeps the painted greens). */
  readonly tint: Vec3;
  /** Card length over the kind's strand length (the painted twig fills ~95% of the cell). */
  readonly grow: number;
  /** Card width over its length. */
  readonly aspect: number;
  /** Lowest card z in the mesh's frame (clear of the ground through the crown's sway). */
  readonly floor?: number;
}

/** Largest s ≤ 1 keeping root + s·(corner − root) inside the box for every corner. */
function fitIn(root: Vec3, corners: readonly Vec3[], lo: Vec3, hi: Vec3): number {
  let s = 1;
  for (const q of corners)
    for (let k = 0; k < 3; k++) {
      const d = (q[k] ?? 0) - (root[k] ?? 0);
      if (d > 1e-9) s = Math.min(s, ((hi[k] ?? 0) - (root[k] ?? 0)) / d);
      if (d < -1e-9) s = Math.min(s, ((lo[k] ?? 0) - (root[k] ?? 0)) / d);
    }
  return Math.max(0.2, s);
}

/**
 * Every kind strand card → one cutout twig card rooted on the same twig point, shrunk about its
 * root where it would leave the kind's own (fitted) leaf envelope, so the tree keeps its measured
 * height and spread and its lowest cards their clearance above the ground.
 */
export function toCutout(leaves: Mesh, o: CutoutOptions): Mesh {
  const b = boundsOf(leaves);
  const hi = b.max;
  const lo: Vec3 = [b.min[0], b.min[1], Math.max(b.min[2], o.floor ?? -Infinity)];
  const L = o.layout;
  const n = Math.floor(leaves.positions.length / 3 / L.verts);
  const mb = new MeshBuilder();
  for (let k = 0; k < n; k++) {
    const v = k * L.verts;
    const root = at(leaves, v + L.root);
    const tip = at(leaves, v + L.tip);
    const across = sub(at(leaves, v + L.across[1]), at(leaves, v + L.across[0]));
    const l = len(sub(tip, root));
    const w = len(across);
    if (!(l > 1e-4 && w > 1e-4)) continue;
    let dir = scale(sub(tip, root), o.grow);
    let side = scale(across, (o.grow * l * o.aspect) / w);
    const half = scale(side, 0.5);
    const end = add(root, dir);
    const fit = fitIn(
      root,
      [sub(root, half), add(root, half), add(end, half), sub(end, half)],
      lo,
      hi,
    );
    dir = scale(dir, fit);
    side = scale(side, fit);
    // Anchor corner takes the root's shade, the tip the tip's (the kind's stem→tip gradient).
    const dark = shadeOf(col(leaves, v + L.root), o.leaf, o.tint);
    const light = shadeOf(col(leaves, v + L.tip), o.leaf, o.tint);
    twigCard(mb, o.cell, root, side, dir, dark, light);
  }
  return mb.build();
}

/**
 * Far crown: `count` clumps of the LOD0 cards, three crossed twig cards each (12 triangles), each
 * card ±`spread` standard deviations of its clump across, tinted `value` × the clump's mean.
 */
export function clumpCards(
  lod0Cards: Mesh,
  count: number,
  cellId: FoliageCellId,
  value: number,
  spread: number,
): { mesh: Mesh; centres: Vec3[] } {
  const clumps = cluster(samples(lod0Cards), count, 10);
  const mb = new MeshBuilder();
  for (const cl of clumps) {
    const [cx, cy, cz] = cl.centre;
    let [sx, sy, sz] = [0, 0, 0];
    const c: [number, number, number] = [0, 0, 0];
    for (const q of cl.members) {
      sx += q.w * (q.p[0] - cx) ** 2;
      sy += q.w * (q.p[1] - cy) ** 2;
      sz += q.w * (q.p[2] - cz) ** 2;
      for (let k = 0; k < 3; k++) c[k] = (c[k] ?? 0) + q.w * (q.c[k] ?? 0);
    }
    const w = cl.w;
    // ±`spread` std: the recipe sizes it so the 32 px LOD2 silhouette matches LOD0's (its test).
    const r = spread * Math.sqrt((sx + sy) / (2 * w));
    const h = spread * Math.sqrt(sz / w);
    const color: Vec3 = [(c[0] / w) * value, (c[1] / w) * value, (c[2] / w) * value];
    const low: Vec3 = [color[0] * 0.8, color[1] * 0.8, color[2] * 0.8];
    for (let j = 0; j < 3; j++) {
      const a = (j / 3) * Math.PI + (cx * 0.7 + cy * 1.3);
      const side: Vec3 = [Math.cos(a) * 2 * r, Math.sin(a) * 2 * r, 0];
      // Cards lean back from vertical, so the top view still covers the crown.
      const dir: Vec3 = [-Math.sin(a) * 0.9 * h, Math.cos(a) * 0.9 * h, 2 * h];
      const root: Vec3 = [cx - dir[0] / 2, cy - dir[1] / 2, cz - dir[2] / 2];
      twigCard(mb, cellId, root, side, dir, low, color);
    }
  }
  return { mesh: mb.build(), centres: clumps.map((cl) => cl.centre) };
}
