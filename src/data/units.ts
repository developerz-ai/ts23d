// Unit normalisation for real-world data: every length becomes metres and every mass kilograms,
// whatever the source used (Wikidata names units by item id: Q3710 = foot, Q191118 = tonne). An
// unknown unit refuses with T3D_DATA_UNIT rather than guessing a factor.

import { Ts23dError } from '../core/index.ts';

export type Dimension = 'length' | 'mass';

export interface UnitDef {
  readonly name: string;
  readonly dimension: Dimension;
  /** Multiply by this to get metres / kilograms. */
  readonly toSi: number;
}

/** Wikidata unit items → SI factor. Exact by definition (international foot, avoirdupois pound). */
export const WIKIDATA_UNITS: Readonly<Record<string, UnitDef>> = {
  Q11573: { name: 'metre', dimension: 'length', toSi: 1 },
  Q828224: { name: 'kilometre', dimension: 'length', toSi: 1000 },
  Q174728: { name: 'centimetre', dimension: 'length', toSi: 0.01 },
  Q174789: { name: 'millimetre', dimension: 'length', toSi: 0.001 },
  Q3710: { name: 'foot', dimension: 'length', toSi: 0.3048 },
  Q218593: { name: 'inch', dimension: 'length', toSi: 0.0254 },
  Q482798: { name: 'yard', dimension: 'length', toSi: 0.9144 },
  Q253276: { name: 'mile', dimension: 'length', toSi: 1609.344 },
  Q11570: { name: 'kilogram', dimension: 'mass', toSi: 1 },
  Q41803: { name: 'gram', dimension: 'mass', toSi: 0.001 },
  Q191118: { name: 'tonne', dimension: 'mass', toSi: 1000 },
  Q100995: { name: 'pound', dimension: 'mass', toSi: 0.45359237 },
  Q469356: { name: 'short ton', dimension: 'mass', toSi: 907.18474 },
  Q667419: { name: 'long ton', dimension: 'mass', toSi: 1016.0469088 },
};

/** `http://www.wikidata.org/entity/Q3710` or `Q3710` → `Q3710`; `1` (unitless) stays `1`. */
export const unitId = (unit: string): string => unit.slice(unit.lastIndexOf('/') + 1);

/** A Wikidata amount in `unit` → SI value, checked against the dimension the property needs. */
export function toSi(amount: number, unit: string, want: Dimension, where: string): number {
  const id = unitId(unit);
  const def = WIKIDATA_UNITS[id];
  if (!def)
    throw new Ts23dError('T3D_DATA_UNIT', {
      cause: `${where}: unit ${id} is not a known ${want} unit`,
      fix: `add ${id} with its exact SI factor to WIKIDATA_UNITS (src/data/units.ts), after checking https://www.wikidata.org/wiki/${id}`,
    });
  if (def.dimension !== want)
    throw new Ts23dError('T3D_DATA_UNIT', {
      cause: `${where}: unit ${def.name} is a ${def.dimension}, the property needs a ${want}`,
      fix: 'the statement is mis-typed upstream: map a different property, or fix it on Wikidata',
    });
  return amount * def.toSi;
}
