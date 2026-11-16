import { describe, expect, it } from 'bun:test';
import { compile, defineAsset } from '../core/index.ts';
import { decodePng } from '../material/index.ts';
import { box } from '../primitives/index.ts';
import { silhouetteSheet } from './silhouette-sheet.ts';

/** A crate whose lid height and handle follow the seed. */
const crate = defineAsset({
  name: 'crate',
  kind: 'prop',
  budget: { triangles: [100, 100, 100] },
  build(ctx) {
    ctx.part('body', box({ size: [1, 0.6, 0.4 + ctx.rng.range(0, 0.6)], color: [0.5, 0.4, 0.3] }));
    if (ctx.seed % 2 === 0)
      ctx.part('handle', box({ size: [0.2, 0.1, 0.3], at: [0, 0, 1], color: [0.2, 0.2, 0.2] }));
  },
});

describe('silhouetteSheet', () => {
  const variants = [1, 2, 3, 4].map((seed) => ({
    label: `s${seed}`,
    asset: compile(crate, { seed }),
  }));
  const sheet = silhouetteSheet(variants, { cell: 64, cols: 2 });

  it('lays N variants out in a grid PNG with a score each', () => {
    expect([sheet.width, sheet.height]).toEqual([128, 2 * (64 + 14)]);
    expect(decodePng(sheet.png).width).toBe(128);
    expect(sheet.scores.map((s) => s.label)).toEqual(['s1', 's2', 's3', 's4']);
    for (const s of sheet.scores) expect(s.score).toBeGreaterThanOrEqual(0);
  });

  it('a handle makes a silhouette more complex than the plain box', () => {
    const c = sheet.scores.map((s) => s.complexity);
    expect(Math.min(c[1] ?? 0, c[3] ?? 0)).toBeGreaterThan(Math.max(c[0] ?? 0, c[2] ?? 0));
  });

  it('is deterministic', () => {
    expect(Bun.hash(silhouetteSheet(variants, { cell: 64, cols: 2 }).png)).toBe(
      Bun.hash(sheet.png),
    );
  });
});
