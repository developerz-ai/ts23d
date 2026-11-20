// Secondary and tertiary forms the landmark warp is too smooth to carry (a thin-plate spline moves
// a brow, it cannot fold one): strokes along the warped landmarks that push the base mesh's
// vertices along their normals. Grooves for the folds beside the mouth, the forehead's lines and
// the crow's feet (deeper with age), a brow shelf where the race's brow comes forward (an orc's
// overhang, a dwarf's heavy ridge), seeded warts, and a healed cut's furrow. Strokes narrower
// than the mesh at hand can hold are dropped (`relieve`'s `min`), so the coarser LODs keep the
// shelf and lose the lines. Also where the few seeded marks sit that the painter colours (warts,
// moles).

import type { Rng, Vec3 } from '@developerz.ai/ts23d';
import { dmath } from '@developerz.ai/ts23d';
import type { QuadMesh } from './base.ts';
import type { FaceHead } from './head.ts';
import { LEFT, MIDLINE, mirrorY } from './landmarks.ts';
import { quadNormals } from './quad.ts';
import type { Character } from './spec.ts';

/** A capsule a → b of radius `r`: vertices inside move `h` metres along their normal at its axis
 *  (+ out, − in), falling smoothly to 0 at `r`. */
export interface Stroke {
  readonly a: Vec3;
  readonly b: Vec3;
  readonly r: number;
  readonly h: number;
}

const clamp = (v: number): number => Math.min(1, Math.max(0, v));

