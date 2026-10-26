// Messages between the page and the compile worker. Types only.

import type { Footprint } from './diorama.ts';

export type Lod = 0 | 1 | 2;

/** What to compile: a recipe by asset name, the play terrain, or a diorama base. */
export type Target =
  | { readonly kind: 'recipe'; readonly name: string }
  | { readonly kind: 'terrain' }
  | { readonly kind: 'diorama'; readonly name: string; readonly footprint: Footprint };

export interface BuildRequest {
  readonly target: Target;
  readonly lod: Lod;
  readonly keepParts?: boolean;
  /** Bake the `rest` + `run` clips. Default true. */
  readonly animations?: boolean;
}

export interface PartInfo {
  readonly name: string;
  readonly parent: string | null;
  readonly triangles: number;
  readonly motion: string | null;
  readonly emitter: string | null;
}

export interface BuildResult {
  readonly glb: Uint8Array;
  readonly triangles: number;
  readonly ms: number;
  readonly parts: readonly PartInfo[];
}

/** Plain-data asset metadata: what the page shows without importing a recipe. */
export interface AssetInfo {
  readonly name: string;
  readonly kind: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly budget: { readonly triangles: readonly [number, number, number] };
}

export interface CatalogEntry {
  readonly asset: AssetInfo;
  readonly file: string;
  readonly family: string | null;
}

export type WorkerIn =
  | { readonly id: number; readonly request: BuildRequest }
  | { readonly id: number; readonly list: true };
export type WorkerOut =
  | { readonly id: number; readonly ok: true; readonly result: BuildResult }
  | { readonly id: number; readonly ok: true; readonly list: readonly CatalogEntry[] }
  | { readonly id: number; readonly ok: false; readonly error: string };
