// Pinned records → a recipe's declared numbers. `realFrom` turns Wikidata quantities into the
// `real` block (length / width / height / mass / measures) plus the source strings to cite, so a
// spec value is never typed by hand twice. `crossCheck` compares a record with the values a recipe
// already declares and lists every conflict beyond tolerance (sources disagree more than you think).

import { Ts23dError } from '../core/index.ts';
import type { WikidataRecord } from './wikidata.ts';

type Axis = 'x' | 'y' | 'z';

export interface MeasureFrom {
  /** Quantity name in the record ('gauge', 'diameter', 'wheelbase', …). */
  readonly from: string;
  readonly label: string;
  readonly axis: Axis;
  readonly parts?: readonly string[];
  readonly between?: readonly [string, string];
  readonly tolerance?: number;
}

export interface RealFromOptions {
  /** Which record quantity feeds each `real` axis: { length: 'length', height: 'height' }. */
  readonly map: {
    readonly length?: string;
    readonly width?: string;
    readonly height?: string;
    readonly mass?: string;
  };
  readonly measures?: readonly MeasureFrom[];
}

export interface RealFrom {
  readonly length?: number;
  readonly width?: number;
  readonly height?: number;
  readonly mass?: number;
  readonly measures: readonly {
    readonly label: string;
    readonly value: number;
    readonly axis: Axis;
    readonly parts?: readonly string[];
    readonly between?: readonly [string, string];
    readonly tolerance?: number;
    readonly source: string;
  }[];
  /** One line per record: cite it in the asset's `sources`. */
  readonly sources: readonly string[];
}

/** Citation for one record: label, QID, licence and the pinned revision URL. */
export const citeWikidata = (r: WikidataRecord): string =>
  `Wikidata ${r.qid} "${r.label}" (${r.license}, fetched ${r.fetched}) ${r.url}`;

export function quantity(r: WikidataRecord, name: string): number {
  const q = r.quantities[name];
  if (!q)
    throw new Ts23dError('T3D_DATA_PROPERTY', {
      cause: `Wikidata ${r.qid} (${r.label}) has no '${name}' — it has: ${Object.keys(r.quantities).join(', ') || 'no quantities'}`,
      fix: `take '${name}' from another source and cite it in sources, or add the statement on ${r.page} and re-run \`bun run data wikidata ${r.qid}\``,
    });
  return q.value;
}

export function realFrom(r: WikidataRecord, o: RealFromOptions): RealFrom {
  const out: Record<string, number> = {};
  for (const [axis, name] of Object.entries(o.map)) if (name) out[axis] = quantity(r, name);
  const source = citeWikidata(r);
  const measures = (o.measures ?? []).map((m) => ({
    label: m.label,
    value: quantity(r, m.from),
    axis: m.axis,
    ...(m.parts ? { parts: m.parts } : {}),
    ...(m.between ? { between: m.between } : {}),
    ...(m.tolerance !== undefined ? { tolerance: m.tolerance } : {}),
    source,
  }));
  return { ...out, measures, sources: [source] };
}

export interface Conflict {
  readonly quantity: string;
  readonly record: number;
  readonly declared: number;
  /** |record − declared| / declared. */
  readonly relative: number;
  readonly message: string;
}

/**
 * Compare declared spec values (SI) with the record. Quantities the record lacks are skipped (use
 * `quantity` to require one); every difference beyond `tolerance` (default 2 %) is a conflict.
 */
export function crossCheck(
  r: WikidataRecord,
  declared: Readonly<Record<string, number>>,
  tolerance = 0.02,
): Conflict[] {
  const out: Conflict[] = [];
  for (const [name, value] of Object.entries(declared)) {
    const q = r.quantities[name];
    if (!q) continue;
    const relative = Math.abs(q.value - value) / Math.max(Math.abs(value), 1e-9);
    if (relative > tolerance)
      out.push({
        quantity: name,
        record: q.value,
        declared: value,
        relative,
        message: `${name}: Wikidata ${r.qid} says ${q.value} ${q.unit}, declared ${value} (${(relative * 100).toFixed(1)} % apart, tolerance ${(tolerance * 100).toFixed(1)} %)`,
      });
  }
  return out;
}
