// definePart: a reusable, parametric, LOD-aware piece of geometry (a bolt, a hinge, a wheel) defined
// once and placed anywhere. Typed params from defaults, validated (T3D_PART_PARAMS + fix), built once
// per (name, params, LOD) and cached, composable (parts call parts), described for a catalogue.
// Pure core: a part's build imports primitives itself; core only runs and caches it.

import {
  checkDefaults,
  type Overrides,
  type ParamInfo,
  type ParamSchema,
  paramInfo,
  paramsKey,
  resolveParams,
} from './define-part-params.ts';
import { pieceMesh, placedMesh, placePiece } from './define-part-place.ts';
import type { BuildContext } from './definition.ts';
import { Ts23dError } from './errors.ts';
import { type Mesh, merge } from './mesh.ts';
import type { Lod, Motion, PartOptions, Surface } from './part.ts';
import { createRng, type Rng } from './rng.ts';
import type { Placement } from './transform.ts';
import type { Vec3 } from './vec.ts';

export * from './define-part-params.ts';

/** One named node of a multi-node part: a door leaf that swings, a lamp's glowing lens. */
export interface PartPiece {
  /** snake_case suffix: the node is `<call name>_<piece name>`. */
  readonly name: string;
  /** null = an empty pivot later pieces need not use. */
  readonly mesh: Mesh | null;
  /** Pivot in the part's space; the mesh is authored relative to it. */
  readonly at?: Vec3;
  readonly surface?: Surface;
  readonly motion?: Motion;
  /** Sibling pieces this moving piece passes through by design (a hinge leaf's knuckles). */
  readonly clearOf?: readonly string[];
}

/** What a part's build receives: the LOD it builds for, a stable rng, and other parts. */
export interface PartBuilder {
  readonly lod: Lod;
  pick<T>(perLod: readonly [T, T, T]): T;
  /** Seeded from (part name, params): identical calls draw identical numbers. */
  readonly rng: Rng;
  /** Another part's merged mesh at this LOD (cached): composition. */
  mesh<Q extends object>(part: DefinedPart<Q>, overrides?: Overrides<Q>): Mesh;
  /** Another part's pieces at this LOD: split them across your own pieces (a hinge's two leaves). */
  pieces<Q extends object>(part: DefinedPart<Q>, overrides?: Overrides<Q>): readonly PartPiece[];
}

/** Per-LOD policy: which LODs emit the part, and which build serves each. */
export interface PartLodPolicy {
  /** Highest LOD that emits the part; above it the part is dropped (rivets: 0, bolts: 1). */
  readonly upTo?: Lod;
  /** Build LOD serving each requested LOD: `[0, 0, 1]` keeps full detail at LOD1. */
  readonly map?: readonly [Lod, Lod, Lod];
}

export interface PartDefinition<P extends object> {
  /** snake_case; also the catalogue key and the cache key. */
  readonly name: string;
  readonly description: string;
  readonly tags?: readonly string[];
  /** Defaults for every parameter; their types are the parameter types. */
  readonly params: P;
  readonly schema?: ParamSchema<P>;
  /** Cross-parameter rule; return the problem in words, or undefined when fine. */
  readonly validate?: (p: Readonly<P>) => string | undefined;
  readonly lod?: PartLodPolicy;
  build(b: PartBuilder, p: Readonly<P>): Mesh | readonly PartPiece[];
}

export interface PartInfo {
  readonly name: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly params: readonly ParamInfo[];
  readonly lod?: PartLodPolicy;
}

/** How one placement adds the part to an asset. */
export interface PartCall extends PartOptions {
  /** Bake a rotation/scale into meshes, pivots and motion axes (a hinge laid on its side). */
  readonly place?: Placement;
  /** Override the definition's `lod.upTo` for this placement. */
  readonly upTo?: Lod;
}

export type LodLike = Lod | { readonly lod: Lod };

export interface DefinedPart<P extends object> {
  /** Add the part to `ctx` as `name` (one mesh) or a `name` group of `name_<piece>` nodes. */
  (ctx: BuildContext, name: string, overrides?: Overrides<P>, options?: PartCall): void;
  readonly info: PartInfo;
  readonly defaults: Readonly<P>;
  /** Defaults ⊕ overrides, validated. */
  params(overrides?: Overrides<P>): Readonly<P>;
  /** All pieces merged into one mesh (at their pivots); empty when the LOD drops the part. */
  mesh(overrides?: Overrides<P>, lod?: LodLike, upTo?: Lod): Mesh;
  /** The pieces as built (a one-mesh part is one piece named 'mesh'); [] when dropped. */
  pieces(overrides?: Overrides<P>, lod?: LodLike, upTo?: Lod): readonly PartPiece[];
  /** Cache counters: builds actually run vs calls served from the cache. */
  stats(): { readonly builds: number; readonly hits: number };
}

/** Any defined part, whatever its params: what a catalogue holds. */
export type AnyPart = DefinedPart<object>;

const EMPTY: Mesh = merge([]);
const CACHE_CAP = 256;
const lodOf = (l: LodLike | undefined): Lod => (typeof l === 'object' ? l.lod : (l ?? 0));

