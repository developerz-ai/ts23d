import { describe, expect, it } from 'bun:test';
import type { Bone, Quat, Vec3 } from '../core/index.ts';
import { checkClip, dmath } from '../core/index.ts';
import {
  footLock,
  neuralMotionClip,
  parseMotion,
  plantedSlide,
  resampleCycles,
} from './neural-motion.ts';

const bones: Bone[] = [
  { name: 'pelvis', head: [0, 0, 0.5], tail: [0.1, 0, 0.5] },
  { name: 'leg_l', parent: 'pelvis', head: [0, 0.1, 0.5], tail: [0, 0.1, 0] },
  { name: 'leg_r', parent: 'pelvis', head: [0, -0.1, 0.5], tail: [0, -0.1, 0] },
];
const swing = (a: number): Quat => [0, dmath.sin(a / 2), 0, dmath.cos(a / 2)];

/** 1.2 s at 24 fps: the root drifts 9 cm/s forward while both feet stay planted, the right leg
 *  lifts (swings) in the middle third — what a text-to-motion model hands back. */
function drifting(): Uint8Array {
  const n = 29;
  const root: Vec3[] = [];
  const legR: Quat[] = [];
  const legL: Quat[] = [];
  for (let f = 0; f < n; f++) {
    root.push([0.09 * (f / 24), 0, 0]);
    legL.push([0, 0, 0, 1]);
    legR.push(f > 9 && f < 19 ? swing(0.6) : [0, 0, 0, 1]);
  }
  return new TextEncoder().encode(
    JSON.stringify({ fps: 24, root, bones: { leg_l: legL, leg_r: legR } }),
  );
}

const reply = (o: { root?: unknown; hips?: unknown; fps?: number }): Uint8Array =>
  new TextEncoder().encode(
    JSON.stringify({
      fps: o.fps ?? 30,
      root: o.root ?? [
        [0, 0, 0],
        [0, 0, 0],
      ],
      bones: {
        pelvis: o.hips ?? [
          [0, 0, 0, 1],
          [0, 0, 0, 1],
        ],
      },
    }),
  );

describe('neural motion refuses keys it would have to guess at', () => {
  const refused: readonly (readonly [string, Parameters<typeof reply>[0], RegExp])[] = [
    [
      'a 3-number rotation (Euler angles)',
      {
        hips: [
          [0.1, 0.2, 0.3],
          [0, 0, 0, 1],
        ],
      },
      /pelvis.*4 numbers/,
    ],
    [
      'a zero quaternion',
      {
        hips: [
          [0, 0, 0, 0],
          [0, 0, 0, 1],
        ],
      },
      /pelvis.*unit/,
    ],
    [
      'a quaternion that is not unit',
      {
        hips: [
          [0, 0, 0, 1.1],
          [0, 0, 0, 1],
        ],
      },
      /pelvis.*unit/,
    ],
    [
      'a 2-number root offset',
      {
        root: [
          [0, 0],
          [0.1, 0],
        ],
      },
      /root.*3 numbers/,
    ],
  ];
  for (const [what, o, message] of refused)
    it(what, () => {
      expect(() => parseMotion(reply(o), bones)).toThrow('T3D_NEURAL_OUTPUT_INVALID');
      expect(() => parseMotion(reply(o), bones)).toThrow(message);
    });

  it('a motion shorter than one cycle (it would be padded with frozen frames)', () => {
    const short = parseMotion(reply({}), bones); // 2 frames at 30 fps
    expect(() => resampleCycles(short, 1)).toThrow('T3D_NEURAL_OUTPUT_INVALID');
    expect(() => resampleCycles(short, 1)).toThrow(/shorter than one 1 s cycle/);
    expect(resampleCycles(short, 1 / 30).root.length).toBe(2);
  });

  it('normalises keys within 1e-3 of unit', () => {
    const m = parseMotion(
      reply({
        hips: [
          [0, 0, 0, 1.0005],
          [0, 0, 0, 1],
        ],
      }),
      bones,
    );
    expect(m.rotations.get('pelvis')?.[0]).toEqual([0, 0, 0, 1]);
  });
});

describe('neural motion → clip', () => {
  it('a drifting root slides the planted feet (the failure the lock exists for)', () => {
    const m = resampleCycles(parseMotion(drifting(), bones), 1);
    expect(plantedSlide(m, bones, ['leg_l', 'leg_r'])).toBeGreaterThan(0.0025);
    expect(footLock(m, bones, ['leg_l', 'leg_r']).slide).toBeLessThan(0.001);
  });

  it('foot-locked: planted feet slip < 1 mm, the clip is one whole 1 s cycle at 30 fps', () => {
    const { clip, slide } = neuralMotionClip({
      name: 'walk_ai',
      bytes: drifting(),
      bones,
      rootBone: 'pelvis',
      feet: ['leg_l', 'leg_r'],
      period: 1,
    });
    expect(slide).toBeLessThan(0.001);
    expect(clip.seconds).toBeCloseTo(1, 6);
    expect(clip.tracks[0]?.times.length).toBe(31);
    expect(() => checkClip('t', clip)).not.toThrow();
    // The root no longer runs away: the left foot never lifts, so the root holds still.
    const tx = clip.tracks[0]?.values ?? new Float32Array();
    expect(Math.abs((tx[tx.length - 3] ?? 0) - (tx[0] ?? 0))).toBeLessThan(0.001);
  });

  it('refuses a bone the skeleton lacks and a non-JSON reply', () => {
    const json = new TextEncoder().encode(
      JSON.stringify({
        fps: 24,
        root: [
          [0, 0, 0],
          [0, 0, 0],
        ],
        bones: {
          tail_9: [
            [0, 0, 0, 1],
            [0, 0, 0, 1],
          ],
        },
      }),
    );
    expect(() => parseMotion(json, bones)).toThrow(/tail_9/);
    expect(() => parseMotion(new Uint8Array([1, 2]), bones)).toThrow('T3D_NEURAL_OUTPUT_INVALID');
  });
});
