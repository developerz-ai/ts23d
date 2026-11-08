import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodePng } from '../src/core/index.ts';
import { decodeDem, sha256 } from '../src/data/index.ts';
import { run } from './data.ts';
import { fetchDem } from './data-dem.ts';
import { type Fetch, fetchWikidata, verifyWikidata } from './data-wikidata.ts';

const dir = await mkdtemp(join(tmpdir(), 't3d-data-'));
afterAll(() => rm(dir, { recursive: true, force: true }));

const ENTITY = {
  entities: {
    Q925252: {
      id: 'Q925252',
      lastrevid: 77,
      labels: { en: { value: 'Half Dome' } },
      claims: {
        P2044: [
          {
            rank: 'normal',
            mainsnak: {
              datavalue: {
                value: { amount: '+8839', unit: 'http://www.wikidata.org/entity/Q3710' },
              },
            },
          },
        ],
      },
    },
  },
};

/** Fake network: records URLs, answers from a table, 404 otherwise. */
function fake(table: Record<string, Uint8Array | string>): Fetch & { urls: string[] } {
  const urls: string[] = [];
  const f = async (url: string): Promise<Response> => {
    urls.push(url);
    const hit =
      table[url] ??
      Object.entries(table).find(([k]) => k.endsWith('*') && url.startsWith(k.slice(0, -1)))?.[1];
    return hit === undefined
      ? new Response('nope', { status: 404 })
      : new Response(typeof hit === 'string' ? hit : new Uint8Array(hit));
  };
  return Object.assign(f, { urls });
}

const W = 'https://www.wikidata.org/wiki/Special:EntityData/Q925252.json';

describe('bun run data', () => {
  test('a malformed or unknown QID refuses with T3D_DATA_QID before or at the fetch', async () => {
    const get = fake({});
    await expect(run(['wikidata', 'Half_Dome'], get)).rejects.toThrow('T3D_DATA_QID');
    expect(get.urls).toEqual([]);
    await expect(fetchWikidata('Q999999999', get, '2026-11-07', dir)).rejects.toThrow(
      'T3D_DATA_QID',
    );
  });

  test('wikidata: pins the revision, hashes the bytes, normalises units', async () => {
    const body = JSON.stringify(ENTITY);
    const get = fake({ [W]: body, [`${W}?revision=77`]: body });
    const r = await fetchWikidata('Q925252', get, '2026-11-07', dir);
    expect(r.url).toBe(`${W}?revision=77`);
    expect(r.sha256).toBe(sha256(new TextEncoder().encode(body)));
    expect(r.quantities['elevation']?.value).toBeCloseTo(2694.1272, 4);
    expect(r.fetched).toBe('2026-11-07');
    expect(await verifyWikidata(r, dir)).toBe(true);
    await Bun.write(join(dir, `${r.sha256}.json`), '{}');
    await expect(verifyWikidata(r, dir)).rejects.toThrow('T3D_DATA_HASH');
  });

  test('dem: outside the US without a stated licence refuses with T3D_DATA_DEM', async () => {
    const box = {
      name: 'alps',
      centre: { lat: 45.976, lon: 7.658 },
      size: [1000, 1000] as const,
      cells: 8,
      zoom: 12,
    };
    await expect(fetchDem(box, fake({}), '2026-11-07', dir)).rejects.toThrow('T3D_DATA_DEM');
  });

  test('dem: fetches the covering tiles, pins each, writes a decodable record', async () => {
    // Every pixel encodes 1500 m (terrarium: 32768 + 1500 = 34268 = 133·256 + 220).
    const rgba = new Uint8Array(256 * 256 * 4);
    for (let k = 0; k < rgba.length; k += 4) rgba.set([133, 220, 0, 255], k);
    const png = encodePng(256, 256, rgba);
    const get = fake({ 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/13/*': png });
    const rec = await fetchDem(
      {
        name: 'flat',
        centre: { lat: 37.738, lon: -119.553 },
        size: [1000, 1000],
        cells: 8,
        zoom: 13,
      },
      get,
      '2026-11-07',
      dir,
    );
    expect(get.urls.length).toBe(rec.source.tiles.length);
    expect(rec.source.tiles.every((t) => t.sha256 === sha256(png))).toBe(true);
    expect(rec.license).toContain('Public domain');
    expect(rec.attribution).toContain('U.S. Geological Survey');
    const g = decodeDem(rec);
    expect([...g.z].every((z) => Math.abs(z - 1500) < 0.03)).toBe(true);
  });

  test('unknown command prints usage', async () => {
    expect((await run(['nope'], fake({})))[0]).toContain('usage');
  });
});
