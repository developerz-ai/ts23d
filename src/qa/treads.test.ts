import { describe, expect, it } from 'bun:test';
import { box, compile, defineAsset, tread } from '../index.ts';
import { treads } from './treads.ts';

const line: [number, number][] = [
  [-1, 0],
  [1, 0],
  [1, 0.5],
  [-1, 0.5],
];

const tank = (moving: boolean) =>
  compile(
    defineAsset({
      name: 'belt_probe',
      kind: 'vehicle',
      budget: { triangles: [9999, 9999, 9999] },
      build(ctx) {
        ctx.part(
          'track_l',
          box({ size: [2, 0.4, 0.5], at: [0, 1, 0.25], color: [0.3, 0.3, 0.3] }),
          {
            ...(moving ? { motion: tread(line, 1, 0.2) } : {}),
          },
        );
        ctx.part('track_dust_l', box({ size: [0.1, 0.1, 0.1], color: [0.3, 0.3, 0.3] }));
      },
    }),
  );

describe('treads gate', () => {
  it('fails a static track belt', () => {
    const f = treads(tank(false));
    expect(f.map((x) => x.part)).toEqual(['track_l']);
    expect(f[0]?.fix).toContain('tread(');
  });

  it('passes a belt with a tread motion and ignores other track_* names', () => {
    expect(treads(tank(true))).toEqual([]);
  });
});
