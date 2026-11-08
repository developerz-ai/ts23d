// The finish layer must never change what the code built and must reject finishes that leak across
// parts, ignore the control maps, or repaint the asset. Failure cases first.

import { describe, expect, it } from 'bun:test';
import { compile, Ts23dError } from '../core/index.ts';
import { cart, repaint, shifted, slabs } from './fixtures.ts';
import { finishAsset, mockFinish } from './index.ts';

const SMALL = { views: 6, size: 96, atlas: 256 } as const;
const codes = (r: { findings: readonly { code: string }[] }): string[] =>
  r.findings.map((f) => f.code);

describe('finishAsset — rejects', () => {
  it('LOD1 and an empty prompt', async () => {
    const model = mockFinish();
    await expect(finishAsset(compile(cart, { lod: 1 }), { model, prompt: 'x' })).rejects.toThrow(
      'T3D_FINISH_INVALID',
    );
    await expect(finishAsset(compile(cart, { lod: 0 }), { model, prompt: ' ' })).rejects.toThrow(
      Ts23dError,
    );
  });

  it('a bake without part masking leaks colour across a flush boundary (T3D_FINISH_MASK_LEAK)', async () => {
    const r = await finishAsset(compile(slabs, { lod: 0 }), {
      ...SMALL,
      model: mockFinish(),
      prompt: 'clean',
      mask: false,
      maxLeak: 0.001,
    });
    expect(r.stats.leak).toBeGreaterThan(0);
    expect(codes(r)).toContain('T3D_FINISH_MASK_LEAK');
  });

  it('a model whose image is shifted off the silhouette (T3D_FINISH_MASK_LEAK per view)', async () => {
    const r = await finishAsset(compile(cart, { lod: 0 }), {
      ...SMALL,
      model: shifted(6),
      prompt: 'x',
    });
    expect(r.findings.some((f) => f.code === 'T3D_FINISH_MASK_LEAK' && f.view !== undefined)).toBe(
      true,
    );
  });

  it('a repaint drifts from the declared palette (T3D_FINISH_PALETTE_DRIFT)', async () => {
    const r = await finishAsset(compile(cart, { lod: 0 }), {
      ...SMALL,
      model: repaint,
      prompt: 'x',
    });
    expect(codes(r)).toContain('T3D_FINISH_PALETTE_DRIFT');
  });
});

describe('finishAsset — accepts', () => {
  it('masked bake of the same slabs: zero leak, no findings', async () => {
    const r = await finishAsset(compile(slabs, { lod: 0 }), {
      ...SMALL,
      model: mockFinish(),
      prompt: 'clean',
      maxLeak: 0.001,
    });
    expect(r.stats.leak).toBe(0);
    expect(r.findings).toEqual([]);
  });

  it('keeps geometry, names, pivots and motion; touches only finishable parts', async () => {
    const before = compile(cart, { lod: 0 });
    const fresh = compile(cart, { lod: 0 });
    const r = await finishAsset(before, { ...SMALL, model: mockFinish(), prompt: 'rust' });
    expect(r.findings).toEqual([]);
    // The input is not mutated.
    before.parts.forEach((p, i) => {
      expect(p.mesh?.positions ?? null).toEqual(fresh.parts[i]?.mesh?.positions ?? null);
    });
    const soup = (m: { positions: Float32Array; indices: Uint32Array } | null): number[] =>
      m
        ? Array.from(m.indices, (v) => [0, 1, 2].map((k) => m.positions[v * 3 + k] ?? 0)).flat()
        : [];
    r.asset.parts.forEach((p, i) => {
      const q = before.parts[i];
      expect(p.name).toBe(q?.name ?? '');
      expect([p.at, p.yaw, p.parent, p.motion, p.surface]).toEqual([
        q?.at,
        q?.yaw,
        q?.parent,
        q?.motion,
        q?.surface,
      ] as never);
      expect(soup(p.mesh)).toEqual(soup(q?.mesh ?? null));
    });
    const lamp = r.asset.parts.find((p) => p.name === 'lamp');
    expect(lamp).toBe(before.parts.find((p) => p.name === 'lamp'));
    expect(r.qa).toEqual([]);
  });
});
