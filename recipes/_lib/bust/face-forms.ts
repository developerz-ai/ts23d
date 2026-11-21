// The bony structure of a skull-stage bust's face, sculpted over the warped base (which is soft:
// puffy lids flush with the brow, no orbit, a cheek that rolls into the jaw). One table per race
// (`Structure`) sets, in head heights: the ORBIT, a bowl carved round the eyeball so the brow
// overhangs it; the LIDS, shells of real thickness wrapping the ball with an almond aperture
// through the canthi; the BROW SHELF over the orbit, the lateral orbital rim turned back to the
// temple; the CHEEKBONE as a ridge with the buccal plane dropped under it. face-check.ts measures
// each of them on the built skin. Left side; the sculpt mirrors. The far LOD's mouth and brows are
// ink on its mesh (`farInk`, D615).

import { dmath, type SculptEdit } from '@developerz.ai/ts23d';
import type { EyeSpec } from './eye.ts';
import { orbitBore } from './face.ts';
import { clayOn, ell, type Surface, type V } from './kit.ts';

/** The landmarks the structure is built from (a skull's, recipes/_lib/face/skull.ts). */
export interface FacePoints {
  readonly glabella: V;
  readonly brow: V;
  readonly browOuter: V;
  readonly endocanthion: V;
  readonly exocanthion: V;
  readonly cheek: V;
  readonly zygion: V;
  readonly gonion: V;
  readonly cheilion: V;
}

/** How strongly each form reads, × the head height H (0 leaves the base as it is). */
export interface Structure {
  /** Brow shelf: clay stood on the supraorbital rim. */
  readonly brow: number;
  /** Orbit bowl: its softness (× the eyeball radius; 0.3 bony … 0.6 soft and young). */
  readonly orbit: number;
  /** How deep the bowl is cut, 1 = a man's (0.5: a shallow, young orbit). */
  readonly depth: number;
  /** The lateral orbital rim turned back: how far behind the cornea the face's side plane
   *  starts beside the outer canthus. */
  readonly rim: number;
  /** Cheekbone ridge height, and the depth of the buccal plane under it. */
  readonly cheek: number;
  readonly hollow: number;
  /** Lash line colour along the upper lid's margin. */
  readonly lash: V;
  /** Lid skin colour (the socket's shade). */
  readonly lid: V;
}