/** Distance from p to the segment ab (the one copy: paint, hair and hair-cards use it too). */
export function segDist(p: Vec3, a: Vec3, b: Vec3): number {
  const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const l2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2] || 1;
  const t = clamp(((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / l2);
  return dmath.hypot(p[0] - a[0] - ab[0] * t, p[1] - a[1] - ab[1] * t, p[2] - a[2] - ab[2] * t);
}

/** `m` with every stroke of radius ≥ `min` applied (a new mesh; topology kept). */
export function relieve(m: QuadMesh, strokes: readonly Stroke[], min = 0): QuadMesh {
  const use = strokes.filter((s) => s.r >= min);
  if (use.length === 0) return m;
  const n = quadNormals(m);
  const p = new Float64Array(m.p);
  for (let v = 0; v < p.length; v += 3) {
    const q: Vec3 = [m.p[v] ?? 0, m.p[v + 1] ?? 0, m.p[v + 2] ?? 0];
    let d = 0;
    for (const s of use) {
      const t = clamp(1 - segDist(q, s.a, s.b) / s.r);
      if (t > 0) d += s.h * t * t * (3 - 2 * t);
    }
    if (d === 0) continue;
    for (let e = 0; e < 3; e++) p[v + e] = (m.p[v + e] ?? 0) + (n[v + e] ?? 0) * d;
  }
  return { p, q: m.q };
}

/** Where a character's warts sit (bust space) and how big: seeded, on the vault, nose and cheeks. */
export function wartsOf(head: FaceHead, count: number, rng: Rng): { at: Vec3; r: number }[] {
  const s = head.scale;
  const spots: Vec3[] = [
    [MIDLINE.forehead[0] - 0.004, 0.022, MIDLINE.forehead[2] + 0.008],
    [MIDLINE.rhinion[0], -0.006, MIDLINE.rhinion[2] - 0.004],
    [LEFT.cheek[0] - 0.006, LEFT.cheek[1] + 0.008, LEFT.cheek[2] - 0.012],
    [LEFT.cheek[0] - 0.004, -LEFT.cheek[1] - 0.004, LEFT.cheek[2] + 0.004],
    [MIDLINE.forehead[0] - 0.012, -0.03, MIDLINE.forehead[2] + 0.016],
    [MIDLINE.pogonion[0] - 0.006, 0.014, MIDLINE.pogonion[2] + 0.004],
    [LEFT.alare[0], LEFT.alare[1] + 0.004, LEFT.alare[2] + 0.004],
    [LEFT.frontotemporale[0], -LEFT.frontotemporale[1], LEFT.frontotemporale[2] - 0.006],
  ];
  return spots.slice(0, count).map((q) => ({
    at: head.map([q[0], q[1] + rng.range(-0.004, 0.004), q[2] + rng.range(-0.004, 0.004)]),
    r: rng.range(0.0032, 0.0048) * s,
  }));
}

/** A few seeded moles (3–5: a rash of them reads as a skin disease): on a cheek, the jaw, the
 *  neck, a temple, beside the mouth. */
export function molesOf(head: FaceHead, count: number, rng: Rng): { at: Vec3; r: number }[] {
  const s = head.scale;
  const spots: Vec3[] = [
    [LEFT.cheek[0] - 0.008, LEFT.cheek[1] + 0.012, LEFT.cheek[2] - 0.02],
    [LEFT.jawline[0] + 0.03, -LEFT.jawline[1] - 0.012, LEFT.jawline[2] + 0.022],
    [MIDLINE.throat[0] - 0.004, 0.024, MIDLINE.throat[2] + 0.004],
    [
      LEFT.frontotemporale[0] + 0.008,
      LEFT.frontotemporale[1] - 0.012,
      LEFT.frontotemporale[2] - 0.016,
    ],
    [LEFT.cheilion[0] - 0.002, -LEFT.cheilion[1] - 0.012, LEFT.cheilion[2] + 0.012],
  ];
  return spots.slice(0, count).map((q) => ({
    at: head.map([q[0], q[1] + rng.range(-0.005, 0.005), q[2] + rng.range(-0.005, 0.005)]),
    r: rng.range(0.0017, 0.0026) * s,
  }));
}

/** The strokes of one character (bust space): age folds, brow shelf, warts, scar furrows. */
export function characterStrokes(head: FaceHead, c: Character, rng: Rng): Stroke[] {
  const s = head.scale;
  const at = (q: Vec3): Vec3 => head.map(q);
  const out: Stroke[] = [];
  // Every adult face has the folds; age deepens them.
  const age = 0.35 + 0.65 * c.age;
  for (const side of [1, -1]) {
    const m = (q: Vec3): Vec3 => at(side > 0 ? q : mirrorY(q));
    const alar = m(LEFT.alare);
    const corner = m(LEFT.cheilion);
    // Nasolabial fold: from beside the nose wing to outside and below the mouth corner.
    out.push({
      a: [alar[0], alar[1] * 1.14, alar[2] + 0.002 * s],
      b: [corner[0], corner[1] * 1.24, corner[2] - 0.007 * s],
      r: 0.0055 * s,
      h: -0.0021 * s * age,
    });
    // Crow's feet: three short lines fanning back from the outer corner of the eye.
    const ex = m(LEFT.exocanthion);
    const zy = m(LEFT.zygion);
    for (const dz of [0.008, 0, -0.009]) {
      const k = 0.42;
      out.push({
        a: [ex[0] - 0.003 * s, ex[1] + side * 0.004 * s, ex[2] + dz * 0.3 * s],
        b: [
          ex[0] + (zy[0] - ex[0]) * k,
          ex[1] + (zy[1] - ex[1]) * k,
          ex[2] + (zy[2] - ex[2]) * k + dz * s,
        ],
        r: 0.0026 * s,
        h: -0.0009 * s * c.age,
      });
    }
    // The bag under the eye, and the groove below it.
    const lid = m(LEFT.lowerLid);
    const orb = m(LEFT.orbitale);
    const en = m(LEFT.endocanthion);
    out.push({
      a: [en[0] - 0.001 * s, en[1], orb[2] - 0.001 * s],
      b: [ex[0] - 0.004 * s, ex[1], (orb[2] + lid[2]) / 2 - 0.004 * s],
      r: 0.004 * s,
      h: -0.0013 * s * c.age,
    });
    // Brow shelf: a ridge along the brow, a hollow under it (the eye sits back in its shadow).
    const shelf = c.race.brow.forward;
    if (shelf > 0.02) {
      const bi = m(LEFT.brow);
      const bo = m(LEFT.browOuter);
      const mid: Vec3 = [bi[0] + 0.004 * s, bi[1] * 0.35, bi[2] - 0.002 * s];
      // (Centred above the brow line, so it fades out at the lid: the lids stay on the eye.)
      const up = 0.007 * s;
      out.push(
        {
          a: [mid[0], mid[1], mid[2] + up],
          b: [bi[0], bi[1], bi[2] + up],
          r: 0.015 * s,
          h: shelf * 0.04 * s,
        },
        {
          a: [bi[0], bi[1], bi[2] + up],
          b: [bo[0], bo[1], bo[2] + up * 0.6],
          r: 0.014 * s,
          h: shelf * 0.034 * s,
        },
      );
    }
  }
  // Forehead lines (worry lines), from 30: three shallow furrows across the brow.
  if (c.age > 0.2) {
    const brow = at(LEFT.brow);
    const fh = at(MIDLINE.forehead);
    for (const k of [0.34, 0.56, 0.78]) {
      const z = brow[2] + (fh[2] - brow[2]) * k;
      const x = brow[0] + (fh[0] - brow[0]) * k;
      const w = (0.04 - 0.008 * k) * s;
      out.push({ a: [x, -w, z], b: [x, w, z + 0.0015 * s], r: 0.003 * s, h: -0.001 * s * c.age });
    }
  }
  for (const w of wartsOf(head, c.warts ?? 0, rng))
    out.push({ a: w.at, b: w.at, r: w.r, h: w.r * 0.45 });
  // A healed cut is a shallow furrow.
  for (const line of c.wear?.scars ?? [])
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1];
      const b = line[i];
      if (a && b) out.push({ a: at(a), b: at(b), r: 0.0034 * s, h: -0.0009 * s });
    }
  return out;
}
