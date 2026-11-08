import { describe, expect, test } from 'bun:test';
import { Ts23dError } from '../core/index.ts';
import { crossCheck, quantity, realFrom } from './real-from.ts';
import type { WikidataRecord } from './wikidata.ts';

const q = (value: number, unit: 'm' | 'kg' = 'm') => ({
  value,
  unit,
  property: 'P0',
  amount: `+${value}`,
  sourceUnit: 'Q11573',
});

const TOWER: WikidataRecord = {
  format: 'ts23d-wikidata/1',
  qid: 'Q243',
  label: 'Eiffel Tower',
  url: 'https://www.wikidata.org/wiki/Special:EntityData/Q243.json?revision=1',
  page: 'https://www.wikidata.org/wiki/Q243',
  license: 'CC0-1.0',
  fetched: '2026-11-07',
  sha256: 'b'.repeat(64),
  quantities: { height: q(330), mass: q(10_100_000, 'kg'), length: q(125) },
  items: {},
};

describe('realFrom / crossCheck', () => {
  test('a missing property refuses with T3D_DATA_PROPERTY naming what exists', () => {
    let err: unknown;
    try {
      realFrom(TOWER, { map: { width: 'width' } });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(Ts23dError);
    expect((err as Ts23dError).code).toBe('T3D_DATA_PROPERTY');
    expect((err as Ts23dError).message).toContain('height, mass, length');
    expect(() => quantity(TOWER, 'gauge')).toThrow('T3D_DATA_PROPERTY');
  });

  test('maps quantities onto real axes, measures and a citation', () => {
    const r = realFrom(TOWER, {
      map: { length: 'length', height: 'height', mass: 'mass' },
      measures: [{ from: 'height', label: 'tip', axis: 'z', parts: ['mast'] }],
    });
    expect(r.length).toBe(125);
    expect(r.height).toBe(330);
    expect(r.mass).toBe(10_100_000);
    expect(r.width).toBeUndefined();
    expect(r.measures[0]).toMatchObject({ label: 'tip', value: 330, axis: 'z', parts: ['mast'] });
    expect(r.sources[0]).toContain('Q243');
    expect(r.sources[0]).toContain('CC0-1.0');
    expect(r.measures[0]?.source).toBe(r.sources[0] ?? '');
  });

  test('cross-check reports conflicts beyond tolerance only', () => {
    const c = crossCheck(TOWER, { height: 324, length: 124.9, width: 3 }, 0.01);
    expect(c.map((x) => x.quantity)).toEqual(['height']);
    expect(c[0]?.relative).toBeCloseTo(6 / 324, 9);
    expect(c[0]?.message).toContain('Q243');
    expect(crossCheck(TOWER, { height: 324 }, 0.02)).toEqual([]);
  });
});
