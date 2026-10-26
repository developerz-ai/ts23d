// Leaf cards: double-sided `planar` polygons, each standing for a cluster of leaves, with per-vertex
// colour (darker at the stem, lighter at the tip, darker deep inside the crown). LOD0 roots every
// card on an exact twig vertex (`transportFrames` = the sweep's own frames); LOD1 replaces each
// twig by one bigger cluster card rooted on its parent's bark.

import { type Mesh, merge, type Rng, type Vec3 } from '../core/index.ts';
import { planar, transportFrames } from '../primitives/index.ts';
import { type LeafParams, OUTLINES } from './vegetation-params.ts';
import type { Stem } from './vegetation-skeleton.ts';

const unit = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Crown occlusion: cards deep inside / low in the crown are darker. */
export interface CrownShade {
  readonly centre: Vec3;
  readonly radius: number;
  readonly zMin: number;
  readonly zMax: number;
}

export function crownShade(stems: readonly Stem[], level: number): CrownShade {
  let r = 0.1;
  let z0 = Infinity;
  let z1 = -Infinity;
  const t = stems[0]?.pts;
  const c = t?.[t.length - 1] ?? [0, 0, 0];
  for (const s of stems) {
    if (s.level < level) continue;
    for (const p of s.pts) {
      r = Math.max(r, Math.hypot(p[0] - c[0], p[1] - c[1]));
      z0 = Math.min(z0, p[2]);
      z1 = Math.max(z1, p[2]);
    }
  }
  return { centre: c, radius: r, zMin: z0, zMax: Math.max(z1, z0 + 0.1) };
}

function card(
  leaf: LeafParams,
  base: Vec3,
  dir: Vec3,
  side: Vec3,
  len: number,
  shade: CrownShade,
  rng: Rng,
): Mesh {
  const outline = OUTLINES[leaf.shape === 'frond' ? 'oval' : leaf.shape];
  const w = len * leaf.width;
  const points = outline.map(
    ([u, v]): Vec3 => [
      base[0] + dir[0] * u * len + side[0] * v * w,
      base[1] + dir[1] * u * len + side[1] * v * w,
      base[2] + dir[2] * u * len + side[2] * v * w,
    ],
  );
  const m = planar({ points, color: leaf.color, doubleSided: true });
  const k = 1 + rng.range(-leaf.colorVar, leaf.colorVar);
  const hue = rng.range(-leaf.colorVar, leaf.colorVar) * 0.6;
  const radial = Math.hypot(base[0] - shade.centre[0], base[1] - shade.centre[1]) / shade.radius;
  const up = (base[2] - shade.zMin) / (shade.zMax - shade.zMin);
  const ao = 0.5 + 0.35 * Math.min(1, radial) ** 0.8 + 0.2 * Math.max(0, Math.min(1, up));
  const [r, g, b] = leaf.color;
  for (let i = 0; i < m.colors.length / 3; i++) {
    const u = outline[i % outline.length]?.[0] ?? 0;
    const s = ao * k * (0.7 + 0.4 * u);
    m.colors[i * 3] = r * s * (1 + hue);
    m.colors[i * 3 + 1] = g * s;
    m.colors[i * 3 + 2] = b * s * (1 - hue);
  }
  return m;
}

