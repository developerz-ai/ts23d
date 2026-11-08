import { describe, expect, test } from 'bun:test';
import { type DemRecord, decodeDem, encodeDem } from './dem.ts';
import { readDem, readWikidata } from './read.ts';
import type { DemBox } from './terrarium.ts';

const BOX: DemBox = { centre: { lat: 46, lon: 7.6 }, size: [800, 600], cells: 8, zoom: 12 };
const META = {
  name: 'test',
  source: { name: 'synthetic', url: 'none', tiles: [], fetched: '2026-11-07' },
  license: 'CC0-1.0',
  attribution: 'test data',
};
const heights = Float64Array.from(
  { length: 81 },
  (_, k) => 1500 + (k % 9) * 12.34 + Math.floor(k / 9) * 7.01,
);

describe('DEM record', () => {
  test('tampered heights refuse with T3D_DATA_HASH', () => {
    const r = encodeDem(BOX, heights, META);
    const flipped = `${r.heights[0] === 'A' ? 'B' : 'A'}${r.heights.slice(1)}`;
    expect(() => decodeDem({ ...r, heights: flipped })).toThrow('T3D_DATA_HASH');
  });

  test('truncated, foreign or hand-edited files refuse with T3D_DATA_DEM', () => {
    const r = encodeDem(BOX, heights, META);
    expect(() => decodeDem({ ...r, heights: r.heights.slice(0, 40) })).toThrow('T3D_DATA_DEM');
    expect(() => decodeDem({ ...r, heights: `!${r.heights.slice(1)}` })).toThrow('T3D_DATA_DEM');
    expect(() => readDem({ format: 'geotiff' })).toThrow('T3D_DATA_DEM');
    expect(() => readWikidata({ format: 'ts23d-wikidata/1', qid: 'Q1', license: 'CC-BY' })).toThrow(
      'T3D_DATA_QID',
    );
    expect(() => encodeDem(BOX, heights.slice(1), META)).toThrow('T3D_DATA_DEM');
    const tall = Float64Array.from(heights, (h, k) => (k === 0 ? h + 9000 : h));
    expect(() => encodeDem(BOX, tall, { ...META, step: 0.1 })).toThrow('T3D_DATA_DEM');
  });

  test('round-trips within half a quantisation step, centred, rows south→north', () => {
    const r: DemRecord = readDem(JSON.parse(JSON.stringify(encodeDem(BOX, heights, META))));
    const g = decodeDem(r);
    expect(g.nx).toBe(9);
    expect(g.rect).toEqual([-400, -300, 400, 300]);
    for (let k = 0; k < heights.length; k++)
      expect(Math.abs((g.z[k] ?? 0) - (heights[k] ?? 0))).toBeLessThanOrEqual(0.025 + 1e-9);
    expect(r.min).toBeCloseTo(1500, 6);
    expect(r.max).toBeCloseTo(1500 + 8 * 12.34 + 8 * 7.01, 1);
  });

  test('same heights, same bytes', () => {
    expect(JSON.stringify(encodeDem(BOX, heights, META))).toBe(
      JSON.stringify(encodeDem(BOX, Float64Array.from(heights), META)),
    );
  });
});
