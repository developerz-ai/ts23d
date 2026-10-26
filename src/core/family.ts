// Parametric families: one build function, many assets. A variant is a name plus the parameters
// that differ — "T-34 1941 vs 1943 turret", "4-4-0 vs 2-6-0", "oak vs birch" — so a new model is a
// one-key change, not a copied file. Families extend families: `base.extend({...})` layers new
// defaults and can wrap the parent's build to add or replace detail.

import { type Asset, type AssetDefinition, type BuildContext, defineAsset } from './asset.ts';

type Shared = Omit<AssetDefinition, 'name' | 'build'>;

export interface FamilyDefinition<P extends object> extends Shared {
  /** Defaults for every parameter; variants override a subset. */
  readonly defaults: P;
  build(ctx: BuildContext, params: Readonly<P>): void;
}

export interface Variant<P> extends Partial<Shared> {
  readonly name: string;
  readonly params?: Partial<P>;
}

export interface Family<P extends object> {
  readonly defaults: Readonly<P>;
  /** Make one asset of this family. */
  variant(v: Variant<P>): Asset;
  /** Derive a family: new defaults (may add parameters) and optionally a build that wraps ours. */
  extend<Q extends object>(
    o: {
      readonly defaults: Q;
      readonly build?: (ctx: BuildContext, params: Readonly<P & Q>, base: () => void) => void;
    } & Partial<Shared>,
  ): Family<P & Q>;
}

export function defineFamily<P extends object>(def: FamilyDefinition<P>): Family<P> {
  const { defaults, build, ...shared } = def;
  return {
    defaults,
    variant: ({ name, params, ...over }) => {
      const p = { ...defaults, ...params } as P;
      return defineAsset({ ...shared, ...over, name, build: (ctx) => build(ctx, p) });
    },
    extend: ({ defaults: more, build: wrap, ...over }) =>
      defineFamily<P & typeof more>({
        ...shared,
        ...over,
        defaults: { ...defaults, ...more },
        build: (ctx, p) => (wrap ? wrap(ctx, p, () => build(ctx, p)) : build(ctx, p)),
      }),
  };
}
