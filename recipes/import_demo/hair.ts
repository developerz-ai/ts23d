// The scan's cropped hair, finished in code: the scanner recorded short hair as a near-black
// wash over the skull, which under the skin's sheen rendered as a plain grey scalp. Above the
// scan's own hairline the head is repainted as a hair mass — a warm dark brown combed back in
// streaks (noise stretched along the comb), lighter where the crown faces the sky, a soft
// wandering hairline where skin shows between the first hairs — and goes onto the matte skin
// strip as a part of its own with no sheen finish (the skin's grey sheen washed a dark crop to a
// pale cap); it batches with the cloth, so it costs no draw.

import { type Mesh, type Rng, type Vec3, valueNoise } from '@developerz.ai/ts23d';
import { fromBust, hairlineZ } from './scan-head.ts';

const clamp = (v: number): number => Math.min(1, Math.max(0, v));
const mix = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

const ROOT: Vec3 = [0.022, 0.014, 0.009];
const MID: Vec3 = [0.11, 0.068, 0.036];
const SUN: Vec3 = [0.26, 0.16, 0.08];

/** How far inside the hair a bust-space point is, metres (> 0 hair, ≤ 0 skin). */
export const hairDepth = (p: Vec3): number => {
  const q = fromBust(p);
  return q[2] - hairlineZ(q);
};

/** The hair mask for the strip split (1 on the hair, past the hairline's soft edge). */
export const hairMask = (p: Vec3): number => (hairDepth(p) > 0.004 ? 1 : 0);

/** `head` with its hair repainted as a hair mass (positions, normals, UVs kept). */
export function paintHair(head: Mesh, rng: Rng): Mesh {
  const streak = valueNoise(rng.fork('streak'), { scale: 0.01, octaves: 2 });
  const edge = valueNoise(rng.fork('edge'), { scale: 0.006, octaves: 1 });
  const P = head.positions;
  const N = head.normals;
  const colors = new Float32Array(head.colors);
  for (let v = 0; v < P.length / 3; v++) {
    const p: Vec3 = [P[v * 3] ?? 0, P[v * 3 + 1] ?? 0, P[v * 3 + 2] ?? 0];
    const h = hairDepth(p) + 0.002 * edge(p);
    if (h < -0.002) continue;
    // Combed back over the top and down the sides: streaks long along x, narrow across y.
    const s = streak([p[0] * 0.15, p[1] * 2, p[2] * 0.45]);
    let c = mix(ROOT, MID, clamp(0.5 + 1.1 * s));
    c = mix(c, SUN, clamp(((N[v * 3 + 2] ?? 0) - 0.35) * 1.5) * clamp(0.5 + 1.2 * s) * 0.7);
    // Thin at the hairline: the skin shows between the first hairs over 8 mm.
    const k = clamp((h + 0.002) / 0.008);
    const skin: Vec3 = [colors[v * 3] ?? 0, colors[v * 3 + 1] ?? 0, colors[v * 3 + 2] ?? 0];
    const out = mix(skin, c, k * 0.95);
    colors[v * 3] = out[0];
    colors[v * 3 + 1] = out[1];
    colors[v * 3 + 2] = out[2];
  }
  return { ...head, colors };
}

/** `head` split into its skin and its hair: the triangles whose centre `hairMask` takes. */
export function splitHair(head: Mesh): { readonly skin: Mesh; readonly hair: Mesh } {
  const P = head.positions;
  const I = head.indices;
  const skin: number[] = [];
  const hair: number[] = [];
  for (let t = 0; t < I.length; t += 3) {
    const c = [0, 0, 0];
    for (let k = 0; k < 3; k++)
      for (let e = 0; e < 3; e++) c[e] = (c[e] ?? 0) + (P[(I[t + k] ?? 0) * 3 + e] ?? 0) / 3;
    (hairMask([c[0] ?? 0, c[1] ?? 0, c[2] ?? 0]) > 0.5 ? hair : skin).push(
      I[t] ?? 0,
      I[t + 1] ?? 0,
      I[t + 2] ?? 0,
    );
  }
  return {
    skin: { ...head, indices: new Uint32Array(skin) },
    hair: { ...head, indices: new Uint32Array(hair) },
  };
}
