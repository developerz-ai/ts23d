// The oak's age story, after the bark swap (../pine/bark.ts): pale grey-green crustose lichen on
// the sky-facing tops of the limbs and the bole (it grows where light and rain land), and the dead
// wood a ~150-year field oak carries: a snapped-off dead limb on the bole (silver-grey, bark gone,
// a jagged broken end) and a fallen limb lying in the leaf litter under the crown.

import { type Mesh, merge, stripRect, sweep, type Vec3 } from '@developerz.ai/ts23d';

const LICHEN: Vec3 = [0.68, 0.72, 0.58];

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: Vec3): Vec3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
/** Silvered dead oak wood under vertex colour on the `wood_weathered` strip. */
const DEAD: Vec3 = [0.78, 0.76, 0.7];

/** Lichen blotches on up-facing bark: `noise` in [−1, 1], `amount` 0..1. */
export function lichen(m: Mesh, noise: (p: Vec3) => number, amount: number): Mesh {
  const colors = new Float32Array(m.colors);
  for (let i = 0; i < m.positions.length / 3; i++) {
    const nz = m.normals[i * 3 + 2] ?? 0;
    const p: Vec3 = [
      m.positions[i * 3] ?? 0,
      m.positions[i * 3 + 1] ?? 0,
      m.positions[i * 3 + 2] ?? 0,
    ];
    if (p[2] < 1.2) continue;
    const blot = Math.max(0, noise(p) * 1.6 - 0.15);
    // Most on the sky-facing tops of limbs, but bole sides carry patches too.
    const w = Math.min(0.85, amount * (0.45 + Math.max(0, nz)) * blot);
    if (w <= 0) continue;
    for (let k = 0; k < 3; k++) {
      const c = colors[i * 3 + k] ?? 0;
      colors[i * 3 + k] = c + ((LICHEN[k] ?? 0) - c) * w;
    }
  }
  return { ...m, colors };
}

/** Bark ring centre at height z on the -Y face of a trunk mesh, and its radius there. */
export function trunkAt(trunk: Mesh, z: number): { c: Vec3; r: number } {
  let [sx, sy, n] = [0, 0, 0];
  for (let i = 0; i < trunk.positions.length / 3; i++) {
    if (Math.abs((trunk.positions[i * 3 + 2] ?? 0) - z) > 0.35) continue;
    sx += trunk.positions[i * 3] ?? 0;
    sy += trunk.positions[i * 3 + 1] ?? 0;
    n++;
  }
  const c: Vec3 = n > 0 ? [sx / n, sy / n, z] : [0, 0, z];
  let r = 0;
  for (let i = 0; i < trunk.positions.length / 3; i++) {
    if (Math.abs((trunk.positions[i * 3 + 2] ?? 0) - z) > 0.35) continue;
    r = Math.max(
      r,
      Math.hypot((trunk.positions[i * 3] ?? 0) - c[0], (trunk.positions[i * 3 + 1] ?? 0) - c[1]),
    );
  }
  return { c, r };
}

/** A tapered, slightly crooked limb from `from` along `dir`, broken off with a jagged end. */
export function brokenLimb(
  from: Vec3,
  dir: Vec3,
  length: number,
  r0: number,
  segments: number,
): Mesh {
  const steps = 6;
  const path: Vec3[] = [];
  const scale: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const d = length * t;
    const kink = Math.sin(t * 5.1) * 0.06 * length;
    path.push([
      from[0] + dir[0] * d + kink * dir[1],
      from[1] + dir[1] * d - kink * dir[0],
      from[2] + dir[2] * d + Math.sin(t * 3.3) * 0.04 * length,
    ]);
    scale.push(r0 * (1 - 0.55 * t));
  }
  const m = sweep({
    section: { radius: 1, segments },
    path,
    scale,
    color: DEAD,
    strip: 'wood_weathered',
    caps: true,
  });
  // Jagged break: every vertex at the end (last ring and its cap, which share positions) pushed
  // along the limb by a function of its angle about the axis, so splinters stick out and the
  // torn side falls back without opening a crack between the ring and the cap.
  const end = path[path.length - 1] ?? from;
  const rEnd = scale[scale.length - 1] ?? r0;
  const ref: Vec3 = Math.abs(dir[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const e1 = norm(cross(dir, ref));
  const e2 = cross(dir, e1);
  const positions = new Float32Array(m.positions);
  for (let i = 0; i < positions.length / 3; i++) {
    const q: Vec3 = [positions[i * 3] ?? 0, positions[i * 3 + 1] ?? 0, positions[i * 3 + 2] ?? 0];
    const d = sub(q, end);
    if (Math.abs(dot(d, dir)) > 0.02 || len(d) > rEnd * 1.05) continue;
    const ang = Math.atan2(dot(d, e2), dot(d, e1));
    const rad = len(d) / Math.max(1e-6, rEnd);
    const off =
      rEnd * rad * (0.9 * Math.max(0, Math.sin(ang * 3)) - 0.5 * Math.max(0, Math.cos(ang * 2)));
    for (let k = 0; k < 3; k++) positions[i * 3 + k] = (q[k] ?? 0) + (dir[k] ?? 0) * off;
  }
  // A sweep's seam column sits on the band's top edge (V = v1, the next strip's first texel row):
  // keep every V a hair inside the weathered-wood band.
  const band = stripRect('wood_weathered');
  const uvs = new Float32Array(m.uvs);
  for (let i = 1; i < uvs.length; i += 2)
    uvs[i] = Math.min(band.v1 - 1e-4, Math.max(band.v0 + 1e-4, uvs[i] ?? 0));
  return { ...m, positions, uvs };
}

/**
 * The snag: a dead limb leaving the bole at `z` on the front (+X) side, rising a little, its root
 * buried in the trunk so it grows out of the bark (merged into the trunk part). `trunk` is the
 * trunk mesh of the same LOD.
 */
export function deadLimb(trunk: Mesh, z: number, lod: number): Mesh {
  const { c, r } = trunkAt(trunk, z);
  // Out along +X (the front), nearly level: inside the bole's Y extent (the DBH measure).
  const d = Math.hypot(1, 0.12, 0.08);
  const dir: Vec3 = [1 / d, -0.12 / d, 0.08 / d];
  return brokenLimb(c, dir, r + 1.6, 0.16, lod === 0 ? 7 : 5);
}

/** A fallen limb resting in the litter, one end on the ground disc, `at` its butt. */
export function fallenLimb(at: Vec3, yawDeg: number, lod: number): Mesh {
  const a = (yawDeg * Math.PI) / 180;
  const r0 = 0.16;
  const dir: Vec3 = [Math.cos(a), Math.sin(a), -0.02];
  const main = brokenLimb([at[0], at[1], at[2] + r0 * 0.75], dir, 3.6, r0, lod === 0 ? 7 : 4);
  if (lod > 0) return main;
  // A side branch forking off a third of the way along, lying on the ground too.
  const b = (yawDeg + 38) * (Math.PI / 180);
  const fork: Vec3 = [at[0] + dir[0] * 1.2, at[1] + dir[1] * 1.2, at[2] + r0 * 0.55];
  return merge([main, brokenLimb(fork, [Math.cos(b), Math.sin(b), -0.04], 1.6, 0.07, 5)]);
}
