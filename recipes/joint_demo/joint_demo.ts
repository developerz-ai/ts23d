// Joint demo: a right arm on a display stand, fist closed round an upright arming sword — built
// from sibling modules (arm.ts, hand.ts, sword.ts) the way a big character is, with the three
// connections declared as joints so QA `joints` proves they fit: elbow and wrist (flush), grip.
// Numbers: ./README.md (NASA MSIS anthropometry; arming-sword proportions).

import {
  type BuildContext,
  box,
  cylinder,
  defineAsset,
  hex,
  lathe,
  type Mesh,
  merge,
  type Vec3,
  weather,
} from '@developerz.ai/ts23d';
import { arm, skinTone } from './arm.ts';
import { gripOf, hand } from './hand.ts';
import { sword } from './sword.ts';

const IRON = hex('#2e2f33');
const BARE = hex('#8d8c88');
const WRIST: readonly [number, number] = [0.022, 0.032];
const GRIP_R = 0.016;

/** The display stand: a bolted base plate, a post with a turned foot, and a cup under the
 *  shoulder; blackened iron that has stood in a workshop (chipped edges, rust creeping from the
 *  bolts and up from the floor, scratches, dust on the plate). */
function stand(ctx: BuildContext, top: number): void {
  const seg = ctx.pick([10, 5, 5]);
  const bolts: Mesh[] = [];
  const spots: { at: Vec3; radius: number }[] = [];
  for (const [bx, by] of [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ] as const) {
    const at: Vec3 = [bx * 0.14, by * 0.14, 0.033];
    spots.push({ at, radius: 0.02 });
    if (ctx.lod < 2)
      bolts.push(
        cylinder({ radius: 0.011, length: 0.006, segments: ctx.pick([8, 6, 6]), color: IRON, at }),
      );
  }
  // The post as stacked rings (the painter needs vertices along it; a bare cylinder has none).
  const rings = ctx.pick([5, 2, 1]);
  const flange = 0.08;
  const cup = top - 0.07;
  const shaft: [number, number][] = Array.from({ length: rings + 1 }, (_, i): [number, number] => [
    0.02,
    flange + ((cup - flange) * i) / rings,
  ]);
  const post = lathe({
    profile:
      ctx.lod < 2
        ? [
            // Foot flange, shaft, and the cup the shoulder rests in.
            [0.02, 0.028],
            [0.05, 0.028],
            [0.05, 0.038],
            [0.034, 0.046],
            [0.026, 0.075],
            ...shaft,
            [0.027, top - 0.062],
            [0.034, top - 0.03],
            [0.05, top - 0.012],
            [0.05, top - 0.004],
            [0.02, top - 0.004],
          ]
        : [
            [0.02, 0.028],
            [0.02, top - 0.004],
          ],
    segments: seg,
    color: IRON,
    strip: 'iron',
  });
  const base = merge([
    box({
      size: [0.36, 0.36, 0.03],
      omit: ['bottom'],
      color: IRON,
      strip: 'iron',
      bevel: ctx.pick([0.006, 0, 0]),
    }),
    ...bolts,
  ]);
  const effects = {
    chips: { where: 'convex-edges', amount: 0.4 },
    rust: {
      where: 'below-fasteners | fasteners | ground-near',
      amount: 0.3,
      streaks: true,
      streakLength: 0.12,
    },
    scratches: { where: 'side-facing', amount: 0.12 },
    dust: { where: 'up-facing', amount: 0.55 },
  };
  const aged = {
    ...weather(
      ctx,
      { stand_base: base },
      {
        name: 'stand_base',
        seed: 7,
        age: 0.7,
        // (Vertices for the dust to land on: a 10 cm grid near, the bare plate far.)
        resolution: [0.1, 0.19, 0],
        fasteners: spots,
        under: BARE,
        // Rust only round the bolts near: the whole plate is ground-near, and 3 cm rust noise on
        // its 10 cm grid lands one vertex in three, a rust checker across the top. (The far plate
        // has no vertices by the bolts: its rust stays at its foot.)
        effects:
          ctx.lod < 2
            ? {
                ...effects,
                rust: { ...effects.rust, where: 'fasteners', streaks: false },
                // An even film over the whole top: a coverage edge on a 10 cm grid is a
                // checker of dusty and black triangles (so is rust or a scratch that lands on
                // one grid vertex in three: the plate's top keeps neither).
                dust: { where: 'up-facing', amount: 1, strength: 0.3 },
                // (Nor chips: a chipped grid vertex bares a whole 10 cm triangle of the top.)
                chips: { where: 'convex-edges', amount: 0 },
              }
            : effects,
      },
    ),
    ...weather(
      ctx,
      { stand_post: post },
      {
        name: 'stand_post',
        seed: 11,
        age: 0.7,
        resolution: 0,
        ground: 0,
        under: BARE,
        effects: {
          chips: effects.chips,
          rust: { ...effects.rust, where: 'ground-near' },
        },
      },
    ),
  };
  for (const [name, m] of Object.entries(aged)) ctx.part(name, m);
}

