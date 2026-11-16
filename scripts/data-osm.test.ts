import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readOsm, sha256 } from '../src/data/index.ts';
import { run } from './data.ts';
import { fetchOsm, OSM_API, osmUrl, overpassQuery } from './data-osm.ts';
import type { Fetch } from './data-wikidata.ts';

const dir = await mkdtemp(join(tmpdir(), 't3d-osm-'));
afterAll(() => rm(dir, { recursive: true, force: true }));

const BBOX = [-74.0045, 40.7335, -74.003, 40.7345] as const;
const RAW = JSON.stringify({
  elements: [
    { type: 'node', id: 1, lat: 40.7339, lon: -74.0039 },
    { type: 'node', id: 2, lat: 40.7341, lon: -74.0039 },
    { type: 'node', id: 3, lat: 40.7341, lon: -74.0036 },
    { type: 'way', id: 7, nodes: [1, 2, 3, 1], tags: { building: 'yes', height: '9.1' } },
  ],
});

function fake(status: number, body: string): Fetch & { urls: string[] } {
  const urls: string[] = [];
  const f = async (url: string): Promise<Response> => {
    urls.push(url);
    return new Response(body, { status });
  };
  return Object.assign(f, { urls });
}

describe('bun run data osm', () => {
  test('refuses missing flags, a bad bbox, an HTTP error and an error page before writing', async () => {
    await expect(run(['osm', '--bbox', BBOX.join(',')], fake(200, RAW))).rejects.toThrow(
      'T3D_DATA_OSM',
    );
    await expect(
      fetchOsm({ name: 'x', bbox: [0, 0, 1, 1] }, fake(200, RAW), '2026-11-15', dir),
    ).rejects.toThrow('bbox');
    const busy = fetchOsm({ name: 'x', bbox: BBOX }, fake(504, 'busy'), '2026-11-15', dir);
    await expect(busy).rejects.toMatchObject({ fix: expect.stringContaining('--source overpass') });
    await expect(
      fetchOsm({ name: 'x', bbox: BBOX }, fake(200, '# 502 at capacity'), '2026-11-15', dir),
    ).rejects.toThrow('did not answer JSON');
  });

  test('pins the raw response hash, URL and date; the record reads back verified', async () => {
    const get = fake(200, RAW);
    const r = await fetchOsm({ name: 'wv', bbox: BBOX }, get, '2026-11-15', dir);
    expect(get.urls).toEqual([`${OSM_API}?bbox=${BBOX.join(',')}`]);
    expect(r.source).toEqual({
      url: `${OSM_API}?bbox=${BBOX.join(',')}`,
      fetched: '2026-11-15',
      sha256: sha256(new TextEncoder().encode(RAW)),
    });
    expect(readOsm(JSON.parse(JSON.stringify(r))).buildings[0]?.height).toBe(9.1);
    expect(await Bun.file(join(dir, `${r.source.sha256}.json`)).text()).toBe(RAW);
  });

  test('the overpass source records its query and asks for every way’s nodes', async () => {
    const get = fake(200, RAW);
    const r = await fetchOsm(
      { name: 'wv', bbox: BBOX, source: 'overpass' },
      get,
      '2026-11-15',
      dir,
    );
    expect(r.source.query).toBe(overpassQuery(BBOX));
    expect(r.source.query).toContain('out body;>;out skel qt;');
    expect(osmUrl(BBOX, 'overpass')).toContain(
      encodeURIComponent('way["building"](40.7335,-74.0045,40.7345,-74.003);'),
    );
  });
});
