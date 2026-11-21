// What a portrait sculptor checks on a head, measured on a bust's built skin field (metres,
// ≤ 0 inside): how far the brow overhangs the orbit, the thickness of the lid's margin, the
// cheekbone over the buccal plane, an ear's cartilage thickness and where its tip sits against the
// eye line and the skull's side, the neck's length against its breadth, the lips' roll over the
// mouth slit. Each is a number with a band in the busts' tests (face-check.test.ts), so a soft
// egg of a face, a paper ear or a pole of a neck fails before anyone has to look.

import type { Field } from '@developerz.ai/ts23d';
import { dmath } from '@developerz.ai/ts23d';
import { add, mul, type V } from './kit.ts';

const STEP = 0.00025;

/** The skin's front (largest x inside) on the line y, z, searched from `from` back to `to`. */
export function frontAt(f: Field, y: number, z: number, from: number, to: number): number {
  for (let x = from; x > to; x -= STEP) if (f([x, y, z]) <= 0) return x;
  return Number.NaN;
}

/** The skin's side (largest y inside) on the line x, z. */
export function sideAt(f: Field, x: number, z: number, from = 0.25): number {
  for (let y = from; y > 0; y -= STEP) if (f([x, y, z]) <= 0) return y;
  return Number.NaN;
}

export interface OrbitMeasure {
  /** Brow's front over the pupil ahead of the cornea's apex, metres. */
  readonly shelf: number;
  /** The brow's front ahead of the deepest skin between it and the upper lid: the orbit's
   *  depth under the brow shelf, metres. */
  readonly depth: number;
  /** Skin thickness over the ball just above the upper lid's margin (the lid's edge), metres. */
  readonly lid: number;
}

/** The orbit over the pupil's column: `eye` centre, ball radius `r`, iris radius `iris`. */
export function measureOrbit(f: Field, eye: V, r: number, iris: number): OrbitMeasure {
  const [ex, ey, ez] = eye;
  const cornea = ex + r;
  const front = (z: number): number => frontAt(f, ey, z, cornea + 0.04, ex - r);
  let brow = Number.NEGATIVE_INFINITY;
  let browZ = ez;
  for (let z = ez + r * 0.9; z < ez + r * 2.6; z += 0.0005) {
    const x = front(z);
    if (x > brow) {
      brow = x;
      browZ = z;
    }
  }
  let pit = brow;
  for (let z = ez + iris; z < browZ; z += 0.0005) pit = Math.min(pit, front(z));
  // The lid's margin: going up the ball's front from the pupil, the first skin over it; its
  // thickness is the most skin found over the ball within 2.5 mm of arc above that edge.
  let lid = 0;
  let edge = Number.NaN;
  for (let a = 0; a < 1.2; a += 0.004) {
    const d: V = [dmath.cos(a), 0, dmath.sin(a)];
    let t = 0;
    while (t < 0.008 && f(add(eye, mul(d, r * 1.035 + t))) <= 0) t += 0.0001;
    if (Number.isNaN(edge) && t > 0.0003) edge = a;
    if (!Number.isNaN(edge) && (a - edge) * r <= 0.0025) lid = Math.max(lid, t + r * 0.035);
  }
  return { shelf: brow - cornea, depth: brow - pit, lid };
}

/** How far the cheekbone stands out past the cheek under it: the head's half-breadth at the
 *  zygion's height less that half-way down to the jaw's angle, 5 % H ahead of the zygion. */
export function measureCheek(f: Field, zygion: V, gonion: V, H: number): number {
  const x = zygion[0] + 0.05 * H;
  return sideAt(f, x, zygion[2]) - sideAt(f, x, (zygion[2] + gonion[2]) / 2);
}

/** The chord of skin through `p` along `n` (unit): the sheet's thickness there, metres (0 when
 *  `p` is outside and no skin lies within 4 mm of it). */
export function thicknessAt(f: Field, p: V, n: V): number {
  let c = p;
  if (f(c) > 0) {
    let best = Number.POSITIVE_INFINITY;
    for (let t = -0.004; t <= 0.004; t += STEP) {
      const q = add(p, mul(n, t));
      const d = f(q);
      if (d < best) {
        best = d;
        c = q;
      }
    }
    if (best > 0) return 0;
  }
  let lo = 0;
  let hi = 0;
  while (hi < 0.03 && f(add(c, mul(n, hi + STEP))) <= 0) hi += STEP;
  while (lo < 0.03 && f(add(c, mul(n, -lo - STEP))) <= 0) lo += STEP;
  return lo + hi;
}

export interface EarMeasure {
  /** Cartilage thickness at 30 %, 60 % and 90 % of the way from root to tip, metres. */
  readonly thick: readonly [number, number, number];
  /** Tip height over the eye line, and its distance out from the skull's side (euryon), × H. */
  readonly tipUp: number;
  readonly tipOut: number;
}

/** An ear along its blade's midline `line` (ear-graft.ts `graftLine`, root → tip, 11 points),
 *  gauged along `normal` (the frame's w, out of the ear's face). */
export function measureEar(
  field: Field,
  line: readonly V[],
  normal: V,
  eyeZ: number,
  euryonY: number,
  H: number,
): EarMeasure {
  const at = (i: number): number => thicknessAt(field, line[i] ?? [0, 0, 0], normal);
  const tip = line[line.length - 1] ?? [0, 0, 0];
  return {
    thick: [at(3), at(6), at(9)],
    tipUp: (tip[2] - eyeZ) / H,
    tipOut: (tip[1] - euryonY) / H,
  };
}

/** The neck's front length (menton down to the jugular notch) over its breadth a third of the
 *  way down from the jaw's angle: 0.7 on a man (85 mm over 120 mm), over 0.8 a pole. */
export function measureNeck(
  f: Field,
  k: { menton: V; jugular: V; gonion: V; throat: V; nape: V },
): { length: number; breadth: number; ratio: number } {
  const z = k.gonion[2] - (k.gonion[2] - k.jugular[2]) / 3;
  const breadth = 2 * sideAt(f, (k.throat[0] + k.nape[0]) / 2, z);
  const length = k.menton[2] - k.jugular[2];
  return { length, breadth, ratio: length / breadth };
}

/** How far the lips roll out over the mouth's slit, metres: the mean front of the upper and the
 *  lower lip (`rise` above and below the slit) ahead of the slit's own front, at half-breadth y. */
export function measureLips(f: Field, stomion: V, y: number, rise: number): number {
  const front = (z: number): number => frontAt(f, y, z, stomion[0] + 0.03, stomion[0] - 0.04);
  return (front(stomion[2] + rise) + front(stomion[2] - rise)) / 2 - front(stomion[2]);
}