/** Splay outward from the stem, lift a little, then droop towards the ground by `hang`. */
function aim(radial: Vec3, along: Vec3, leaf: LeafParams, rng: Rng): { dir: Vec3; side: Vec3 } {
  const hang = leaf.hang ?? 0;
  const flat = leaf.flat ?? 0;
  const lift = rng.range(-0.3, 0.5);
  const out = unit([
    radial[0] * 0.9 + along[0] * 0.7,
    radial[1] * 0.9 + along[1] * 0.7,
    radial[2] * 0.9 + along[2] * 0.7 + lift,
  ]);
  const d0 = unit([out[0] * (1 - hang), out[1] * (1 - hang), out[2] * (1 - hang) - hang]);
  const dir = unit([d0[0], d0[1], d0[2] * (1 - flat)]);
  const level = unit([-dir[1], dir[0], 0]);
  const s1 = unit([
    dir[1] * radial[2] - dir[2] * radial[1],
    dir[2] * radial[0] - dir[0] * radial[2],
    dir[0] * radial[1] - dir[1] * radial[0],
  ]);
  const s0 = Math.hypot(...s1) < 0.5 ? level : s1;
  // Flat cards (pine pads) lie level: side goes horizontal, roll fades out.
  const side = unit([
    s0[0] + (level[0] - s0[0]) * flat,
    s0[1] + (level[1] - s0[1]) * flat,
    s0[2] + (level[2] - s0[2]) * flat,
  ]);
  const roll = rng.range(-0.7, 0.7) * (1 - flat);
  const t: Vec3 = [
    dir[1] * side[2] - dir[2] * side[1],
    dir[2] * side[0] - dir[0] * side[2],
    dir[0] * side[1] - dir[1] * side[0],
  ];
  const c = Math.cos(roll);
  const s = Math.sin(roll);
  return { dir, side: [side[0] * c + t[0] * s, side[1] * c + t[1] * s, side[2] * c + t[2] * s] };
}

/** LOD0: `perStem` cards along the outer 70% of every terminal stem, rooted on a ring vertex. */
export function leafCards(
  stems: readonly Stem[],
  level: number,
  ringSegments: number,
  leaf: LeafParams,
  shade: CrownShade,
  rng: Rng,
): Mesh {
  const out: Mesh[] = [];
  for (const st of stems) {
    if (st.level !== level) continue;
    const frames = transportFrames(st.pts);
    const res = st.pts.length - 1;
    for (let i = 0; i < leaf.perStem; i++) {
      const from = leaf.from ?? 0.3;
      const t = from + ((1 - from) * (i + 1)) / leaf.perStem;
      const j = Math.max(1, Math.min(res, Math.round(t * res)));
      const f = frames[j];
      const c = st.pts[j];
      if (!f || !c) continue;
      const a = (rng.int(0, ringSegments - 1) / ringSegments) * Math.PI * 2;
      const radial: Vec3 = [
        Math.cos(a) * f.n[0] + Math.sin(a) * f.b[0],
        Math.cos(a) * f.n[1] + Math.sin(a) * f.b[1],
        Math.cos(a) * f.n[2] + Math.sin(a) * f.b[2],
      ];
      const r = st.radii[j] ?? 0;
      const base: Vec3 = [c[0] + radial[0] * r, c[1] + radial[1] * r, c[2] + radial[2] * r];
      const { dir, side } = aim(radial, f.t, leaf, rng);
      out.push(card(leaf, base, dir, side, leaf.size * rng.range(0.8, 1.2), shade, rng));
    }
  }
  return merge(out);
}

/** LOD1: one cluster card per (unemitted) twig, rooted where the twig would leave its parent. */
export function clusterCards(
  stems: readonly Stem[],
  level: number,
  leaf: LeafParams,
  shade: CrownShade,
  rng: Rng,
): Mesh {
  const out: Mesh[] = [];
  for (const st of stems) {
    if (st.level !== level) continue;
    const tip = st.pts[st.pts.length - 1] ?? st.surface;
    const p0 = st.pts[0] ?? st.surface;
    const along = unit([tip[0] - p0[0], tip[1] - p0[1], tip[2] - p0[2]]);
    const radial = unit([st.surface[0] - p0[0], st.surface[1] - p0[1], st.surface[2] - p0[2]]);
    const { dir, side } = aim(radial, along, leaf, rng);
    const len = st.length * 1.1 + leaf.size;
    out.push(card(leaf, st.surface, dir, side, len, shade, rng));
  }
  return merge(out);
}
