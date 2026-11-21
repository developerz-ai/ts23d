// The faction perimeter reads as a defensive wall, not a kerb, and it has lived on a salt flat:
// chest-high for a 1.8 m Warden, and the plinth darker than the dressed blocks above it where
// brine splash and standing water wick up (D592). Failure first: a clean wall must fail.

import { describe, expect, it } from 'bun:test';
import { box, compile, defineAsset, hex, type Lod } from '@developerz.ai/ts23d';

type Compiled = ReturnType<typeof compile>;

import { perimeter } from './ground.ts';

const walls = (lod: Lod): Compiled =>
  compile(
    defineAsset({
      name: 'rts_perimeter',
      kind: 'scene',
      budget: { triangles: [6000, 2000, 400] },
      build: perimeter,
    }),
    { lod },
  );

/** Mean luminance of the perimeter's vertices in a height band [z0, z1). */
function luminance(c: Compiled, z0: number, z1: number): number {
  let sum = 0;
  let n = 0;
  for (const p of c.parts) {
    const m = p.mesh;
    if (!m) continue;
    for (let i = 0; i < m.positions.length / 3; i++) {
      const z = m.positions[i * 3 + 2] ?? 0;
      if (z < z0 || z >= z1) continue;
      sum +=
        0.2126 * (m.colors[i * 3] ?? 0) +
        0.7152 * (m.colors[i * 3 + 1] ?? 0) +
        0.0722 * (m.colors[i * 3 + 2] ?? 0);
      n++;
    }
  }
  return n ? sum / n : Number.NaN;
}

/** The foot is at least this much darker than the block course (grime ratio). */
const MAX_FOOT_RATIO = 0.75;
/** Chest-high on a 1.8 m figure: a wall, not a kerb (was 0.95 m). */
const MIN_HEIGHT = 1.15;

describe('perimeter wall', () => {
  it('fails a clean wall (foot as bright as the blocks)', () => {
    const clean = compile(
      defineAsset({
        name: 'clean_wall',
        kind: 'prop',
        budget: { triangles: [12, 12, 12] },
        build(ctx) {
          ctx.part('wall', box({ size: [2.4, 0.5, 1.2], color: hex('#cfc4a8') }));
        },
      }),
      { lod: 0 },
    );
    expect(luminance(clean, -0.01, 0.02) / luminance(clean, 0.5, 1.3)).toBeGreaterThan(
      MAX_FOOT_RATIO,
    );
  });

  for (const lod of [0, 1, 2] as Lod[])
    it(`LOD${lod}: chest-high, the plinth darker than the blocks`, () => {
      const c = walls(lod);
      let top = 0;
      for (const p of c.parts)
        for (let i = 2; i < (p.mesh?.positions.length ?? 0); i += 3)
          top = Math.max(top, p.mesh?.positions[i] ?? 0);
      expect(top).toBeGreaterThanOrEqual(MIN_HEIGHT);
      const foot = luminance(c, -0.01, 0.02);
      const body = luminance(c, 0.5, 1.3);
      expect(foot / body).toBeLessThanOrEqual(MAX_FOOT_RATIO);
    });
});
