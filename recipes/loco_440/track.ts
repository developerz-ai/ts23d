// Track under the train: a gravel ballast bed, weathered timber ties with iron tie plates and
// spike heads, and rolled rails (rusty web, the head kept as the running surface). Its own group,
// the length of engine + tender.

import {
  type BuildContext,
  grime,
  type Mesh,
  merge,
  prism,
  translate,
  type Vec2,
} from '@developerz.ai/ts23d';
import { bx, F, HEAD, type Layout, RAIL_H, RAIL_Y, SIDES, TIE_H } from './shared.ts';

export function buildTrack(ctx: BuildContext, L: Layout): void {
  const { lod, pilotTip, tenderRear } = L;
  ctx.group('track');
  const x0 = tenderRear;
  const x1 = pilotTip;
  const len = x1 - x0;
  const m: Mesh[] = [];
  if (lod < 2) {
    const n = Math.round(len / 0.6);
    for (let i = 0; i < n; i += lod === 0 ? 1 : 2) {
      // Ties hand-laid: a little skew in spacing and length.
      const x = x0 + 0.3 + i * 0.6 + ctx.rng.range(-0.03, 0.03);
      const half = 1.3 + ctx.rng.range(-0.05, 0.03);
      m.push(bx(x - 0.115, x + 0.115, -half, half, 0, TIE_H, F.ties));
      for (const [, s] of SIDES) {
        // Tie plate under each rail foot: what the rail actually bears on.
        m.push(
          bx(
            x - 0.1,
            x + 0.1,
            s * RAIL_Y - 0.08,
            s * RAIL_Y + 0.08,
            TIE_H - 0.011,
            TIE_H + 0.001,
            F.rust,
          ),
        );
        if (lod === 0)
          for (const dy of [-0.075, 0.075])
            m.push(
              bx(
                x - 0.02,
                x + 0.02,
                s * RAIL_Y + dy - 0.02,
                s * RAIL_Y + dy + 0.02,
                TIE_H,
                TIE_H + 0.025,
                F.rust,
              ),
            );
      }
    }
    // Ballast bed: a shallow trapezoid, ties sitting into it.
    m.push(
      translate(
        prism({
          profile: [
            [-1.4, 0],
            [1.4, 0],
            [1.3, 0.1],
            [-1.3, 0.1],
          ],
          depth: len,
          plane: 'yz',
          ...F.ballast,
        }),
        [(x0 + x1) / 2, 0, -0.0],
      ),
    );
    if (lod === 0) {
      // Loose stones scattered on the shoulders and between the ties.
      for (let i = 0; i < 260; i++) {
        const x = x0 + ctx.rng.range(0.1, len - 0.1);
        const y = ctx.rng.range(-1.3, 1.3);
        const r = ctx.rng.range(0.025, 0.05);
        m.push(bx(x - r, x + r, y - r, y + r * 0.8, 0.07, 0.1 + r * 0.6, F.ballast));
      }
    }
  } else {
    m.push(bx(x0, x1, -1.3, 1.3, 0, TIE_H, F.ties));
  }
  ctx.part('track_ties', grime(merge(m), { ground: 0.2, groundStrength: 0.3 }), {
    parent: 'track',
  });
  const profile: Vec2[] =
    lod === 0
      ? [
          [-0.065, 0],
          [0.065, 0],
          [0.065, 0.012],
          [0.01, 0.03],
          [0.009, 0.1],
          [HEAD / 2, 0.105],
          [HEAD / 2, RAIL_H],
          [-HEAD / 2, RAIL_H],
          [-HEAD / 2, 0.105],
          [-0.009, 0.1],
          [-0.01, 0.03],
          [-0.065, 0.012],
        ]
      : [
          [-0.05, 0],
          [0.05, 0],
          [HEAD / 2, RAIL_H],
          [-HEAD / 2, RAIL_H],
        ];
  for (const [side, s] of SIDES) {
    const rail = [
      translate(prism({ profile, depth: len, plane: 'yz', ...F.rust }), [
        (x0 + x1) / 2,
        s * RAIL_Y,
        TIE_H,
      ]),
    ];
    // Polished running band on the railhead.
    if (lod === 0)
      rail.push(
        bx(
          x0,
          x1,
          s * RAIL_Y - 0.025,
          s * RAIL_Y + 0.025,
          TIE_H + RAIL_H,
          TIE_H + RAIL_H + 0.001,
          F.steel,
        ),
      );
    ctx.part(`track_rail_${side}`, merge(rail), { parent: 'track' });
  }
}
