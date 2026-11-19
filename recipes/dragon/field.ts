// Cinderhorn after a century of fights and fire (world frame): the wear a pristine sculpt lacks.
//   wear    ash from its own breath settled grey on the back, crest and wing tops; soot baked
//           black round the nostrils and the corners of the mouth; the feet, the belly's edge and
//           the dragging tail caked with cinder mud; three claw rakes healed pale across the right
//           flank, a cut across the snout and one down the right side of the neck
//   horn    the right main horn's tip snapped off: the mesh beyond a slanted break plane is
//           pressed flat onto it, showing the pale core
//   wing    the right wing's trailing edge torn: a V notch pulled into the membrane between the
//           second and third fingers (vertices move, no triangle is cut: the slab stays closed)

import { grime, type Mesh, type Vec3 } from '@developerz.ai/ts23d';
import { recolour } from '../_lib/creature/wild.ts';
import { mix, smooth, type WearSpec, wearPaint } from '../_lib/creature/wild-paint.ts';
import { C } from './palette.ts';
import { JOINT } from './shoulder.ts';
import { SK } from './skeleton.ts';

const nose = SK.head.nose;
const hinge = SK.head.hinge;

export const WEAR: WearSpec = {
  seed: 77,
  settle: { colour: [0.2, 0.185, 0.175], strength: 0.42, above: 1.7, patch: 0.3 },
  mud: { top: 0.5, colour: [0.06, 0.05, 0.045], strength: 0.85 },
  damp: { top: 0.75, strength: 0.22 },
  patches: [
    // Soot: the nostrils, the lips' corners, the throat under the jaw.
    {
      at: [nose[0] - 0.08, 0, nose[2] + 0.04],
      radius: 0.36,
      colour: [0.02, 0.018, 0.016],
      strength: 0.8,
    },
    {
      at: [hinge[0] + 0.35, 0.3, hinge[2] + 0.02],
      radius: 0.3,
      colour: [0.02, 0.018, 0.016],
      strength: 0.65,
    },
    {
      at: [hinge[0] + 0.35, -0.3, hinge[2] + 0.02],
      radius: 0.3,
      colour: [0.02, 0.018, 0.016],
      strength: 0.65,
    },
    {
      at: [hinge[0] + 0.75, 0, hinge[2] - 0.12],
      radius: 0.4,
      colour: [0.03, 0.025, 0.022],
      strength: 0.5,
    },
  ],
  // Healed scale-less skin: a dull rose a few steps above the crimson, not white.
  scarColour: [0.5, 0.2, 0.16],
  scars: [
    // Claw rakes across the right flank (projected along Y onto the ribs).
    ...[0, 1, 2].map((k) => ({
      a: [0.55 - k * 0.2, -0.7, 1.98 - k * 0.03] as Vec3,
      b: [0.2 - k * 0.2, -0.7, 1.38 + k * 0.05] as Vec3,
      width: 0.024 - k * 0.003,
      axis: 1 as const,
      reach: 0.45,
    })),
    // Down the right side of the neck.
    { a: [1.72, -0.35, 2.75], b: [1.5, -0.4, 2.3], width: 0.026, axis: 1, reach: 0.4 },
    // Across the snout, brow side to lip.
    { a: [3.0, -0.16, 3.5], b: [3.3, 0.1, 3.42], width: 0.011, axis: 2, reach: 0.3 },
  ],
};

const wear = wearPaint(WEAR);

/** A part's mesh with the wear painted in; `at` = the part's world offset. */
export function worn(mesh: Mesh, at: Vec3 = [0, 0, 0]): Mesh {
  const m = recolour(mesh, at, wear);
  return at[0] === 0 && at[1] === 0 && at[2] === 0
    ? grime(m, { ground: 0.9, groundStrength: 0.22 })
    : m;
}

/**
 * Snap a horn's tip off: everything beyond the break plane (at `keep` of the way from `root` to
 * the farthest vertex, tilted so the break is slanted) is pressed onto the plane and painted as
 * the horn's pale core, darker at the splintered rim.
 */
