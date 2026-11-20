import { describe, expect, it } from 'bun:test';
import {
  compile,
  createRng,
  defineAsset,
  dmath,
  type Mesh,
  translate,
  type Vec3,
} from '../core/index.ts';
import type { UvRect } from '../material/index.ts';
import { hairCards } from '../passes/hair-cards.ts';
import { hairFlow } from '../passes/hair-flow.ts';
import { sdf } from '../primitives/index.ts';
import {
  cardRootProof,
  cardRoots,
  type FurSilhouetteZone,
  furSilhouette,
} from './fur-silhouette.ts';

const R = 0.3;
const C: Vec3 = [0, 0, 0.5];
const field = (p: Vec3): number => dmath.hypot(p[0] - C[0], p[1] - C[1], p[2] - C[2]) - R;
const ball = sdf({
  field,
  bounds: [
    [-0.35, -0.35, 0.15],
    [0.35, 0.35, 0.85],
  ],
  resolution: 0.02,
  color: () => [0.4, 0.35, 0.3],
});
const CELL: UvRect = { u0: 0.1, u1: 0.2, v0: 0.5, v1: 0.51, metres: 1 };
const coat = hairCards({
  surface: ball,
  flow: hairFlow(ball, () => [-1, 0, -0.3]),
  zones: [
    {
      name: 'guard',
      density: () => 900,
      length: 0.06,
      width: 0.012,
      lift: 0.7,
      bend: 0.4,
      cells: [CELL],
    },
  ],
  rng: createRng(2),
  field,
}).mesh;

const asset = (cards: Mesh | null) =>
  compile(
    defineAsset({
      name: 'furball',
      kind: 'creature',
      budget: { triangles: [100000, 100000, 100000] },
      build(ctx) {
        ctx.part('body', ball);
        if (cards) ctx.part('fur', cards, { surface: 'cutout' });
      },
    }),
  );
const top: FurSilhouetteZone = {
  name: 'back',
  coat: 'fur',
  on: 'body',
  at: [0, 0, C[2] + R],
  radius: 0.12,
};

describe('furSilhouette', () => {
  it('fails: a bald body (no coat part) leaves the outline smooth', () => {
    const f = furSilhouette(asset(null), [top]);
    expect(f).toHaveLength(1);
    expect(f[0]?.code).toBe('T3D_FUR_SILHOUETTE');
    expect(f[0]?.message).toMatch(/zone 'back': outline 1\.00×/);
  });

  it('passes when guard-hair cards break the outline', () => {
    expect(furSilhouette(asset(coat), [top])).toEqual([]);
  });

  it('fails: a zone off the outline in every view is reported, not skipped', () => {
    const inside: FurSilhouetteZone = { ...top, at: C, radius: 0.05 };
    expect(furSilhouette(asset(coat), [inside])[0]?.message).toMatch(/not on the outline/);
  });
});

describe('cardRootProof', () => {
  it('fails: cards lifted off the body have roots outside it', () => {
    const lifted = translate(coat, [0, 0, 0.05]);
    const p = cardRootProof(lifted, ball);
    expect(p.outside.length).toBeGreaterThan(p.roots * 0.3);
  });

  it('every buried root is inside the parent solid', () => {
    const p = cardRootProof(coat, ball);
    expect(p.roots).toBe(cardRoots(coat).length);
    expect(p.roots).toBeGreaterThan(100);
    expect(p.outside).toEqual([]);
  });
});
