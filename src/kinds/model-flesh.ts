// The plan's flesh as tapered capsules, the target a model mesh is registered onto (model-fit.ts)
// and the body of the test fixtures: trunk masses (round at the mass's height), body chain, neck,
// head, tail and both sides' legs down to the paws. `capsuleProjector` is the closest point on
// their union, `fleshSamples` an even scatter of points on their surfaces.

import type { Vec3 } from '../core/index.ts';
import { dmath } from '../core/index.ts';
import type { WeightBone } from '../passes/index.ts';
import type { Bones } from './creature-bones.ts';

const flip = (p: Vec3): Vec3 => [p[0], -p[1], p[2]];

/** The plan's flesh as capsules, both sides (asset frame). */
export function planCapsules(b: Bones): WeightBone[] {
  const out: WeightBone[] = [];
  const chain = (nodes: readonly { at: Vec3; r: number }[]): void => {
    for (let i = 0; i + 1 < nodes.length; i++) {
      const [p, q] = [nodes[i], nodes[i + 1]];
      if (p && q) out.push({ a: p.at, b: q.at, r1: p.r, r2: q.r });
    }
  };
  for (const t of b.trunk) {
    // Round at the mass's height: the dorsal and belly lines are what a side-on model shows.
    const r = t.r[2];
    const half = Math.max(0, t.r[0] - r);
    out.push({ a: [t.at[0] - half, 0, t.at[2]], b: [t.at[0] + half, 0, t.at[2]], r1: r, r2: r });
  }
  chain(b.chain);
  chain(b.neck);
  chain(b.tail);
  out.push({ a: b.head.atlas, b: b.nose, r1: b.head.height * 0.45, r2: b.head.height * 0.25 });
  for (const l of b.legs)
    for (const side of [(p: Vec3) => p, flip]) {
      const paw: Vec3 = [l.foot[0] + l.footSize[0], l.foot[1], l.footSize[2] * 0.5];
      const last = l.radii[l.radii.length - 1] ?? b.limbR;
      chain([
        ...l.joints.map((at, i) => ({ at: side(at), r: l.radii[i] ?? b.limbR })),
        { at: side(paw), r: Math.min(last, l.footSize[2] * 0.5) },
      ]);
    }
  return out;
}

/** Closest point on the capsule union's surface, and the distance to it. */
export function capsuleProjector(caps: readonly WeightBone[]) {
  return (p: Vec3): { q: Vec3; e: number } => {
    let best = Infinity;
    let q: Vec3 = p;
    for (const c of caps) {
      const u: Vec3 = [c.b[0] - c.a[0], c.b[1] - c.a[1], c.b[2] - c.a[2]];
      const w: Vec3 = [p[0] - c.a[0], p[1] - c.a[1], p[2] - c.a[2]];
      const l2 = u[0] * u[0] + u[1] * u[1] + u[2] * u[2];
      const t =
        l2 > 0 ? Math.min(1, Math.max(0, (w[0] * u[0] + w[1] * u[1] + w[2] * u[2]) / l2)) : 0;
      const r = (c.r1 ?? 0) + ((c.r2 ?? c.r1 ?? 0) - (c.r1 ?? 0)) * t;
      const o: Vec3 = [c.a[0] + u[0] * t, c.a[1] + u[1] * t, c.a[2] + u[2] * t];
      const d = dmath.hypot(p[0] - o[0], p[1] - o[1], p[2] - o[2]);
      const e = Math.abs(d - r);
      if (e >= best) continue;
      best = e;
      const k = d > 1e-9 ? r / d : 0;
      q = [o[0] + (p[0] - o[0]) * k, o[1] + (p[1] - o[1]) * k, o[2] + (p[2] - o[2]) * k];
    }
    return { q, e: best };
  };
}

/** Points on the capsules' surfaces, about `gap` apart: what the model must cover. */
export function fleshSamples(caps: readonly WeightBone[], gap: number): Vec3[] {
  const out: Vec3[] = [];
  for (const c of caps) {
    const u: Vec3 = [c.b[0] - c.a[0], c.b[1] - c.a[1], c.b[2] - c.a[2]];
    const len = dmath.hypot(u[0], u[1], u[2]);
    const side: Vec3 = Math.abs(u[2]) > 0.9 * len ? [1, 0, 0] : [0, 0, 1];
    const e1 = unit(cross(u, side), [0, 1, 0]);
    const e2 = unit(cross(u, e1), [0, 0, 1]);
    const steps = Math.max(1, Math.round(len / gap));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const r = (c.r1 ?? 0) + ((c.r2 ?? c.r1 ?? 0) - (c.r1 ?? 0)) * t;
      const ring = Math.max(4, Math.round((2 * Math.PI * r) / gap));
      for (let k = 0; k < ring; k++) {
        const a = (2 * Math.PI * (k + 0.5 * (i % 2))) / ring;
        const [ca, sa] = [dmath.cos(a) * r, dmath.sin(a) * r];
        out.push([
          c.a[0] + u[0] * t + e1[0] * ca + e2[0] * sa,
          c.a[1] + u[1] * t + e1[1] * ca + e2[1] * sa,
          c.a[2] + u[2] * t + e1[2] * ca + e2[2] * sa,
        ]);
      }
    }
  }
  return out;
}

const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (v: Vec3, fallback: Vec3): Vec3 => {
  const l = dmath.hypot(v[0], v[1], v[2]);
  return l > 1e-12 ? [v[0] / l, v[1] / l, v[2] / l] : fallback;
};
