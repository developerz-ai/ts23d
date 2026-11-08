// Low-poly stand-ins for far LODs (and for thin parts at any LOD, where an SDF would need tiny
// cells): a skin chain as a capped swept tube with its radius profile, and an ellipsoid blob. The
// same nodes the sculpt uses, so the silhouette matches; a different emitter, never a decimation.

import {
  type Mesh,
  MeshBuilder,
  stripRect,
  transportFrames,
  type Vec3,
} from '@developerz.ai/ts23d';
import type { SkinNode } from './skin.ts';

/**
 * A skin chain as a tube mesh: a ring of `sides` vertices per node (parallel-transport frames, so
 * no twist), normals tilted by the taper, a colour per node (gradients, ring bands), a flat start
 * cap and a fan end cap. UVs on the `plain` strip.
 */
export function tubeMesh(
  nodes: readonly SkinNode[],
  o: { readonly sides: number; readonly colors: readonly Vec3[] | Vec3 },
): Mesh {
  // Drop near-duplicate points: frames need a direction between consecutive points.
  const kept: { n: SkinNode; c: Vec3 }[] = [];
  nodes.forEach((n, i) => {
    const last = kept[kept.length - 1];
    const c = isList(o.colors) ? (o.colors[i] ?? [1, 1, 1]) : o.colors;
    if (
      !last ||
      Math.hypot(n.at[0] - last.n.at[0], n.at[1] - last.n.at[1], n.at[2] - last.n.at[2]) > 1e-4
    )
      kept.push({ n, c });
  });
  const path = kept.map((k) => k.n.at);
  const fr = transportFrames(path);
  const rect = stripRect('plain');
  const b = new MeshBuilder();
  const rings: number[][] = [];
  let s = 0;
  kept.forEach((k, i) => {
    const f = fr[i];
    if (!f) return;
    if (i > 0) {
      const p = path[i - 1] ?? k.n.at;
      s += Math.hypot(k.n.at[0] - p[0], k.n.at[1] - p[1], k.n.at[2] - p[2]);
    }
    // Taper tilts the surface normal toward the narrowing end.
    const prev = kept[Math.max(0, i - 1)]?.n ?? k.n;
    const next = kept[Math.min(kept.length - 1, i + 1)]?.n ?? k.n;
    const ds =
      Math.hypot(next.at[0] - prev.at[0], next.at[1] - prev.at[1], next.at[2] - prev.at[2]) || 1;
    const slope = (prev.r - next.r) / ds;
    const row: number[] = [];
    for (let j = 0; j <= o.sides; j++) {
      const a = (j / o.sides) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const rad: Vec3 = [
        f.n[0] * ca + f.b[0] * sa,
        f.n[1] * ca + f.b[1] * sa,
        f.n[2] * ca + f.b[2] * sa,
      ];
      const nn: Vec3 = [rad[0] + f.t[0] * slope, rad[1] + f.t[1] * slope, rad[2] + f.t[2] * slope];
      const l = Math.hypot(nn[0], nn[1], nn[2]) || 1;
      row.push(
        b.vertex({
          p: [k.n.at[0] + rad[0] * k.n.r, k.n.at[1] + rad[1] * k.n.r, k.n.at[2] + rad[2] * k.n.r],
          n: [nn[0] / l, nn[1] / l, nn[2] / l],
          uv: [
            rect.u0 + (s / rect.metres) * (rect.u1 - rect.u0),
            rect.v0 + 0.002 + (j / o.sides) * (rect.v1 - rect.v0 - 0.004),
          ],
          // Painted key light: up-facing sides of a tube lighter, undersides cooler.
          color: lit(k.c, nn[2] / l),
        }),
      );
    }
    rings.push(row);
  });
  for (let i = 0; i + 1 < rings.length; i++)
    for (let j = 0; j < o.sides; j++) {
      const a = rings[i]?.[j] ?? 0;
      const c = rings[i]?.[j + 1] ?? 0;
      const d = rings[i + 1]?.[j + 1] ?? 0;
      const e = rings[i + 1]?.[j] ?? 0;
      b.quad(a, c, d, e);
    }
  // Caps: fans about the end points, facing out along the path.
  const cap = (i: number, out: 1 | -1): void => {
    const k = kept[i];
    const f = fr[i];
    if (!k || !f) return;
    const n: Vec3 = [f.t[0] * out, f.t[1] * out, f.t[2] * out];
    const centre = b.vertex({ p: k.n.at, n, uv: [rect.u0, rect.v0 + 0.002], color: k.c });
    const ids: number[] = [];
    for (let j = 0; j < o.sides; j++) {
      const a = (j / o.sides) * Math.PI * 2;
      const rad: Vec3 = [
        f.n[0] * Math.cos(a) + f.b[0] * Math.sin(a),
        f.n[1] * Math.cos(a) + f.b[1] * Math.sin(a),
        f.n[2] * Math.cos(a) + f.b[2] * Math.sin(a),
      ];
      ids.push(
        b.vertex({
          p: [k.n.at[0] + rad[0] * k.n.r, k.n.at[1] + rad[1] * k.n.r, k.n.at[2] + rad[2] * k.n.r],
          n,
          uv: [rect.u0, rect.v0 + 0.002],
          color: k.c,
        }),
      );
    }
    for (let j = 0; j < o.sides; j++) {
      const p = ids[j] ?? 0;
      const q = ids[(j + 1) % o.sides] ?? 0;
      if (out === 1) b.tri(centre, p, q);
      else b.tri(centre, q, p);
    }
  };
  cap(0, -1);
  cap(kept.length - 1, 1);
  return b.build();
}

