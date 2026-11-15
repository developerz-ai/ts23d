// Goblin hair: pale wisps — a few thin tapered locks straggling up and back off a warty dome, each
// rooted in the scalp, toned grey at the root and near-white at the tip, no two alike (seeded).
// Card hair (`hairBaseEdits` + `goblinCardHair`): no sculpted wisps, a few thin clumped strand
// cards standing up and back off the bare dome.

import { type Field, type SculptEdit, sculptField, type Vec3 } from '@developerz.ai/ts23d';
import { lock, mix } from '../_lib/bust/hair.ts';
import { headBlock } from '../_lib/bust/head.ts';
import { type Surface, spline, surface, type V } from '../_lib/bust/kit.ts';
import { C, H, L, SPEC } from './spec.ts';

export function hairEdits(scalp: Field, lod: number): SculptEdit[] {
  const s = surface(scalp);
  const out: SculptEdit[] = [];
  for (const [i, [dx, dy, len, lean]] of WISPS.entries()) {
    if (lod === 2 && i > 2) break;
    const ctrl = wispLine(s, dx, dy, len, lean);
    out.push(
      ...lock(spline(ctrl, 10), 0.0045, 0.0012, C.hairRoot, C.hairTip, { mirror: false, seg: 2 }),
    );
  }
  return out;
}

/** Wisps: x from the glabella (×H), y (×H), length (×H), lean. */
export const WISPS: ReadonlyArray<readonly [number, number, number, number]> = [
  [-0.3, 0.05, 0.42, 0.2],
  [-0.42, 0.14, 0.36, 0.5],
  [-0.55, 0.08, 0.4, 0.35],
  [-0.62, 0.2, 0.3, 0.7],
  [-0.5, -0.06, 0.34, -0.3],
  [-0.7, -0.12, 0.28, -0.6],
];

/** A wisp's control line: rooted in the scalp, up off the dome, then back. */
export function wispLine(s: Surface, dx: number, dy: number, len: number, lean: number): V[] {
  const root = wispRoot(s, dx, dy);
  const n = s.normal(root);
  return [
    root,
    [
      root[0] + n[0] * len * 0.3 * H,
      root[1] + n[1] * len * 0.3 * H + lean * 0.05 * H,
      root[2] + len * 0.35 * H,
    ],
    [root[0] - len * 0.35 * H, root[1] + lean * 0.18 * H, root[2] + len * 0.55 * H],
    [root[0] - len * 0.8 * H, root[1] + lean * 0.3 * H, root[2] + len * 0.45 * H],
  ];
}

/** Where a wisp is rooted: 6 mm into the scalp under (dx, dy). */
export function wispRoot(s: Surface, dx: number, dy: number): V {
  return s.off([L.gx + dx * H, dy * H, L.crown], -0.006);
}

/** No sculpted hair under the cards: the dome stays bare skin. */
export const hairBaseEdits = (_scalp: Field, _lod: number): SculptEdit[] => [];

/** Card wisps for `cardHair`: sparse, thin, standing up and back off the crown. */
export function goblinCardHair() {
  const field = sculptField([headBlock(SPEC, 2)], { color: C.hairRoot, mirror: 'y' }).field;
  const crown: Vec3 = [L.gx - 0.5 * H, 0, L.crown];
  // A patch over the crown, 0.32 H across.
  const region: Field = (p) =>
    Math.hypot((p[0] - crown[0]) * 0.8, p[1], Math.min(0, p[2] - crown[2] + 0.12 * H)) - 0.32 * H;
  return {
    field,
    bounds: [
      [L.back - 0.03, -0.12, L.crown - 0.35 * H],
      [L.gx + 0.03, 0.12, L.crown + 0.03],
    ] as [Vec3, Vec3],
    cell: 0.004,
    comb: (p: Vec3): Vec3 => [-1, Math.sign(p[1]) * 0.4, 0.5],
    color: mix(C.hairRoot, C.hairTip, 0.4),
    layers: [
      {
        name: 'wisps',
        kind: 'hair',
        region,
        density: 900,
        length: 0.075,
        width: 0.006,
        lift: 0.9,
        bend: 0.55,
        droop: 0.15,
        roll: 1.2,
        clump: 3,
        tone: [0.75, 1.25],
      },
    ] as const,
  };
}
