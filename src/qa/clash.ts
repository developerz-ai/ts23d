// Gate: moving parts never cut through anything. Each motion root (a spinning wheel/axle group, a
// rotor, a sliding crosshead) is swept through its whole motion; any other part whose surface goes
// deeper than CLASH_EPS into that swept volume fails — wheel vs fender, prop vs cowling, rod vs frame.
// Spins sweep a solid of revolution (radius profile per axial slice); sways sweep only their
// sector (the same profile, kept per 5° angular bin and widened by the swing); slides use the
// moving mesh's bounds extended along the stroke (one side only for `oneWay`).

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

const BINS = 72;
const TAU = Math.PI * 2;

/**
 * Swept volume of `mesh` rotating about `axis` through `pivot`. `range` (radians, rest = 0)
 * limits it to a sector; omitted = a full revolution.
 */
function spinVolume(
  mesh: Mesh,
  pivot: Vec3,
  axis: Vec3,
  range?: readonly [number, number],
): Volume {
  const len = Math.hypot(...axis) || 1;
  const u: Vec3 = [axis[0] / len, axis[1] / len, axis[2] / len];
  // A frame around the axis, for the angle of each point.
  const ref: Vec3 = Math.abs(u[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const dotRef = ref[0] * u[0] + ref[1] * u[1] + ref[2] * u[2];
  const e1raw: Vec3 = [ref[0] - dotRef * u[0], ref[1] - dotRef * u[1], ref[2] - dotRef * u[2]];
  const e1l = Math.hypot(...e1raw) || 1;
  const e1: Vec3 = [e1raw[0] / e1l, e1raw[1] / e1l, e1raw[2] / e1l];
  const e2: Vec3 = [
    u[1] * e1[2] - u[2] * e1[1],
    u[2] * e1[0] - u[0] * e1[2],
    u[0] * e1[1] - u[1] * e1[0],
  ];
  const coords = (p: Vec3): [number, number, number] => {
    const d: Vec3 = [p[0] - pivot[0], p[1] - pivot[1], p[2] - pivot[2]];
    const a = d[0] * u[0] + d[1] * u[1] + d[2] * u[2];
    const x = d[0] * e1[0] + d[1] * e1[1] + d[2] * e1[2];
    const y = d[0] * e2[0] + d[1] * e2[1] + d[2] * e2[2];
    return [a, Math.hypot(x, y), Math.atan2(y, x)];
  };
  const bin = (phi: number): number =>
    Math.floor((((phi % TAU) + TAU) % TAU) / (TAU / BINS)) % BINS;
  const pts = surfaceSamples(mesh, 0.05, 8).map(coords);
  const lo = Math.min(...pts.map((p) => p[0]));
  const hi = Math.max(...pts.map((p) => p[0]));
  const span = Math.max(hi - lo, 1e-6);
  const slice = (a: number): number => Math.min(SLICES - 1, Math.floor(((a - lo) / span) * SLICES));
  // radius[slice * BINS + bin]: farthest body sample in that slice and angular bin (rest pose).
  const radius = new Float64Array(SLICES * BINS).fill(-1);
  for (const [a, r, phi] of pts) {
    const k = slice(a) * BINS + bin(phi);
    radius[k] = Math.max(radius[k] ?? -1, r);
  }
  // Bins a rest-pose bin sweeps into: the swing plus one bin of slack either side.
  const [from, to] = range ?? [0, TAU];
  const steps = range ? Math.ceil((to - from) / (TAU / BINS)) + 2 : BINS;
  const reach = Math.max(...radius) + Math.max(Math.abs(lo), Math.abs(hi));
  return {
    min: [pivot[0] - reach, pivot[1] - reach, pivot[2] - reach],
    max: [pivot[0] + reach, pivot[1] + reach, pivot[2] + reach],
    inside: (p) => {
      const [a, r, phi] = coords(p);
      if (a < lo + CLASH_EPS || a > hi - CLASH_EPS) return false;
      const base = slice(a) * BINS;
      // p is swept if some rest-pose bin, rotated by θ ∈ [from, to], lands on p's angle.
      for (let i = 0; i < Math.min(steps, BINS); i++) {
        const theta = range ? from - TAU / BINS + i * (TAU / BINS) : i * (TAU / BINS);
        if (r < (radius[base + bin(phi - theta)] ?? -1) - CLASH_EPS) return true;
      }
      return false;
    },
  };
}

function slideVolume(mesh: Mesh, offset: Vec3, oneWay = false): Volume {
  const b = boundsOf(mesh);
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
  for (const root of asset.parts.filter((p) => p.motion)) {
    const moving = subtree(asset.parts, root.name);
    const body = merge([...moving].flatMap((n) => meshes.get(n) ?? []));
    const t = xf.get(root.name);
    if (!t || body.indices.length === 0 || !root.motion) continue;
    const c = Math.cos(t.yaw);
    const s = Math.sin(t.yaw);
    const rot = (v: Vec3): Vec3 => [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]];
    const m = root.motion;
    const peak = m.kind === 'sway' ? (m.degrees * Math.PI) / 180 : 0;
    const vol =
      m.kind === 'slide'
        ? slideVolume(body, rot(m.offset), m.oneWay)
        : m.kind === 'sway'
          ? spinVolume(body, t.origin, rot(m.axis), m.oneWay ? [0, peak] : [-peak, peak])
          : spinVolume(body, t.origin, rot(m.axis));
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
