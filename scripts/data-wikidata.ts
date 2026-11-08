// `bun run data wikidata <QID…> --out <dir>`: fetch Wikidata items (CC0) at a pinned revision,
// keep the raw response in the gitignored cache (by sha256) and write a small normalised record
// `<dir>/wikidata-<QID>.json` (metres / kilograms, licence, revision URL, sha256) for the recipe
// to commit and import. Tests pass a fake fetch; nothing here runs at compile time.

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Ts23dError } from '../src/core/index.ts';
import {
  checkQid,
  parseWikidata,
  sha256,
  WIKIDATA_ITEMS,
  type WikidataRecord,
} from '../src/data/index.ts';

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export const DATA_CACHE = 'node_modules/.cache/ts23d/data';
const HEADERS = { 'User-Agent': 'ts23d-data (https://github.com/developerz-ai/ts23d)' };
const ENTITY = 'https://www.wikidata.org/wiki/Special:EntityData';

async function bytes(url: string, get: Fetch, what: string): Promise<Uint8Array> {
  const res = await get(url, { headers: HEADERS });
  if (res.status === 404)
    throw new Ts23dError('T3D_DATA_QID', {
      cause: `${what}: ${url} → 404`,
      fix: 'check the id on https://www.wikidata.org (deleted, merged or mistyped)',
    });
  if (!res.ok) throw new Error(`data: GET ${url} → HTTP ${res.status}\nfix: retry later`);
  return new Uint8Array(await res.arrayBuffer());
}

const json = (b: Uint8Array): unknown => JSON.parse(new TextDecoder().decode(b));

/** Write a committed data file in the repo's own JSON format (biome), so lint stays green. */
export async function writeJson(file: string, value: unknown): Promise<void> {
  await Bun.write(file, `${JSON.stringify(value, null, 2)}\n`);
  Bun.spawnSync(['bunx', 'biome', 'format', '--write', file], {
    stdout: 'ignore',
    stderr: 'ignore',
  });
}

/** Item ids referenced by item-valued facts we keep (gauge, wheel arrangement). */
function itemIds(raw: unknown, qid: string): string[] {
  const s = JSON.stringify(raw);
  const ids = new Set<string>();
  for (const pid of Object.values(WIKIDATA_ITEMS)) {
    const at = s.indexOf(`"${pid}":[`);
    if (at < 0) continue;
    for (const m of s.slice(at, at + 4000).matchAll(/"id":"(Q\d+)"/g))
      if (m[1] && m[1] !== qid) ids.add(m[1]);
  }
  return [...ids].sort();
}

async function labels(ids: readonly string[], get: Fetch): Promise<Record<string, string>> {
  if (!ids.length) return {};
  const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids.join('|')}&props=labels&languages=en&format=json`;
  const ents = (json(await bytes(url, get, 'labels')) as { entities?: Record<string, unknown> })
    .entities;
  const out: Record<string, string> = {};
  for (const [id, e] of Object.entries(ents ?? {})) {
    const v = (e as { labels?: { en?: { value?: string } } }).labels?.en?.value;
    if (v) out[id] = v;
  }
  return out;
}

/** Fetch one item at its current revision, pinned by revision URL + sha256. */
export async function fetchWikidata(
  qid: string,
  get: Fetch = fetch,
  today = new Date().toISOString().slice(0, 10),
  cache = DATA_CACHE,
): Promise<WikidataRecord> {
  checkQid(qid);
  const latest = json(await bytes(`${ENTITY}/${qid}.json`, get, qid)) as {
    entities?: Record<string, { lastrevid?: number }>;
  };
  const rev = Object.values(latest.entities ?? {})[0]?.lastrevid;
  const url = rev ? `${ENTITY}/${qid}.json?revision=${rev}` : `${ENTITY}/${qid}.json`;
  const raw = await bytes(url, get, qid);
  const hash = sha256(raw);
  await mkdir(cache, { recursive: true });
  await Bun.write(join(cache, `${hash}.json`), raw);
  const parsed = json(raw);
  return parseWikidata(parsed, qid, {
    url,
    sha256: hash,
    fetched: today,
    labels: await labels(itemIds(parsed, qid), get),
  });
}

/** Re-parse a cached raw response and confirm it still hashes to the record's pin. */
export async function verifyWikidata(r: WikidataRecord, cache = DATA_CACHE): Promise<boolean> {
  const f = Bun.file(join(cache, `${r.sha256}.json`));
  if (!(await f.exists())) return false;
  const raw = new Uint8Array(await f.arrayBuffer());
  if (sha256(raw) !== r.sha256)
    throw new Ts23dError('T3D_DATA_HASH', {
      cause: `cached ${r.qid} response does not hash to ${r.sha256}`,
      fix: `delete ${cache} and re-run \`bun run data wikidata ${r.qid}\``,
    });
  return true;
}

export async function wikidataCommand(
  qids: readonly string[],
  out: string,
  get: Fetch = fetch,
): Promise<string[]> {
  if (!qids.length)
    throw new Ts23dError('T3D_DATA_QID', {
      cause: 'no QIDs given',
      fix: 'bun run data wikidata Q243 --out recipes/eiffel_tower/data',
    });
  await mkdir(out, { recursive: true });
  const lines: string[] = [];
  for (const qid of qids) {
    const r = await fetchWikidata(qid, get);
    const file = join(out, `wikidata-${r.qid}.json`);
    await writeJson(file, r);
    const qs = Object.entries(r.quantities).map(([k, q]) => `${k} ${q.value} ${q.unit}`);
    lines.push(`✓ ${r.qid} ${r.label}: ${qs.join(', ') || 'no quantities'} → ${file}`);
  }
  return lines;
}
