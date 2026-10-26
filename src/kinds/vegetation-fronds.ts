// Palm fronds: pinnate leaves as curved card strips — narrow double-sided leaflets either side of
// each rachis, folded into a V and drooping, longest mid-frond. Plus coconuts tucked under the
// crown. The rachis itself is a swept stem (in `branches`); leaflets root on its bark.

import { type Mesh, MeshBuilder, merge, type Rng, type Vec3 } from '../core/index.ts';
import { arcLengths, lathe, transportFrames } from '../primitives/index.ts';
import type { CrownShade } from './vegetation-leaves.ts';
import type { LeafParams } from './vegetation-params.ts';
import type { Stem } from './vegetation-skeleton.ts';

type V = [number, number, number];

function tri(mb: MeshBuilder, a: Vec3, b: Vec3, c: Vec3, col: Vec3, tipCol: Vec3): void {
  const e1: V = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const e2: V = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n: V = [
    e1[1] * e2[2] - e1[2] * e2[1],
    e1[2] * e2[0] - e1[0] * e2[2],
    e1[0] * e2[1] - e1[1] * e2[0],
  ];
  const l = Math.hypot(n[0], n[1], n[2]) || 1;
  for (const s of [1, -1]) {
    const nn: Vec3 = [(n[0] / l) * s, (n[1] / l) * s, (n[2] / l) * s];
    const i = mb.vertex({ p: a, n: nn, uv: [0, 0], color: col });
    const j = mb.vertex({ p: b, n: nn, uv: [0, 0], color: col });
    const k = mb.vertex({ p: c, n: nn, uv: [0, 0], color: tipCol });
    if (s > 0) mb.tri(i, j, k);
    else mb.tri(i, k, j);
  }
}

/**
 * Leaflets along every frond (stem at `level`). `perSide` leaflets each side; `from` overrides
 * each frond's first rachis point (LOD2 roots them all on the trunk's top cap centre).
 */
export function frondLeaflets(
  stems: readonly Stem[],
  level: number,
  leaf: LeafParams,
  perSide: number,
  shade: CrownShade,
  rng: Rng,
): Mesh {
  const mb = new MeshBuilder();
  for (const st of stems) {
    if (st.level !== level) continue;
    const arc = arcLengths(st.pts);
    const frames = transportFrames(st.pts);
    const k = 1 + rng.range(-leaf.colorVar, leaf.colorVar);
    const step = (st.length * 0.9) / perSide;
    for (let i = 0; i < perSide; i++) {
      const u = 0.1 + (0.9 * (i + 0.5)) / perSide;
      const s = u * st.length;
      let j = 0;
      while (j < arc.length - 2 && (arc[j + 1] ?? 0) < s) j++;
      const a = st.pts[j] ?? [0, 0, 0];
      const b = st.pts[j + 1] ?? a;
      const f = (s - (arc[j] ?? 0)) / ((arc[j + 1] ?? 1) - (arc[j] ?? 0) || 1);
      const fr = frames[j] ?? { t: [1, 0, 0] as Vec3, n: [0, 0, 1] as Vec3, b: [0, 1, 0] as Vec3 };
      const r = (st.radii[j] ?? 0) * (1 - f) + (st.radii[j + 1] ?? 0) * f;
      const c: Vec3 = [
        a[0] + (b[0] - a[0]) * f,
        a[1] + (b[1] - a[1]) * f,
        a[2] + (b[2] - a[2]) * f,
      ];
      const len = st.length * leaf.width * Math.sin(Math.PI * (0.12 + 0.88 * u)) ** 0.6;
      const ao =
        0.6 +
        0.4 *
          Math.min(1, Math.hypot(c[0] - shade.centre[0], c[1] - shade.centre[1]) / shade.radius);
      const col: Vec3 = [
        leaf.color[0] * k * ao * 0.75,
        leaf.color[1] * k * ao * 0.75,
        leaf.color[2] * k * ao * 0.75,
      ];
      const tipCol: Vec3 = [col[0] * 1.45, col[1] * 1.35, col[2] * 1.2];
      for (const side of [1, -1]) {
        const o: Vec3 = [fr.b[0] * side, fr.b[1] * side, fr.b[2] * side];
        const root = (d: number): Vec3 => [
          c[0] + o[0] * r + fr.t[0] * d,
          c[1] + o[1] * r + fr.t[1] * d,
          c[2] + o[2] * r + fr.t[2] * d,
        ];
        const tip: Vec3 = [
          c[0] + (o[0] * 0.8 + fr.t[0] * 0.45 - fr.n[0] * 0.35) * len,
          c[1] + (o[1] * 0.8 + fr.t[1] * 0.45 - fr.n[1] * 0.35) * len,
          c[2] + (o[2] * 0.8 + fr.t[2] * 0.45 - fr.n[2] * 0.35) * len - 0.2 * len,
        ];
        tri(mb, root(-step * 0.35), root(step * 0.35), tip, col, tipCol);
      }
    }
  }
  return mb.build();
}

/** Coconuts: `count` spheres hugging the trunk just below the frond bases. */
export function fruit(
  trunk: Stem,
  at: number,
  o: { count: number; radius: number; color: Vec3 },
  rng: Rng,
): Mesh {
  const j = Math.max(0, Math.min(trunk.pts.length - 1, Math.round(at * (trunk.pts.length - 1))));
  const c = trunk.pts[j] ?? [0, 0, 0];
  const rt = trunk.radii[j] ?? 0.2;
  const profile = [0, 1, 2, 3, 4].map((i): [number, number] => {
    const a = -Math.PI / 2 + (i / 4) * Math.PI;
    return [Math.max(0.0001, Math.cos(a)) * o.radius, Math.sin(a) * o.radius];
  });
  const out: Mesh[] = [];
  for (let i = 0; i < o.count; i++) {
    const a = (i / o.count) * Math.PI * 2 + rng.range(-0.3, 0.3);
    const d = rt + o.radius * 0.6;
    const dz = rng.range(-1, 0.5) * o.radius;
    out.push(
      lathe({
        profile,
        segments: 6,
        caps: false,
        at: [c[0] + Math.cos(a) * d, c[1] + Math.sin(a) * d, c[2] + dz],
        color: o.color,
      }),
    );
  }
  return merge(out);
}
