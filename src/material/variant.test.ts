import { afterAll, describe, expect, it } from 'bun:test';
import { Ts23dError } from '../core/index.ts';
import { defineMaterial, materialOf, resetMaterials } from './define.ts';
import { NATURE_LIBRARY } from './nature.ts';
import { createCanvas } from './paint/canvas.ts';
import { HOUSE_STRIPS } from './paint/default-sheet.ts';
import { paintStrip } from './paint/strip.ts';
import type { StripRecipe } from './paint/types.ts';
import {
  CUSTOM_STRIP_SLOTS,
  NATURE_STRIPS,
  STRIP_H,
  STRIP_ROWS,
  STRIPS,
  type StripId,
  spanOf,
  stripAtV,
  stripRect,
  TRIM_SHEET_SIZE,
} from './trim-sheet.ts';
import { materialVariant, weathered } from './variant.ts';

afterAll(resetMaterials);

const codeOf = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    if (e instanceof Ts23dError) return e.code;
    throw e;
  }
  return 'none';
};

describe('variants and weathering: bad input', () => {
  it('rejects a variant index out of range and an unknown strip', () => {
    expect(codeOf(() => materialVariant('oak', 16))).toBe('T3D_MATERIAL_INVALID');
    expect(codeOf(() => materialVariant('oak', 1.5))).toBe('T3D_MATERIAL_INVALID');
    expect(codeOf(() => materialVariant('nope' as StripId, 1))).toBe('T3D_MATERIAL_UNKNOWN');
    expect(codeOf(() => stripRect('oak~99' as StripId))).toBe('T3D_MATERIAL_UNKNOWN');
  });

  it('rejects weathering dials outside 0..1', () => {
    expect(codeOf(() => defineMaterial(weathered('oak', { id: 'oak_soaked', wet: 2 })))).toBe(
      'T3D_MATERIAL_INVALID',
    );
  });
});

describe('layout v3', () => {
  it('holds 42 built-ins and 14 custom rows of 1/64, cells above', () => {
    expect(STRIPS.length).toBe(42);
    expect(STRIP_ROWS * STRIP_H).toBe(0.875);
    expect(CUSTOM_STRIP_SLOTS).toBe(14);
    expect(stripAtV(stripRect('sand').v0 + 0.001)).toBe('sand');
    expect(stripAtV(0.87)).toBe('custom');
    expect(stripAtV(0.9)).toBe('cell');
  });

  it('gives isotropic nature strips texels within 2:1 at the house size', () => {
    for (const id of NATURE_STRIPS) {
      if (id.startsWith('bark_')) continue; // furrows run along V: fine U on purpose
      const u = spanOf(id) / TRIM_SHEET_SIZE;
      const v = (NATURE_LIBRARY[id].scaleMetres ?? 1) / (STRIP_H * TRIM_SHEET_SIZE);
      expect(Math.max(u, v) / Math.min(u, v)).toBeLessThanOrEqual(2);
    }
  });
});

describe('variants and weathering: output', () => {
  it('a variant shares its base row and span but starts elsewhere along U', () => {
    const base = stripRect('oak');
    const v = stripRect(materialVariant('oak', 3));
    expect([v.v0, v.v1, v.metres]).toEqual([base.v0, base.v1, base.metres]);
    expect(v.u0).not.toBe(base.u0);
    expect(v.u1 - v.u0).toBe(1);
    expect(materialOf(materialVariant('sand', 2)).origin).toBe('nature');
  });

  it('wet darkens and smooths a strip; worn edges brighten', () => {
    const paint = (r: StripRecipe) => {
      const c = createCanvas(256, 32, 1, r.scaleMetres, true);
      paintStrip(c, r, 3);
      const mean = (a: Float32Array): number => a.reduce((s, x) => s + x, 0) / a.length;
      return { tone: mean(c.tone), rough: mean(c.rough) };
    };
    const soil = HOUSE_STRIPS.soil as StripRecipe;
    const dry = paint(soil);
    const wet = paint({ ...soil, params: { ...soil.params, wet: 0.8 } });
    expect(wet.tone).toBeLessThan(dry.tone * 0.85);
    expect(wet.rough).toBeLessThan(dry.rough - 0.3);
    const bricks = HOUSE_STRIPS.brick as StripRecipe;
    const worn = paint({ ...bricks, params: { ...bricks.params, wear: 0.8 } });
    expect(worn.tone).toBeGreaterThan(paint(bricks).tone);
  });

  it('weathered() derives a definable material from any strip', () => {
    const id = defineMaterial(weathered('cobblestone', { id: 'cobble_wet', wet: 0.7 }));
    expect(materialOf(id).recipe.params?.['wet']).toBe(0.7);
    expect(materialOf(id).recipe.graph).toBe(HOUSE_STRIPS.cobblestone?.graph);
  });
});
