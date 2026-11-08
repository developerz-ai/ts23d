// Joint demo: a right arm on a display stand, fist closed round an upright arming sword — built
// from sibling modules (arm.ts, hand.ts, sword.ts) the way a big character is, with the three
// connections declared as joints so QA `joints` proves they fit: elbow and wrist (flush), grip.
// Numbers: ./README.md (NASA MSIS anthropometry; arming-sword proportions).

import { box, cylinder, defineAsset, hex } from '@developerz.ai/ts23d';
import { arm } from './arm.ts';
import { hand } from './hand.ts';
import { sword } from './sword.ts';

const IRON = hex('#2e2f33');
const WRIST: readonly [number, number] = [0.022, 0.032];
const GRIP_R = 0.016;

/** The recipe as a function of the hand scale, so a test can build a mis-sized hand. */
export const jointDemo = (handScale = 1, name = 'joint_demo') =>
  defineAsset({
    name,
    kind: 'prop',
    description:
      'Teaching asset: an arm, a hand and a sword from separate modules, connected by checked joints',
    sources: [
      'https://msis.jsc.nasa.gov/sections/section03.htm',
      'https://en.wikipedia.org/wiki/Arming_sword',
    ],
    real: {
      length: 0.88,
      width: 0.36,
      height: 1.85,
      measures: [
        {
          label: 'forearm length',
          value: 0.26,
          axis: 'x',
          parts: ['forearm'],
          source: 'NASA MSIS',
        },
        {
          label: 'grip length',
          value: 0.14,
          axis: 'z',
          parts: ['sword_grip'],
          source: 'arming sword',
        },
        {
          label: 'blade length',
          value: 0.76,
          axis: 'z',
          parts: ['sword_blade'],
          source: 'arming sword',
        },
        {
          label: 'guard span',
          value: 0.18,
          axis: 'y',
          parts: ['sword_guard'],
          source: 'arming sword',
        },
      ],
    },
    tags: ['demo', 'joints'],
    budget: { triangles: [6000, 2000, 500] },
    build(ctx) {
      const shoulder = [0, 0, 1.0] as const;
      ctx.part(
        'stand_base',
        box({ size: [0.36, 0.36, 0.03], color: IRON, bevel: ctx.pick([0.006, 0.003, 0]) }),
      );
      ctx.part(
        'stand_post',
        cylinder({
          radius: 0.02,
          length: 0.92,
          segments: ctx.pick([12, 8, 6]),
          color: IRON,
          at: [0, 0, 0.03 + 0.46],
        }),
      );
      const a = arm(ctx, {
        shoulder: [...shoulder],
        upperLength: 0.27,
        forearmLength: 0.26,
        wrist: WRIST,
      });
      const grip = hand(ctx, { wrist: a.wrist, section: WRIST, grip: GRIP_R, scale: handScale });
      sword(ctx, {
        at: grip,
        gripRadius: GRIP_R,
        gripLength: 0.14,
        bladeLength: 0.76,
        guardSpan: 0.18,
      });
      ctx.joint('elbow', { from: 'upper_arm', to: 'forearm', at: a.elbow, axis: [1, 0, 0] });
      ctx.joint('wrist', { from: 'forearm', to: 'hand', at: a.wrist, axis: [1, 0, 0] });
      ctx.joint('grip', { from: 'hand', to: 'sword', at: grip, axis: [0, 0, 1], kind: 'grip' });
    },
  });

export const joint_demo = jointDemo();
