// The tune declaration's types, named for this module's API (the source of truth is the
// `tune` field of AssetDefinition in core).

import type { AssetDefinition } from '../core/index.ts';

export type TuneSpec = NonNullable<AssetDefinition['tune']>;
export type TuneParam = TuneSpec['params'][string];
export type TuneObjective = TuneSpec['objectives'][number];
export type TuneView = Extract<TuneObjective, { kind: 'silhouette' }>['view'];
export type TunedValues = Readonly<Record<string, number>>;
