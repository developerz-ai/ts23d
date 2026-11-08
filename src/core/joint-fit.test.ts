import { describe, expect, it } from 'bun:test';
import { box, cylinder, lathe } from '../primitives/index.ts';
import { compile, defineAsset, jointFit } from './index.ts';

const C: [number, number, number] = [0.8, 0.7, 0.6];

/** A 2.4 cm peg (an eyeball) seated in a `hole`-radius bore of a 20 cm plate (the skull). */
const seated = (hole: number, open = false) =>
  defineAsset({
    name: 'seated',
    kind: 'character',
    budget: { triangles: [9999, 9999, 9999] },
    build(ctx) {
      // A ring (the bore's wall) or, `open`, a block beside the peg that never closes round it.
      const wall: [number, number][] = [
        [hole, 0.95],
        [0.1, 0.95],
        [0.1, 1.05],
        [hole, 1.05],
        [hole, 0.95],
      ];
      ctx.part(
        'head',
        open
          ? box({ size: [0.2, 0.1, 0.1], at: [0, -0.05 - hole, 0.95], color: C })
          : lathe({ profile: wall, segments: 48, color: C }),
      );
      ctx.part(
        'eye',
        cylinder({ radius: 0.012, length: 0.04, segments: 32, color: C, at: [0, 0, 1.05] }),
      );
      ctx.joint('orbit', {
        from: 'eye',
        to: 'head',
        at: [0, 0, 1.05],
        axis: [0, 0, -1],
        kind: 'socket',
      });
    },
  });

/** Forearm Ø8 cm meeting a hand Ø8 cm; the hand part also has a far piece 30 cm away. */
const wristWithFarPiece = () =>
  defineAsset({
    name: 'far',
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
      ctx.part('hand_palm', box({ size: [0.1, 0.08, 0.08], at: [0.35, 0, 0.96], color: C }));
      ctx.part('hand_ring', box({ size: [0.1, 0.02, 0.02], at: [0.35, 0.3, 0.99], color: C }));
      ctx.joint('wrist', { from: 'forearm', to: 'hand', at: [0.3, 0, 1], axis: [1, 0, 0] });
    },
  });

const fit = (a: ReturnType<typeof defineAsset>) => {
  const c = compile(a, { lod: 0 });
  return jointFit(c, c.joints?.[0] ?? (null as never));
};
const codes = (f: ReturnType<typeof fit>) => f.findings.map((x) => x.message.split(' ')[0]);

describe('local joint sections', () => {
  it('fails a peg rattling in a bore far wider than it', () => {
    const f = fit(seated(0.022));
    expect(codes(f)).toContain('T3D_JOINT_MISMATCH');
    expect(f.findings[0]?.message).toMatch(/2\.4 cm on eye vs 4\.4 cm on head/);
  });
  it('fails a socket that cannot close round the peg (judged by its local outline)', () => {
    const f = fit(seated(0.0125, true));
    // Only the block's near wall lies within reach: a flat 0 cm "socket" beside a 2.4 cm peg.
    expect(codes(f)).toContain('T3D_JOINT_MISMATCH');
    expect(f.to?.width ?? 1).toBeLessThan(0.005);
  });
  it('compares a peg with its bore, not the whole plate', () => {
    const f = fit(seated(0.0125));
    expect(f.findings).toEqual([]);
    // The plate is 20 cm across; the socket is measured at its 2.5 cm opening.
    expect(f.to?.width ?? 0).toBeCloseTo(0.025, 3);
    expect(f.from?.width ?? 0).toBeCloseTo(0.024, 3);
  });
  it('ignores a far piece of the same part crossing the joint plane', () => {
    const f = fit(wristWithFarPiece());
    expect(f.findings).toEqual([]);
    expect(f.to?.width ?? 0).toBeCloseTo(0.08, 2);
  });
});
