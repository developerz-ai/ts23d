// Gate: moving parts never cut through anything. Each motion root (a spinning wheel/axle group, a
// rotor, a sliding crosshead) is swept through its whole motion; any other part whose surface goes
// deeper than CLASH_EPS into that swept volume fails — wheel vs fender, prop vs cowling, rod vs frame.
// Spins sweep a solid of revolution (clash-sweep.ts); sways sweep only the sector they travel,
// resolved to millimetres (clash-sector.ts); slides use the moving mesh's bounds extended along the stroke (one
// side only for `oneWay`).

import {
  type CompiledAsset,
  type Mesh,
  merge,
  type Part,
  type Vec3,
  worldMeshes,
  worldTransforms,
} from '../core/index.ts';
import { sectorVolume } from './clash-sector.ts';
import { spinVolume, type Volume } from './clash-sweep.ts';
import { surfaceSamples } from './geometry.ts';
import { meshBounds } from './geometry-cache.ts';
import { CLASH_EPS, type Finding, type Gate } from './types.ts';

/** Sample spacing on the static parts (m), and the face-interior lattice cap per triangle: 400
 *  points keep a 3.6 m panel triangle at ≤ 7 cm spacing, so a 10 cm rotor blade through its
 *  middle lands samples (a big triangle costs up to 400 inside-tests; most are below 10 cm). */
const STEP = 0.1;
const INTERIOR = 400;

function subtree(parts: readonly Part[], root: string): Set<string> {
  const out = new Set([root]);
  for (const p of parts) if (p.parent && out.has(p.parent)) out.add(p.name);
  return out;
}

function slideVolume(mesh: Mesh, offset: Vec3, oneWay = false): Volume {
  const b = meshBounds(mesh);
  // Two-sided strokes reach ±offset; one-way strokes reach rest..rest + offset.
  const neg = (k: number): number =>
    oneWay ? Math.min(0, offset[k] ?? 0) : -Math.abs(offset[k] ?? 0);
  const pos = (k: number): number =>
    oneWay ? Math.max(0, offset[k] ?? 0) : Math.abs(offset[k] ?? 0);
  const lo = [0, 1, 2].map((k) => (b.min[k] ?? 0) + neg(k) + CLASH_EPS);
  const hi = [0, 1, 2].map((k) => (b.max[k] ?? 0) + pos(k) - CLASH_EPS);
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
  // A tread runs round inside its own outline: nothing to sweep.
  for (const root of asset.parts.filter((p) => p.motion && p.motion.kind !== 'tread')) {
    const moving = subtree(asset.parts, root.name);
    const body = merge([...moving].flatMap((n) => meshes.get(n) ?? []));
    const t = xf.get(root.name);
    if (!t || body.indices.length === 0 || !root.motion || root.motion.kind === 'tread') continue;
    const c = Math.cos(t.yaw);
    const s = Math.sin(t.yaw);
    const rot = (v: Vec3): Vec3 => [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]];
    const m = root.motion;
    const peak = m.kind === 'sway' ? (m.degrees * Math.PI) / 180 : 0;
    const vol =
      m.kind === 'slide'
        ? slideVolume(body, rot(m.offset), m.oneWay)
        : m.kind === 'sway' && (m.oneWay ? peak : 2 * peak) < Math.PI * 2
          ? sectorVolume(body, t.origin, rot(m.axis), m.oneWay ? [0, peak] : [-peak, peak])
          : spinVolume(body, t.origin, rot(m.axis));
    for (const [name, mesh] of meshes) {
      if (moving.has(name) || root.clearOf?.includes(name)) continue;
      const b = meshBounds(mesh);
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
      const hits = surfaceSamples(mesh, STEP, 4, INTERIOR).filter(
        (p) => inBox(p, vol) && vol.inside(p),
      ).length;
      if (hits > 0) {
        findings.push({
          gate: 'clashes',
          code: 'T3D_QA_CLASHES',
          part: name,
          message: `'${name}' cuts into the swept ${root.motion.kind} of '${root.name}' (${hits} sample${hits === 1 ? '' : 's'} deeper than ${CLASH_EPS * 100} cm)`,
          fix: `move/trim '${name}' or '${root.name}' for running clearance; if they are meant to interlock (an axle through its bearing), list it: clearOf: ['${name}'] on '${root.name}'`,
        });
      }
    }
  }
  return findings;
};
