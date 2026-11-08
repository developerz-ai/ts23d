// Conifer needle tufts (LOD0, leaf shape `needles`): bottle-brushes clustered along the outer part
// of every twig. Each tuft is two crossed spiky cards whose spine runs along the twig's own axis
// (through its wood, so the brush is attached along a line, not hung off a point), turned up a
// little at the tips like a Scots pine shoot. Crossed cards keep the tuft full from any angle.

import { type Mesh, merge, type Rng, type Vec3 } from '../core/index.ts';
import { transportFrames } from '../primitives/index.ts';
import { type CrownShade, card } from './vegetation-leaves.ts';
import type { LeafParams } from './vegetation-params.ts';
import type { Stem } from './vegetation-skeleton.ts';

const unit = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** Share of a tuft that sits behind its anchor point, so brushes overlap along the twig. */
const BACK = 0.35;
/** Upturn of the tuft axis towards +Z (pine shoots curl up at the tips). */
const UPTURN = 0.2;

export function needleTufts(
  stems: readonly Stem[],
  level: number,
  leaf: LeafParams,
  shade: CrownShade,
  rng: Rng,
): Mesh {
  const out: Mesh[] = [];
  const from = leaf.from ?? 0.3;
  for (const st of stems) {
    if (st.level !== level) continue;
    const frames = transportFrames(st.pts);
    const res = st.pts.length - 1;
    for (let i = 0; i < leaf.perStem; i++) {
      const t = from + ((1 - from) * (i + 0.5)) / leaf.perStem;
      // Anywhere along the polyline (not only on its few vertices): lerp the axis point.
      const x = t * res;
      const j = Math.max(0, Math.min(res - 1, Math.floor(x)));
      const f = frames[j];
      const p0 = st.pts[j];
      const p1 = st.pts[j + 1] ?? p0;
      if (!f || !p0 || !p1) continue;
      const k = Math.min(1, x - j);
      const c: Vec3 = [
        p0[0] + (p1[0] - p0[0]) * k,
        p0[1] + (p1[1] - p0[1]) * k,
        p0[2] + (p1[2] - p0[2]) * k,
      ];
      const up = UPTURN * (0.5 + t);
      const dir = unit([
        f.t[0] + rng.range(-0.15, 0.15),
        f.t[1] + rng.range(-0.15, 0.15),
        f.t[2] + up,
      ]);
      const a = rng.range(0, Math.PI);
      const n = unit(cross(dir, Math.abs(dir[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1]));
      const b = cross(dir, n);
      const side: Vec3 = [
        n[0] * Math.cos(a) + b[0] * Math.sin(a),
        n[1] * Math.cos(a) + b[1] * Math.sin(a),
        n[2] * Math.cos(a) + b[2] * Math.sin(a),
      ];
      const len = leaf.size * rng.range(0.8, 1.2);
      const base: Vec3 = [
        c[0] - dir[0] * len * BACK,
        c[1] - dir[1] * len * BACK,
        c[2] - dir[2] * len * BACK,
      ];
      out.push(card(leaf, base, dir, side, len, shade, rng));
      out.push(card(leaf, base, dir, cross(dir, side), len, shade, rng));
    }
  }
  return merge(out);
}
