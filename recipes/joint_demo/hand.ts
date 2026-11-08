// The hand: a palm lofted from the wrist section, a fist (a ring of curled fingers) closed round
// a vertical handle, a thumb over it and four knuckles. `scale` exists for the failure demo: a
// hand ×2 must fail the wrist joint.

import { type BuildContext, cylinder, lathe, loft, merge, type Vec3 } from '@developerz.ai/ts23d';
import { ringYZ, SKIN } from './arm.ts';

export interface HandOptions {
  readonly wrist: Vec3;
  /** Wrist half-breadth (Y) and half-depth (Z), to start the palm flush with the forearm. */
  readonly section: readonly [number, number];
  /** Handle radius the fist closes on. */
  readonly grip: number;
  /** Uniform scale (1 = to spec). */
  readonly scale?: number;
}

/** Builds the hand; returns the grip centre (where the handle's axis passes through the fist). */
export function hand(ctx: BuildContext, o: HandOptions): Vec3 {
  const s = o.scale ?? 1;
  const n = ctx.pick([24, 12, 6]);
  const [wx, , wz] = o.wrist;
  const [hy, hz] = o.section;
  // Palm: thumb side down, 8 cm long, widening along Z (palm breadth is vertical here).
  const palm = [
    ringYZ(wx, hy * 1.04 * s, hz * 1.02 * s, wz, n),
    ringYZ(wx + 0.04 * s, 0.022 * s, 0.038 * s, wz, n),
    ringYZ(wx + 0.075 * s, 0.02 * s, 0.042 * s, wz, n),
  ];
  ctx.part('hand_palm', loft({ rings: palm, color: SKIN, capStart: true, capEnd: true }));
  // Fist: the four curled fingers as one ring round the handle, 8.4 cm tall.
  const inner = o.grip;
  const wall = 0.022 * s;
  const height = 0.084 * s;
  const centre: Vec3 = [wx + 0.075 * s + inner + 0.004 * s, 0, wz];
  ctx.part(
    'hand_fist',
    lathe({
      profile: [
        [inner, -height / 2],
        [inner + wall, -height / 2],
        [inner + wall, height / 2],
        [inner, height / 2],
        [inner, -height / 2],
      ],
      segments: n,
      color: SKIN,
      at: centre,
    }),
  );
  if (ctx.lod < 2) {
    // Knuckles: four bumps on the front of the ring.
    const r = 0.011 * s;
    const knuckles = [0, 1, 2, 3].map((i) =>
      cylinder({
        radius: r,
        length: 0.016 * s,
        segments: ctx.pick([10, 6, 4]),
        axis: 'y',
        color: SKIN,
        at: [centre[0] + inner + wall - r * 0.4, 0, wz - height / 2 + (height * (i + 0.5)) / 4],
      }),
    );
    ctx.part('hand_knuckles', merge(knuckles));
    // Thumb: wraps over the top of the fist from the palm side.
    ctx.part(
      'hand_thumb',
      cylinder({
        radius: 0.012 * s,
        length: 0.05 * s,
        segments: ctx.pick([10, 6, 4]),
        axis: 'x',
        color: SKIN,
        at: [centre[0] - 0.006 * s, -inner - wall * 0.4, wz + height / 2 + 0.004 * s],
      }),
    );
  }
  return centre;
}
