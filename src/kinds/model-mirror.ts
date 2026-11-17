// Mirroring for models made from an exact side-profile concept, whose far side is invented:
// where the sagittal plane is (midway between the traced left and right legs, else the middle of
// the upper body's width), which half is nearer the plan, the kept half and its mirror image as
// one mesh, bones made exactly symmetric, and `mirrorResidual`: how well the kept half's mirror
// image lies on the half it would replace, per body region. A head that is turned or off the
// plane shows there BEFORE anything is mirrored (mirroring it gives two muzzles): modelRig
// refuses to mirror above MIRROR_LIMIT.

import { type Bone, type Mesh, Ts23dError, type Vec3 } from '../core/index.ts';
import { capsuleDistance } from '../passes/index.ts';
import { triBvh } from '../primitives/index.ts';
import type { Bones } from './creature-bones.ts';
import { capsuleProjector, planCapsules } from './model-flesh.ts';
import { type FittedSkeleton, fitSkeleton } from './model-skeleton.ts';

export type Capsule = { head: Vec3; tail: Vec3; r: number };

/** Middle of the body's width (y) over its upper half, between the hind and the fore feet. */
export function upperMiddle(mesh: Mesh, plan: Bones): number {
  const xs = plan.legs.map((l) => l.foot[0]);
  const [x0, x1] = xs.length > 1 ? [Math.min(...xs), Math.max(...xs)] : [-Infinity, Infinity];
  const P = mesh.positions;
  let [lo, hi] = [Infinity, -Infinity];
  for (let i = 0; i < P.length; i += 3) {
    if ((P[i + 2] ?? 0) < plan.height * 0.5 || (P[i] ?? 0) < x0 || (P[i] ?? 0) > x1) continue;
    [lo, hi] = [Math.min(lo, P[i + 1] ?? 0), Math.max(hi, P[i + 1] ?? 0)];
  }
  return hi > lo ? (lo + hi) / 2 : 0;
}

/** Mean distance to the plan's flesh of the registered vertices on each side of y = 0. */
export function nearerSide(mesh: Mesh, plan: Bones): '+' | '-' {
  const project = capsuleProjector(planCapsules(plan));
  const P = mesh.positions;
  const step = Math.max(1, Math.floor(P.length / 3 / 3000));
  const sum = [0, 0];
  const n = [0, 0];
  for (let v = 0; v < P.length / 3; v += step) {
    const p: Vec3 = [P[v * 3] ?? 0, P[v * 3 + 1] ?? 0, P[v * 3 + 2] ?? 0];
    const k = p[1] >= 0 ? 0 : 1;
    sum[k] = (sum[k] ?? 0) + project(p).e;
    n[k] = (n[k] ?? 0) + 1;
  }
  return (sum[0] ?? 0) / Math.max(n[0] ?? 0, 1) <= (sum[1] ?? 0) / Math.max(n[1] ?? 0, 1)
    ? '+'
    : '-';
}

/** The `side` half of a mesh (the triangles centred on that side) and its mirror image across
 *  y = 0; vertices that cross the plane are put on it, so the two halves meet. */
export function mirrorHalf(mesh: Mesh, side: '+' | '-'): Mesh {
  const s = side === '+' ? 1 : -1;
  const P = mesh.positions;
  const n = P.length / 3;
  const keep: number[] = [];
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const ys = [0, 1, 2].map((k) => (P[(mesh.indices[t + k] ?? 0) * 3 + 1] ?? 0) * s);
    // By its centre: a far-side limb that only grazes the plane leaves no sliver on it.
    if (ys.reduce((a, y) => a + y, 0) > 0) keep.push(t);
  }
  const half = (flip: boolean): { p: Float32Array; nrm: Float32Array } => {
    const p = Float32Array.from(P);
    const nrm = Float32Array.from(mesh.normals);
    for (let v = 0; v < n; v++) {
      const y = Math.max(0, (P[v * 3 + 1] ?? 0) * s) * s;
      p[v * 3 + 1] = flip ? -y : y;
      if (flip) nrm[v * 3 + 1] = -(nrm[v * 3 + 1] ?? 0);
    }
    return { p, nrm };
  };
  const [a, b] = [half(false), half(true)];
  const cat = (x: Float32Array, y: Float32Array): Float32Array => {
    const out = new Float32Array(x.length + y.length);
    out.set(x);
    out.set(y, x.length);
    return out;
  };
  const indices = new Uint32Array(keep.length * 6);
  keep.forEach((t, i) => {
    const [i0, i1, i2] = [mesh.indices[t] ?? 0, mesh.indices[t + 1] ?? 0, mesh.indices[t + 2] ?? 0];
    indices.set([i0, i1, i2, i0 + n, i2 + n, i1 + n], i * 6);
  });
  return {
    positions: cat(a.p, b.p),
    normals: cat(a.nrm, b.nrm),
    uvs: cat(mesh.uvs, mesh.uvs),
    colors: cat(mesh.colors, mesh.colors),
    indices,
  };
}

