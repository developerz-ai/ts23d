// gait: a planted foot that slides, a foot through the floor and a loop that does not close fail.

import { describe, expect, it } from 'bun:test';
import {
  type Armature,
  type Clip,
  type CompiledAsset,
  compile,
  defineAsset,
  translate,
} from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { radial, rigged, spine } from './chain-fixtures.ts';
import { feetOf, gaitFindings, SLIDE_LIMIT } from './gait.ts';
import { SKIN_SINK_LIMIT } from './gait-skin.ts';
import { rig, walk, walkerBones } from './motion-fixtures.ts';

/** The one-leg walker with a boot skinned to its leg (sole at z = `sole`), bobbing in place:
 *  the root dips `dip` metres at mid-clip and comes back. */
function bobber(dip: number, sole = 0): CompiledAsset {
  const times = Float32Array.from([0, 0.5, 1]);
  const clip: Clip = {
    name: 'idle',
    seconds: 1,
    loop: true,
    tracks: [
      {
        bone: 'root',
        path: 'translation',
        times,
        values: Float32Array.from([0, 0, 0, 0, 0, -dip, 0, 0, 0]),
      },
    ],
  };
  return compile(
    defineAsset({
      name: 'bobber',
      kind: 'prop',
      budget: { triangles: [999, 999, 999] },
      clips: [clip],
      build(ctx) {
        for (const b of walkerBones) ctx.bone(b.name, b);
        const boot = translate(box({ size: [0.2, 0.1, 0.1], color: [0.5, 0.5, 0.5] }), [
          0,
          0,
          sole,
        ]);
        const n = boot.positions.length / 3;
        const joints = new Uint16Array(n * 4);
        const weights = new Float32Array(n * 4);
        for (let v = 0; v < n; v++) {
          joints[v * 4] = 1;
          weights[v * 4] = 1;
        }
        ctx.part('boot', { ...boot, joints, weights });
      },
    }),
  );
}

describe('gait', () => {
  it('fails a planted foot that slides 1 cm a frame at the root speed', () => {
    const f = gaitFindings(rig(walk(0.3)));
    const slide = f.find((x) => x.code === 'T3D_GAIT_FOOT_SLIDE');
    expect(slide?.message).toContain("foot 'leg' slides");
    expect(slide?.fix).toContain('stride');
  });

  it('fails a loop whose last key is not its first', () => {
    expect(gaitFindings(rig(walk(0, 0.3))).some((x) => x.message.includes('does not loop'))).toBe(
      true,
    );
  });

  it('fails a foot that sinks below its rest height', () => {
    const c = walk(0);
    const sunk: Clip = {
      ...c,
      tracks: c.tracks.map((t) =>
        t.path === 'translation'
          ? { ...t, values: t.values.map((v, k) => (k % 3 === 2 ? -0.01 : v)) }
          : t,
      ),
    };
    expect(gaitFindings(rig(sunk)).some((x) => x.message.includes('sinks'))).toBe(true);
  });

  it('passes a foot held in place while the root travels (the leg leans as the body passes)', () => {
    // The arc lifts the foot off the band except near vertical: no frame pair slides > 1 mm.
    const f = gaitFindings(rig(walk(0)));
    expect(f.filter((x) => x.code === 'T3D_GAIT_FOOT_SLIDE')).toEqual([]);
    expect(SLIDE_LIMIT).toBe(0.001);
  });

  it('fails an in-place clip that pushes the skin of a foot under the floor', () => {
    const f = gaitFindings(bobber(0.01));
    expect(f).toHaveLength(1);
    expect(f[0]?.code).toBe('T3D_QA_GAIT');
    expect(f[0]?.message).toContain(
      "the skin of foot 'leg' sinks 10.0 mm under the floor at frame 15",
    );
    expect(f[0]?.fix).toContain("raise the clip's root by 10.0 mm");
  });

  it('passes a dip inside the limit, and a sole that already rests under z = 0 (not the clip)', () => {
    expect(gaitFindings(bobber(SKIN_SINK_LIMIT - 0.001))).toEqual([]);
    expect(gaitFindings(bobber(0, -0.02))).toEqual([]);
    // …but the limit is counted from that rest sole, not waived.
    expect(gaitFindings(bobber(0.01, -0.02))).toHaveLength(1);
  });

  it('finds feet as low leaf bones, never `_mid` helpers', () => {
    const sk: Armature = {
      bones: [
        ...walkerBones,
        { name: 'leg_mid', parent: 'root', head: [0, 0, 0.5], tail: [0, 0, 0.01] },
      ],
    };
    expect(feetOf(sk).map((b) => b.name)).toEqual(['leg']);
  });

  it('fails nothing on a water asset for feet it does not have, but still checks its loops', () => {
    const swimmer = rigged(walkerBones, [walk(0.3)]);
    expect(gaitFindings(swimmer).filter((x) => x.code === 'T3D_GAIT_FOOT_SLIDE')).toEqual([]);
    expect(gaitFindings(rigged(walkerBones, [walk(0, 0.3)]))[0]?.message).toContain(
      'does not loop',
    );
  });

  it('does not call the tips of arms lying on the ground feet, at any link count', () => {
    for (const links of [3, 5, 8, 24]) expect(feetOf(radial(8, links, 1, 0.005))).toEqual([]);
  });

  it('does not call a serpent lying on the ground feet', () => {
    const flat = spine(12, 2).map((b) => ({
      ...b,
      head: [b.head[0], b.head[1], 0.01] as const,
      tail: [b.tail[0], b.tail[1], 0.01] as const,
    }));
    expect(feetOf({ bones: flat })).toEqual([]);
  });

  it('does not call a long chain hanging straight down a leg', () => {
    const bones: Armature['bones'] = [
      { name: 'hub', head: [0, 0, 1], tail: [0.1, 0, 1] },
      ...Array.from({ length: 8 }, (_, i) => ({
        name: `arm_${i}`,
        parent: i === 0 ? 'hub' : `arm_${i - 1}`,
        head: [0, 0, 1 - i / 8] as const,
        tail: [0, 0, 1 - (i + 1) / 8 + 0.001] as const,
      })),
    ];
    expect(feetOf({ bones })).toEqual([]);
  });

  it('keeps a jointed leg and a flat toe branching off a foot', () => {
    const bones: Armature['bones'] = [
      { name: 'hip', head: [0, 0, 1], tail: [0.2, 0, 1] },
      { name: 'thigh', parent: 'hip', head: [0, 0, 1], tail: [0, 0, 0.5] },
      { name: 'shin', parent: 'thigh', head: [0, 0, 0.5], tail: [0, 0, 0.05] },
      { name: 'toe_a', parent: 'shin', head: [0, 0, 0.05], tail: [0.1, 0.02, 0.02] },
      { name: 'toe_b', parent: 'shin', head: [0, 0, 0.05], tail: [0.1, -0.02, 0.02] },
    ];
    expect(feetOf({ bones }).map((b) => b.name)).toEqual(['toe_a', 'toe_b']);
  });
});
