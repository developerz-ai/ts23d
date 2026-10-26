// Gate: moving parts never cut through anything. Each motion root (a spinning wheel/axle group, a
// rotor, a sliding crosshead) is swept through its whole motion; any other part whose surface goes
// deeper than CLASH_EPS into that swept volume fails — wheel vs fender, prop vs cowling, rod vs frame.
// Spin sweeps are exact solids of revolution (sway uses the same, conservatively) (radius profile per axial slice); slides use the
// moving mesh's bounds extended along the stroke.

import {
  boundsOf,
  type CompiledAsset,
  type Mesh,
  merge,
  type Part,
  type Vec3,
  worldMeshes,
  worldTransforms,
} from '../core/index.ts';
import { surfaceSamples } from './geometry.ts';
import { CLASH_EPS, type Finding, type Gate } from './types.ts';

const SLICES = 24;

function subtree(parts: readonly Part[], root: string): Set<string> {
  const out = new Set([root]);
  for (const p of parts) if (p.parent && out.has(p.parent)) out.add(p.name);
  return out;
}

type Inside = (p: Vec3) => boolean;

/** A swept volume plus its conservative world AABB, so far-away parts and samples skip the test. */
interface Volume {
  readonly inside: Inside;
  readonly min: Vec3;
  readonly max: Vec3;
}

function spinVolume(mesh: Mesh, pivot: Vec3, axis: Vec3): Volume {
  const len = Math.hypot(...axis) || 1;
  const u: Vec3 = [axis[0] / len, axis[1] / len, axis[2] / len];
  const coords = (p: Vec3): [number, number] => {
    const d: Vec3 = [p[0] - pivot[0], p[1] - pivot[1], p[2] - pivot[2]];
    const a = d[0] * u[0] + d[1] * u[1] + d[2] * u[2];
    return [a, Math.hypot(d[0] - a * u[0], d[1] - a * u[1], d[2] - a * u[2])];
  };
  const pts = surfaceSamples(mesh, 0.05, 8).map(coords);
  const lo = Math.min(...pts.map((p) => p[0]));
  const hi = Math.max(...pts.map((p) => p[0]));
  const span = Math.max(hi - lo, 1e-6);
  const radius = new Float64Array(SLICES).fill(-1);
  for (const [a, r] of pts) {
    const s = Math.min(SLICES - 1, Math.floor(((a - lo) / span) * SLICES));
    radius[s] = Math.max(radius[s] ?? -1, r);
  }
  const reach = Math.max(...radius) + Math.max(Math.abs(lo), Math.abs(hi));
  return {
    min: [pivot[0] - reach, pivot[1] - reach, pivot[2] - reach],
    max: [pivot[0] + reach, pivot[1] + reach, pivot[2] + reach],
    inside: (p) => {
      const [a, r] = coords(p);
      if (a < lo + CLASH_EPS || a > hi - CLASH_EPS) return false;
      const s = Math.min(SLICES - 1, Math.floor(((a - lo) / span) * SLICES));
      return r < (radius[s] ?? -1) - CLASH_EPS;
    },
  };
}

function slideVolume(mesh: Mesh, offset: Vec3): Volume {
  const b = boundsOf(mesh);
  const lo = [0, 1, 2].map(
    (k) => Math.min(b.min[k] ?? 0, (b.min[k] ?? 0) - Math.abs(offset[k] ?? 0)) + CLASH_EPS,
  );
  const hi = [0, 1, 2].map(
    (k) => Math.max(b.max[k] ?? 0, (b.max[k] ?? 0) + Math.abs(offset[k] ?? 0)) - CLASH_EPS,
  );
  return {
    min: [lo[0] ?? 0, lo[1] ?? 0, lo[2] ?? 0],
    max: [hi[0] ?? 0, hi[1] ?? 0, hi[2] ?? 0],
    inside: (p) => [0, 1, 2].every((k) => (p[k] ?? 0) > (lo[k] ?? 0) && (p[k] ?? 0) < (hi[k] ?? 0)),
  };
}

const inBox = (p: Vec3, v: Volume): boolean =>
  p[0] >= v.min[0] &&
  p[0] <= v.max[0] &&
  p[1] >= v.min[1] &&
  p[1] <= v.max[1] &&
  p[2] >= v.min[2] &&
  p[2] <= v.max[2];

export const clashes: Gate = (asset: CompiledAsset): Finding[] => {
  const meshes = worldMeshes(asset.parts);
  const xf = worldTransforms(asset.parts);
  const findings: Finding[] = [];
  for (const root of asset.parts.filter((p) => p.motion)) {
    const moving = subtree(asset.parts, root.name);
    const body = merge([...moving].flatMap((n) => meshes.get(n) ?? []));
    const t = xf.get(root.name);
    if (!t || body.indices.length === 0 || !root.motion) continue;
    const c = Math.cos(t.yaw);
    const s = Math.sin(t.yaw);
    const rot = (v: Vec3): Vec3 => [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]];
    // A sway sweeps a sector of a full turn; the whole revolution is a safe superset.
    const vol =
      root.motion.kind === 'slide'
        ? slideVolume(body, rot(root.motion.offset))
        : spinVolume(body, t.origin, rot(root.motion.axis));
    for (const [name, mesh] of meshes) {
      if (moving.has(name) || root.clearOf?.includes(name)) continue;
      const b = boundsOf(mesh);
      if (
        !inBox(b.min, {
          ...vol,
          min: [
            vol.min[0] - (b.max[0] - b.min[0]),
            vol.min[1] - (b.max[1] - b.min[1]),
            vol.min[2] - (b.max[2] - b.min[2]),
          ],
        })
      )
        continue;
      const hits = surfaceSamples(mesh, 0.1, 4).filter(
        (p) => inBox(p, vol) && vol.inside(p),
      ).length;
      if (hits > 0) {
        findings.push({
          gate: 'clashes',
          part: name,
          message: `'${name}' cuts into the swept ${root.motion.kind} of '${root.name}' (${hits} sample${hits === 1 ? '' : 's'} deeper than ${CLASH_EPS * 100} cm)`,
          fix: `move/trim '${name}' or '${root.name}' for running clearance; if they are meant to interlock (an axle through its bearing), list it: clearOf: ['${name}'] on '${root.name}'`,
        });
      }
    }
  }
  return findings;
};
