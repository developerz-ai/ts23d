// Typed entry points for committed data files: a recipe imports the JSON (`import dem from
// './data/dem-x.json'`) and passes it through `readDem` / `readWikidata`, which check the format
// tag and the fields geometry relies on — a hand-edited or foreign file refuses with a fix instead
// of producing silent nonsense. Hash verification happens on decode (decodeDem).

import { Ts23dError } from '../core/index.ts';
import type { DemRecord } from './dem.ts';
import type { WikidataRecord } from './wikidata.ts';

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';

export function readDem(json: unknown, where = 'DEM'): DemRecord {
  const ok =
    isObj(json) &&
    json['format'] === 'ts23d-dem/1' &&
    typeof json['heights'] === 'string' &&
    typeof json['sha256'] === 'string' &&
    typeof json['cells'] === 'number' &&
    Array.isArray(json['size']) &&
    typeof json['offset'] === 'number' &&
    typeof json['step'] === 'number' &&
    typeof json['license'] === 'string' &&
    typeof json['attribution'] === 'string';
  if (!ok)
    throw new Ts23dError('T3D_DATA_DEM', {
      cause: `${where} is not a ts23d-dem/1 record`,
      fix: 'pin it with `bun run data dem --centre <lat,lon> --size <m> --name <id> --out <file>`',
    });
  return json as unknown as DemRecord;
}

export function readWikidata(json: unknown, where = 'Wikidata record'): WikidataRecord {
  const ok =
    isObj(json) &&
    json['format'] === 'ts23d-wikidata/1' &&
    typeof json['qid'] === 'string' &&
    json['license'] === 'CC0-1.0' &&
    typeof json['sha256'] === 'string' &&
    isObj(json['quantities']);
  if (!ok)
    throw new Ts23dError('T3D_DATA_QID', {
      cause: `${where} is not a ts23d-wikidata/1 record`,
      fix: 'pin it with `bun run data wikidata <QID> --out recipes/<name>/data`',
    });
  return json as unknown as WikidataRecord;
}
