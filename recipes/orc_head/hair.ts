// Orc warrior's knot: a scalp lock of separate sculpted LOCKS — clumps that taper, overlap and
// lie on the skull, flowing from a hairline over the crown into a bun of two locks wound round
// the knot, the tail's root standing out of it bound by two leather wraps, then a tail of locks
// arcing back low and lying down the skull to the nape. Each lock is toned root → tip
// (dark roots and undersides, lighter tips) by colour segments that blend along it; fine
// secondary strands at the hairline. Stylised hand-painted idiom: big readable clumps.
// Card hair (`orcCardHair`): strand cards over the scalp lock combed into the knot (clumped into
// locks), a full beard on chin and jaw in three layers over a hair-painted chin (build.ts `scalp`
// paint), and coarse brows, on top of the sculpted knot.

import type { BuildContext, Field, Mesh, SculptEdit, Vec3 } from '@developerz.ai/ts23d';
import { dmath } from '@developerz.ai/ts23d';
import { add, chain, crease, type Surface, spline, taper, type V } from '../_lib/bust/kit.ts';
import { browLayers, withBrowComb } from '../_lib/face/brows.ts';
import type { CardHairStyle } from '../_lib/face/hair-cards.ts';
import { C } from './palette.ts';
import { skinMesh } from './skin.ts';
import { H, SK } from './spec.ts';
import { tuskExit } from './tusks.ts';

/** Where the left tusk leaves the lower lip (the beard parts round it). */
const TUSK_EXIT = tuskExit();

const mix = (a: V, b: V, t: number): V => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** One lock: a tapered chain along a smooth path, split into colour segments root → tip. */
function lock(pts: readonly V[], r0: number, r1: number, belly: number, seg = 3): SculptEdit[] {
  const n = pts.length;
  const radii = taper(n, r0, r1, belly);
  const out: SculptEdit[] = [];
  const per = Math.ceil((n - 1) / seg);
  for (let s = 0; s < seg; s++) {
    const a = s * per;
    const b = Math.min(n - 1, a + per);
    if (b <= a) break;
    const t = (s + 0.5) / seg;
    out.push(
      chain(pts.slice(a, b + 1), radii.slice(a, b + 1), {
        color: mix(C.hairRoot, C.hairTip, t * t),
        blend: 0.006,
        join: 0.002,
      }),
    );
  }
  return out;
}

/** The knot (the point all scalp locks converge on), just behind the crown. */
export const KNOT: V = [-0.058, 0, 0.584];

export function hairKnot(ctx: BuildContext, skull: Surface): Mesh {
  const edits: SculptEdit[] = [];
  const lod = ctx.lod;
  // The scalp lock: hair pulled up from a patch on the crown into the knot — a low cap with
  // lock separations converging on the knot (the rest of the head is shaved).
  edits.push({
    group: [
      { shape: 'ellipsoid', at: skull.off([-0.045, 0, 0.585], -0.012), size: [0.05, 0.036, 0.022] },
      {
        shape: 'ellipsoid',
        at: add(KNOT, [0, 0, 0.002]),
        size: [0.018, 0.016, 0.014],
        blend: 0.012,
      },
    ],
    color: C.hairRoot,
  });
  if (lod < 2)
    for (let i = 0; i < 7; i++) {
      const t = i / 6 - 0.5;
      const pts = [
        skull.off([0.0 - Math.abs(t) * 0.03, t * 0.06, 0.58], 0.002),
        skull.off([-0.03, t * 0.034, 0.6], 0.009),
        add(KNOT, [0.012, t * 0.02, 0.012]),
      ];
      edits.push(crease(pts, 0.0024, { n: 8, mirror: false, color: C.hairRoot }));
    }
  // The bun: the lock wound round the knot in three turns stacked and tightening as they rise,
  // a groove between each — the hair is clearly WRAPPED, not a lump.
  // (LOD1/2: one rounded bun — turns thinner than the coarse cell fold inside out.)
  if (lod === 0)
    for (const [dz, rr, tube] of [
      [0.0, 0.0165, 0.0058],
      [0.009, 0.0145, 0.0054],
      [0.017, 0.0122, 0.005],
    ] as const)
      edits.push({
        shape: 'torus',
        at: add(KNOT, [0, 0, dz]),
        size: [rr, tube],
        color: C.hairRoot,
        blend: 0.0012,
      });
  else
    edits.push({
      shape: 'ellipsoid',
      at: add(KNOT, [0, 0, 0.008]),
      size: [0.021, 0.021, 0.016],
      color: C.hairRoot,
    });
  // The tail's root standing out of the bun, bound by two leather wraps.
  edits.push(
    chain([add(KNOT, [0, 0, 0.012]), add(KNOT, [-0.004, 0, 0.05])], [0.0105, 0.0095], {
      color: C.hairRoot,
      blend: 0.004,
    }),
  );
  if (lod === 0)
    for (const dz of [0.03, 0.042])
      edits.push({
        shape: 'torus',
        at: add(KNOT, [-0.0025, 0, dz]),
        size: [0.0122, 0.0042],
        color: C.hairBand,
        blend: 0.0015,
      });
  // Tail: locks out of the wraps, arcing back low over the crown and lying down the back of the
  // skull to the nape, fanned and overlapping.
  // LOD0 five slim, separate locks; LOD1 three thicker, LOD2 one (a lock thinner than ~1.5 cells,
  // or a gap between locks under a cell, folds inside out).
  const tails: Array<[number, number, number]> =
    lod === 2
      ? [[0, 0, 0.019]]
      : (
          [
            [0, 0, 0.0085],
            [0.016, 0.002, 0.0075],
            [-0.016, -0.002, 0.0075],
            [0.009, -0.006, 0.0068],
            [-0.008, 0.006, 0.0068],
          ] as const
        )
          .slice(0, lod === 0 ? 5 : 3)
          .map(([dy, dz, r]): [number, number, number] => [dy, dz, lod === 0 ? r : r * 1.45]);
  for (const [dy, dz, r] of tails) {
    // (The far LOD's one fat lock keeps the higher arc: 1 cm lower it folds into the crown.)
    const ctrl = tailPath(skull, dy, dz, lod === 2 ? 0 : 0.01);
    edits.push(...lock(spline(ctrl, 16), r, 0.0022, r * 0.25, 3));
  }
  // 4.4 mm at LOD0 so the bun's wound turns and the leather wraps read as themselves.
  return skinMesh(edits, ctx.pick([0.0044, 0.009, 0.022]), {
    rng: ctx.rng.fork('hair'),
    color: C.hairRoot,
    mirror: false,
  });
}