export function brokenTip(horn: Mesh, root: Vec3, keep: number): Mesh {
  const P = horn.positions;
  let tip: Vec3 = root;
  let far = 0;
  for (let i = 0; i < P.length; i += 3) {
    const d = Math.hypot(
      (P[i] ?? 0) - root[0],
      (P[i + 1] ?? 0) - root[1],
      (P[i + 2] ?? 0) - root[2],
    );
    if (d > far) [far, tip] = [d, [P[i] ?? 0, P[i + 1] ?? 0, P[i + 2] ?? 0]];
  }
  if (far === 0) return horn;
  const axis: Vec3 = [(tip[0] - root[0]) / far, (tip[1] - root[1]) / far, (tip[2] - root[2]) / far];
  // Slanted: the plane's normal leans 25° off the horn's axis, toward +Z.
  const lean: Vec3 = [axis[0], axis[1], axis[2] + 0.47];
  const ll = Math.hypot(lean[0], lean[1], lean[2]);
  const n: Vec3 = [lean[0] / ll, lean[1] / ll, lean[2] / ll];
  const at: Vec3 = [
    root[0] + axis[0] * far * keep,
    root[1] + axis[1] * far * keep,
    root[2] + axis[2] * far * keep,
  ];
  const positions = new Float32Array(P);
  const colors = new Float32Array(horn.colors);
  for (let i = 0; i < P.length; i += 3) {
    const h =
      ((P[i] ?? 0) - at[0]) * n[0] +
      ((P[i + 1] ?? 0) - at[1]) * n[1] +
      ((P[i + 2] ?? 0) - at[2]) * n[2];
    if (h <= 0) continue;
    for (let k = 0; k < 3; k++) positions[i + k] = (P[i + k] ?? 0) - (n[k] ?? 0) * h;
    const core = mix(C.horn, C.hornRoot, smooth(0, far * 0.04, h) * 0.55);
    colors.set(core, i);
  }
  return { ...horn, positions, colors };
}

/**
 * Tear the trailing edge of a wing membrane (a mesh in the wing pivot's frame, `side` 1 = left,
 * −1 = right): the rim vertex farthest out between fingers `k` and `k + 1` is found, and the
 * membrane within `radius` of it is pulled back toward the wrist, deepest at the rim: a V notch
 * with a dark, dried edge.
 */
export function tornEdge(
  membrane: Mesh,
  side: 1 | -1,
  k: number,
  radius: number,
  depth: number,
): Mesh {
  const W = SK.wing;
  const local = (p: Vec3): Vec3 => [p[0] - JOINT[0], (p[1] - JOINT[1]) * side, p[2] - JOINT[2]];
  const a = local(W.tips[k] ?? W.wrist);
  const b = local(W.tips[k + 1] ?? W.wrist);
  const w = local(W.wrist);
  const mid: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const out: Vec3 = [mid[0] - w[0], mid[1] - w[1], mid[2] - w[2]];
  const ol = Math.hypot(out[0], out[1], out[2]) || 1;
  const e: Vec3 = [out[0] / ol, out[1] / ol, out[2] / ol];
  const chord = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const P = membrane.positions;
  // The rim: the vertex farthest along `e` among those near the panel's mid line.
  let rim: Vec3 | null = null;
  let best = -Infinity;
  for (let i = 0; i < P.length; i += 3) {
    const p: Vec3 = [P[i] ?? 0, P[i + 1] ?? 0, P[i + 2] ?? 0];
    const d: Vec3 = [p[0] - mid[0], p[1] - mid[1], p[2] - mid[2]];
    const along = d[0] * e[0] + d[1] * e[1] + d[2] * e[2];
    const off = Math.hypot(d[0] - e[0] * along, d[1] - e[1] * along, d[2] - e[2] * along);
    if (off < chord * 0.12 && along > best) [best, rim] = [along, p];
  }
  if (!rim) return membrane;
  const positions = new Float32Array(P);
  const colors = new Float32Array(membrane.colors);
  for (let i = 0; i < P.length; i += 3) {
    const d = Math.hypot((P[i] ?? 0) - rim[0], (P[i + 1] ?? 0) - rim[1], (P[i + 2] ?? 0) - rim[2]);
    if (d >= radius) continue;
    const t = 1 - d / radius;
    for (let c = 0; c < 3; c++) positions[i + c] = (P[i + c] ?? 0) - (e[c] ?? 0) * depth * t * t;
    const dark = mix(
      [colors[i] ?? 0, colors[i + 1] ?? 0, colors[i + 2] ?? 0],
      C.scaleSeam,
      t * 0.8,
    );
    colors.set(dark, i);
  }
  return { ...membrane, positions, colors };
}
