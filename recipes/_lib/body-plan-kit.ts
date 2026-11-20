// Body-plan surface kit: a closed loft from any `point(u, a)` (normals from its faces, winding from signed
// volume), fin plates between two edge curves, monotone profiles, value noise, skinning onto named
// plan bones. The body-plan sweep is elliptical only; these animals need grooves and real planforms.
// Shared by great_white, bluefin_tuna and king_cobra.

import {
  type BodyPlan,
  type BuildContext,
  dmath,
  type Mesh,
  MeshBuilder,
  type StripId,
  skinWeights,
  stripRect,
  type Vec3,
} from '@developerz.ai/ts23d';

export const TAU = Math.PI * 2;
export const clamp = (v: number, lo = 0, hi = 1): number => Math.max(lo, Math.min(hi, v));
export const mix = (a: number, b: number, k: number): number => a + (b - a) * k;
export const smooth = (a: number, b: number, x: number): number => {
  const k = clamp((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};
export const gauss = (x: number, s: number): number => dmath.exp(-(x * x) / (s * s));
export const mixRgb = (a: Vec3, b: Vec3, k: number): Vec3 => [
  mix(a[0], b[0], k),
  mix(a[1], b[1], k),
  mix(a[2], b[2], k),
];
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const norm = (a: Vec3): Vec3 => {
  const l = dmath.hypot(a[0], a[1], a[2]);
  return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 1];
};
export const spow = (v: number, p: number): number => Math.sign(v) * dmath.pow(Math.abs(v), p);

/** Monotone cubic through (x, y) pairs (Fritsch-Carlson): profiles never overshoot a station. */
export function profile(table: readonly (readonly [number, number])[]): (x: number) => number {
  const xs = table.map((p) => p[0]);
  const ys = table.map((p) => p[1]);
  const n = xs.length;
  const dx = xs.slice(1).map((x, i) => x - (xs[i] ?? 0));
  const sl = ys.slice(1).map((y, i) => (y - (ys[i] ?? 0)) / (dx[i] ?? 1));
  const m = xs.map((_, i) => {
    if (i === 0) return sl[0] ?? 0;
    if (i === n - 1) return sl[n - 2] ?? 0;
    const [a, b] = [sl[i - 1] ?? 0, sl[i] ?? 0];
    return a * b <= 0 ? 0 : (2 * a * b) / (a + b);
  });
  return (x) => {
    if (x <= (xs[0] ?? 0)) return ys[0] ?? 0;
    if (x >= (xs[n - 1] ?? 0)) return ys[n - 1] ?? 0;
    let i = 0;
    while (i < n - 2 && x > (xs[i + 1] ?? 0)) i++;
    const h = dx[i] ?? 1;
    const k = (x - (xs[i] ?? 0)) / h;
    const [k2, k3] = [k * k, k * k * k];
    return (
      (2 * k3 - 3 * k2 + 1) * (ys[i] ?? 0) +
      (k3 - 2 * k2 + k) * h * (m[i] ?? 0) +
      (-2 * k3 + 3 * k2) * (ys[i + 1] ?? 0) +
      (k3 - k2) * h * (m[i + 1] ?? 0)
    );
  };
}

/** Catmull-Rom through points, u in 0..1 spread evenly over the spans. */
export function curve3(pts: readonly Vec3[]): (u: number) => Vec3 {
  const last = pts.length - 1;
  const p = (i: number): Vec3 => pts[Math.max(0, Math.min(last, i))] ?? [0, 0, 0];
  return (u) => {
    const x = clamp(u) * last;
    const i = Math.min(last - 1, Math.floor(x));
    const t = x - i;
    const [a, b, c, d] = [p(i - 1), p(i), p(i + 1), p(i + 2)];
    const f = (k: 0 | 1 | 2): number =>
      0.5 *
      (2 * b[k] +
        (c[k] - a[k]) * t +
        (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * t * t +
        (3 * b[k] - a[k] - 3 * c[k] + d[k]) * t * t * t);
    return [f(0), f(1), f(2)];
  };
}

const hash = (x: number, y: number, seed: number): number => {
  const s = dmath.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Smooth value noise, 0..1. Deterministic: a pure function of its arguments. */
export function noise(x: number, y: number, seed = 0): number {
  const [i, j] = [Math.floor(x), Math.floor(y)];
  const [u, v] = [smooth(0, 1, x - i), smooth(0, 1, y - j)];
  return mix(
    mix(hash(i, j, seed), hash(i + 1, j, seed), u),
    mix(hash(i, j + 1, seed), hash(i + 1, j + 1, seed), u),
    v,
  );
}

export const fbm = (x: number, y: number, seed = 0): number =>
  noise(x, y, seed) * 0.55 +
  noise(x * 2.1, y * 2.1, seed + 1) * 0.3 +
  noise(x * 4.3, y * 4.3, seed + 2) * 0.15;

export interface LoftSpec {
  /** Ring positions, ascending. */
  readonly us: readonly number[];
  readonly sides: number;
  /** Surface point of ring u at angle a (0..TAU). */
  point(u: number, a: number): Vec3;
  /** Linear colour of a finished vertex. */
  color(p: Vec3, n: Vec3, u: number, a: number): Vec3;
  readonly strip?: StripId;
  /** Final say on a vertex normal (a thin plate's edge stays in the plate). */
  shade?(n: Vec3, u: number, a: number): Vec3;
  /** Length along u and round the section, metres: true-scale texture. */
  readonly metres?: readonly [number, number];
  /** Strip height in metres (`scaleMetres` of the material). */
  readonly stripHeight?: number;
}

/** A closed tube: rings of `sides` quads, each end capped on its own centre. */
export function loft(s: LoftSpec): Mesh {
  const { us, sides } = s;
  const rows = us.length;
  const P: Vec3[] = [];
  for (const u of us)
    for (let j = 0; j <= sides; j++) {
      const a = ((j % sides) / sides) * TAU;
      P.push(s.point(u, a));
    }
  const id = (i: number, j: number): number => i * (sides + 1) + j;
  const ring = (i: number): Vec3 => {
    let c: Vec3 = [0, 0, 0];
    for (let j = 0; j < sides; j++) c = add(c, P[id(i, j)] ?? [0, 0, 0]);
    return scale(c, 1 / sides);
  };
  const poles: Vec3[] = [ring(0), ring(rows - 1)];
  P.push(poles[0] ?? [0, 0, 0], poles[1] ?? [0, 0, 0]);
  const [first, end] = [P.length - 2, P.length - 1];
  const tris: [number, number, number][] = [];
  for (let i = 0; i + 1 < rows; i++)
    for (let j = 0; j < sides; j++) {
      tris.push([id(i, j), id(i + 1, j), id(i + 1, j + 1)]);
      tris.push([id(i, j), id(i + 1, j + 1), id(i, j + 1)]);
    }
  for (let j = 0; j < sides; j++) {
    tris.push([first, id(0, j), id(0, j + 1)]);
    tris.push([end, id(rows - 1, j + 1), id(rows - 1, j)]);
  }
  const at = (v: number): Vec3 => P[v] ?? [0, 0, 0];
  const faces = tris.filter(([a, b, c]) => {
    const n = cross(sub(at(b), at(a)), sub(at(c), at(a)));
    return dmath.hypot(n[0], n[1], n[2]) > 1e-11;
  });
  const volume = faces.reduce((v, [a, b, c]) => v + dot(at(a), cross(at(b), at(c))), 0);
  const flip = volume < 0;
  const N: Vec3[] = P.map(() => [0, 0, 0]);
  const push = (v: number, n: Vec3): void => {
    N[v] = add(N[v] ?? [0, 0, 0], n);
  };
  for (const [a, b, c] of faces) {
    const f = cross(sub(at(b), at(a)), sub(at(c), at(a)));
    const n = flip ? scale(f, -1) : f;
    for (const v of [a, b, c]) {
      push(v, n);
      // The seam column is one column twice: both copies share the normal.
      const j = v < first ? v % (sides + 1) : -1;
      if (j === 0) push(v + sides, n);
      if (j === sides) push(v - sides, n);
    }
  }
  const rect = stripRect(s.strip ?? 'plain');
  const [along, round] = s.metres ?? [rect.metres, s.stripHeight ?? 1];
  const vSpan = Math.min(1, round / (s.stripHeight ?? 1)) * (rect.v1 - rect.v0);
  const b = new MeshBuilder();
  const uvOf = (i: number, j: number): [number, number] => [
    rect.u0 + ((us[i] ?? 0) * along) / rect.metres,
    rect.v0 + (j / sides) * vSpan,
  ];
  P.forEach((p, v) => {
    const pole = v >= first;
    const i = pole ? (v === first ? 0 : rows - 1) : Math.floor(v / (sides + 1));
    const j = pole ? 0 : v % (sides + 1);
    const a = (j / sides) * TAU;
    const raw = norm(N[v] ?? [0, 0, 1]);
    const n = s.shade && !pole ? norm(s.shade(raw, us[i] ?? 0, a)) : raw;
    b.vertex({ p, n, uv: uvOf(i, j), color: s.color(p, n, us[i] ?? 0, a) });
  });
  for (const [x, y, z] of faces) {
    if (flip) b.tri(x, z, y);
    else b.tri(x, y, z);
  }
  return b.build();
}

export interface PlateSpec {
  /** Leading and trailing edge, root (u 0) to tip (u 1). */
  readonly lead: (u: number) => Vec3;
  readonly trail: (u: number) => Vec3;
  /** Half-thickness at span u, metres. */
  readonly thick: (u: number) => number;
  readonly us: readonly number[];
  readonly sides: number;
  /** Thickness direction when the edges alone do not define one. */
  readonly normal?: Vec3;
  color(p: Vec3, n: Vec3, u: number, chord: number): Vec3;
  readonly strip?: StripId;
}

/** A fin: a thin lens section swept between two edge curves, thickest near the leading third. */
export function plate(s: PlateSpec): Mesh {
  const chordOf = (a: number): number => 0.5 + 0.5 * dmath.cos(a);
  const up = (u: number): Vec3 => {
    if (s.normal) return s.normal;
    const span = sub(s.lead(Math.min(1, u + 0.02)), s.lead(Math.max(0, u - 0.02)));
    return norm(cross(sub(s.trail(u), s.lead(u)), span));
  };
  return loft({
    us: s.us,
    sides: s.sides,
    ...(s.strip ? { strip: s.strip } : {}),
    // On the two sharp edges the faces disagree by 180°: the normal lies in the plate.
    shade: (n, u, a) => {
      if (Math.abs(dmath.sin(a)) > 1e-6) return n;
      const t = up(u);
      return sub(n, scale(t, dot(n, t)));
    },
    point: (u, a) => {
      const c = chordOf(a);
      const base = add(s.lead(u), scale(sub(s.trail(u), s.lead(u)), c));
      // Blunt round the leading edge, fine toward the trailing one.
      const lens = dmath.sin(a) * (1 - 0.65 * c);
      return add(base, scale(up(u), s.thick(u) * lens));
    },
    color: (p, n, u, a) => s.color(p, n, u, chordOf(a)),
  });
}

/** A ball looking along `axis`; `color` reads the angle off that axis (0 pupil centre .. PI). */
export function eyeball(
  c: Vec3,
  R: number,
  axis: Vec3,
  rings: number,
  sides: number,
  color: (theta: number) => Vec3,
  strip: StripId = 'plastic',
): Mesh {
  const w = norm(axis);
  const e1 = norm(cross(w, Math.abs(w[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1]));
  const e2 = cross(w, e1);
  return loft({
    us: even(0.05, 0.95, rings),
    sides,
    strip,
    point: (u, a) => {
      const th = u * Math.PI;
      const ring = add(scale(e1, dmath.cos(a)), scale(e2, dmath.sin(a)));
      return add(c, scale(add(scale(w, dmath.cos(th)), scale(ring, dmath.sin(th))), R));
    },
    color: (_p, _n, u) => color(u * Math.PI),
  });
}

export const even = (a: number, b: number, n: number): number[] =>
  Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);

/** Sorted, de-duplicated stations (closer than `gap` merge). */
export function stations(values: readonly number[], gap = 1e-4): number[] {
  const out: number[] = [];
  for (const v of [...values].sort((a, b) => a - b))
    if (out.length === 0 || v - (out.at(-1) ?? 0) > gap) out.push(v);
  return out;
}

/** Every plan bone onto the context, parents first. */
export function declareBones(ctx: BuildContext, plan: BodyPlan): void {
  for (const { name, ...bone } of plan.bones) ctx.bone(name, bone);
}

export const bonesOf = (plan: BodyPlan, ...ids: readonly string[]): string[] =>
  plan.chains.filter((c) => ids.includes(c.id)).flatMap((c) => c.links.map((l) => l.bone.name));

/** Skins a mesh onto the named bones only: bone segments, exponential falloff `blend` metres. */
export function skinTo(mesh: Mesh, plan: BodyPlan, names: readonly string[], blend: number): Mesh {
  const flesh = plan.bones.map((b) => ({ a: b.head, b: b.tail }));
  const only = names.map((n) => plan.bones.findIndex((b) => b.name === n)).filter((i) => i >= 0);
  return skinWeights(mesh, flesh, { blend, only });
}