/** One tail lock's control path: out of the wraps, back low over the crown, down to the nape. */
export function tailPath(skull: Surface, dy: number, dz: number, drop = 0.01): V[] {
  return [
    add(KNOT, [-0.004, dy * 0.3, 0.048]),
    // (The arc 1 cm lower than it first stood: a tail hanging off the knot, not a handle.)
    add(KNOT, [-0.026, dy, 0.046 - drop + dz]),
    add(KNOT, [-0.05, dy * 1.4, 0.024 - drop * 0.9 + dz]),
    skull.off([-0.105, dy * 2, 0.54], 0.01 + dz * 0.3),
    skull.off([-0.123, dy * 2.4, 0.47], 0.009 + dz * 0.3),
    skull.off([-0.12, dy * 2.8, 0.41], 0.011),
  ];
}

/** Scalp lock: the crown patch the knot gathers (the rest of the head is shaved). */
export const scalpLock: Field = (p) =>
  dmath.hypot((p[0] + 0.045) / 1.25, p[1] / 0.95, Math.min(0, p[2] - 0.555)) - 0.05;

/** Beard: chin and jaw from under the lower lip to the jaw angle and a little under the jaw,
 *  in front of the ears, parted round the tusks' bases (a 2.4 cm clearing round where each
 *  leaves the lip) — never on the lips or swallowing the tusk roots. */
export const beardRegion: Field = (p) =>
  Math.max(
    p[2] - (SK.cheilion[2] - 0.018) - Math.max(0, SK.cheilion[0] - 0.02 - p[0]) * 0.9,
    SK.tragion[0] + 0.045 - p[0],
    SK.menton[2] - 0.025 - p[2],
    0.024 - dmath.hypot(p[0] - TUSK_EXIT[0], Math.abs(p[1]) - TUSK_EXIT[1], p[2] - TUSK_EXIT[2]),
  );

/** Coarse brows on the brow shelf (it stands 3 cm proud of the base's brow line). */
const BROWS = {
  thick: 0.007,
  length: 0.016,
  density: 300000,
  tone: [0.45, 0.8],
  reach: 0.035,
} as const;

/** Card hair for `cardHair` on the orc: `skull` is the stage-2 skin surface (build.ts `body`). A
 *  dense base of short flat clumps hides the painted chin, coarse locks hang from it in clumps
 *  and wiry strays break the outline; the brows are coarse cards on the brow shelf. */
export function orcCardHair(skull: Surface): CardHairStyle {
  const comb = (p: Vec3, n: Vec3): Vec3 =>
    beardRegion(p) < 0.01
      ? [0.3 + 0.2 * n[0], Math.sign(p[1]) * 0.15, -1]
      : [KNOT[0] - p[0], KNOT[1] - p[1], KNOT[2] + 0.02 - p[2]];
  const beard = { kind: 'beard', region: beardRegion, fold: 0.4, tint: [1.1, 1.02, 0.9] } as const;
  return {
    field: skull.field,
    bounds: [
      [-0.16, -0.14, 0.24],
      [0.2, 0.14, 0.62],
    ],
    cell: 0.004,
    comb: withBrowComb(comb, SK, H, BROWS),
    color: mix(C.hairRoot, C.hairTip, 0.3),
    // The lock style (D461): the scalp lock and the beard on its coarse cells, narrower and denser.
    locks: {},
    layers: [
      {
        name: 'scalp_lock',
        kind: 'beard',
        region: scalpLock,
        density: 7000,
        length: 0.06,
        width: 0.012,
        lift: 0.1,
        bend: 0.8,
        droop: 0,
        clump: 5,
      },
      {
        ...beard,
        name: 'beard_base',
        density: 12000,
        length: 0.028,
        width: 0.014,
        lift: 0.08,
        bend: 0.85,
        droop: 0.4,
        hug: 1,
        tone: [0.45, 0.75],
      },
      {
        ...beard,
        name: 'beard',
        density: 11500,
        length: 0.055,
        width: 0.011,
        lift: 0.22,
        bend: 0.6,
        droop: 0.65,
        clump: 3,
        tone: [0.7, 1.1],
        hug: 0.7,
      },
      {
        ...beard,
        name: 'beard_wisp',
        kind: 'wisp',
        density: 2500,
        length: 0.05,
        width: 0.006,
        lift: 0.35,
        bend: 0.5,
        droop: 0.5,
        fold: 0,
        tone: [0.8, 1.2],
      },
      ...browLayers(SK, H, BROWS),
    ],
  };
}