const flip = (p: Vec3): Vec3 => [p[0], -p[1], p[2]];

/** Bones made exactly mirror-symmetric: `_l` chains mirrored onto `_r`, the rest onto y = 0. */
export function mirrorBones(bones: readonly Bone[]): Bone[] {
  const byName = new Map(bones.map((b) => [b.name, b]));
  return bones.map((b): Bone => {
    const left = b.name.replace(/_r(?=_\d+$|$)/, '_l');
    if (left !== b.name) {
      const l = byName.get(left);
      return l ? { ...b, head: flip(l.head), tail: flip(l.tail) } : b;
    }
    if (/_l(?=_\d+$|$)/.test(b.name)) return b;
    return { ...b, head: [b.head[0], 0, b.head[2]], tail: [b.tail[0], 0, b.tail[2]] };
  });
}

/** The capsules' own reach, as the Blender ops read it (steps/unweb.py REACH). */
export const CAPSULE_REACH = 1.5;

/** The mesh without the triangles whose centre lies within reach of any capsule. */
export function without(mesh: Mesh, caps: readonly Capsule[]): Mesh {
  if (caps.length === 0) return mesh;
  const P = mesh.positions;
  const keep: number[] = [];
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const mid = (a: number): number =>
      [0, 1, 2].reduce((sum, k) => sum + (P[(mesh.indices[t + k] ?? 0) * 3 + a] ?? 0), 0) / 3;
    const c: Vec3 = [mid(0), mid(1), mid(2)];
    const near = caps.some(
      (x) => capsuleDistance(c, { a: x.head, b: x.tail }) <= x.r * CAPSULE_REACH,
    );
    if (!near) keep.push(mesh.indices[t] ?? 0, mesh.indices[t + 1] ?? 0, mesh.indices[t + 2] ?? 0);
  }
  return { ...mesh, indices: Uint32Array.from(keep) };
}

export const moveY = (p: Vec3, dy: number): Vec3 => [p[0], p[1] + dy, p[2]];

/** The skeleton fitted (not strictly) on the unmirrored mesh, or null when its legs cannot be
 *  traced. */
export function tracedSkeleton(mesh: Mesh, plan: Bones, prefix: string): FittedSkeleton | null {
  try {
    return fitSkeleton(mesh, plan, prefix, false);
  } catch (e) {
    if (e instanceof Ts23dError && e.code === 'T3D_MODEL_SKELETON') return null;
    throw e;
  }
}

/** Largest 95th-percentile mirror residual ÷ plan height of the head, neck or trunk for a mirror
 *  to be allowed. Measured on the proxies: profile wolf head 0.126 (mirrored, it has two muzzles),
 *  ¾ wolf head 0.218; necks ≤ 0.058, trunks ≤ 0.045; the symmetric fixture 0. */
export const MIRROR_LIMIT = 0.08;

export interface MirrorResidual {
  /** Per region (bone chain: head, neck, spine, tail, fore, hind …): median and 95th percentile
   *  distance from the kept half's mirror image to the surface it would replace, ÷ plan height. */
  readonly regions: Readonly<Record<string, { readonly median: number; readonly p95: number }>>;
  /** The worst p95 over head, neck and spine. */
  readonly worst: number;
  readonly region: string;
}

/** How far the mesh's mirror image (across y = 0) lies from the mesh, per region of `bones`:
 *  both halves are measured, so a head leaning to either side shows. */
export function mirrorResidual(mesh: Mesh, bones: readonly Bone[], height: number): MirrorResidual {
  const bvh = triBvh(mesh);
  const P = mesh.positions;
  const step = Math.max(1, Math.floor(P.length / 3 / 4000));
  const by = new Map<string, number[]>();
  const q: [number, number, number] = [0, 0, 0];
  for (let v = 0; v < P.length / 3; v += step) {
    const p: Vec3 = [P[v * 3] ?? 0, P[v * 3 + 1] ?? 0, P[v * 3 + 2] ?? 0];
    let [near, region] = [Infinity, ''];
    for (const b of bones) {
      if (b.name.endsWith('_mid')) continue;
      const d = capsuleDistance(p, { a: b.head, b: b.tail });
      if (d < near)
        [near, region] = [
          d,
          b.name
            .replace(/(_[lr])?(_\d+)?$/, '')
            .replace(/^.*_(?=fore|hind|head|neck|spine|tail)/, ''),
        ];
    }
    by.set(region, [...(by.get(region) ?? []), bvh.closest([p[0], -p[1], p[2]], q) / height]);
  }
  const regions: Record<string, { median: number; p95: number }> = {};
  for (const [k, d] of by) {
    d.sort((a, b) => a - b);
    regions[k] = { median: d[d.length >> 1] ?? 0, p95: d[Math.floor(d.length * 0.95)] ?? 0 };
  }
  let [worst, region] = [0, ''];
  for (const k of ['head', 'neck', 'spine'])
    if ((regions[k]?.p95 ?? 0) > worst) [worst, region] = [regions[k]?.p95 ?? 0, k];
  return { regions, worst, region };
}
