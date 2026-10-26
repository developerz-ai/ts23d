// The DSL's root: an asset is a TypeScript function that builds named parts into a scene.
// Code, not JSON — loops, helpers and composition are the point (docs/decisions/005).

import { Ts23dError } from './errors.ts';
import type { Mesh } from './mesh.ts';
import { createRng, type Rng } from './rng.ts';
import type { Vec3 } from './vec.ts';

/** 0 = hero detail, 1 = mid, 2 = far. A recipe reads it and drops detail; it never decimates. */
export type Lod = 0 | 1 | 2;

export interface Spin {
  readonly kind: 'spin';
  /** Rotation axis in the part's local space. */
  readonly axis: Vec3;
  /** Revolutions per second of the baked loop. */
  readonly rps: number;
}

export interface Slide {
  readonly kind: 'slide';
  /** Peak offset of a sinusoidal back-and-forth (piston rods, sliders). */
  readonly offset: Vec3;
  readonly hz: number;
}

export type Motion = Spin | Slide;

export interface PartOptions {
  /** Pivot in the parent's space; the mesh is authored relative to it. */
  readonly at?: Vec3;
  readonly parent?: string;
  /** Rotation about local Z, radians. A part that also moves goes inside a yawed group. */
  readonly yaw?: number;
  readonly motion?: Motion;
}

export interface UseOptions {
  /** Prefix for every instanced part: `house_3` → `house_3_roof`, `house_3_door_0`. */
  readonly prefix: string;
  readonly at?: Vec3;
  readonly yaw?: number;
  readonly parent?: string;
  /** Per-instance seed, so ten copies of one recipe are ten variants. */
  readonly seed?: number;
}

export interface Part {
  readonly name: string;
  readonly mesh: Mesh | null;
  readonly at: Vec3;
  readonly parent: string | null;
  readonly yaw: number;
  readonly motion: Motion | null;
}

export interface BuildContext {
  readonly lod: Lod;
  readonly seed: number;
  readonly rng: Rng;
  /** Add a named part. Names are the contract with the engine: `axle_*`, `door_*`, `rotor_*`. */
  part(name: string, mesh: Mesh | null, options?: PartOptions): void;
  /** An empty pivot that other parts parent to. */
  group(name: string, options?: PartOptions): void;
  /** Instance another asset inside this one, compiled at this LOD — the composition primitive. */
  use(asset: Asset, options: UseOptions): void;
}

export interface Budget {
  /** Triangle ceiling per LOD; QA fails the build above it. */
  readonly triangles: readonly [number, number, number];
}

export interface AssetDefinition {
  readonly name: string;
  readonly kind: string;
  readonly description?: string;
  readonly tags?: readonly string[];
  readonly budget: Budget;
  readonly seed?: number;
  build(ctx: BuildContext): void;
}

export interface Asset extends AssetDefinition {
  readonly __ts23d: 'asset';
}

export interface CompiledAsset {
  readonly name: string;
  readonly kind: string;
  readonly lod: Lod;
  readonly budget: Budget;
  readonly parts: readonly Part[];
}

export function defineAsset(def: AssetDefinition): Asset {
  if (!/^[a-z][a-z0-9_]*$/.test(def.name)) {
    throw new Ts23dError('T3D_RECIPE_INVALID', {
      cause: `asset name '${def.name}' is not snake_case`,
      fix: 'rename it to [a-z][a-z0-9_]* — it becomes the GLB file name and the root node',
    });
  }
  return { ...def, __ts23d: 'asset' };
}

export const isAsset = (value: unknown): value is Asset =>
  typeof value === 'object' &&
  value !== null &&
  (value as { __ts23d?: unknown }).__ts23d === 'asset';

export function compile(asset: Asset, options: { lod?: Lod; seed?: number } = {}): CompiledAsset {
  const lod = options.lod ?? 0;
  const seed = options.seed ?? asset.seed ?? 1;
  const parts = new Map<string, Part>();
  const add = (name: string, mesh: Mesh | null, o: PartOptions = {}): void => {
    if (parts.has(name)) {
      throw new Ts23dError('T3D_PART_DUPLICATE', {
        cause: `part '${name}' was added twice in '${asset.name}'`,
        fix: 'give each part a unique name — suffix the loop index, e.g. wheel_0, wheel_1',
      });
    }
    if (o.parent !== undefined && !parts.has(o.parent)) {
      throw new Ts23dError('T3D_PART_UNKNOWN', {
        cause: `part '${name}' parents to '${o.parent}', which does not exist yet`,
        fix: 'add the parent (ctx.group or ctx.part) before its children',
      });
    }
    if (o.motion && o.yaw) {
      throw new Ts23dError('T3D_RECIPE_INVALID', {
        cause: `part '${name}' sets both yaw and motion`,
        fix: 'put the yaw on a parent ctx.group and the motion on the part inside it',
      });
    }
    parts.set(name, {
      name,
      mesh,
      at: o.at ?? [0, 0, 0],
      parent: o.parent ?? null,
      yaw: o.yaw ?? 0,
      motion: o.motion ?? null,
    });
  };
  const use = (child: Asset, o: UseOptions): void => {
    const sub = compile(child, { lod, seed: o.seed ?? seed });
    add(o.prefix, null, {
      at: o.at ?? [0, 0, 0],
      yaw: o.yaw ?? 0,
      ...(o.parent ? { parent: o.parent } : {}),
    });
    for (const p of sub.parts) {
      add(`${o.prefix}_${p.name}`, p.mesh, {
        at: p.at,
        yaw: p.yaw,
        parent: p.parent ? `${o.prefix}_${p.parent}` : o.prefix,
        ...(p.motion ? { motion: p.motion } : {}),
      });
    }
  };
  asset.build({
    lod,
    seed,
    rng: createRng(seed),
    part: add,
    group: (name, o) => add(name, null, o),
    use,
  });
  return {
    name: asset.name,
    kind: asset.kind,
    lod,
    budget: asset.budget,
    parts: [...parts.values()],
  };
}
