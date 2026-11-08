// Draw-skin for SDF sculpts (Blender Skin / ZSpheres analogue): a chain of nodes, each a point
// with a radius, becomes a smooth tapered tube of exact round cones (Quílez), one field edit per
// segment so the sculpt's sparse fold only evaluates segments near the query point. Limbs, necks,
// tails, fingers, horns and claws are all skins. Also: `blade` (a skin pressed flat: spines,
// back plates, tail fins) and `tube` (sample radii along any path).

import type { Field, SculptEdit, Vec3 } from '@developerz.ai/ts23d';
import { arcT, v3 } from './curve.ts';

export interface SkinNode {
  readonly at: Vec3;
  readonly r: number;
}

export interface SkinOptions {
  readonly color?: Vec3;
  /** Blend of the whole chain into the sculpt (the chain's own joints are exact). */
  readonly blend?: number;
  readonly op?: 'add' | 'subtract' | 'intersect';
  readonly mirror?: boolean;
  /** Per-segment colour (index, count) for banded horns and claws; overrides `color`. */
  readonly band?: (i: number, n: number) => Vec3;
}

/** Exact distance to a round cone: spheres (a, r1) and (b, r2) joined by their tangent cone. */
export function roundCone(a: Vec3, b: Vec3, r1: number, r2: number): Field {
  const ba = v3.sub(b, a);
  const l2 = v3.dot(ba, ba);
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  // One sphere swallows the other: the bigger sphere is the shape.
  if (a2 <= 0) {
    const [c, r] = r1 >= r2 ? [a, r1] : [b, r2];
    return (p) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) - r;
  }
  return (p) => {
    const pax = p[0] - a[0];
    const pay = p[1] - a[1];
    const paz = p[2] - a[2];
    const y = pax * ba[0] + pay * ba[1] + paz * ba[2];
    const z = y - l2;
    const qx = pax * l2 - ba[0] * y;
    const qy = pay * l2 - ba[1] * y;
    const qz = paz * l2 - ba[2] * y;
    const x2 = qx * qx + qy * qy + qz * qz;
    const y2 = y * y * l2;
    const z2 = z * z * l2;
    const k = Math.sign(rr) * rr * rr * x2;
    if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
    if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
    return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
  };
}

/** Axis-aligned box around two spheres, padded so the clamp never shaves the surface. */
function segBounds(a: SkinNode, b: SkinNode, pad: number): [Vec3, Vec3] {
  const lo: Vec3 = [
    Math.min(a.at[0] - a.r, b.at[0] - b.r) - pad,
    Math.min(a.at[1] - a.r, b.at[1] - b.r) - pad,
    Math.min(a.at[2] - a.r, b.at[2] - b.r) - pad,
  ];
  const hi: Vec3 = [
    Math.max(a.at[0] + a.r, b.at[0] + b.r) + pad,
    Math.max(a.at[1] + a.r, b.at[1] + b.r) + pad,
    Math.max(a.at[2] + a.r, b.at[2] + b.r) + pad,
  ];
  return [lo, hi];
}

/** The chain as one sculpt group: segments hard-joined (they share spheres), blended as a whole. */
export function skin(nodes: readonly SkinNode[], o: SkinOptions = {}): SculptEdit {
  const segs: SculptEdit[] = [];
  const n = nodes.length - 1;
  for (let i = 0; i < n; i++) {
    const a = nodes[i];
    const b = nodes[i + 1];
    if (!a || !b) continue;
    const color = o.band ? o.band(i, n) : o.color;
    segs.push({
      field: roundCone(a.at, b.at, a.r, b.r),
      bounds: segBounds(a, b, 0.002 + 0.02 * Math.max(a.r, b.r)),
      blend: 0,
      ...(color ? { color } : {}),
    });
  }
  return {
    group: segs,
    blend: o.blend ?? 0,
    op: o.op ?? 'add',
    ...(o.color ? { color: o.color } : {}),
    ...(o.mirror !== undefined ? { mirror: o.mirror } : {}),
  };
}

/** Nodes along `path` with radius `r(t)`, t = arc fraction 0..1. */
export function tube(path: readonly Vec3[], r: (t: number) => number): SkinNode[] {
  const ts = arcT(path);
  return path.map((at, i) => ({ at, r: Math.max(0.002, r(ts[i] ?? 0)) }));
}

/**
 * A blade: a round-cone chain pressed into a slab of half-thickness `thick` about the plane that
 * holds the chain and is perpendicular to `side` (a dorsal spine: side = +Y). One field edit.
 */
export function blade(
  nodes: readonly SkinNode[],
  side: Vec3,
  thick: number,
  o: { readonly color?: Vec3; readonly blend?: number; readonly mirror?: boolean } = {},
): SculptEdit {
  const first = nodes[0];
  if (!first) return { group: [] };
  const s = v3.norm(side);
  const cones = nodes
    .slice(0, -1)
    .map((a, i) => roundCone(a.at, (nodes[i + 1] ?? a).at, a.r, (nodes[i + 1] ?? a).r));
  const off = v3.dot(s, first.at);
  const field: Field = (p) => {
    let d = Number.POSITIVE_INFINITY;
    for (const c of cones) d = Math.min(d, c(p));
    const slab = Math.abs(v3.dot(s, p) - off) - thick;
    return Math.max(d, slab);
  };
  const lo: [number, number, number] = [Infinity, Infinity, Infinity];
  const hi: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const nd of nodes)
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k] ?? 0, (nd.at[k] ?? 0) - nd.r - 0.01);
      hi[k] = Math.max(hi[k] ?? 0, (nd.at[k] ?? 0) + nd.r + 0.01);
    }
  return {
    field,
    bounds: [lo, hi],
    blend: o.blend ?? 0,
    ...(o.color ? { color: o.color } : {}),
    ...(o.mirror !== undefined ? { mirror: o.mirror } : {}),
  };
}