/** The recipe as a function of the hand scale, so a test can build a mis-sized hand. */
export const jointDemo = (handScale = 1, name = 'joint_demo') =>
  defineAsset({
    name,
    kind: 'prop',
    description:
      'Teaching asset: a sun-browned arm on a rusting iron stand, its fist closed round a nicked arming sword; arm, hand and sword come from separate modules, connected by checked joints',
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
          axis: 'x',
          parts: ['sword_guard'],
          source: 'arming sword',
        },
      ],
    },
    tags: ['demo', 'joints'],
    art: { focal: 'hand_fingers' },
    // From the arm's side, close: the default orbit frames the sword's whole height from the
    // front-left and leaves the hand a few pixels across.
    hero: { eye: [2.03, -3.25, 1.32], target: [0.3, 0, 0.93], fovDeg: 30 },
    // The generic prop band (5k / 1.5k / 300). LOD0: the sword 1.5k, the arm and the fingered
    // hand 2.6k, the stand 0.8k (its plate is tessellated on a 10 cm grid so the rust and dust
    // have vertices to live on).
    budget: { triangles: [5000, 1500, 300] },
    build(ctx) {
      const shoulder: Vec3 = [0, 0, 1.0];
      stand(ctx, shoulder[2] - 0.045);
      const wrist: Vec3 = [shoulder[0] + 0.03 + 0.27 + 0.26, 0, shoulder[2]];
      const at = gripOf(wrist, GRIP_R, handScale);
      // Red, dry skin on the elbow and over the knuckles; grime thickest at the hand.
      const tone = skinTone(ctx.rng.fork('skin'), {
        red: [
          [0.3, 0, shoulder[2] - 0.045],
          [at[0] + GRIP_R + 0.012, 0, at[2] + 0.03],
          [at[0] + GRIP_R + 0.012, 0, at[2] - 0.03],
          [at[0] + GRIP_R + 0.008, at[1] + GRIP_R + 0.01, at[2]],
        ],
        grime: [at[0], at[1], at[2] - 0.02],
      });
      const a = arm(ctx, {
        shoulder,
        upperLength: 0.27,
        forearmLength: 0.26,
        wrist: WRIST,
        tone,
      });
      const handle = cylinder({ radius: GRIP_R, length: 0.14, segments: 12, color: IRON, at });
      const grip = hand(ctx, {
        wrist: a.wrist,
        section: WRIST,
        grip: GRIP_R,
        scale: handScale,
        tone,
        occluder: handle,
      });
      sword(ctx, {
        at: grip,
        gripRadius: GRIP_R,
        gripLength: 0.14,
        bladeLength: 0.76,
        guardSpan: 0.18,
        rng: ctx.rng.fork('sword'),
      });
      ctx.joint('elbow', { from: 'upper_arm', to: 'forearm', at: a.elbow, axis: [1, 0, 0] });
      ctx.joint('wrist', { from: 'forearm', to: 'hand', at: a.wrist, axis: [1, 0, 0] });
      ctx.joint('grip', { from: 'hand', to: 'sword', at: grip, axis: [0, 0, 1], kind: 'grip' });
    },
  });

export const joint_demo = jointDemo();
