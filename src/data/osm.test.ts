import { describe, expect, it } from 'bun:test';
import { checkBbox, citeOsm, OSM_ATTRIBUTION, parseHeight, parseOsm, readOsm } from './osm.ts';

const BBOX = [-74.0045, 40.7335, -74.003, 40.7345] as const;
const SOURCE = {
  url: 'https://example.test/map.json',
  fetched: '2026-11-15',
  sha256: 'ab'.repeat(32),
};

/** API 0.6 shape: nodes + ways by reference; one clockwise building, one street, one park. */
const RAW = {
  version: '0.6',
  elements: [
    { type: 'node', id: 1, lat: 40.7339, lon: -74.0039 },
    { type: 'node', id: 2, lat: 40.7341, lon: -74.0039 },
    { type: 'node', id: 3, lat: 40.7341, lon: -74.0036 },
    { type: 'node', id: 4, lat: 40.7339, lon: -74.0036 },
    { type: 'node', id: 5, lat: 40.7336, lon: -74.0044 },
    { type: 'node', id: 6, lat: 40.7344, lon: -74.0031 },
    {
      type: 'way',
      id: 20,
      nodes: [1, 2, 3, 4, 1],
      tags: {
        building: 'yes',
        height: '17.3',
        'building:levels': '5',
        'addr:street': 'West 10th Street',
        'addr:housenumber': '190',
      },
    },
    {
      type: 'way',
      id: 10,
      nodes: [5, 6],
      tags: { highway: 'residential', name: 'Bleecker Street' },
    },
    { type: 'way', id: 30, nodes: [4, 3, 2, 1, 4], tags: { leisure: 'park' } },
  ],
};

describe('parseOsm', () => {
  it('refuses an error page, a dangling node reference and a huge or inverted bbox', () => {
    expect(() =>
      parseOsm({ remark: 'runtime error' }, { name: 'x', bbox: BBOX, source: SOURCE }),
    ).toThrow('T3D_DATA_OSM');
    const dangling = {
      elements: [{ type: 'way', id: 9, nodes: [1, 99], tags: { highway: 'service' } }],
    };
    expect(() => parseOsm(dangling, { name: 'x', bbox: BBOX, source: SOURCE })).toThrow('node 1');
    expect(() => checkBbox([-74, 40, -73, 41])).toThrow('T3D_DATA_OSM');
    expect(() => checkBbox([-74, 41, -74.1, 40])).toThrow('T3D_DATA_OSM');
    expect(() => parseOsm(RAW, { name: 'West Village', bbox: BBOX, source: SOURCE })).toThrow(
      'snake_case',
    );
  });

  it('keeps footprints CCW in metres from the bbox centre, heights, levels and the address', () => {
    const r = parseOsm(RAW, { name: 'wv', bbox: BBOX, source: SOURCE });
    expect(r.buildings).toHaveLength(1);
    const b = r.buildings[0];
    expect([b?.height, b?.levels, b?.minHeight, b?.address]).toEqual([
      17.3,
      5,
      0,
      '190 West 10th Street',
    ]);
    expect(b?.ring).toHaveLength(4);
    const ring = b?.ring ?? [];
    const area =
      ring.reduce((s, a, i) => {
        const c = ring[(i + 1) % ring.length] ?? a;
        return s + a[0] * c[1] - c[0] * a[1];
      }, 0) / 2;
    // 0.0003° lon × 0.0002° lat at 40.734° N ≈ 25.3 × 22.2 m, counter-clockwise (positive).
    expect(area).toBeGreaterThan(25.3 * 22.2 * 0.98);
    expect(area).toBeLessThan(25.3 * 22.2 * 1.02);
    expect(r.roads[0]).toMatchObject({ highway: 'residential', name: 'Bleecker Street' });
    expect(r.areas[0]).toMatchObject({ key: 'leisure', value: 'park' });
    expect(r.license).toBe('ODbL-1.0');
    expect(citeOsm(r)).toContain(OSM_ATTRIBUTION);
  });

  it('reads Overpass `out geom` ways the same as node references', () => {
    const geom = {
      elements: [
        {
          type: 'way',
          id: 20,
          geometry: [1, 2, 3, 4, 1].map((n) => {
            const node = RAW.elements.find((e) => e.id === n && e.type === 'node') as {
              lat: number;
              lon: number;
            };
            return { lat: node.lat, lon: node.lon };
          }),
          tags: RAW.elements[6]?.tags,
        },
      ],
    };
    const a = parseOsm(RAW, { name: 'wv', bbox: BBOX, source: SOURCE }).buildings;
    const b = parseOsm(geom, { name: 'wv', bbox: BBOX, source: SOURCE }).buildings;
    expect(b).toEqual(a);
  });

  it('readOsm verifies the pin: an edited height refuses with T3D_DATA_HASH', () => {
    const r = parseOsm(RAW, { name: 'wv', bbox: BBOX, source: SOURCE });
    const json = JSON.parse(JSON.stringify(r));
    expect(readOsm(json).buildings[0]?.height).toBe(17.3);
    json.buildings[0].height = 30;
    expect(() => readOsm(json)).toThrow('T3D_DATA_HASH');
    expect(() => readOsm({ format: 'other' })).toThrow('T3D_DATA_OSM');
  });

  it('parses metre heights only', () => {
    expect([
      parseHeight('12'),
      parseHeight('12.5 m'),
      parseHeight('40 ft'),
      parseHeight(undefined),
    ]).toEqual([12, 12.5, null, null]);
  });
});
