import { describe, expect, it } from 'bun:test';
import { type CompiledAsset, compile, defineAsset, type WeatherCoverage } from '../core/index.ts';
import { weatherGate } from './weather.ts';

const base: WeatherCoverage = {
  target: 'door',
  effect: 'dust',
  where: 'up-facing',
  lod: 0,
  amount: 0.3,
  actual: 0.3,
  area: 1,
  tolerance: 0.02,
  misplaced: 0,
};
const asset = (weather: WeatherCoverage[]): CompiledAsset => ({
  ...compile(
    defineAsset({ name: 'w', kind: 'prop', budget: { triangles: [1, 1, 1] }, build: () => {} }),
  ),
  weather,
});
const codes = (w: WeatherCoverage[]): string[] =>
  weatherGate(asset(w)).map((f) => f.message.split(':')[0] ?? '');

describe('QA weather gate', () => {
  it('fails coverage off target, empty selections, misplaced dust, rising streaks, LOD2 dents', () => {
    expect(codes([{ ...base, actual: 0.25 }])).toEqual(['T3D_WEATHER_COVERAGE']);
    expect(codes([{ ...base, area: 0, actual: 0 }])).toEqual(['T3D_WEATHER_NO_SURFACE']);
    expect(codes([{ ...base, misplaced: 0.2 }])).toEqual(['T3D_WEATHER_MISPLACED']);
    expect(codes([{ ...base, effect: 'rust', streaks: 9, upward: 1 }])).toEqual([
      'T3D_WEATHER_STREAK_UP',
    ]);
    const dent = {
      ...base,
      effect: 'dents',
      amount: 0.01,
      actual: 0.008,
      count: 2,
      countRange: [2, 5] as const,
    };
    expect(codes([{ ...dent, lod: 2 }])).toEqual(['T3D_WEATHER_SHAPE']);
    expect(codes([{ ...dent, actual: 0.02 }])).toEqual(['T3D_WEATHER_SHAPE']);
    expect(codes([{ ...dent, count: 7 }])).toEqual(['T3D_WEATHER_SHAPE']);
    expect(codes([{ ...dent, effect: 'sag', area: 0, actual: 0 }])).toEqual([
      'T3D_WEATHER_NO_SURFACE',
    ]);
    expect(weatherGate(asset([{ ...base, actual: 0.25 }]))[0]?.fix).toMatch(/resolution/);
  });

  it('passes declared, measured, plausible weathering and assets without any', () => {
    expect(
      codes([
        base,
        { ...base, effect: 'dents', amount: 0.01, actual: 0.009, count: 3, countRange: [2, 5] },
      ]),
    ).toEqual([]);
    expect(weatherGate(asset([]))).toEqual([]);
  });
});
