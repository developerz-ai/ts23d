// Wikidata entity JSON (CC0) → a pinned, normalised record: quantities in metres / kilograms,
// coordinates, and item-valued facts (track gauge, wheel arrangement) by id + label. Pure parsing;
// the network lives in scripts/data-wikidata.ts, which commits the record beside the recipe so a
// compile reads only that file. Ranks: preferred beats normal, deprecated statements and value-less
// (`somevalue` / `novalue`) snaks are skipped, and a unitless amount loses to one with a unit.

import { Ts23dError } from '../core/index.ts';
import { type Dimension, toSi, unitId } from './units.ts';

export const WIKIDATA_QUANTITIES: Readonly<
  Record<string, { readonly id: string; readonly dimension: Dimension }>
> = {
  length: { id: 'P2043', dimension: 'length' },
  width: { id: 'P2049', dimension: 'length' },
  height: { id: 'P2048', dimension: 'length' },
  depth: { id: 'P5524', dimension: 'length' },
  diameter: { id: 'P2386', dimension: 'length' },
  wheelbase: { id: 'P3039', dimension: 'length' },
  wingspan: { id: 'P2050', dimension: 'length' },
  elevation: { id: 'P2044', dimension: 'length' },
  mass: { id: 'P2067', dimension: 'mass' },
};

/** Item-valued facts kept as id + English label (labels resolved by the fetch script). */
export const WIKIDATA_ITEMS: Readonly<Record<string, string>> = {
  gauge: 'P1064',
  wheelArrangement: 'P2978',
};

export interface Quantity {
  /** SI value: metres or kilograms. */
  readonly value: number;
  readonly unit: 'm' | 'kg';
  readonly property: string;
  /** As published: amount string and unit item, e.g. '+7214', 'Q3710'. */
  readonly amount: string;
  readonly sourceUnit: string;
}

export interface WikidataRecord {
  readonly format: 'ts23d-wikidata/1';
  readonly qid: string;
  readonly label: string;
  /** The exact revision fetched (Special:EntityData/<QID>.json?revision=<n>). */
  readonly url: string;
  readonly page: string;
  readonly license: 'CC0-1.0';
  /** ISO date the response was fetched (provenance only; never read by geometry). */
  readonly fetched: string;
  /** sha256 of the raw response bytes. */
  readonly sha256: string;
  readonly quantities: Readonly<Record<string, Quantity>>;
  readonly coordinates?: { readonly lat: number; readonly lon: number };
  readonly items: Readonly<Record<string, { readonly qid: string; readonly label: string }>>;
}

export interface WikidataPin {
  readonly url: string;
  readonly sha256: string;
  readonly fetched: string;
  /** Labels of item values (Q1395 → 'standard gauge'), looked up by the script. */
  readonly labels?: Readonly<Record<string, string>>;
}

export const QID = /^Q[1-9]\d*$/;

export function checkQid(qid: string): string {
  if (!QID.test(qid))
    throw new Ts23dError('T3D_DATA_QID', {
      cause: `'${qid}' is not a Wikidata item id`,
      fix: 'pass the Q-number from the item page, e.g. Q243 (https://www.wikidata.org/wiki/Q243)',
    });
  return qid;
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === 'object' ? (v as Json) : {});

/** Statement values of a property in rank order (preferred, then normal; never deprecated).
 * Only snaks with a value count: `somevalue` / `novalue` statements carry no datavalue. */
function ranked(claims: Json, pid: string): Json[] {
  const all = Array.isArray(claims[pid]) ? (claims[pid] as unknown[]).map(obj) : [];
  const live = all.filter((c) => c['rank'] !== 'deprecated');
  const order = [
    ...live.filter((c) => c['rank'] === 'preferred'),
    ...live.filter((c) => c['rank'] !== 'preferred'),
  ];
  return order.flatMap((c) => {
    const value = obj(obj(c['mainsnak'])['datavalue'])['value'];
    return value && typeof value === 'object' ? [value as Json] : [];
  });
}

const best = (claims: Json, pid: string): Json | undefined => ranked(claims, pid)[0];

const unitOf = (v: Json): string => (typeof v['unit'] === 'string' ? v['unit'] : '1');

/** Best quantity: a unitless ('1') amount is skipped while a statement with a unit exists. */
function bestQuantity(claims: Json, pid: string): Json | undefined {
  const amounts = ranked(claims, pid).filter((v) => typeof v['amount'] === 'string');
  return amounts.find((v) => unitId(unitOf(v)) !== '1') ?? amounts[0];
}

/** Parse a Special:EntityData response for `qid`. */
export function parseWikidata(raw: unknown, qid: string, pin: WikidataPin): WikidataRecord {
  checkQid(qid);
  const entities = obj(obj(raw)['entities']);
  // A redirected item answers under its new id: accept the single entity it returns.
  const e = obj(entities[qid] ?? Object.values(entities)[0]);
  if (typeof e['id'] !== 'string' || 'missing' in e)
    throw new Ts23dError('T3D_DATA_QID', {
      cause: `Wikidata has no entity ${qid}`,
      fix: 'check the id on https://www.wikidata.org (it may be deleted or mistyped)',
    });
  const claims = obj(e['claims']);
  const quantities: Record<string, Quantity> = {};
  for (const [name, p] of Object.entries(WIKIDATA_QUANTITIES)) {
    const v = bestQuantity(claims, p.id);
    if (!v || typeof v['amount'] !== 'string') continue;
    const unit = unitOf(v);
    quantities[name] = {
      value: toSi(Number(v['amount']), unit, p.dimension, `${qid} ${p.id} (${name})`),
      unit: p.dimension === 'mass' ? 'kg' : 'm',
      property: p.id,
      amount: v['amount'],
      sourceUnit: unitId(unit),
    };
  }
  const items: Record<string, { qid: string; label: string }> = {};
  for (const [name, pid] of Object.entries(WIKIDATA_ITEMS)) {
    const id = best(claims, pid)?.['id'];
    if (typeof id === 'string') items[name] = { qid: id, label: pin.labels?.[id] ?? id };
  }
  const c = best(claims, 'P625');
  const label = obj(obj(e['labels'])['en'])['value'];
  return {
    format: 'ts23d-wikidata/1',
    qid: e['id'],
    label: typeof label === 'string' ? label : e['id'],
    url: pin.url,
    page: `https://www.wikidata.org/wiki/${e['id']}`,
    license: 'CC0-1.0',
    fetched: pin.fetched,
    sha256: pin.sha256,
    quantities,
    ...(c && typeof c['latitude'] === 'number' && typeof c['longitude'] === 'number'
      ? { coordinates: { lat: c['latitude'], lon: c['longitude'] } }
      : {}),
    items,
  };
}
