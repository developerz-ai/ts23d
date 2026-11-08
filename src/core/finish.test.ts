// Finishes, optics and lacquered paint slots: every misuse fails with a fix; valid ones resolve
// to linear RGB with defaults filled.

import { describe, expect, it } from 'bun:test';
import { box } from '../primitives/index.ts';
import { compile, defineAsset } from './asset.ts';
import type { AssetDefinition } from './definition.ts';
import { OPTICS } from './optics.ts';

const c: [number, number, number] = [0.5, 0.5, 0.5];
const asset = (over: Partial<AssetDefinition>, part: Record<string, unknown> = {}) =>
  defineAsset({
    name: 'f',
    kind: 'prop',
    budget: { triangles: [999, 999, 999] },
    build(ctx) {
      ctx.part('a', box({ size: [1, 1, 1], at: [0, 0, 0.5], color: c }), part);
    },
    ...over,
  });

describe('finishes: failures first', () => {
  it('rejects a part naming an undeclared finish', () => {
    expect(() => compile(asset({}, { finish: 'velvet' }))).toThrow(/does not declare/);
  });
  it('rejects a finish on a see-through part', () => {
    const a = asset(
      { finishes: { velvet: { sheen: { colour: '#802040' } } } },
      {
        finish: 'velvet',
        surface: 'glass',
      },
    );
    expect(() => compile(a)).toThrow(/is glass and has a finish/);
  });
  it('rejects paint + finish on one part', () => {
    const a = asset(
      { paint: { body: '#ffffff' }, finishes: { brushed: { anisotropy: { strength: 0.8 } } } },
      { finish: 'brushed', paint: 'body' },
    );
    expect(() => compile(a)).toThrow(/both paint/);
  });
  it('rejects out-of-range numbers, bad colours and bad names', () => {
    expect(() => compile(asset({ finishes: { cc: { clearcoat: 2 } } }))).toThrow(/outside 0..1/);
    expect(() => compile(asset({ finishes: { s: { sheen: { colour: 'red' } } } }))).toThrow(
      /#rrggbb/,
    );
    expect(() => compile(asset({ finishes: { Bad: {} } }))).toThrow(/snake_case/);
    expect(() =>
      compile(asset({ finishes: { t: { iridescence: { thickness: [500, 100] } } } })),
    ).toThrow(/thickness is \[500, 100\] nm/);
  });
  it('rejects optics on a surface that is not see-through and impossible values', () => {
    const bad = { opaque: { ior: 1.5 } } as unknown as AssetDefinition['optics'];
    expect(() => compile(asset({ ...(bad ? { optics: bad } : {}) }))).toThrow(/see-through/);
    expect(() => compile(asset({ optics: { glass: { ior: 0.5 } } }))).toThrow(/outside 1..3/);
  });
  it('rejects a lacquered slot with flake outside 0..1', () => {
    const a = asset({ paint: { body: { colour: '#c01010', metallicFlake: 3 } } });
    expect(() => compile(a)).toThrow(/metallicFlake/);
  });
});

describe('finishes: resolved', () => {
  it('fills defaults and converts sRGB to linear', () => {
    const a = compile(
      asset(
        {
          finishes: {
            velvet: { sheen: { colour: '#ffffff' } },
            heat: { iridescence: {} },
            coat: { clearcoat: 1 },
          },
        },
        { finish: 'velvet' },
      ),
    );
    expect(a.finishes?.['velvet']?.sheen).toEqual({ colour: [1, 1, 1], roughness: 0.5 });
    expect(a.finishes?.['heat']?.iridescence).toEqual({
      factor: 1,
      ior: 1.3,
      thickness: [100, 400],
    });
    expect(a.finishes?.['coat']?.clearcoatRoughness).toBe(0.03);
    expect(a.parts[0]?.finish).toBe('velvet');
  });
  it('merges optics over the surface preset', () => {
    const a = compile(asset({ optics: { glass: { ior: 1.52, attenuationColour: '#ffffff' } } }));
    expect(a.optics?.glass).toEqual({ ...OPTICS.glass, ior: 1.52, attenuationColour: [1, 1, 1] });
  });
  it('lacquered slot: colour as before, finish carried; plain slots add nothing', () => {
    const plain = compile(asset({ paint: { body: '#c01010' } }, { paint: 'body' }));
    expect(plain.paintSet?.finish).toBeUndefined();
    const car = compile(
      asset(
        { paint: { body: { colour: '#c01010', clearcoat: 1, metallicFlake: 0.5 } } },
        { paint: 'body' },
      ),
    );
    expect(car.paintSet?.paint['body']).toEqual(plain.paintSet?.paint['body'] ?? [0, 0, 0]);
    expect(car.paintSet?.finish?.['body']).toEqual({
      clearcoat: 1,
      clearcoatRoughness: 0.03,
      metallic: 0.5,
      roughness: 0.4,
    });
  });
});
