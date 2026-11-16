// The head/neck fit of the hybrid: the model's wolf turns and lowers its head (a ¾ photo), so
// one body fit leaves its head 10–20 cm off ours and the 2 cm texture gate rejects it. Here the
// head gets its own similarity from landmarks found on both wolves — nose tip (the head point
// farthest from the torso), ear tips (the two highest front points), eyes (the darkest points
// between ears and nose on each side) — solved onto OUR head frame (nose, ear tips, eyeballs),
// and the neck bends between body and head: each model point takes `w` of the head's move (a
// rotation about the model's atlas), w rising along the neck from its base to the atlas.

import {
  applySimilarity,
  type Mesh,
  type Similarity,
  similarityFit,
  Ts23dError,
  type Vec3,
} from '@developerz.ai/ts23d';

/** One wolf's head landmarks (world, Z up, +X front). */
export interface HeadMarks {
  readonly nose: Vec3;
  readonly earL: Vec3;
  readonly earR: Vec3;
  /** Absent on our LOD2 (no eyeballs there): the fit uses nose and ear tips only. */
  readonly eyeL?: Vec3;
  readonly eyeR?: Vec3;
}

const at = (P: Float32Array, i: number): Vec3 => [
  P[i * 3] ?? 0,
  P[i * 3 + 1] ?? 0,
  P[i * 3 + 2] ?? 0,
];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mid = (a: Vec3, b: Vec3): Vec3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const len = (v: Vec3): number => Math.hypot(v[0], v[1], v[2]);

function lost(what: string): never {
  throw new Ts23dError('T3D_NEURAL_OUTPUT_INVALID', {
    cause: `wolf_hybrid head fit: no ${what} on the model mesh`,
    fix: 're-roll the concept (concept.ts seed) so the wolf stands with its head up and both ears visible',
  });
}

/** Landmarks of the model's wolf (globally fitted onto ours, so +X is roughly its front). */
export function modelMarks(P: Float32Array, C: Float32Array): HeadMarks {
  const n = P.length / 3;
  let top = -1;
  for (let i = 0; i < n; i++)
    if ((P[i * 3] ?? 0) > 0.1 && (top < 0 || (P[i * 3 + 2] ?? 0) > (P[top * 3 + 2] ?? 0))) top = i;
  if (top < 0) lost('front half');
  const e1 = at(P, top);
  // The other ear: the highest front point 6–25 cm (horizontally) from the first.
  let other = -1;
  for (let i = 0; i < n; i++) {
    const p = at(P, i);
    const d = Math.hypot(p[0] - e1[0], p[1] - e1[1]);
    if (p[0] > 0.1 && d > 0.06 && d < 0.25 && (other < 0 || p[2] > (P[other * 3 + 2] ?? 0)))
      other = i;
  }
  if (other < 0) lost('second ear');
  const e2 = at(P, other);
  const em = mid(e1, e2);
  // Nose: within 32 cm of the ears, not far below them, farthest from the torso's centroid.
  const torso: [number, number, number] = [0, 0, 0];
  let tn = 0;
  for (let i = 0; i < n; i++)
    if ((P[i * 3 + 2] ?? 0) > 0.45) {
      for (let a = 0; a < 3; a++) torso[a] = (torso[a] ?? 0) + (P[i * 3 + a] ?? 0);
      tn++;
    }
  if (!tn) lost('torso');
  const tc: Vec3 = [torso[0] / tn, torso[1] / tn, torso[2] / tn];
  let tip = -1;
  let far = 0;
  for (let i = 0; i < n; i++) {
    const p = at(P, i);
    if (len(sub(p, em)) > 0.32 || p[2] < em[2] - 0.25) continue;
    const d = len(sub(p, tc));
    if (d > far) [far, tip] = [d, i];
  }
  if (tip < 0) lost('nose');
  const nose = at(P, tip);
  // Head frame: forward = ears → nose, horizontal; side = +Y-ward of it (the wolf's left).
  const fl = Math.hypot(nose[0] - em[0], nose[1] - em[1]) || 1;
  const f: Vec3 = [(nose[0] - em[0]) / fl, (nose[1] - em[1]) / fl, 0];
  const side = (p: Vec3): number => -(p[0] - em[0]) * f[1] + (p[1] - em[1]) * f[0];
  const fwd = (p: Vec3): number => (p[0] - em[0]) * f[0] + (p[1] - em[1]) * f[1];
  const [earL, earR] = side(e1) > side(e2) ? [e1, e2] : [e2, e1];
  // Eyes: the darkest dozen points per side between ears and nose, above the nose.
  const eye = (sign: number): Vec3 => {
    const cand: { i: number; y: number }[] = [];
    for (let i = 0; i < n; i++) {
      const p = at(P, i);
      const a = fwd(p);
      const b = side(p) * sign;
      if (a < fl * 0.1 || a > fl * 0.65 || b < 0.015 || b > 0.08) continue;
      if (p[2] < nose[2] || p[2] > em[2] - 0.04) continue;
      const y =
        0.2126 * (C[i * 3] ?? 0) + 0.7152 * (C[i * 3 + 1] ?? 0) + 0.0722 * (C[i * 3 + 2] ?? 0);
      cand.push({ i, y });
    }
    if (cand.length < 12) lost(`${sign > 0 ? 'left' : 'right'} eye`);
    cand.sort((a, b) => a.y - b.y || a.i - b.i);
    const c: [number, number, number] = [0, 0, 0];
    for (const { i } of cand.slice(0, 12))
      for (let a = 0; a < 3; a++) c[a] = (c[a] ?? 0) + (P[i * 3 + a] ?? 0) / 12;
    return c;
  };
  return { nose, earL, earR, eyeL: eye(1), eyeR: eye(-1) };
}

