import { describe, expect, it } from 'bun:test';
import {
  boundsOf,
  compile,
  defineAsset,
  type Lod,
  Ts23dError,
  triangleCount,
} from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { runQa } from '../qa/index.ts';
import { facade } from './building.ts';
import { type OpeningOptions, opening } from './openings.ts';

const win: OpeningOptions = {
  kind: 'window',
  width: 0.9,
  height: 1.6,
  at: [3, 0, 1],
  facing: 'front',
  glass: [0.1, 0.15, 0.2],
  frame: [0.9, 0.9, 0.85],
  wall: [0.6, 0.3, 0.2],
};

describe('opening', () => {
  it('rejects a degenerate opening with a fix', () => {
    try {
      opening({ ...win, width: 0 });
      throw new Error('expected a throw');
    } catch (e) {
      expect(e).toBeInstanceOf(Ts23dError);
      expect((e as Ts23dError).code).toBe('T3D_RECIPE_INVALID');
      expect((e as Ts23dError).fix).toContain('0.2 m');
    }
  });

  it('sits on the wall face and projects outward on the facing side only', () => {
    const front = boundsOf(opening(win));
    expect(front.min[0]).toBeCloseTo(3, 6);
    expect(front.max[0]).toBeGreaterThan(3.15);
    // Sill hangs below the opening, lintel rises above it.
    expect(front.min[2]).toBeCloseTo(1 - 0.07, 6);
    expect(front.max[2]).toBeCloseTo(1 + 1.6 + 0.22, 6);
    const left = boundsOf(opening({ ...win, at: [0, 2, 1], facing: 'left' }));
    expect(left.min[1]).toBeCloseTo(2, 6);
    expect(left.max[1]).toBeGreaterThan(2.15);
    const back = boundsOf(opening({ ...win, at: [-3, 0, 1], facing: 'back' }));
    expect(back.max[0]).toBeCloseTo(-3, 6);
  });

  it('gives doors no sill and drops detail per LOD', () => {
    const door = boundsOf(opening({ ...win, kind: 'door', height: 2.1, at: [3, 0, 0] }));
    expect(door.min[2]).toBeCloseTo(0, 6);
    for (const kind of ['window', 'door'] as const) {
      const t = ([0, 1, 2] as Lod[]).map((l) => triangleCount(opening({ ...win, kind }, l)));
      expect(t[0]).toBeGreaterThan(t[1] ?? 0);
      expect(t[1]).toBeGreaterThan(t[2] ?? 0);
      expect(t[2]).toBe(10);
    }
  });

  it('upgrades facade slots with `kit` and keeps every part attached', () => {
    const a = defineAsset({
      name: 'terrace',
      kind: 'building',
      budget: { triangles: [20000, 6000, 800] },
      build(ctx) {
        ctx.part('walls', box({ size: [7, 10, 6], color: [0.6, 0.3, 0.2] }));
        facade(ctx, {
          prefix: 'win',
          at: [0, 0, 0],
          footprint: [7, 10],
          floors: 2,
          floorHeight: 3,
          grammar: 'pier:~ | {win:1.6 | pier:0.9}* | pier:~',
          ground: 'pier:~ | door:1.5 | pier:~',
          sides: ['front', 'left'],
          glass: [0.1, 0.15, 0.2],
          kit: { wall: [0.6, 0.3, 0.2] },
        });
      },
    });
    const c = compile(a);
    expect(c.parts.filter((p) => p.name.startsWith('win_front_1_')).length).toBe(4);
    expect(c.parts.some((p) => p.name.startsWith('win_left_0_'))).toBe(true);
    for (const lod of [0, 1, 2] as Lod[]) expect(runQa(compile(a, { lod }))).toEqual([]);
  });
});
