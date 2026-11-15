// Stages 2–3 of a skull-stage head, as brush strokes on the warped base (src/primitives
// sculpt-stroke.ts): PLANES — the Asaro plane set pulled flat (forehead front, temple, cheek front
// under the eye, buccal side under the zygoma, jaw side, chin front) so light breaks across the
// head in facets instead of rolling over a soft egg; MUSCLES and bone — the supraorbital ridge, the
// zygomatic arch, masseter, the jaw line, the sternocleidomastoid from the mastoid to the sternum;
// features.ts has stage 4 (the folds and the lips' edges). Left side only (the sculpt mirrors). Depths are shares of the head height
// H, scaled by a race's `Forms` (0 = the soft base, 1 = a game hero's read).

import type { SculptEdit, Vec3 } from '@developerz.ai/ts23d';
import type { SkullLandmarks } from './skull.ts';

/** How strongly each stage reads, 1 = the human hero (0 leaves the base as it is). */
export interface Forms {
  readonly planes: number;
  readonly brow: number;
  readonly cheek: number;
  readonly jaw: number;
  readonly neck: number;
  /** Lid fold, nasolabial and mentolabial creases. */
  readonly lines: number;
  /** Vermilion border and philtrum. */
  readonly lips: number;
}

export const HERO_FORMS: Forms = {
  planes: 1,
  brow: 1,
  cheek: 1,
  jaw: 1,
  neck: 1,
  lines: 1,
  lips: 1,
};

export const add = (a: Vec3, x: number, y: number, z: number): Vec3 => [
  a[0] + x,
  a[1] + y,
  a[2] + z,
];
const mid = (a: Vec3, b: Vec3, t = 0.5): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** The plane set: flatten strokes, each pulling the skin toward a plane through its path. */
export function planeStrokes(k: SkullLandmarks, H: number, f: Forms): SculptEdit[] {
  const d = (x: number): number => x * H * f.planes;
  if (f.planes <= 0) return [];
  const flat = (path: Vec3[], normal: Vec3, radius: number, depth: number): SculptEdit => ({
    stroke: 'flatten',
    path,
    normal,
    radius: radius * H,
    depth: d(depth),
  });
  const browTop = k.brow[2] + 0.06 * H;
  return [
    // Forehead front: the broad plane above the brows, tipped back.
    flat(
      [
        [k.glabella[0] - 0.012 * H, 0.012 * H, browTop],
        [k.browOuter[0] - 0.01 * H, k.browOuter[1] * 0.85, browTop],
      ],
      [1, 0.1, 0.3],
      0.09,
      0.003,
    ),
    // Temple: the side plane behind the outer brow.
    flat(
      [add(k.browOuter, -0.04 * H, 0.012 * H, 0.03 * H), add(k.euryon, 0.12 * H, 0, -0.04 * H)],
      [0.3, 1, 0.1],
      0.05,
      0.005,
    ),
    // Cheek front: the malar plane under the eye, facing forward and out.
    flat(
      [add(k.cheek, 0.004 * H, -0.012 * H, 0.012 * H), add(k.cheek, 0, 0.01 * H, -0.01 * H)],
      [1, 0.55, -0.1],
      0.045,
      0.004,
    ),
    // Buccal side plane below the zygoma: the plane change from cheekbone to jaw.
    flat(
      [mid(k.zygion, k.cheilion, 0.35), mid(k.zygion, k.gonion, 0.45)],
      [0.35, 1, -0.05],
      0.05,
      0.005,
    ),
    // Jaw side plane, gonion to the chin's corner.
    flat(
      [add(k.gonion, 0.02 * H, 0, 0.02 * H), mid(k.gonion, k.pogonion, 0.6)],
      [0.2, 1, -0.3],
      0.05,
      0.005,
    ),
    // Chin front.
    flat(
      [add(k.pogonion, 0, 0.004 * H, 0.008 * H), add(k.pogonion, -0.006 * H, 0.03 * H, 0)],
      [1, 0.15, -0.15],
      0.03,
      0.003,
    ),
  ];
}

/** Bone and muscle: inflate strokes for ridges and bellies, a pinch on the jaw line. */
export function muscleStrokes(k: SkullLandmarks, H: number, f: Forms): SculptEdit[] {
  const out: SculptEdit[] = [];
  const push = (
    stroke: 'inflate' | 'pinch',
    path: Vec3[],
    radius: number | [number, number],
    depth: number,
  ): void => {
    if (depth > 0)
      out.push({
        stroke,
        path,
        radius: typeof radius === 'number' ? radius * H : [radius[0] * H, radius[1] * H],
        depth: depth * H,
      });
  };
  // Supraorbital ridge: glabella out along the brow, fading at the outer end.
  push(
    'inflate',
    [
      add(k.brow, -0.004 * H, -0.05 * H, -0.006 * H),
      add(k.brow, -0.004 * H, 0, -0.004 * H),
      add(k.browOuter, -0.008 * H, -0.004 * H, -0.008 * H),
    ],
    [0.06, 0.04],
    0.006 * f.brow,
  );
  // Zygomatic bone and arch: from the cheek's top back toward the ear.
  push(
    'inflate',
    [
      add(k.cheek, -0.012 * H, 0.004 * H, 0.03 * H),
      add(k.zygion, 0.04 * H, 0, 0.004 * H),
      add(k.zygion, 0.0, -0.004 * H, 0.0),
    ],
    [0.05, 0.035],
    0.0025 * f.cheek,
  );
  // Masseter: zygomatic arch down to the jaw angle.
  push(
    'inflate',
    [add(k.zygion, 0.02 * H, -0.006 * H, -0.05 * H), add(k.gonion, 0.04 * H, 0.002 * H, 0.03 * H)],
    0.045,
    0.006 * f.jaw,
  );
  // Jaw line: a crisp edge from the angle toward the chin.
  push(
    'pinch',
    [
      add(k.gonion, 0.004 * H, 0.002 * H, -0.004 * H),
      mid(k.gonion, k.menton, 0.55),
      add(k.menton, -0.03 * H, 0.03 * H, 0.004 * H),
    ],
    0.03,
    0.0015 * f.jaw,
  );
  // Sternocleidomastoid: mastoid, down and forward to the sternal notch beside the midline.
  push(
    'inflate',
    [
      add(k.mastoid, 0.01 * H, 0.006 * H, -0.02 * H),
      mid(k.mastoid, k.jugular, 0.5),
      add(k.jugular, -0.02 * H, 0.04 * H, 0.03 * H),
    ],
    [0.05, 0.035],
    0.012 * f.neck,
  );
  return out;
}