export function definePart<P extends object>(def: PartDefinition<P>): DefinedPart<P> {
  if (!/^[a-z][a-z0-9_]*$/.test(def.name))
    throw new Ts23dError('T3D_RECIPE_INVALID', {
      cause: `part name '${def.name}' is not snake_case`,
      fix: 'rename it to [a-z][a-z0-9_]* — it keys the catalogue and the cache',
    });
  checkDefaults(def.name, def.params);
  if (def.lod) checkLodPolicy(def.name, def.lod);
  const cache = new Map<string, { pieces: readonly PartPiece[]; merged: Mesh }>();
  let builds = 0;
  let hits = 0;
  const params = (o?: Overrides<P>): Readonly<P> =>
    resolveParams(def.name, def.params, def.schema, o, def.validate);

  const built = (o: Overrides<P> | undefined, l: LodLike | undefined, upTo?: Lod) => {
    const asked = lodOf(l);
    const limit = upTo ?? def.lod?.upTo;
    if (limit !== undefined && asked > limit) return null;
    const lod = def.lod?.map?.[asked] ?? asked;
    const p = params(o);
    const key = `${lod}|${paramsKey(def.params, p)}`;
    const hit = cache.get(key);
    if (hit) {
      hits++;
      return hit;
    }
    builds++;
    const out = def.build(builder(lod, `${def.name}|${key}`), p);
    const pieces: readonly PartPiece[] = isPieces(out)
      ? checkPieces(def.name, out)
      : [{ name: 'mesh', mesh: out }];
    const entry = { pieces, merged: merge(pieces.flatMap(pieceMesh)) };
    if (cache.size >= CACHE_CAP) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(key, entry);
    return entry;
  };

  const add = (ctx: BuildContext, name: string, o?: Overrides<P>, call: PartCall = {}): void => {
    const { place, upTo, ...opts } = call;
    const b = built(o, ctx.lod, upTo);
    if (!b) return;
    const only = b.pieces.length === 1 && b.pieces[0]?.name === 'mesh' ? b.pieces[0] : undefined;
    if (only) {
      ctx.part(name, place ? placedMesh(b.merged, place) : b.merged, opts);
      return;
    }
    const pieces = place ? b.pieces.map((pc) => placePiece(pc, place)) : b.pieces;
    ctx.group(name, opts);
    for (const pc of pieces)
      ctx.part(`${name}_${pc.name}`, pc.mesh, {
        parent: name,
        ...(pc.at ? { at: pc.at } : {}),
        ...(pc.surface ? { surface: pc.surface } : {}),
        ...(pc.motion ? { motion: pc.motion } : {}),
        // A moving piece's clearOf: its own siblings plus whatever the call allows.
        ...(pc.motion && (pc.clearOf || opts.clearOf)
          ? { clearOf: [...(pc.clearOf ?? []).map((s) => `${name}_${s}`), ...(opts.clearOf ?? [])] }
          : {}),
      });
  };

  return Object.assign(add, {
    info: {
      name: def.name,
      description: def.description,
      tags: def.tags ?? [],
      params: paramInfo(def.params, def.schema),
      ...(def.lod ? { lod: def.lod } : {}),
    },
    defaults: def.params,
    params,
    mesh: (o?: Overrides<P>, l?: LodLike, upTo?: Lod) => built(o, l, upTo)?.merged ?? EMPTY,
    pieces: (o?: Overrides<P>, l?: LodLike, upTo?: Lod) => built(o, l, upTo)?.pieces ?? [],
    stats: () => ({ builds, hits }),
  });
}

function builder(lod: Lod, key: string): PartBuilder {
  return {
    lod,
    pick: (perLod) => perLod[lod],
    rng: createRng(0x7a3d).fork(key),
    mesh: (part, o) => part.mesh(o, lod),
    pieces: (part, o) => part.pieces(o, lod),
  };
}

const isLod = (v: unknown): v is Lod => v === 0 || v === 1 || v === 2;

/** `upTo` is a LOD; `map` is three LODs that never get finer as the requested LOD rises. */
function checkLodPolicy(part: string, lod: PartLodPolicy): void {
  if (lod.upTo !== undefined && !isLod(lod.upTo))
    throw new Ts23dError('T3D_RECIPE_INVALID', {
      cause: `part '${part}' lod.upTo ${lod.upTo} is not 0, 1 or 2`,
      fix: 'set upTo to the highest LOD that emits the part: 0, 1 or 2',
    });
  const map = lod.map;
  if (map === undefined) return;
  const ok = map.length === 3 && map.every(isLod) && map[0] <= map[1] && map[1] <= map[2];
  if (!ok)
    throw new Ts23dError('T3D_RECIPE_INVALID', {
      cause: `part '${part}' lod.map [${map.join(', ')}] is not three non-decreasing LODs`,
      fix: 'give the build LOD for each of LOD0/1/2, coarsening only: e.g. map: [0, 0, 1]',
    });
}

const isPieces = (out: Mesh | readonly PartPiece[]): out is readonly PartPiece[] =>
  Array.isArray(out);

function checkPieces(part: string, pieces: readonly PartPiece[]): readonly PartPiece[] {
  const seen = new Set<string>();
  for (const pc of pieces) {
    if (!/^[a-z][a-z0-9_]*$/.test(pc.name) || seen.has(pc.name))
      throw new Ts23dError('T3D_RECIPE_INVALID', {
        cause: `part '${part}' returned piece '${pc.name}' (${seen.has(pc.name) ? 'duplicate' : 'not snake_case'})`,
        fix: 'give each piece a unique snake_case name: frame, sash, glass',
      });
    seen.add(pc.name);
  }
  return pieces;
}

/** Catalogue rows for a list of parts, sorted by name (stable for generated docs). */
export const catalogueOf = (parts: readonly AnyPart[]): PartInfo[] =>
  parts.map((p) => p.info).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
