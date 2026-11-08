// Orc warrior's knot: a scalp lock of separate sculpted LOCKS — clumps that taper, overlap and
// lie on the skull, flowing from a hairline over the crown into a bun of two locks wound round
// the knot, the tail's root standing out of it bound by two leather wraps, then a tail of locks
// arcing back low and lying down the skull to the nape. Each lock is toned root → tip
// (dark roots and undersides, lighter tips) by colour segments that blend along it; fine
// secondary strands at the hairline. Stylised hand-painted idiom: big readable clumps.

import type { BuildContext, Mesh, SculptEdit } from '@developerz.ai/ts23d';
import { add, chain, crease, type Surface, spline, taper, type V } from '../_lib/bust/kit.ts';
import { C } from './palette.ts';
import { skinMesh } from './skin.ts';

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
    const ctrl = tailPath(skull, dy, dz);
    edits.push(...lock(spline(ctrl, 16), r, 0.0022, r * 0.25, 3));
  }
  // 3.5 mm at LOD0 so the bun's wound turns and the leather wraps read as themselves.
  return skinMesh(edits, ctx.pick([0.0035, 0.009, 0.022]), {
    rng: ctx.rng.fork('hair'),
    color: C.hairRoot,
    mirror: false,
  });
}

/** One tail lock's control path: out of the wraps, back low over the crown, down to the nape. */
export function tailPath(skull: Surface, dy: number, dz: number): V[] {
  return [
    add(KNOT, [-0.004, dy * 0.3, 0.048]),
    add(KNOT, [-0.026, dy, 0.046 + dz]),
    add(KNOT, [-0.05, dy * 1.4, 0.024 + dz]),
    skull.off([-0.105, dy * 2, 0.54], 0.01 + dz * 0.3),
    skull.off([-0.123, dy * 2.4, 0.47], 0.009 + dz * 0.3),
    skull.off([-0.12, dy * 2.8, 0.41], 0.011),
  ];
}
