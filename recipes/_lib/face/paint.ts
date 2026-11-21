// Skin painting per vertex on the warped face — the texture artist's pass done as vertex colour,
// driven by the warped landmarks so every race gets it in the right place: blood-warm zones
// (cheeks, nose tip, ears, lips with a soft vermilion edge), cool eye sockets and jaw underside,
// painted eyebrows as streaked hair bands, a dark mouth interior, curvature (crevices darker,
// ridges lifted) and a low-frequency mottle so the skin never reads as one flat colour.

import { dmath, type Vec3, valueNoise } from '@developerz.ai/ts23d';
import type { QuadMesh } from './base.ts';
import { curvature } from './curvature.ts';
import type { FaceHead } from './head.ts';
import { LEFT, MIDLINE, mirrorY } from './landmarks.ts';
import type { PaintOptions } from './paint-types.ts';
import { quadNormals } from './quad.ts';
import { segDist } from './relief.ts';
import { thinness } from './thinness.ts';

export type { PaintOptions, SkinWear } from './paint-types.ts';

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
/** Soft falloff of a distance: 1 at 0, 0 at r, with no visible rim (smoothstep squared). */
const soft = (dist: number, r: number): number => {
  const t = clamp(1 - dist / r);
  const e = t * t * (3 - 2 * t);
  return e * e;
};

/** `c` shifted along the two axes skin colour varies on: t > 0 toward blood (rose, less green
 *  and blue), t < 0 toward melanin (gold, less blue). A relative shift, so any tone keeps its
 *  hue family (a green orc's mottle stays green). */
const hue = (c: Vec3, t: number): Vec3 =>
  t > 0 ? [c[0], c[1] * 0.9, c[2] * 0.9] : [c[0], c[1] * 0.97, c[2] * 0.84];