const isList = (c: readonly Vec3[] | Vec3): c is readonly Vec3[] => Array.isArray(c[0]);

/** Hand-painted light on a tube: +22% on top, −25% (cool) underneath. */
const lit = (c: Vec3, up: number): Vec3 =>
  up > 0
    ? [
        Math.min(1, c[0] * (1 + 0.22 * up)),
        Math.min(1, c[1] * (1 + 0.2 * up)),
        Math.min(1, c[2] * (1 + 0.15 * up)),
      ]
    : [c[0] * (1 + 0.28 * up), c[1] * (1 + 0.3 * up), c[2] * (1 + 0.18 * up)];

/** A skin chain as a capped tube of one colour. */
export function skinTube(
  nodes: readonly SkinNode[],
  o: { readonly sides: number; readonly color: Vec3 },
): Mesh {
  return tubeMesh(nodes, { sides: o.sides, colors: o.color });
}

/** Ellipsoid of radii `r` at `at`, rotated by degrees about X, then Y, then Z (as sculpt edits). */
export function blob(
  at: Vec3,
  r: Vec3,
  o: {
    readonly rotate?: Vec3;
    readonly rings: number;
    readonly sides: number;
    readonly color: Vec3 | ((n: Vec3) => Vec3);
  },
): Mesh {
  const [ax, ay, az] = (o.rotate ?? [0, 0, 0]).map((d) => (d * Math.PI) / 180);
  const rot = (v: Vec3): Vec3 => {
    // R = Rz · Ry · Rx
    let [x, y, z] = v;
    [y, z] = [
      y * Math.cos(ax ?? 0) - z * Math.sin(ax ?? 0),
      y * Math.sin(ax ?? 0) + z * Math.cos(ax ?? 0),
    ];
    [x, z] = [
      x * Math.cos(ay ?? 0) + z * Math.sin(ay ?? 0),
      -x * Math.sin(ay ?? 0) + z * Math.cos(ay ?? 0),
    ];
    [x, y] = [
      x * Math.cos(az ?? 0) - y * Math.sin(az ?? 0),
      x * Math.sin(az ?? 0) + y * Math.cos(az ?? 0),
    ];
    return [x, y, z];
  };
  const b = new MeshBuilder();
  const idx: number[][] = [];
  for (let i = 0; i <= o.rings; i++) {
    const th = (i / o.rings) * Math.PI;
    const row: number[] = [];
    for (let j = 0; j <= o.sides; j++) {
      const ph = (j / o.sides) * Math.PI * 2;
      const u: Vec3 = [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)];
      const p = rot([u[0] * r[0], u[1] * r[1], u[2] * r[2]]);
      const nl = [u[0] / r[0], u[1] / r[1], u[2] / r[2]] as const;
      const l = Math.hypot(nl[0], nl[1], nl[2]) || 1;
      const n = rot([nl[0] / l, nl[1] / l, nl[2] / l]);
      row.push(
        b.vertex({
          p: [p[0] + at[0], p[1] + at[1], p[2] + at[2]],
          n,
          uv: [0.5 + j / o.sides / 4, 0.01],
          color: typeof o.color === 'function' ? o.color(n) : o.color,
        }),
      );
    }
    idx.push(row);
  }
  for (let i = 0; i < o.rings; i++)
    for (let j = 0; j < o.sides; j++) {
      const a = idx[i]?.[j] ?? 0;
      const c = idx[i + 1]?.[j] ?? 0;
      const d = idx[i + 1]?.[j + 1] ?? 0;
      const e = idx[i]?.[j + 1] ?? 0;
      if (i > 0) b.tri(a, c, e);
      if (i < o.rings - 1) b.tri(e, c, d);
    }
  return b.build();
}
