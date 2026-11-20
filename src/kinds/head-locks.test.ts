import { afterAll, describe, expect, it } from 'bun:test';
import { createRng, dmath, type Vec3 } from '../core/index.ts';
import { materialSnapshot, type StripId, stripRect } from '../material/index.ts';
import { type CardLayer, scalpCards } from './head-cards.ts';
import { lockLayers } from './head-locks.ts';

// Put back what other test files' recipes defined at import (D334).
afterAll(materialSnapshot());

// A 10 cm ball head, hair on its upper half, combed back (-X).
const ball = (p: Vec3): number => dmath.norm(p) - 0.1;
const hair: CardLayer = {
  name: 'hair',
  kind: 'hair',
  region: (p) => 0.02 - p[2],
  density: 3000,
  length: 0.05,
  width: 0.02,
  fold: 0.5,
  tone: [0.6, 1],
};
const opts = (layers: readonly CardLayer[], locks?: object) => ({
  field: ball,
  bounds: [
    [-0.12, -0.12, -0.12],
    [0.12, 0.12, 0.12],
  ] as [Vec3, Vec3],
  cell: 0.008,
  comb: (): Vec3 => [-1, 0, -0.3],
  layers,
  color: [0.2, 0.12, 0.06] as Vec3,
  lod: 0,
  rng: createRng(4),
  ...(locks ? { locks } : {}),
});

/** V range of a mesh's UVs. */
const vRange = (uv: Float32Array): [number, number] => {
  let lo = 1;
  let hi = 0;
  for (let i = 1; i < uv.length; i += 2) {
    lo = Math.min(lo, uv[i] ?? 0);
    hi = Math.max(hi, uv[i] ?? 0);
  }
  return [lo, hi];
};

describe('lockLayers (D461)', () => {
  it('fails if a hair layer is not split into a dark under-layer, narrow locks and flyaways', () => {
    const out = lockLayers([hair], {}, 0);
    expect(out.map((l) => [l.name, l.kind])).toEqual([
      ['hair_under', 'mass'],
      ['hair', 'hair'],
      ['hair_fly', 'wisp'],
    ]);
    const [under, mid, fly] = out;
    // Narrower, denser, same coverage; flat (a narrow card is the lock), clumped.
    expect(mid?.width).toBeCloseTo(0.01);
    expect((mid?.density ?? 0) * (mid?.width ?? 0)).toBeCloseTo(hair.density * hair.width);
    expect(mid?.fold).toBe(0);
    expect(mid?.clump).toBeGreaterThanOrEqual(2);
    expect(under?.tone?.[0]).toBeLessThan(0.6);
    expect(fly?.density).toBeLessThan((mid?.density ?? 0) * 0.1);
  });

  it('drops the flyaways past LOD0, and an under share of 0 drops the under-layer', () => {
    expect(lockLayers([hair], {}, 1).map((l) => l.name)).toEqual(['hair_under', 'hair']);
    expect(lockLayers([{ ...hair, under: 0, fly: 0 }], {}, 0).map((l) => l.name)).toEqual(['hair']);
  });

  it('never narrows a card under 4 mm: brows and lashes keep their width', () => {
    const lash: CardLayer = { ...hair, name: 'lashes', kind: 'beard', width: 0.0026 };
    const beard: CardLayer = { ...hair, name: 'beard', kind: 'beard', width: 0.012 };
    const [l, b] = lockLayers([lash, beard], { narrow: 0.5 }, 0);
    expect(l?.width).toBe(0.0026);
    expect(l?.density).toBe(hair.density);
    expect(b?.width).toBeCloseTo(0.006);
  });
});

describe('scalpCards locks', () => {
  it('default cards map onto hair_clumps; the lock style onto hair_locks, with more cards', () => {
    const plain = scalpCards(opts([hair]));
    const locks = scalpCards(opts([hair], {}));
    expect(plain).not.toBeNull();
    expect(locks).not.toBeNull();
    const [p0, p1] = vRange(plain?.uvs ?? new Float32Array([0, 1]));
    const [l0, l1] = vRange(locks?.uvs ?? new Float32Array([0, 1]));
    const clumps = stripRect('hair_clumps' as StripId);
    const lockRow = stripRect('hair_locks' as StripId);
    expect(p0).toBeGreaterThanOrEqual(clumps.v0);
    expect(p1).toBeLessThanOrEqual(clumps.v1);
    expect(l0).toBeGreaterThanOrEqual(lockRow.v0);
    expect(l1).toBeLessThanOrEqual(lockRow.v1);
    expect(locks?.indices.length ?? 0).toBeGreaterThan(plain?.indices.length ?? 0);
  });
});
