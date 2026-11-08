// Skin painting per vertex on the warped face — the texture artist's pass done as vertex colour,
// driven by the warped landmarks so every race gets it in the right place: blood-warm zones
// (cheeks, nose tip, ears, lips with a soft vermilion edge), cool eye sockets and jaw underside,
// painted eyebrows as streaked hair bands, a dark mouth interior, curvature (crevices darker,
// ridges lifted) and a low-frequency mottle so the skin never reads as one flat colour.

import { type Rng, type Vec3, valueNoise } from '@developerz.ai/ts23d';
import type { QuadMesh } from './base.ts';
import type { FaceHead } from './head.ts';
import { LEFT, MIDLINE, mirrorY } from './landmarks.ts';
import { quadNormals } from './quad.ts';
import type { SkinTone } from './spec.ts';

const clamp = (v: number): number => Math.min(1, Math.max(0, v));
const mix = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const d = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/** Soft blob: 1 at the centre, 0 at radius r. */
const blob = (p: Vec3, c: Vec3, r: number): number => {
  const t = clamp(1 - d(p, c) / r);
  return t * t * (3 - 2 * t);
};

/** Mean-curvature proxy per vertex: + convex, − concave (umbrella Laplacian along the normal). */
export function curvature(m: QuadMesh, n: Float64Array): Float64Array {
  const V = m.p.length / 3;
  const sum = new Float64Array(V * 3);
  const cnt = new Float64Array(V);
  const el = new Float64Array(V);
  for (let f = 0; f < m.q.length; f += 4)
    for (let k = 0; k < 4; k++) {
      const a = m.q[f + k] ?? 0;
      const b = m.q[f + ((k + 1) % 4)] ?? 0;
      for (const [u, v] of [
        [a, b],
        [b, a],
      ] as const) {
        for (let e = 0; e < 3; e++) sum[u * 3 + e] = (sum[u * 3 + e] ?? 0) + (m.p[v * 3 + e] ?? 0);
        cnt[u] = (cnt[u] ?? 0) + 1;
        el[u] =
          (el[u] ?? 0) +
          Math.hypot(
            (m.p[u * 3] ?? 0) - (m.p[v * 3] ?? 0),
            (m.p[u * 3 + 1] ?? 0) - (m.p[v * 3 + 1] ?? 0),
            (m.p[u * 3 + 2] ?? 0) - (m.p[v * 3 + 2] ?? 0),
          );
      }
    }
  const k = new Float64Array(V);
  for (let v = 0; v < V; v++) {
    const c = cnt[v] || 1;
    const h = (el[v] ?? 0) / c || 1;
    let dot = 0;
    for (let e = 0; e < 3; e++)
      dot += ((sum[v * 3 + e] ?? 0) / c - (m.p[v * 3 + e] ?? 0)) * (n[v * 3 + e] ?? 0);
    k[v] = (-dot / (h * h)) * h; // ≈ curvature × edge length: scale-free across LODs
  }
  return k;
}

export interface PaintOptions {
  readonly tone: SkinTone;
  readonly brows: Vec3;
  readonly rng: Rng;
  /** Hairline region (≤ 0 where hair grows): the skin under its edge takes the hair colour, so
   *  the hair grows out of a soft line instead of sitting on the skin like a cap. */
  readonly hairline?: (p: Vec3) => number;
  readonly hair?: Vec3;
}