/** A circle (centre y, z and radius) through three points of the eye's frontal plane. */
function circle(a: [number, number], b: [number, number], c: [number, number]): V {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  const a2 = a[0] * a[0] + a[1] * a[1];
  const b2 = b[0] * b[0] + b[1] * b[1];
  const c2 = c[0] * c[0] + c[1] * c[1];
  const y = (a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d;
  const z = (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d;
  return [y, z, dmath.hypot(a[0] - y, a[1] - z)];
}

/** The lid margins at the pupil's column: metres above (upper) and below (lower) the centre. */
export function lidEdges(e: EyeSpec): { up: number; lo: number } {
  return { up: e.iris * (1 - 2 * e.upper), lo: e.iris * (1 - 2 * e.lower) };
}

/**
 * The palpebral aperture in the eye's frontal plane (≤ 0 inside): an almond between two arcs
 * through the canthi, the upper through the upper lid's margin over the pupil, the lower through
 * the lower lid's. Its tilt is the canthi's.
 */
export function aperture(k: FacePoints, e: EyeSpec): (y: number, z: number) => number {
  const [, ey, ez] = e.centre;
  const { up, lo } = lidEdges(e);
  const en: [number, number] = [k.endocanthion[1], k.endocanthion[2]];
  const exo: [number, number] = [k.exocanthion[1], k.exocanthion[2]];
  // The apex of each arc: over the pupil, on the canthal line's own slope.
  const mz = (en[1] + exo[1]) / 2 - ez;
  const U = circle(en, [ey, ez + up + mz * 0.5], exo);
  const D = circle(en, [ey, ez - lo + mz * 0.5], exo);
  return (y, z) =>
    Math.max(dmath.hypot(y - U[0], z - U[1]) - U[2], dmath.hypot(y - D[0], z - D[1]) - D[2]);
}

const box = (c: V, r: number): [V, V] => [
  [c[0] - r, c[1] - r, c[2] - r],
  [c[0] + r, c[1] + r, c[2] + r],
];

/** The orbit and the lids: bowl, lid shells, the aperture, the ball's seat, the lash line. */
export function orbitEdits(k: FacePoints, e: EyeSpec, s: Structure): SculptEdit[] {
  const [ex, ey, ez] = e.centre;
  const R = e.r;
  const rl = R + e.lid;
  const gap = aperture(k, e);
  const ball = (p: V): number => dmath.hypot(p[0] - ex, p[1] - ey, p[2] - ez);
  const around = box(e.centre, rl + 0.006);
  return [
    // The bowl: the puffy base skin in front of the ball taken back to the lids' own surface, so
    // the brow above, the nose's side and the cheek below stand round the eye.
    // (Its inner end stops 1.2 radii from the centre: nearer the midline the two bowls pinch the
    // nose's root into a ridge.)
    ell(
      [ex + R * (1.92 - 0.3 * s.depth), ey + R * 0.1, ez + R * 0.3],
      [R * 0.7, R * 1.3, R * 1.05],
      {
        op: 'subtract',
        blend: R * s.orbit,
      },
    ),
    // The lids: the ball's own curve, a lid's thickness proud of it, in front of its equator.
    {
      group: [
        { shape: 'sphere', at: e.centre, size: rl },
        { field: (p) => ex + R * 0.2 - p[0], bounds: around, op: 'intersect', blend: e.lid },
      ],
      blend: e.lid * 1.6,
      color: s.lid,
    },
    // The aperture: cut square through the lids, so their margins show their thickness.
    {
      field: (p) => Math.max(gap(p[1], p[2]), ball(p) - rl - e.lid * 0.3, ex + R * 0.3 - p[0]),
      bounds: around,
      op: 'subtract',
      blend: e.lid * 0.12,
    },
    // The lash line: the upper margin, darker.
    {
      field: (p) =>
        Math.max(
          Math.abs(gap(p[1], p[2])) - e.lid * 0.5,
          ez - p[2],
          Math.abs(ball(p) - rl) - e.lid,
        ),
      bounds: around,
      op: 'paint',
      blend: e.lid * 0.3,
      color: s.lash,
    },
    // The ball's seat again (the lids were solid): room for the ball, and the bore behind it.
    { shape: 'sphere', at: e.centre, size: R * 1.03, op: 'subtract', blend: R * 0.05 },
    orbitBore({ eye: e.centre, eyeR: R }),
  ];
}

/** The brow shelf, the lateral orbital rim and the cheekbone with its buccal plane. */
export function boneEdits(
  k: FacePoints,
  e: EyeSpec,
  H: number,
  skin: Surface,
  s: Structure,
): SculptEdit[] {
  const [ex, ey, ez] = e.centre;
  const R = e.r;
  const out: SculptEdit[] = [];
  // The side plane of the face starts at the lateral orbital rim: a plane through it, turned 50°
  // from the front, takes the outer brow and the cheek's corner back toward the temple. It
  // fades out above the brow and under the cheekbone (a quadratic ramp: no crease).
  if (s.rim > 0) {
    const at: V = [ex + R - s.rim * H, Math.abs(k.exocanthion[1]) + R * 0.3, ez];
    const n: V = [0.64, 0.77, 0];
    const lo = ez - R * 1.4;
    const hi = k.browOuter[2] + R * 0.5;
    const w = 0.05 * H;
    // (Behind the orbit too: the plane is the face's, never the ears'.)
    const x0 = ex - R * 1.5;
    const fade = (x: number, z: number): number => {
      const t = Math.max(0, lo - z, z - hi) + 2 * Math.max(0, x0 - x);
      return t < w ? (t * t) / (2 * w) : t - w / 2;
    };
    out.push({
      field: (p) => {
        const y = Math.abs(p[1]);
        return (p[0] - at[0]) * n[0] + (y - at[1]) * n[1] - fade(p[0], p[2]);
      },
      // (An intersect keeps only what its bounds hold: the whole bust.)
      bounds: [
        [-2, -2, -1],
        [2, 2, 3],
      ],
      op: 'intersect',
      blend: 0.06 * H,
      mirror: false,
    });
  }
  // Brow shelf: clay along the supraorbital rim from beside the glabella, over the orbit, and
  // down the lateral rim to the outer canthus' height.
  if (s.brow > 0) {
    const bz = ez + R * 1.42;
    out.push(
      clayOn(
        skin,
        [
          [k.glabella[0], 0.03 * H, bz - R * 0.1],
          [k.brow[0], ey - R * 0.2, bz + R * 0.1],
          [k.browOuter[0], k.browOuter[1] - R * 0.25, bz],
          [ex + R * 0.1, Math.abs(k.exocanthion[1]) + R * 0.5, ez + R * 0.55],
        ],
        0.03 * H,
        s.brow * H,
        { blend: 0.03 * H, tips: 0.55 },
      ),
    );
  }
  // Cheekbone: the zygomatic bone from under the orbit's outer corner back along the arch.
  if (s.cheek > 0)
    out.push(
      clayOn(
        skin,
        [
          [k.cheek[0] + 0.01 * H, ey + R * 0.3, ez - R * 1.75],
          [k.cheek[0] - 0.02 * H, Math.abs(k.exocanthion[1]) + R * 0.4, ez - R * 1.6],
          [k.zygion[0] + 0.1 * H, k.zygion[1], k.zygion[2] + 0.005 * H],
          [k.zygion[0] + 0.02 * H, k.zygion[1], k.zygion[2]],
        ],
        0.04 * H,
        s.cheek * H,
        { blend: 0.045 * H, tips: 0.5 },
      ),
    );
  // The buccal plane: under the arch the cheek drops in toward the teeth, down to the jaw.
  if (s.hollow > 0) {
    const c: V = [
      (k.zygion[0] + 0.1 * H + k.cheilion[0]) / 2,
      (k.zygion[1] + k.cheilion[1]) / 2 + 0.035 * H + 0.03 * H,
      (k.zygion[2] + k.gonion[2]) / 2 + 0.01 * H,
    ];
    out.push(
      ell(c, [0.085 * H, 0.03 * H + s.hollow * H, 0.07 * H], {
        op: 'subtract',
        blend: 0.05 * H,
        rotate: [0, -20, 12],
      }),
    );
  }
  return out;
}

/** Bones first (they ride the stage-2 skin), then the orbit and lids cut into them. LOD1's 1 cm
 *  cell cannot hold a 3 mm lid, and an orbit without lids leaves the eyeball bare (a bulging
 *  stare): there the lids are 5 mm thick and open a little wider, forms that cell holds. */
export function structureEdits(
  k: FacePoints,
  e: EyeSpec,
  H: number,
  skin: Surface,
  s: Structure,
  lod = 0,
): SculptEdit[] {
  const eye: EyeSpec =
    lod === 0 ? e : { ...e, lid: Math.max(e.lid, 0.005), upper: e.upper * 0.5, lower: 0 };
  return [...boneEdits(k, e, H, skin, s), ...orbitEdits(k, eye, s)];
}

/** The landmarks the far ink is drawn from (a skull's, left side). */
export interface InkPoints {
  readonly stomion: V;
  readonly cheilion: V;
  readonly brow: V;
  readonly browOuter: V;
}

/** The far LOD's inked features: the outlines to slice the mesh along (`phi` = 0 where
 *  `within` holds) and the flat colour of a triangle centred at a point (undefined: the skin as
 *  painted). */
export interface FarInk {
  readonly cuts: readonly {
    readonly phi: (p: V) => number;
    readonly within: (p: V) => boolean;
  }[];
  readonly colour: (p: V) => V | undefined;
}

/**
 * What a hand-made far LOD paints on its face (D615): the lips as a patch of their colour, the
 * mouth as a dark line through them from corner to corner, the brows as bands along the ridge,
 * each a shape of its own on the skull's landmarks, in the frontal (y, z) plane. Vertex paint
 * alone cannot hold them: LOD2's face vertices stand 1.1–1.3 cm apart and average their faces'
 * paint, so a 4 mm line is gone and the lips are a faint blush. layers.ts `inked` slices the
 * mesh along these outlines and fills them.
 */
export function farInk(
  k: InkPoints,
  H: number,
  c: { readonly lips: V; readonly dark: V; readonly brows?: V },
): FarInk {
  const s = k.stomion;
  const cy = Math.abs(k.cheilion[1]);
  const end = cy * 0.94;
  /** The mouth's line: its height at y (corner → stomion → corner). */
  const zl = (y: number): number => s[2] + (k.cheilion[2] - s[2]) * Math.min(1, Math.abs(y) / cy);
  // The zones' own lips (../face/zones.ts), a little fuller: an upper and a lower ellipse, each
  // riding the line (a smile lifts the corners 6 mm over the stomion: ellipses level with it lost
  // the upper lip under the line).
  const lip = (p: V, dz: number, ry: number, rz: number): number =>
    (dmath.hypot(p[1] / ry, (p[2] - zl(p[1]) - dz) / rz) - 1) * rz;
  const upper = (p: V): number => lip(p, 0.01 * H, cy, 0.014 * H);
  const lower = (p: V): number => lip(p, -0.012 * H, cy * 0.9, 0.017 * H);
  const front = s[0] - 0.07 * H;
  const head: V = [k.brow[0], Math.abs(k.brow[1]) - 0.05 * H, k.brow[2] - 0.004 * H];
  const tail: V = [
    k.browOuter[0],
    Math.abs(k.browOuter[1]) + 0.008 * H,
    k.browOuter[2] - 0.004 * H,
  ];
  const midY = (head[1] + tail[1]) / 2;
  const midZ = (head[2] + tail[2]) / 2 + 0.01 * H;
  /** The brow's centre line: its height at |y| (head → arch → tail). */
  const zb = (y: number): number => {
    const a = Math.abs(y);
    return a < midY
      ? head[2] + ((midZ - head[2]) * (a - head[1])) / (midY - head[1])
      : midZ + ((tail[2] - midZ) * (a - midY)) / (tail[1] - midY);
  };
  // (The brow's tail turns onto the head's side, behind the mouth's plane.)
  const back = tail[0] - 0.03 * H;
  const LINE = 0.009 * H;
  // (Thinning to its tail.)
  const browHalf = (y: number): number =>
    0.013 *
    H *
    (1 - 0.45 * Math.min(1, Math.max(0, (Math.abs(y) - head[1]) / (tail[1] - head[1]))));
  const onMouth = (p: V): boolean => p[0] > front && Math.abs(p[1]) < end;
  const onBrow = (p: V): boolean =>
    p[0] > back && Math.abs(p[1]) > head[1] && Math.abs(p[1]) < tail[1];
  const line = [
    c.dark[0] * 0.6 + c.lips[0] * 0.4,
    c.dark[1] * 0.6 + c.lips[1] * 0.4,
    c.dark[2] * 0.6 + c.lips[2] * 0.4,
  ] as const;
  return {
    cuts: [
      { phi: (p) => p[2] - zl(p[1]) - LINE, within: onMouth },
      { phi: (p) => p[2] - zl(p[1]) + LINE, within: onMouth },
      { phi: upper, within: (p) => p[0] > front && p[2] > zl(p[1]) },
      { phi: lower, within: (p) => p[0] > front && p[2] < zl(p[1]) },
      ...(c.brows
        ? [
            { phi: (p: V) => p[2] - zb(p[1]) - browHalf(p[1]), within: onBrow },
            { phi: (p: V) => p[2] - zb(p[1]) + browHalf(p[1]), within: onBrow },
          ]
        : []),
    ],
    colour: (p) => {
      if (p[0] > front) {
        if (Math.abs(p[1]) < end && Math.abs(p[2] - zl(p[1])) < LINE) return line;
        if (Math.min(upper(p), lower(p)) < 0) return c.lips;
      }
      return c.brows && onBrow(p) && Math.abs(p[2] - zb(p[1])) < browHalf(p[1])
        ? c.brows
        : undefined;
    },
  };
}
