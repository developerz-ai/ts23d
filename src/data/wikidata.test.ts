import { describe, expect, test } from 'bun:test';
import { Ts23dError } from '../core/index.ts';
import { toSi } from './units.ts';
import { checkQid, parseWikidata } from './wikidata.ts';

const PIN = {
  url: 'https://example/Q1.json?revision=1',
  sha256: 'a'.repeat(64),
  fetched: '2026-11-07',
};
const U = 'http://www.wikidata.org/entity/';

const claim = (amount: string, unit: string, rank = 'normal'): unknown => ({
  rank,
  mainsnak: { datavalue: { value: { amount, unit: `${U}${unit}` } } },
});
const entity = (claims: Record<string, unknown[]>): unknown => ({
  entities: { Q42: { id: 'Q42', labels: { en: { value: 'Thing' } }, claims } },
});

const code = (f: () => unknown): string => {
  try {
    f();
  } catch (e) {
    return e instanceof Ts23dError ? e.code : `not Ts23dError: ${e}`;
  }
  return 'no throw';
};

describe('wikidata', () => {
  test('a malformed QID refuses with T3D_DATA_QID', () => {
    expect(code(() => checkQid('243'))).toBe('T3D_DATA_QID');
    expect(code(() => checkQid('Q0'))).toBe('T3D_DATA_QID');
    expect(code(() => parseWikidata(entity({}), 'P31', PIN))).toBe('T3D_DATA_QID');
  });

  test('an entity the response does not hold refuses with T3D_DATA_QID', () => {
    expect(code(() => parseWikidata({ entities: {} }, 'Q42', PIN))).toBe('T3D_DATA_QID');
    expect(
      code(() => parseWikidata({ entities: { Q42: { id: 'Q42', missing: '' } } }, 'Q42', PIN)),
    ).toBe('T3D_DATA_QID');
  });

  test('an unknown or mis-dimensioned unit refuses with T3D_DATA_UNIT', () => {
    expect(
      code(() => parseWikidata(entity({ P2043: [claim('+3', 'Q999999999')] }), 'Q42', PIN)),
    ).toBe('T3D_DATA_UNIT');
    expect(code(() => parseWikidata(entity({ P2043: [claim('+3', 'Q11570')] }), 'Q42', PIN))).toBe(
      'T3D_DATA_UNIT',
    );
    expect(code(() => toSi(1, '1', 'length', 'unitless'))).toBe('T3D_DATA_UNIT');
  });

  test('feet become metres and tonnes kilograms', () => {
    const r = parseWikidata(
      entity({
        P2048: [claim('+7214', 'Q3710')],
        P2067: [claim('+10100', 'Q191118')],
        P2386: [claim('+56.5', 'Q218593')],
      }),
      'Q42',
      PIN,
    );
    expect(r.quantities['height']?.value).toBeCloseTo(2198.8272, 6);
    expect(r.quantities['height']?.sourceUnit).toBe('Q3710');
    expect(r.quantities['mass']?.value).toBe(10_100_000);
    expect(r.quantities['mass']?.unit).toBe('kg');
    expect(r.quantities['diameter']?.value).toBeCloseTo(1.4351, 6);
    expect(r.license).toBe('CC0-1.0');
    expect(r.label).toBe('Thing');
  });

  test('preferred rank wins and deprecated statements are ignored', () => {
    const r = parseWikidata(
      entity({
        P2048: [claim('+300', 'Q11573'), claim('+330', 'Q11573', 'preferred')],
        P2043: [claim('+999', 'Q11573', 'deprecated'), claim('+125', 'Q11573')],
      }),
      'Q42',
      PIN,
    );
    expect(r.quantities['height']?.value).toBe(330);
    expect(r.quantities['length']?.value).toBe(125);
  });

  test('a somevalue statement first does not hide the next usable one', () => {
    const somevalue = { rank: 'preferred', mainsnak: { snaktype: 'somevalue' } };
    const r = parseWikidata(entity({ P2048: [somevalue, claim('+4.5', 'Q11573')] }), 'Q42', PIN);
    expect(r.quantities['height']?.value).toBe(4.5);
  });

  test('a unitless length is skipped for one with a unit, and refuses only when alone', () => {
    const unitless = (amount: string, rank = 'normal'): unknown => ({
      rank,
      mainsnak: { datavalue: { value: { amount, unit: '1' } } },
    });
    const r = parseWikidata(
      entity({ P2043: [unitless('+12', 'preferred'), claim('+7', 'Q11573')] }),
      'Q42',
      PIN,
    );
    expect(r.quantities['length']?.value).toBe(7);
    expect(code(() => parseWikidata(entity({ P2043: [unitless('+12')] }), 'Q42', PIN))).toBe(
      'T3D_DATA_UNIT',
    );
  });

  test('coordinates and item facts with labels from the pin', () => {
    const r = parseWikidata(
      entity({
        P625: [{ mainsnak: { datavalue: { value: { latitude: 37.746, longitude: -119.533 } } } }],
        P1064: [{ mainsnak: { datavalue: { value: { id: 'Q1395' } } } }],
      }),
      'Q42',
      { ...PIN, labels: { Q1395: 'standard gauge' } },
    );
    expect(r.coordinates).toEqual({ lat: 37.746, lon: -119.533 });
    expect(r.items['gauge']).toEqual({ qid: 'Q1395', label: 'standard gauge' });
  });
});
