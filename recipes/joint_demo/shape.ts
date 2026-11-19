// Small shape tools the arm, hand and sword share: a smoothed path, a tube skinned round it
// (ellipse sections, so fingers can be flat and wide), an ellipsoid, and a per-vertex repaint for
// wear (stains, rubbed zones) on meshes whose primitive takes one colour only.

import { loft, type Mesh, type StripId, type Vec3 } from '@developerz.ai/ts23d';

export const mix = (a: Vec3, b: Vec3, t: number): Vec3 => {
  const k = Math.min(1, Math.max(0, t));
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
};

export const dist = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** 1 at `c`, easing to 0 at distance `r`. */
export const blob = (p: Vec3, c: Vec3, r: number): number => {
  const t = Math.min(1, Math.max(0, 1 - dist(p, c) / r));
  return t * t * (3 - 2 * t);
};

/** One station of a tube: centre, half-size across the bend plane's normal and along `up`. */
export interface Station {
  readonly at: Vec3;
  /** Half-thickness across the path (perpendicular to `up`). */
  readonly r: number;
  /** Half-breadth along `up`. */
  readonly h: number;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Catmull–Rom through the stations, `steps` pieces per span (1 = the stations themselves). */
export function smooth(st: readonly Station[], steps: number): Station[] {
  if (steps <= 1 || st.length < 3) return [...st];
  const at = (i: number): Station => st[Math.min(st.length - 1, Math.max(0, i))] as Station;
  const out: Station[] = [];
  for (let i = 0; i < st.length - 1; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      const c = (e: 0 | 1 | 2): number =>
        0.5 *
        (2 * p1.at[e] +
          (p2.at[e] - p0.at[e]) * t +
          (2 * p0.at[e] - 5 * p1.at[e] + 4 * p2.at[e] - p3.at[e]) * t * t +
          (3 * p1.at[e] - p0.at[e] - 3 * p2.at[e] + p3.at[e]) * t * t * t);
      out.push({ at: [c(0), c(1), c(2)], r: lerp(p1.r, p2.r, t), h: lerp(p1.h, p2.h, t) });
    }
  }
  out.push(at(st.length - 1));
  return out;
}

const norm = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

export interface TubeOptions {
  readonly segments: number;
  readonly up: Vec3;
  readonly color: Vec3 | ((p: Vec3) => Vec3);
  readonly strip?: StripId;
  /** Ring start angle in steps (0.5 puts a vertex straight along `up` on a 6-gon). */
  readonly phase?: number;
  /** Close the far end with a rounded tip of this many extra rings (0 = flat cap). */
  readonly tip?: number;
}

/** A tube round the stations: each ring an ellipse across the path, `h` along `up`. */
export function tube(st: readonly Station[], o: TubeOptions): Mesh {
  const rings: Vec3[][] = [];
  const ring = (c: Vec3, t: Vec3, r: number, h: number): Vec3[] => {
    const side = norm(cross(o.up, t));
    const b = norm(cross(t, side));
    return Array.from({ length: o.segments }, (_, k): Vec3 => {
      const a = ((k + (o.phase ?? 0)) / o.segments) * Math.PI * 2;
      const [cs, sn] = [Math.cos(a) * r, Math.sin(a) * h];
      return [
        c[0] + side[0] * cs + b[0] * sn,
        c[1] + side[1] * cs + b[1] * sn,
        c[2] + side[2] * cs + b[2] * sn,
      ];
    });
  };
  let last: Vec3 = [1, 0, 0];
  for (let i = 0; i < st.length; i++) {
    const a = (st[Math.max(0, i - 1)] as Station).at;
    const b = (st[Math.min(st.length - 1, i + 1)] as Station).at;
    last = norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
    const s = st[i] as Station;
    rings.push(ring(s.at, last, s.r, s.h));
  }
  const end = st[st.length - 1] as Station;
  const tip = o.tip ?? 0;
  for (let k = 1; k <= tip; k++) {
    const a = (k / (tip + 0.35)) * (Math.PI / 2);
    const d = Math.sin(a) * end.r * 0.9;
    rings.push(
      ring(
        [end.at[0] + last[0] * d, end.at[1] + last[1] * d, end.at[2] + last[2] * d],
        last,
        end.r * Math.cos(a),
        end.h * Math.cos(a),
      ),
    );
  }
  const color = o.color;
  return loft({
    rings,
    color: typeof color === 'function' ? (_r, _i, p) => color(p) : color,
    ...(o.strip ? { strip: o.strip } : {}),
    capStart: true,
    capEnd: true,
  });
}

/** An ellipsoid with half-axes `r` at `c` (rings stacked along Z). */
export function ellipsoid(
  c: Vec3,
  r: Vec3,
  segments: number,
  stacks: number,
  color: Vec3 | ((p: Vec3) => Vec3),
): Mesh {
  const st: Station[] = [];
  for (let i = 0; i <= stacks; i++) {
    const a = -Math.PI / 2 + ((i + 0.5) / (stacks + 1)) * Math.PI;
    st.push({
      at: [c[0], c[1], c[2] + r[2] * Math.sin(a)],
      r: r[0] * Math.cos(a),
      h: r[1] * Math.cos(a),
    });
  }
  return tube(st, { segments, up: [0, 1, 0], color });
}

/** The same mesh with every vertex colour replaced by `f(position, old colour)`. */
export function repaint(m: Mesh, f: (p: Vec3, c: Vec3) => Vec3): Mesh {
  const colors = new Float32Array(m.colors.length);
  for (let v = 0; v < m.positions.length / 3; v++) {
    const c = f(
      [m.positions[v * 3] ?? 0, m.positions[v * 3 + 1] ?? 0, m.positions[v * 3 + 2] ?? 0],
      [m.colors[v * 3] ?? 1, m.colors[v * 3 + 1] ?? 1, m.colors[v * 3 + 2] ?? 1],
    );
    colors.set(c, v * 3);
  }
  return { ...m, colors };
}
