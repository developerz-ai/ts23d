// Morph targets from the sculpt (ADR 013): re-evaluate the field with one parameter changed (a
// fuller chest for `breathe`, a swollen brow) and project each rest vertex along the rest field's
// gradient onto the changed surface; or turn a region about a hinge (`blink`: the upper lid slides
// down over the ball about the eye's lateral axis). The result is a per-vertex delta (glTF target).

import {
  dmath,
  type Mesh,
  type Morph,
  quatFromAxisAngle,
  quatRotate,
  Ts23dError,
  type Vec3,
} from '../core/index.ts';

/** Signed distance, negative inside (the sculpt's field). */
export type MorphField = (p: Vec3) => number;

export interface FieldMorphOptions {
  /** Share of the delta per rest point, 0..1 (default 1 everywhere). */
  readonly weight?: (p: Vec3) => number;
  /** Largest move, metres (default 0.05): a vertex never jumps to an unrelated surface. */
  readonly reach?: number;
  /** Finite-difference step for gradients, metres (default 1e-4). */
  readonly h?: number;
}

export interface HingeMorphOptions {
  /** A point on the hinge axis. */
  readonly at: Vec3;
  readonly axis: Vec3;
  readonly degrees: number;
  /** Share of the turn per rest point, 0..1. */
  readonly weight: (p: Vec3) => number;
}

function checkName(name: string): void {
  if (!/^[a-z][a-z0-9_]*$/.test(name))
    throw new Ts23dError('T3D_RECIPE_INVALID', {
      cause: `morph name '${name}' is not snake_case`,
      fix: 'name the shape for what it does: blink, jaw_open, breathe',
    });
}

const point = (m: Mesh, v: number): Vec3 => [
  m.positions[v * 3] ?? 0,
  m.positions[v * 3 + 1] ?? 0,
  m.positions[v * 3 + 2] ?? 0,
];

const clamp01 = (x: number): number => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);

function gradient(f: MorphField, p: Vec3, h: number): Vec3 {
  const d = (k: number): number => {
    const e = (s: number): Vec3 => [
      p[0] + (k === 0 ? s : 0),
      p[1] + (k === 1 ? s : 0),
      p[2] + (k === 2 ? s : 0),
    ];
    return (f(e(h)) - f(e(-h))) / (2 * h);
  };
  return [d(0), d(1), d(2)];
}

/** Project every rest vertex along the rest gradient onto `target`'s zero set. */
export function fieldMorph(
  mesh: Mesh,
  name: string,
  rest: MorphField,
  target: MorphField,
  o: FieldMorphOptions = {},
): Morph {
  checkName(name);
  const reach = o.reach ?? 0.05;
  const h = o.h ?? 1e-4;
  const out = new Float32Array(mesh.positions.length);
  for (let v = 0; v < out.length / 3; v++) {
    const p = point(mesh, v);
    const w = clamp01(o.weight ? o.weight(p) : 1);
    if (w === 0) continue;
    const g = gradient(rest, p, h);
    const gl = dmath.norm(g);
    if (!(gl > 1e-9)) continue;
    const n: Vec3 = [g[0] / gl, g[1] / gl, g[2] / gl];
    // Newton along the line p + t n on the changed field.
    let t = 0;
    for (let i = 0; i < 8; i++) {
      const q: Vec3 = [p[0] + n[0] * t, p[1] + n[1] * t, p[2] + n[2] * t];
      const f = target(q);
      const gq = gradient(target, q, h);
      const slope = gq[0] * n[0] + gq[1] * n[1] + gq[2] * n[2];
      if (!(Math.abs(slope) > 1e-6)) break;
      t = Math.min(reach, Math.max(-reach, t - f / slope));
      if (Math.abs(f) < 1e-7) break;
    }
    out.set([n[0] * t * w, n[1] * t * w, n[2] * t * w], v * 3);
  }
  return { name, positions: out };
}

/** Turn each rest vertex about the hinge by `degrees × weight(p)`. */
export function hingeMorph(mesh: Mesh, name: string, o: HingeMorphOptions): Morph {
  checkName(name);
  if (!(dmath.norm(o.axis) > 1e-9) || !Number.isFinite(o.degrees))
    throw new Ts23dError('T3D_RECIPE_INVALID', {
      cause: `morph '${name}': hinge axis is zero or degrees ${o.degrees} not finite`,
      fix: 'give the hinge a direction, e.g. axis: [0, 1, 0], and finite degrees',
    });
  const out = new Float32Array(mesh.positions.length);
  for (let v = 0; v < out.length / 3; v++) {
    const p = point(mesh, v);
    const w = clamp01(o.weight(p));
    if (w === 0) continue;
    const q = quatFromAxisAngle(o.axis, ((o.degrees * Math.PI) / 180) * w);
    const r = quatRotate(q, [p[0] - o.at[0], p[1] - o.at[1], p[2] - o.at[2]]);
    out.set([r[0] + o.at[0] - p[0], r[1] + o.at[1] - p[1], r[2] + o.at[2] - p[2]], v * 3);
  }
  return { name, positions: out };
}

/** Adds two morphs' deltas (left + right eye of one `blink`). */
export function sumMorphs(name: string, a: Morph, b: Morph): Morph {
  checkName(name);
  return { name, positions: a.positions.map((x, i) => x + (b.positions[i] ?? 0)) };
}