/** Colour per vertex of the (already warped and scaled) face mesh. */
export function paintSkin(m: QuadMesh, head: FaceHead, o: PaintOptions): (v: number) => Vec3 {
  const n = quadNormals(m);
  const k = curvature(m, n);
  const at = (q: Vec3): Vec3 => head.map(q);
  const both = (q: Vec3): [Vec3, Vec3] => [at(q), at(mirrorY(q))];
  const s = head.scale;
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
  // The lashes' margin: a warm near-black from the skin's own crevice tone (mixed from golden
  // brows it was olive, and read as eye shadow on a fair elf, D521).
  const LASH: Vec3 = mix(T.cavity, [0.04, 0.025, 0.02], 0.6);
  // Blood under thin skin: the flush a step redder than the tone's own; the sockets cool and a
  // step darker; the lips deeper than their tone (the hero's sky washes out a near-skin red).
  const FLUSH: Vec3 = [T.flush[0], T.flush[1] * 0.86, T.flush[2] * 0.84];
  const SOCKET: Vec3 = mix(T.cool, T.cavity, 0.3);
  const LIPS: Vec3 = [T.lips[0] * 0.95, T.lips[1] * 0.82, T.lips[2] * 0.84];
  const browZ = (at(LEFT.brow)[2] + at(MIDLINE.glabella)[2]) / 2;
  const alar = both(LEFT.alare);
  // The flush's path each side: the cheekbone's front, the cheek's apple, beside the nose's wing.
  const flushPath = [LEFT, null].map((side) => {
    const m = (q: Vec3): Vec3 => at(side ? q : mirrorY(q));
    const bone = mix(LEFT.cheek, LEFT.zygion, 0.25);
    const wing: Vec3 = [LEFT.alare[0] - 0.004, LEFT.alare[1] + 0.008, LEFT.alare[2] + 0.002];
    return [m([bone[0], bone[1], bone[2] + 0.004]), m(LEFT.cheek), m(wing)] as const;
  });
  // Scar tissue: paler and less saturated than the skin round it, relative to the skin's own
  // value (a fixed near-white read as a wet specular hot spot on green or dark skin).
  const lum = (T.base[0] + T.base[1] + T.base[2]) / 3;
  const SCAR: Vec3 = mix(
    [T.base[0] * 1.15, T.base[1] * 1.15, T.base[2] * 1.15],
    [lum * 1.45, lum * 1.25, lum * 1.2],
    0.55,
  );
  const DIRT: Vec3 = [T.cavity[0] * 0.8, T.cavity[1] * 0.8, T.cavity[2] * 0.75];
  // Light through thin skin (ear rims, the helix, an elf's long tip): red-orange (D522).
  const thin = far ? undefined : thinness(m, n, 0.006 * s);
  const trag = at(LEFT.tragion);
  const THROUGH: Vec3 = [T.flush[0] * 1.1, T.flush[1] * 0.62, T.flush[2] * 0.45];
  return (v) => {
    const p: Vec3 = [m.p[v * 3] ?? 0, m.p[v * 3 + 1] ?? 0, m.p[v * 3 + 2] ?? 0];
    const nz = n[v * 3 + 2] ?? 0;
    const kv = far ? 0 : (k[v] ?? 0);
    let c: Vec3 = T.base;
    // The portrait painter's three bands, broad enough to read at hero distance: the forehead
    // lightest and yellowest, the middle third (cheeks, nose, ears) blood-warm, the lower third
    // (jaw, chin, under the jaw) cooler, the sockets cool and dark.
    c = mix(c, [c[0] * 1.04, c[1] * 1.03, c[2] * 0.94], clamp((p[2] - browZ) / (0.03 * s)) * 0.5);
    // (The cheeks' flush follows the cheekbone down to the nose's wing, broad and faint: a round
    // blob on the cheek apple read as painted-on rouge circles in the front view.)
    let band = 0;
    let near = Number.POSITIVE_INFINITY;
    for (const f of flushPath) {
      const dist = Math.min(segDist(p, f[0], f[1]), segDist(p, f[1], f[2]));
      near = Math.min(near, dist);
      band = Math.max(band, soft(dist, 0.034 * s) * 0.22 + soft(dist, 0.06 * s) * 0.12);
    }
    const flush =
      band +
      blob(p, nose, 0.03 * s) * 0.4 +
      // (The ears' own redness stays on the ear: at 4.5 cm it spilt onto the cheek's side as a
      // pink disc in the front view.)
      Math.max(blob(p, ear[0], 0.032 * s), blob(p, ear[1], 0.032 * s));
    c = mix(c, FLUSH, clamp(flush));
    const jaw = clamp((mouth[2] + 0.004 * s - p[2]) / (0.025 * s));
    // (A step cooler, not mauve: at 0.4 the neck under the jaw read as a grey-violet wash.)
    c = mix(c, mix(T.cool, T.base, 0.4), jaw * 0.25);
    // Cool and dark: round the eyes, under the jaw.
    const socket = Math.max(blob(p, eye[0], 0.032 * s), blob(p, eye[1], 0.032 * s));
    c = mix(c, SOCKET, clamp(socket * 0.62 + clamp(-nz - 0.2) * 0.35));
    // Lips: an ellipse about the mouth, in front of the teeth line.
    const ly = (p[1] - mouth[1]) / (halfW * 1.02);
    const lz = (p[2] - mouth[2]) / (Math.abs(sup[2] - inf[2]) * 0.62 + 0.002 * s);
    const lip =
      clamp((1 - (ly * ly + lz * lz)) * 4) * clamp((p[0] - (sup[0] - 0.012 * s)) / (0.004 * s));
    c = mix(c, LIPS, lip * 0.95);
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
      // (Off the upper lid: the band reached to its margin and the hero showed it as a stripe
      // of brown eye shadow above the eye, D521.)
      const lidTop = (lidLine[i]?.[1][2] ?? q[2]) + 0.003 * s;
      const band =
        clamp((1 - across / w) * 2.5) *
        clamp((p[0] - q[0] + 0.014 * s) / (0.004 * s)) *
        clamp((p[2] - lidTop) / (0.003 * s));
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
        // The lid's fold above it a soft shade of the socket (the renderer shades the crease
        // itself), then the lash line: a dark margin wide enough to read at hero distance (2 mm
        // vanished between vertices). (Toward the cavity at 0.45, and a lash line 5 mm deep,
        // the upper lid read as a band of brown eye shadow, D521.)
        const up = p[2] - (lid[1][2] + 0.0045 * s);
        const fold = clamp(1 - dmath.hypot(dl * 0.8, up) / (0.006 * s));
        c = mix(c, mix(SOCKET, T.cavity, 0.2), fold * 0.22 * near);
        c = mix(c, LASH, clamp(1.4 - dl / (0.0024 * s)) * near);
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
      // Weathered: raw redness broad over the cheekbones and down the nose (wide and soft,
      // so it reads as weather, not make-up), broken by the blotch noise.
      const wind = W.wind ?? 0;
      if (wind > 0) {
        const raw = soft(near, 0.08 * s) * 0.4 + blob(p, nose, 0.04 * s) * 0.45;
        c = mix(c, [FLUSH[0] * 1.02, FLUSH[1] * 0.8, FLUSH[2] * 0.78], clamp(raw * wind));
      }
      // Blotches: uneven colour along blood and melanin, never toward grey (soft: a strong one
      // is a stain).
      const pt = far ? 0 : patch(p);
      c = mix(c, hue(c, pt), Math.min(1, Math.abs(pt) * 0.8 * (0.4 + W.freckles)));
      if (W.stubble) {
        // (From 4 mm outside the line: the region's own values are only millimetres deep on a
        // jaw, so a ramp starting at the line left a shaven chin clean.)
        // An even shadow: the cut hairs are the stubble strip's dots (skin-texture.ts). (Dots
        // of vertex colour 2 mm across on a 3 mm mesh read as a grey worm pattern, D514.)
        // (A shaven beard's wash is faint and feathered: at 0.7 over 9 mm it read as a tan
        // under-wash with a hard top edge across the cheek, D523.)
        // The far LOD has no strip to draw the hairs: its wash carries them as before.
        const ramp = (far ? 0.009 : (W.stubble.feather ?? 0.009)) * s;
        const k =
          clamp((0.004 * s - W.stubble.region(p)) / ramp) * (far ? 0.86 : (W.stubble.wash ?? 0.7));
        c = mix(c, W.stubble.colour, k * W.stubble.amount);
      }
      for (const sc of W.scars ?? []) {
        const dist = segDist(p, sc.a, sc.b);
        c = mix(c, T.cavity, clamp(1 - Math.abs(dist - sc.width * 1.5) / sc.width) * 0.65);
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
    // Thin ear skin, behind the cheek's front: the blood-warm glow of light through it.
    const side = clamp((Math.abs(p[1]) - Math.abs(trag[1]) + 0.006 * s) / (0.004 * s));
    if (thin && side > 0 && p[0] < trag[0] + 0.012 * s)
      c = mix(c, THROUGH, clamp((thin[v] ?? 0) * 1.3) * 0.55 * side);
    // Curvature: crevices darker toward the cavity colour, ridges lifted.
    c = mix(c, T.cavity, clamp(-kv * 2.2) * 0.6);
    const lift = 1 + clamp(kv * 2) * 0.12;
    // Mottle along blood (rose) and melanin (gold): the old flush/cool mix greyed a face in
    // blotches (D512).
    const mt = far ? 0 : mottle(p);
    c = mix(c, hue(c, mt), Math.min(1, Math.abs(mt) * 1.1));
    // A little more chroma than the mixes leave: blended zones drift toward grey.
    const grey = (c[0] + c[1] + c[2]) / 3;
    const sat = (x: number): number => clamp((grey + (x - grey) * 1.18) * lift);
    return [sat(c[0]), sat(c[1]), sat(c[2])];
  };
}
