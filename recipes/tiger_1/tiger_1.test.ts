// Tiger I stands on its tracks at every LOD: nothing below z = 0 (the open LOD2 belt and
// link-by-link LOD0 belt) and the lowest point on the ground (±2 mm).
import { describe, expect, it } from 'bun:test';
import { box, defineAsset, hex, type Mesh } from '@developerz.ai/ts23d';
import { assertUprightOnGround } from '@developerz.ai/ts23d/testing';
import { farDisc, tiger_1 } from './tiger_1.ts';

describe('tiger_1 on the ground', () => {
  it('the check fails a track 1.4 cm under the ground', () => {
    const sunk = defineAsset({
      name: 'sunk_track',
      kind: 'prop',
      budget: { triangles: [100, 100, 100] },
      build(ctx) {
        ctx.part(
          'track_l',
          box({ size: [5, 0.55, 0.06], at: [0, 0, -0.014], color: hex('#4a4139') }),
        );
      },
    });
    expect(() => assertUprightOnGround(sunk, { eps: 0.002 })).toThrow(/below the ground/);
  });

  for (const asset of [tiger_1])
    it(`${asset.name} rests on z = 0 at every LOD`, () => {
      expect(Math.abs(assertUprightOnGround(asset, { eps: 0.002 }))).toBeLessThanOrEqual(0.002);
    });
});

describe('tiger_1 LOD2 running gear', () => {
  /** Stretches along the axle (y) that no triangle spans: daylight between hub and disc. */
  const slits = (m: Mesh): [number, number][] => {
    const spans: [number, number][] = [];
    for (let t = 0; t < m.indices.length; t += 3) {
      const ys = [0, 1, 2].map((k) => m.positions[(m.indices[t + k] ?? 0) * 3 + 1] ?? 0);
      spans.push([Math.min(...ys), Math.max(...ys)]);
    }
    const levels = [...new Set(spans.flat().map((v) => Math.round(v * 1e5) / 1e5))].sort(
      (a, b) => a - b,
    );
    const out: [number, number][] = [];
    for (let i = 0; i + 1 < levels.length; i++) {
      const [a = 0, b = 0] = [levels[i], levels[i + 1]];
      if (!spans.some(([lo, hi]) => lo <= a + 1e-5 && hi >= b - 1e-5)) out.push([a, b]);
    }
    return out;
  };
  for (const [name, r, hub] of [
    ['sprocket', 0.35, 0.5],
    ['idler', 0.36, 0.18],
  ] as const)
    it(`the ${name}'s hub runs into its disc (no daylight along the axle)`, () => {
      expect(slits(farDisc(r, 0.2, hub))).toEqual([]);
    });
});
