// chain-cross: one long limb through another fails; limbs that stay apart, or short ones, do not.

import { describe, expect, it } from 'bun:test';
import {
  type Bone,
  type Clip,
  compile,
  defineAsset,
  dmath,
  type Mesh,
  translate,
  type Vec3,
} from '../core/index.ts';
import { chainCrossFindings, segmentDistance } from './chain-cross.ts';
import { radial, rigged, swing } from './chain-fixtures.ts';
import { smooth, tube } from './motion-fixtures.ts';

/** Two parallel 5-bone arms along +X at y = ±0.5 under a hub, skinned with tubes of radius `r`. */
function pair(r: number | null, degrees: number) {
  const arm = (side: string, y: number): Bone[] =>
    Array.from({ length: 5 }, (_, i) => ({
      name: `arm_${side}_${i}`,
      parent: i === 0 ? 'hub' : `arm_${side}_${i - 1}`,
      head: [i / 5, y, 1] as Vec3,
      tail: [(i + 1) / 5, y, 1] as Vec3,
    }));
  const bones: Bone[] = [
    { name: 'hub', head: [0, 0, 1], tail: [0, 0, 1.1] },
    ...arm('a', 0.5),
    ...arm('b', -0.5),
  ];
  return compile(
    defineAsset({
      name: 'pair',
      kind: 'creature',
      medium: 'water',
      budget: { triangles: [99999, 99999, 99999], bones: 64 },
      clips: [swing('arm_a_0', [0, 0, 1], degrees)],
      build(ctx) {
        for (const b of bones) ctx.bone(b.name, b);
        if (r === null) return;
        ctx.part('skin_a', smooth(translate(tube(1, r), [0, 0.5, 1]), bones));
        ctx.part('skin_b', smooth(translate(tube(1, r), [0, -0.5, 1]), bones));
      },
    }),
  );
}

/** `clip` played in `seconds`, its keys moved with it. */
const squeezed = (clip: Clip, seconds: number): Clip => ({
  ...clip,
  seconds,
  tracks: clip.tracks.map((t) => ({
    ...t,
    times: t.times.map((v) => (v / clip.seconds) * seconds),
  })),
});

/** `n` vertices all on one arm bone, 3 cm round it. */
function heavySkin(n: number) {
  const arms = radial(2, 5).bones;
  const bone = arms.findIndex((b) => b.name === 'arm_0_2');
  const positions = new Float32Array(n * 3);
  const joints = new Uint16Array(n * 4);
  const weights = new Float32Array(n * 4);
  for (let v = 0; v < n; v++) {
    positions.set([0.4 + (0.2 * v) / n, 0.03 * dmath.cos(v), 1 + 0.03 * dmath.sin(v)], v * 3);
    joints[v * 4] = bone;
    weights[v * 4] = 1;
  }
  const mesh: Mesh = {
    positions,
    normals: new Float32Array(n * 3),
    uvs: new Float32Array(n * 2),
    colors: new Float32Array(n * 3).fill(0.5),
    indices: Uint32Array.from([0, 1, 2]),
    joints,
    weights,
  };
  return compile(
    defineAsset({
      name: 'heavy',
      kind: 'creature',
      medium: 'water',
      budget: { triangles: [9, 9, 9], bones: 64 },
      clips: [swing('arm_0_0', [0, 0, 1], 10)],
      build(ctx) {
        for (const b of arms) ctx.bone(b.name, b);
        ctx.part('skin', mesh);
      },
    }),
  );
}

describe('chain-cross', () => {
  it('fails a crossing that exists only at a key between two sampled frames', () => {
    // 0.05 s is under one 15 fps frame: apart at both ends, through the other arm at the middle key.
    const flick = squeezed(swing('arm_0_0', [0, 0, 1], 180), 0.05);
    const [f, ...rest] = chainCrossFindings(rigged(radial(2, 5).bones, [flick]));
    expect(rest).toEqual([]);
    expect(f?.message).toContain('0.025 s');
  });

  it('reads a very heavy skin in linear time', () => {
    const asset = heavySkin(100_000);
    const start = performance.now();
    expect(chainCrossFindings(asset)).toEqual([]);
    expect(performance.now() - start).toBeLessThan(3000);
  }, 60_000);

  it('fails an arm swung through another', () => {
    const arms = radial(2, 5);
    const [f, ...rest] = chainCrossFindings(rigged(arms.bones, [swing('arm_0_0', [0, 0, 1], 180)]));
    expect(rest).toEqual([]);
    expect(f?.code).toBe('T3D_QA_CHAIN_CROSS');
    expect(f?.message).toContain("clip 'idle'");
    expect(f?.fix.length).toBeGreaterThan(0);
  });

  it('measures thickness from the skin: fat arms collide where thin ones pass', () => {
    // The swing brings arm a's tip 0.25 m from arm b.
    expect(chainCrossFindings(pair(0.2, -48.6))).toHaveLength(1);
    expect(chainCrossFindings(pair(0.05, -48.6))).toEqual([]);
    expect(chainCrossFindings(pair(null, -48.6))).toEqual([]);
  });

  it('gives an unskinned limb the same thickness at every link count', () => {
    // The swung arm's axis misses the other by 0.1 m: a near miss at LOD0 and at LOD2 alike.
    for (const links of [4, 20]) {
      const arms = radial(2, links);
      expect(chainCrossFindings(rigged(arms.bones, [swing('arm_0_0', [0, 0, 1], 150)]))).toEqual(
        [],
      );
    }
  });

  it('passes arms that swing but stay apart, and arms meeting only at the hub', () => {
    const arms = radial(8, 6);
    expect(chainCrossFindings(rigged(arms.bones, [swing('arm_0_0', [0, 0, 1], 15)]))).toEqual([]);
  });

  it('has nothing to say below two long chains', () => {
    const short = radial(4, 3);
    expect(chainCrossFindings(rigged(short.bones, [swing('arm_0_0', [0, 0, 1], 90)]))).toEqual([]);
    const one = radial(1, 8);
    expect(chainCrossFindings(rigged(one.bones, [swing('arm_0_0', [0, 0, 1], 90)]))).toEqual([]);
  });

  it('measures segment distance, crossing and parallel', () => {
    const a: readonly [Vec3, Vec3] = [
      [-1, 0, 0],
      [1, 0, 0],
    ];
    const b: readonly [Vec3, Vec3] = [
      [0, -1, 0.3],
      [0, 1, 0.3],
    ];
    expect(segmentDistance(a, b)).toBeCloseTo(0.3, 9);
    const c: readonly [Vec3, Vec3] = [
      [3, 0, 0.4],
      [5, 0, 0.4],
    ];
    expect(segmentDistance(a, c)).toBeCloseTo(dmath.hypot(2, 0.4), 9);
  });
});
