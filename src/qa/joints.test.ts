import { describe, expect, it } from 'bun:test';
import { compile, defineAsset, type JointKind, jointFit } from '../core/index.ts';
import { box, cylinder, lathe } from '../primitives/index.ts';
import { joints } from './joints.ts';

const C: [number, number, number] = [0.8, 0.7, 0.6];

/** Forearm Ø8 cm along +X ending at x = 0.3; a hand box `hand` m square from there on. */
const wrist = (hand: number, o: { gap?: number; dy?: number; kind?: JointKind } = {}) =>
  defineAsset({
    name: 'wrist',
    kind: 'character',
    budget: { triangles: [9999, 9999, 9999] },
    build(ctx) {
      ctx.part(
        'forearm',
        cylinder({
          radius: 0.04,
          length: 0.3,
          segments: 24,
          axis: 'x',
          color: C,
          at: [0.15, 0, 1],
        }),
      );
      const x = 0.3 + (o.gap ?? 0);
      ctx.part(
        'hand_palm',
        box({ size: [0.1, hand, hand], at: [x + 0.05, o.dy ?? 0, 1 - hand / 2], color: C }),
      );
      ctx.joint('wrist', {
        from: 'forearm',
        to: 'hand',
        at: [0.3, 0, 1],
        axis: [1, 0, 0],
        ...(o.kind ? { kind: o.kind } : {}),
      });
    },
  });

/** A fist (a tube of inner radius `fist`) around a handle of radius `handle`, both along Z. */
const grip = (handle: number, fist: number) =>
  defineAsset({
    name: 'grip',
    kind: 'prop',
    budget: { triangles: [9999, 9999, 9999] },
    build(ctx) {
      ctx.part(
        'sword_grip',
        cylinder({ radius: handle, length: 0.2, segments: 24, color: C, at: [0, 0, 1] }),
      );
      ctx.part(
        'hand',
        lathe({
          profile: [
            [fist, 0.95],
            [fist + 0.03, 0.95],
            [fist + 0.03, 1.05],
            [fist, 1.05],
            [fist, 0.95],
          ],
          segments: 24,
          color: C,
        }),
      );
      ctx.joint('grip', {
        from: 'hand',
        to: 'sword',
        at: [0, 0, 1],
        axis: [0, 0, 1],
        kind: 'grip',
      });
    },
  });

describe('joints gate', () => {
  it('fails a hand twice the wrist, with both sizes, the % and a scale fix', () => {
    const [f] = joints(compile(wrist(0.16)));
    expect(f?.message).toContain('T3D_JOINT_MISMATCH');
    expect(f?.message).toContain('8.0 cm');
    expect(f?.message).toContain('16.0 cm');
    expect(f?.message).toContain('100%');
    expect(f?.fix).toContain('×0.50');
  });

  it('fails a hand floating 5 cm off the wrist', () => {
    const f = joints(compile(wrist(0.08, { gap: 0.05 })));
    expect(f.map((x) => x.message.split(' ')[0])).toContain('T3D_JOINT_GAP');
  });

  it('fails a hand slid off-centre', () => {
    const f = joints(compile(wrist(0.08, { dy: 0.05 })));
    expect(f.map((x) => x.message.split(' ')[0])).toContain('T3D_JOINT_OFFSET');
  });

  it('fails a joint naming a part that does not exist', () => {
    const asset = defineAsset({
      name: 'lonely',
      kind: 'prop',
      budget: { triangles: [99, 99, 99] },
      build(ctx) {
        ctx.part('a', box({ size: [1, 1, 1], color: C }));
        ctx.joint('j', { from: 'a', to: 'b', at: [0, 0, 1], axis: [0, 0, 1] });
      },
    });
    expect(joints(compile(asset))[0]?.message).toContain("no part matches 'b'");
  });

  it('passes a hand sized to the wrist', () => {
    expect(joints(compile(wrist(0.085)))).toEqual([]);
  });

  it('measures both sections', () => {
    const a = compile(wrist(0.085));
    const fit = jointFit(a, a.joints?.[0] ?? (null as never));
    expect(fit.from?.width).toBeCloseTo(0.08, 2);
    expect(fit.to?.width).toBeCloseTo(0.085, 3);
  });
});

describe('grip joints', () => {
  it('fails a handle too thin for the fist', () => {
    const [f] = joints(compile(grip(0.008, 0.016)));
    expect(f?.message).toContain('T3D_JOINT_MISMATCH');
    expect(f?.message).toContain('too thin');
  });

  it('fails a handle too thick for the fist', () => {
    expect(joints(compile(grip(0.03, 0.016)))[0]?.message).toContain('too thick');
  });

  it('passes a handle the fist closes on', () => {
    expect(joints(compile(grip(0.016, 0.016)))).toEqual([]);
  });
});

describe('ctx.joint', () => {
  it('rejects a zero axis', () => {
    const bad = defineAsset({
      name: 'bad',
      kind: 'prop',
      budget: { triangles: [9, 9, 9] },
      build(ctx) {
        ctx.joint('j', { from: 'a', to: 'b', at: [0, 0, 0], axis: [0, 0, 0] });
      },
    });
    expect(() => compile(bad)).toThrow('axis');
  });

  it('carries a used asset’s joints, prefixed and moved', () => {
    const scene = defineAsset({
      name: 'scene',
      kind: 'scene',
      budget: { triangles: [9999, 9999, 9999] },
      build(ctx) {
        ctx.use(wrist(0.085), { prefix: 'npc', at: [2, 0, 0], yaw: Math.PI / 2 });
      },
    });
    const c = compile(scene);
    const j = c.joints?.[0];
    expect(j?.name).toBe('npc_wrist');
    expect(j?.from).toBe('npc_forearm');
    expect(j?.at[0]).toBeCloseTo(2, 6);
    expect(j?.at[1]).toBeCloseTo(0.3, 6);
    expect(j?.axis[1]).toBeCloseTo(1, 6);
    expect(joints(c)).toEqual([]);
  });
});
