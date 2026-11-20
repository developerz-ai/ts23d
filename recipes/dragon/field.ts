// Cinderhorn after a century of fights and fire (world frame): the wear a pristine sculpt lacks.
//   wear    ash from its own breath settled grey on the back, crest and wing tops; soot baked
//           black round the nostrils and the corners of the mouth; the feet, the belly's edge and
//           the dragging tail caked with cinder mud; three claw rakes healed pale across the right
//           flank, a cut across the snout and one down the right side of the neck
//   horn    the right main horn's tip snapped off: the mesh beyond a slanted break plane is
//           pressed flat onto it, showing the pale core
//   wing    the right wing's trailing edge torn: a V notch pulled into the membrane between the
//           second and third fingers (vertices move, no triangle is cut: the slab stays closed)

import { dmath, grime, type Mesh, type Vec3 } from '@developerz.ai/ts23d';
import { recolour } from '../_lib/creature/wild.ts';
import { mix, smooth, type WearSpec, wearPaint } from '../_lib/creature/wild-paint.ts';
import { C } from './palette.ts';
import { JOINT } from './shoulder.ts';
import { SK } from './skeleton.ts';

const nose = SK.head.nose;
const hinge = SK.head.hinge;

export const WEAR: WearSpec = {
  seed: 77,
  // Pale wood ash lying in drifts on the back, crest and wing tops: grey on crimson.
  settle: { colour: [0.5, 0.47, 0.44], strength: 0.62, above: 1.7, patch: 0.42 },
  // Cinder mud: black and wet on the claws and the dragging tail, a grey ash crust drying up
  // the shanks, splashed to the knees and the belly plates' edge.
  mud: { top: 0.42, colour: [0.3, 0.27, 0.25], strength: 0.9 },
  damp: { top: 0.8, strength: 0.25 },
  patches: [
    // Soot: the nostrils, the lips' corners, the throat under the jaw.
    {
      at: [nose[0] - 0.12, 0, nose[2] + 0.04],
      radius: 0.5,
      colour: [0.02, 0.018, 0.016],
      strength: 0.88,
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
      radius: 0.5,
      colour: [0.03, 0.025, 0.022],
      strength: 0.6,
    },
    // …and a fan of soot blown back down the throat and the cream chest plates.
    { at: [1.75, 0, 2.25], radius: 0.55, colour: [0.05, 0.04, 0.035], strength: 0.72 },
    { at: [1.35, 0, 1.55], radius: 0.6, colour: [0.06, 0.05, 0.045], strength: 0.6 },
    // An old burn on the right flank: scales scorched matt black, grey at the edge.
    { at: [-0.35, -0.72, 1.75], radius: 0.5, colour: [0.07, 0.06, 0.055], strength: 0.7 },
  ],
  // Healed scale-less skin: a dull rose a few steps above the crimson, not white.
  scarColour: [0.72, 0.42, 0.36],
  scars: [
    // Claw rakes across the right flank (projected along Y onto the ribs).
    ...[0, 1, 2].map((k) => ({
      a: [0.62 - k * 0.24, -0.7, 2.08 - k * 0.03] as Vec3,
      b: [0.12 - k * 0.24, -0.7, 1.3 + k * 0.05] as Vec3,
      width: 0.055 - k * 0.008,
      axis: 1 as const,
      reach: 0.45,
    })),
    // Down the right side of the neck.
    { a: [1.76, -0.35, 2.85], b: [1.46, -0.4, 2.2], width: 0.05, axis: 1, reach: 0.4 },
    // Across the snout, brow side to lip.
    { a: [2.95, -0.18, 3.5], b: [3.32, 0.1, 3.42], width: 0.024, axis: 2, reach: 0.3 },
  ],
};

const wear = wearPaint(WEAR);
/** The far mesh's wear: the broad layers only (flecks and scars alias on 25 cm cells). */
const wearFar = wearPaint(WEAR, true);

/** A part's mesh with the wear painted in; `at` = the part's world offset; `far`: the far LOD. */
export function worn(mesh: Mesh, at: Vec3 = [0, 0, 0], far = false): Mesh {
  const m = recolour(mesh, at, far ? wearFar : wear);
  return at[0] === 0 && at[1] === 0 && at[2] === 0
    ? grime(m, { ground: 0.9, groundStrength: 0.22 })
    : m;
}