/** Our landmarks: the head mesh (world), the eyeball centres and radius. The model's eye is a
 *  surface point, so ours sits on the eyeball's front-lateral face (canid orbits ≈ 25° off the
 *  snout axis). */
export function codeMarks(
  head: Mesh,
  eyes: { readonly l: Vec3; readonly r: Vec3; readonly radius: number } | null,
): HeadMarks {
  const P = head.positions;
  let nose: Vec3 = [-Infinity, 0, 0];
  let earL: Vec3 = [0, 0, -Infinity];
  let earR: Vec3 = [0, 0, -Infinity];
  for (let i = 0; i < P.length / 3; i++) {
    const p = at(P, i);
    if (p[0] > nose[0]) nose = p;
    if (p[1] > 0 && p[2] > earL[2]) earL = p;
    if (p[1] < 0 && p[2] > earR[2]) earR = p;
  }
  const out = (e: Vec3, s: number): Vec3 => [
    e[0] + (eyes?.radius ?? 0) * Math.cos(0.44),
    e[1] + s * (eyes?.radius ?? 0) * Math.sin(0.44),
    e[2],
  ];
  return eyes
    ? { nose, earL, earR, eyeL: out(eyes.l, 1), eyeR: out(eyes.r, -1) }
    : { nose, earL, earR };
}

/** The model head → our head: weighted similarity on the landmarks both carry (nose and eyes
 *  count twice: they place the face; ear tips flop). */
export function headFit(model: HeadMarks, ours: HeadMarks): Similarity {
  const keys = (['nose', 'eyeL', 'eyeR', 'earL', 'earR'] as const).filter(
    (k) => model[k] && ours[k],
  );
  const pick = (m: HeadMarks): Vec3[] => keys.map((k) => m[k] ?? [0, 0, 0]);
  return similarityFit(
    pick(model),
    pick(ours),
    keys.map((k) => (k.startsWith('ear') ? 1 : 2)),
  );
}

/** How much of the head's move a model point takes: 0 at and behind the neck base, 1 at and
 *  past the atlas, smooth along the neck between. */
export function neckWeight(base: Vec3, atlas: Vec3): (p: Vec3) => number {
  const axis = sub(atlas, base);
  const l2 = axis[0] ** 2 + axis[1] ** 2 + axis[2] ** 2 || 1;
  return (p) => {
    const d = sub(p, base);
    return smoothstep(0, 1, (d[0] * axis[0] + d[1] * axis[1] + d[2] * axis[2]) / l2);
  };
}

/** Our atlas in the model's (globally fitted) frame: where its head pivots. */
export function modelAtlas(head: Similarity, atlas: Vec3): Vec3 {
  const inv = invert(head);
  return applySimilarity(inv, atlas);
}

function invert(m: Similarity): Similarity {
  const r = m.r;
  const rt = [0, 3, 6, 1, 4, 7, 2, 5, 8].map((i) => r[i] ?? 0);
  const s = 1 / m.s;
  const q = applySimilarity({ s, r: rt, t: [0, 0, 0] }, m.t);
  return { s, r: rt, t: [-q[0], -q[1], -q[2]] };
}
