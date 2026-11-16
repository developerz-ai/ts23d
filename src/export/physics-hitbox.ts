// Per-bone hitboxes for skinned assets: one capsule per bone fitted to the vertices that bone
// dominates (weight ≥ ½), parallel to the bone through their centroid, its radius grown until it
// holds ≥ 95 % of them. Written
// as KHR_physics_rigid_bodies triggers (KHR_implicit_shapes capsules) on the joint nodes, so they
// ride the skeleton and never change the body's own collision: game code reads them for damage.

import {
  type CompiledAsset,
  type Quat,
  SKIN_INFLUENCES,
  toWorld,
  type Vec3,
  worldTransforms,
} from '../core/index.ts';
import type { Json } from './bin-writer.ts';
import type { GltfDoc } from './hierarchy.ts';

/** Share of a bone's vertices its capsule must contain. */
export const HITBOX_COVERAGE = 0.95;

export interface Hitbox {
  readonly bone: string;
  /** Capsule centre relative to the bone's head (joint-local, metres). */
  readonly center: Vec3;
  /** Rotates local +Y onto the bone. */
  readonly rotation: Quat;
  /** Distance between the cap centres (KHR definition). */
  readonly height: number;
  readonly radius: number;
  /** Share of the bone's vertices inside (≥ HITBOX_COVERAGE). */
  readonly coverage: number;
}

const r6 = (v: number): number => Math.round(v * 1e6) / 1e6;

/** Shortest-arc rotation taking +Y onto unit `u`. */
function yTo(u: Vec3): Quat {
  const w = 1 + u[1];
  if (w < 1e-9) return [1, 0, 0, 0];
  const q: Quat = [u[2], 0, -u[0], w];
  const l = Math.hypot(...q);
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

const percentile = (xs: readonly number[], f: number): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(f * (s.length - 1))))] ?? 0;
};

/** Every bone's capsule (bones dominating fewer than 4 vertices get none). */
export function fitHitboxes(asset: CompiledAsset): Hitbox[] {
  const sk = asset.skeleton;
  if (!sk) return [];
  const pts: Vec3[][] = sk.bones.map(() => []);
  const xf = worldTransforms(asset.parts);
  for (const p of asset.parts) {
    const m = p.mesh;
    const t = xf.get(p.name);
    if (!m?.joints || !m.weights || !t || p.surface === 'cutout') continue;
    for (let v = 0; v < m.positions.length / 3; v++)
      for (let s = 0; s < SKIN_INFLUENCES; s++)
        if ((m.weights[v * SKIN_INFLUENCES + s] ?? 0) >= 0.5) {
          const w = toWorld(t, [
            m.positions[v * 3] ?? 0,
            m.positions[v * 3 + 1] ?? 0,
            m.positions[v * 3 + 2] ?? 0,
          ]);
          pts[m.joints[v * SKIN_INFLUENCES + s] ?? 0]?.push(w);
        }
  }
  return sk.bones.flatMap((b, i): Hitbox[] => {
    const ps = pts[i] ?? [];
    if (ps.length < 4) return [];
    const d: Vec3 = [b.tail[0] - b.head[0], b.tail[1] - b.head[1], b.tail[2] - b.head[2]];
    const len = Math.hypot(...d);
    const u: Vec3 = [d[0] / len, d[1] / len, d[2] / len];
    // The axis runs along the bone through the flesh's centroid (a spine bone lies on the back's
    // top line; its flesh hangs below it).
    const mean = (k: 0 | 1 | 2): number => ps.reduce((sum, p) => sum + p[k], 0) / ps.length;
    const c: Vec3 = [mean(0), mean(1), mean(2)];
    const along = ps.map((p) => (p[0] - c[0]) * u[0] + (p[1] - c[1]) * u[1] + (p[2] - c[2]) * u[2]);
    const radial = ps.map((p, k) => {
      const t = along[k] ?? 0;
      return Math.hypot(p[0] - c[0] - u[0] * t, p[1] - c[1] - u[1] * t, p[2] - c[2] - u[2] * t);
    });
    let r = Math.max(1e-3, percentile(radial, HITBOX_COVERAGE));
    const lo = percentile(along, 0.01);
    const hi = percentile(along, 0.99);
    let a = 0;
    let z = 0;
    let coverage = 0;
    for (let k = 0; k < 40; k++) {
      a = Math.min(lo + r / 2, (lo + hi) / 2);
      z = Math.max(hi - r / 2, (lo + hi) / 2);
      const inside = ps.filter((_, j) => {
        const t = Math.min(z, Math.max(a, along[j] ?? 0));
        return Math.hypot((along[j] ?? 0) - t, radial[j] ?? 0) <= r + 1e-9;
      }).length;
      coverage = inside / ps.length;
      if (coverage >= HITBOX_COVERAGE) break;
      r *= 1.05;
    }
    const mid = (a + z) / 2;
    const q = yTo(u);
    return [
      {
        bone: b.name,
        center: [
          r6(c[0] + u[0] * mid - b.head[0]),
          r6(c[1] + u[1] * mid - b.head[1]),
          r6(c[2] + u[2] * mid - b.head[2]),
        ],
        rotation: [r6(q[0]), r6(q[1]), r6(q[2]), r6(q[3])],
        height: r6(z - a),
        radius: r6(r),
        coverage: Math.round(coverage * 1e4) / 1e4,
      },
    ];
  });
}

/** Trigger nodes under the joint nodes; capsule shapes appended to `shapes`. */
export function writeHitboxes(
  doc: GltfDoc,
  hitboxes: readonly Hitbox[],
  joints: ReadonlyMap<string, number>,
  shapes: Json[],
  extension: string,
): void {
  for (const h of hitboxes) {
    const joint = joints.get(h.bone);
    const parent = joint === undefined ? undefined : doc.nodes[joint];
    if (!parent) continue;
    shapes.push({
      type: 'capsule',
      capsule: { height: h.height, radiusTop: h.radius, radiusBottom: h.radius },
    });
    doc.nodes.push({
      name: `${h.bone}_hitbox`,
      translation: [...h.center],
      rotation: [...h.rotation],
      extras: { ts23d: { hitbox: h.bone } },
      extensions: { [extension]: { trigger: { geometry: { shape: shapes.length - 1 } } } },
    });
    parent['children'] = [
      ...((parent['children'] as number[] | undefined) ?? []),
      doc.nodes.length - 1,
    ];
  }
}