/** Per vertex, the sum of its triangles' unnormalised (area-weighted) winding normals. */
function faceSums(P: Float32Array, indices: Uint32Array): Float64Array {
  const acc = new Float64Array(P.length);
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t] ?? 0, indices[t + 1] ?? 0, indices[t + 2] ?? 0];
    const u = [0, 1, 2].map((k) => (P[b * 3 + k] ?? 0) - (P[a * 3 + k] ?? 0));
    const v = [0, 1, 2].map((k) => (P[c * 3 + k] ?? 0) - (P[a * 3 + k] ?? 0));
    const f = [
      (u[1] ?? 0) * (v[2] ?? 0) - (u[2] ?? 0) * (v[1] ?? 0),
      (u[2] ?? 0) * (v[0] ?? 0) - (u[0] ?? 0) * (v[2] ?? 0),
      (u[0] ?? 0) * (v[1] ?? 0) - (u[1] ?? 0) * (v[0] ?? 0),
    ];
    for (const w of [a, b, c])
      for (let k = 0; k < 3; k++) acc[w * 3 + k] = (acc[w * 3 + k] ?? 0) + (f[k] ?? 0);
  }
  return acc;
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
    const d = dmath.hypot(
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
  const ll = dmath.hypot(lean[0], lean[1], lean[2]);
  const n: Vec3 = [lean[0] / ll, lean[1] / ll, lean[2] / ll];
  const at: Vec3 = [
    root[0] + axis[0] * far * keep,
    root[1] + axis[1] * far * keep,
    root[2] + axis[2] * far * keep,
  ];
  const positions = new Float32Array(P);
  const normals = new Float32Array(horn.normals);
  const colors = new Float32Array(horn.colors);
  const moved: number[] = [];
  for (let i = 0; i < P.length; i += 3) {
    const h =
      ((P[i] ?? 0) - at[0]) * n[0] +
      ((P[i + 1] ?? 0) - at[1]) * n[1] +
      ((P[i + 2] ?? 0) - at[2]) * n[2];
    if (h <= 0) continue;
    for (let k = 0; k < 3; k++) positions[i + k] = (P[i + k] ?? 0) - (n[k] ?? 0) * h;
    moved.push(i / 3);
    const core = mix(C.horn, C.hornRoot, smooth(0, far * 0.04, h) * 0.55);
    colors.set(core, i);
  }
  // A pressed vertex lies on the break face (or its rim): its normal is that of the faces it now
  // touches, area-weighted by winding, so it looks out along the break and blends into the wall.
  const faces = faceSums(positions, horn.indices);
  for (const v of moved) {
    const f: Vec3 = [faces[v * 3] ?? 0, faces[v * 3 + 1] ?? 0, faces[v * 3 + 2] ?? 0];
    const l = dmath.hypot(f[0], f[1], f[2]);
    normals.set(l > 0 ? [f[0] / l, f[1] / l, f[2] / l] : n, v * 3);
  }
  return { ...horn, positions, normals, colors };
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
  const ol = dmath.hypot(out[0], out[1], out[2]) || 1;
  const e: Vec3 = [out[0] / ol, out[1] / ol, out[2] / ol];
  const chord = dmath.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const P = membrane.positions;
  // The rim: the vertex farthest along `e` among those near the panel's mid line.
  let rim: Vec3 | null = null;
  let best = -Infinity;
  for (let i = 0; i < P.length; i += 3) {
    const p: Vec3 = [P[i] ?? 0, P[i + 1] ?? 0, P[i + 2] ?? 0];
    const d: Vec3 = [p[0] - mid[0], p[1] - mid[1], p[2] - mid[2]];
    const along = d[0] * e[0] + d[1] * e[1] + d[2] * e[2];
    const off = dmath.hypot(d[0] - e[0] * along, d[1] - e[1] * along, d[2] - e[2] * along);
    if (off < chord * 0.12 && along > best) [best, rim] = [along, p];
  }
  if (!rim) return membrane;
  const positions = new Float32Array(P);
  const normals = new Float32Array(membrane.normals);
  const colors = new Float32Array(membrane.colors);
  for (let i = 0; i < P.length; i += 3) {
    const r: Vec3 = [(P[i] ?? 0) - rim[0], (P[i + 1] ?? 0) - rim[1], (P[i + 2] ?? 0) - rim[2]];
    const d = dmath.hypot(r[0], r[1], r[2]);
    if (d >= radius) continue;
    const t = 1 - d / radius;
    for (let c = 0; c < 3; c++) positions[i + c] = (P[i + c] ?? 0) - (e[c] ?? 0) * depth * t * t;
    // The pull is p − e·depth·t²: Jacobian J = I + e gᵀ, g = 2·depth·t·r / (radius·d). Normals
    // go by its cofactor det(J)·J⁻ᵀ = (1 + e·g) I − g eᵀ, which keeps them on the side the
    // triangles' winding faces. The rim vertex (d = 0) is the notch's apex and keeps its normal.
    if (d > 0) {
      const s = (2 * depth * t) / (radius * d);
      const g: Vec3 = [r[0] * s, r[1] * s, r[2] * s];
      const nv: Vec3 = [normals[i] ?? 0, normals[i + 1] ?? 0, normals[i + 2] ?? 0];
      const en = e[0] * nv[0] + e[1] * nv[1] + e[2] * nv[2];
      const det = 1 + e[0] * g[0] + e[1] * g[1] + e[2] * g[2];
      const m: Vec3 = [nv[0] * det - g[0] * en, nv[1] * det - g[1] * en, nv[2] * det - g[2] * en];
      const l = dmath.hypot(m[0], m[1], m[2]) || 1;
      normals.set([m[0] / l, m[1] / l, m[2] / l], i);
    }
    const dark = mix(
      [colors[i] ?? 0, colors[i + 1] ?? 0, colors[i + 2] ?? 0],
      C.scaleSeam,
      t * 0.8,
    );
    colors.set(dark, i);
  }
  return { ...membrane, positions, normals, colors };
}