/** Colour per vertex of the (already warped and scaled) face mesh. */
export function paintSkin(m: QuadMesh, head: FaceHead, o: PaintOptions): (v: number) => Vec3 {
  const n = quadNormals(m);
  const k = curvature(m, n);
  const at = (q: Vec3): Vec3 => head.map(q);
  const both = (q: Vec3): [Vec3, Vec3] => [at(q), at(mirrorY(q))];
  const s = head.scale;
  const cheek = both(LEFT.cheek);
  const ear = both([LEFT.earOut[0] + 0.006, LEFT.earOut[1], LEFT.earOut[2] - 0.008]);
  const eye = both(LEFT.eye);
  const browIn = both(LEFT.brow);
  const browOut = both(LEFT.browOuter);
  const nose = at(MIDLINE.pronasale);
  const sup = at(MIDLINE.labraleSup);
  const inf = at(MIDLINE.labraleInf);
  const corner = both(LEFT.cheilion);
  const mouth = mix(sup, inf, 0.5);
  const halfW = Math.abs(corner[0][1] - corner[1][1]) / 2;
  const mottle = valueNoise(o.rng.fork('mottle'), { scale: 0.04 * s, octaves: 3 });
  const streak = valueNoise(o.rng.fork('brow'), { scale: 0.0025 * s, octaves: 2 });
  const T = o.tone;
  return (v) => {
    const p: Vec3 = [m.p[v * 3] ?? 0, m.p[v * 3 + 1] ?? 0, m.p[v * 3 + 2] ?? 0];
    const nz = n[v * 3 + 2] ?? 0;
    let c: Vec3 = T.base;
    // Blood-warm: cheeks, nose tip, ears.
    const flush =
      Math.max(blob(p, cheek[0], 0.035 * s), blob(p, cheek[1], 0.035 * s)) * 0.55 +
      blob(p, nose, 0.018 * s) * 0.5 +
      Math.max(blob(p, ear[0], 0.04 * s), blob(p, ear[1], 0.04 * s)) * 0.6;
    c = mix(c, T.flush, clamp(flush));
    // Cool: round the eyes, under the jaw.
    const socket = Math.max(blob(p, eye[0], 0.03 * s), blob(p, eye[1], 0.03 * s));
    c = mix(c, T.cool, clamp(socket * 0.45 + clamp(-nz - 0.2) * 0.35));
    // Lips: an ellipse about the mouth, in front of the teeth line.
    const ly = (p[1] - mouth[1]) / (halfW * 1.02);
    const lz = (p[2] - mouth[2]) / (Math.abs(sup[2] - inf[2]) * 0.62 + 0.002 * s);
    const lip =
      clamp((1 - (ly * ly + lz * lz)) * 4) * clamp((p[0] - (sup[0] - 0.012 * s)) / (0.004 * s));
    c = mix(c, T.lips, lip * 0.6);
    // Mouth interior (behind the lips): dark.
    const inside =
      clamp((1 - (ly * ly + lz * lz * 0.6)) * 3) *
      clamp((sup[0] - 0.011 * s - p[0]) / (0.005 * s)) *
      clamp((p[0] - (sup[0] - 0.05 * s)) / (0.005 * s));
    c = mix(c, [0.18, 0.06, 0.06], inside);
    // Eyebrows: a band from the inner brow to the outer, raised ~ 4 mm, streaked.
    for (let i = 0; i < 2; i++) {
      const a = browIn[i] ?? nose;
      const b = browOut[i] ?? nose;
      const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const L2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1;
      const t = clamp(((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / L2);
      const q: Vec3 = [
        a[0] + ab[0] * t,
        a[1] + ab[1] * t,
        a[2] + ab[2] * t + 0.004 * s - 0.002 * s * t,
      ];
      const w = (0.0065 - 0.0025 * t) * s;
      const band = clamp((1 - d(p, q) / w) * 2.5) * clamp((p[0] - q[0] + 0.012 * s) / (0.004 * s));
      const hair = 0.75 + 0.25 * streak([p[0] * 0.3, p[1] * 3, p[2] * 0.3]);
      c = mix(c, o.brows, clamp(band * hair * 1.3));
    }
    if (o.hairline && o.hair) {
      const h = o.hairline(p);
      c = mix(c, o.hair, clamp(1 - (h + 0.004 * s) / (0.01 * s)) * 0.85);
    }
    // Curvature: crevices darker toward the cavity colour, ridges lifted.
    const kv = k[v] ?? 0;
    c = mix(c, T.cavity, clamp(-kv * 2.2) * 0.6);
    const lift = 1 + clamp(kv * 2) * 0.12;
    const mt = mottle(p);
    c = mix(c, mt > 0 ? T.flush : T.cool, Math.abs(mt) * 0.18);
    return [clamp(c[0] * lift), clamp(c[1] * lift), clamp(c[2] * lift)];
  };
}
