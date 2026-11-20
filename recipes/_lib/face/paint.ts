// Skin painting per vertex on the warped face — the texture artist's pass done as vertex colour,
// driven by the warped landmarks so every race gets it in the right place: blood-warm zones
// (cheeks, nose tip, ears, lips with a soft vermilion edge), cool eye sockets and jaw underside,
// painted eyebrows as streaked hair bands, a dark mouth interior, curvature (crevices darker,
// ridges lifted) and a low-frequency mottle so the skin never reads as one flat colour.

import { dmath, type Rng, type Vec3, valueNoise } from '@developerz.ai/ts23d';
import type { QuadMesh } from './base.ts';
import type { FaceHead } from './head.ts';
import { LEFT, MIDLINE, mirrorY } from './landmarks.ts';
import { quadNormals } from './quad.ts';
import { segDist } from './relief.ts';
import type { SkinTone } from './spec.ts';

const clamp = (v: number): number => Math.min(1, Math.max(0, v));
const mix = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const d = (a: Vec3, b: Vec3): number => dmath.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
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
          dmath.hypot(
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

/** What life has done to a skin, painted on top of its zones. All dials 0..1. */
export interface SkinWear {
  /** Sun on the skin that faces up and forward: darker, warmer forehead, nose, cheek tops,
   *  shoulders; freckles gather there. */
  readonly sun: number;
  /** Uneven colour: redder and paler blotches. */
  readonly freckles: number;
  /** Dirt in the hollows and on the neck. */
  readonly grime: number;
  /** Shaven-beard shadow: where the beard would grow, its colour, how strong. */
  readonly stubble?: {
    readonly region: (p: Vec3) => number;
    readonly colour: Vec3;
    readonly amount: number;
  };
  /** Healed cuts, as segments in bust space: a pale ridge with a darker rim. */
  readonly scars?: readonly { readonly a: Vec3; readonly b: Vec3; readonly width: number }[];
}

export interface PaintOptions {
  readonly tone: SkinTone;
  readonly brows: Vec3;
  readonly rng: Rng;
  /** Hairline region (≤ 0 where hair grows): the skin under its edge takes the hair colour, so
   *  the hair grows out of a soft line instead of sitting on the skin like a cap. */
  readonly hairline?: (p: Vec3) => number;
  readonly hair?: Vec3;
  /** 0 young … 1 old: darker under the eyes, forehead lines, deeper folds beside the mouth. */
  readonly age?: number;
  readonly wear?: SkinWear;
  /** Seeded marks (moles, warts): a spot of `colour` × the skin under it, radius `r`. */
  readonly marks?: readonly { readonly at: Vec3; readonly r: number; readonly tone: number }[];
  /** The far LOD: the zones only (lips, brows, sockets, flush, beard, hairline). Noise-driven
   *  colour (mottle, blotches, grit, curvature) on a 1 000-triangle face is a patchwork. */
  readonly far?: boolean;
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
  const W = o.wear;
  const age = o.age ?? 0;
  const far = o.far === true;
  const patch = valueNoise(o.rng.fork('patch'), { scale: 0.02 * s, octaves: 2 });
  const grit = valueNoise(o.rng.fork('grit'), { scale: 0.006 * s, octaves: 2 });
  const fh = at(MIDLINE.forehead);
  const lidLine = [LEFT, null].map((side) => {
    const m = (q: Vec3): Vec3 => at(side ? q : mirrorY(q));
    return [m(LEFT.endocanthion), m(LEFT.upperLid), m(LEFT.exocanthion)] as const;
  });
  const LASH: Vec3 = mix(o.brows, [0.05, 0.03, 0.03], 0.6);
  const alar = both(LEFT.alare);
  const SCAR: Vec3 = mix(T.base, [0.92, 0.78, 0.76], 0.6);
  const DIRT: Vec3 = [T.cavity[0] * 0.8, T.cavity[1] * 0.8, T.cavity[2] * 0.75];
  return (v) => {
    const p: Vec3 = [m.p[v * 3] ?? 0, m.p[v * 3 + 1] ?? 0, m.p[v * 3 + 2] ?? 0];
    const nz = n[v * 3 + 2] ?? 0;
    const kv = far ? 0 : (k[v] ?? 0);
    let c: Vec3 = T.base;
    // Blood-warm: cheeks, nose tip, ears.
    const flush =
      Math.max(blob(p, cheek[0], 0.035 * s), blob(p, cheek[1], 0.035 * s)) * 0.55 +
      blob(p, nose, 0.02 * s) * 0.6 +
      Math.max(blob(p, ear[0], 0.045 * s), blob(p, ear[1], 0.045 * s)) * 0.85;
    c = mix(c, T.flush, clamp(flush));
    // Cool: round the eyes, under the jaw.
    const socket = Math.max(blob(p, eye[0], 0.03 * s), blob(p, eye[1], 0.03 * s));
    c = mix(c, T.cool, clamp(socket * 0.55 + clamp(-nz - 0.2) * 0.35));
    // Lips: an ellipse about the mouth, in front of the teeth line.
    const ly = (p[1] - mouth[1]) / (halfW * 1.02);
    const lz = (p[2] - mouth[2]) / (Math.abs(sup[2] - inf[2]) * 0.62 + 0.002 * s);
    const lip =
      clamp((1 - (ly * ly + lz * lz)) * 4) * clamp((p[0] - (sup[0] - 0.012 * s)) / (0.004 * s));
    c = mix(c, T.lips, lip * 0.85);
    // Mouth interior (behind the lips): dark.
    const inside =
      clamp((1 - (ly * ly + lz * lz * 0.6)) * 3) *
      clamp((sup[0] - 0.011 * s - p[0]) / (0.005 * s)) *
      clamp((p[0] - (sup[0] - 0.05 * s)) / (0.005 * s));
    c = mix(c, [0.18, 0.06, 0.06], inside);
    // Eyebrows: a band from the inner brow to the outer, streaked.
    for (let i = 0; i < 2; i++) {
      const a = browIn[i] ?? nose;
      const b = browOut[i] ?? nose;
      const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const L2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2] || 1;
      const t = clamp(((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / L2);
      const q: Vec3 = [
        a[0] + ab[0] * t,
        a[1] + ab[1] * t,
        // (Below the landmarks' chord: they mark the ridge's top, the hair grows on its edge
        // over the orbit; the tail drops toward the temple.)
        a[2] + ab[2] * t - 0.007 * s - 0.003 * s * t,
      ];
      const w = (0.0068 - 0.003 * t) * s * (1 + 0.5 * age);
      // (Distance across the face only: the chord between the two landmarks runs up to a
      // centimetre under the brow's curve, so a 3D distance left the brow's middle bare.)
      const across = dmath.hypot(p[1] - q[1], p[2] - q[2]);
      const band = clamp((1 - across / w) * 2.5) * clamp((p[0] - q[0] + 0.014 * s) / (0.004 * s));
      const hair = 0.8 + 0.2 * streak([p[0] * 0.3, p[1] * 3, p[2] * 0.3]);
      c = mix(c, o.brows, clamp(band * hair * 1.8));
      // The lash line: the upper lid's margin, dark from corner to corner.
      const lid = lidLine[i];
      if (lid) {
        const flat = (q3: Vec3): Vec3 => [p[0], q3[1], q3[2]];
        const dl = Math.min(
          segDist(p, flat(lid[0]), flat(lid[1])),
          segDist(p, flat(lid[1]), flat(lid[2])),
        );
        const near = clamp((p[0] - lid[1][0] + 0.012 * s) / (0.004 * s));
        c = mix(c, LASH, clamp(1.6 - dl / (0.002 * s)) * 0.85 * near);
      }
    }
    // Age: tired skin under the eyes, lines across the forehead, the folds beside the mouth.
    const under = Math.max(
      ...eye.map((e) => blob(p, [e[0] + 0.004 * s, e[1], e[2] - 0.015 * s], 0.017 * s)),
    );
    c = mix(c, mix(T.cool, T.cavity, 0.45), under * (0.12 + 0.5 * age));
    if (age > 0.2) {
      const brow = browIn[0] ?? nose;
      for (const k of [0.3, 0.52, 0.74]) {
        const z = brow[2] + (fh[2] - brow[2]) * k + dmath.sin(p[1] * 60) * 0.0012 * s;
        const line =
          clamp(1 - Math.abs(p[2] - z) / (0.0022 * s)) *
          clamp(1 - Math.abs(p[1]) / (0.05 * s)) *
          clamp((p[0] - (fh[0] - 0.03 * s)) / (0.01 * s));
        c = mix(c, T.cavity, line * 0.42 * age);
      }
      for (let i = 0; i < 2; i++) {
        const a = alar[i] ?? nose;
        const b = corner[i] ?? nose;
        const fold = clamp(
          1 -
            segDist(p, [a[0], a[1] * 1.12, a[2]], [b[0], b[1] * 1.22, b[2] - 0.006 * s]) /
              (0.0045 * s),
        );
        c = mix(c, T.cavity, fold * 0.5 * age);
      }
    }
    if (W) {
      // Sun: the skin that faces the sky and the front goes darker and warmer.
      const sun = clamp(nz * 0.9 + Math.max(0, n[v * 3] ?? 0) * 0.3 - 0.12) * W.sun;
      c = mix(c, [c[0] * 0.8, c[1] * 0.65, c[2] * 0.54], sun * 0.55);
      // Blotches: uneven colour, redder patches and paler ones (soft: a strong one is a stain).
      const pt = far ? 0 : patch(p);
      c = mix(c, pt > 0 ? T.flush : T.cool, Math.abs(pt) * 0.12 * (0.4 + W.freckles));
      if (W.stubble) {
        // (From 4 mm outside the line: the region's own values are only millimetres deep on a
        // jaw, so a ramp starting at the line left a shaven chin clean.)
        const k =
          clamp((0.004 * s - W.stubble.region(p)) / (0.007 * s)) *
          (far ? 0.86 : 0.72 + 0.28 * grit(p));
        c = mix(c, W.stubble.colour, k * W.stubble.amount);
      }
      for (const sc of W.scars ?? []) {
        const dist = segDist(p, sc.a, sc.b);
        c = mix(c, T.cavity, clamp(1 - Math.abs(dist - sc.width * 1.5) / sc.width) * 0.5);
        c = mix(c, SCAR, clamp(1.4 - dist / sc.width));
      }
      // Grime: in the hollows, and a film on the neck and behind the jaw.
      const neck = clamp((at(MIDLINE.menton)[2] - p[2]) / (0.05 * s));
      c = mix(
        c,
        DIRT,
        clamp(clamp(-kv * 2.4) * 0.55 + neck * (far ? 0.3 : 0.2 + 0.25 * grit(p))) * W.grime,
      );
    }
    if (o.hairline && o.hair) {
      const h = o.hairline(p);
      // (Inside the line only, and soft: at the base mesh's vertex spacing a strong tint past the
      // line showed as a brown blotch on the forehead under the fringe.)
      c = mix(c, o.hair, clamp(-h / (0.012 * s)) * 0.7);
    }
    for (const mk of o.marks ?? []) {
      const t = clamp(1.5 - d(p, mk.at) / mk.r);
      c = mix(c, [c[0] * mk.tone, c[1] * mk.tone * 0.86, c[2] * mk.tone * 0.74], t);
    }
    // Curvature: crevices darker toward the cavity colour, ridges lifted.
    c = mix(c, T.cavity, clamp(-kv * 2.2) * 0.6);
    const lift = 1 + clamp(kv * 2) * 0.12;
    const mt = far ? 0 : mottle(p);
    c = mix(c, mt > 0 ? T.flush : T.cool, Math.abs(mt) * 0.18);
    // A little more chroma than the mixes leave: blended zones drift toward grey.
    const grey = (c[0] + c[1] + c[2]) / 3;
    const sat = (x: number): number => clamp((grey + (x - grey) * 1.18) * lift);
    return [sat(c[0]), sat(c[1]), sat(c[2])];
  };
}
