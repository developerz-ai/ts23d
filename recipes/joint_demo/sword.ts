// The sword: an arming sword standing point-up — pommel, grip, cruciform guard and a diamond-
// section blade tapering to the point. Built round the grip centre the hand reports.

import {
  type BuildContext,
  box,
  cylinder,
  hex,
  lathe,
  loft,
  type Vec3,
} from '@developerz.ai/ts23d';
import { ball } from './arm.ts';

const STEEL = hex('#b9bec4');
const LEATHER = hex('#4a2f1e');
const BRASS = hex('#a8832e');

export interface SwordOptions {
  /** Grip centre (the fist's centre). */
  readonly at: Vec3;
  readonly gripRadius: number;
  readonly gripLength: number;
  readonly bladeLength: number;
  readonly guardSpan: number;
}

/** A diamond ring in the plane z = const: half-thickness along X, half-width along Y. */
const diamond = (c: Vec3, t: number, w: number): Vec3[] => [
  [c[0] + t, c[1], c[2]],
  [c[0], c[1] + w, c[2]],
  [c[0] - t, c[1], c[2]],
  [c[0], c[1] - w, c[2]],
];

export function sword(ctx: BuildContext, o: SwordOptions): void {
  const [x, y, z] = o.at;
  const half = o.gripLength / 2;
  ctx.part(
    'sword_grip',
    cylinder({
      radius: o.gripRadius,
      length: o.gripLength,
      segments: ctx.pick([16, 8, 6]),
      color: LEATHER,
      at: o.at,
    }),
  );
  const guardZ = z + half;
  ctx.part(
    'sword_guard',
    box({
      size: [0.024, o.guardSpan, 0.018],
      at: [x, y, guardZ],
      color: BRASS,
      bevel: ctx.pick([0.004, 0.002, 0]),
    }),
  );
  const b0 = guardZ + 0.018;
  ctx.part(
    'sword_blade',
    loft({
      rings: [
        diamond([x, y, b0], 0.0045, 0.025),
        diamond([x, y, b0 + o.bladeLength * 0.7], 0.0035, 0.019),
        diamond([x, y, b0 + o.bladeLength - 0.0005], 0.0003, 0.0005),
      ],
      color: STEEL,
      capStart: true,
      capEnd: true,
    }),
  );
  const pr = o.gripRadius * 1.5;
  ctx.part(
    'sword_pommel',
    lathe({
      profile: ball(pr, ctx.pick([7, 5, 3])),
      segments: ctx.pick([16, 8, 6]),
      color: BRASS,
      at: [x, y, z - half - pr * 0.8],
    }),
  );
}
