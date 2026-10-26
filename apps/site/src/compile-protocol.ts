// Messages between the page and the compile worker. Types only.

import type { AssetManifest } from '@developerz-ai/ts23d';
import type { Footprint } from './diorama.ts';

export type Lod = 0 | 1 | 2;

/** What to compile: a recipe by asset name, or a diorama base for the viewer. */
export type Target =
  | { readonly kind: 'recipe'; readonly name: string }
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

/** The CLI's manifest.json, minus QA (never run in the browser) and file paths. */
export type Manifest = Omit<AssetManifest, 'qa' | 'files'>;

/** The painted trim sheet: RGBA bytes per map, size × size. */
export interface Sheet {
  readonly size: number;
  readonly albedo: Uint8Array;
  readonly normal: Uint8Array;
  readonly orm: Uint8Array;
}

export type Ask =
  | { readonly request: BuildRequest }
  | { readonly list: true }
  | { readonly manifest: string }
  | { readonly sheet: true };

export type Answer = BuildResult | readonly CatalogEntry[] | Manifest | Sheet;

export type WorkerIn = { readonly id: number } & Ask;
export type WorkerOut =
  | { readonly id: number; readonly ok: true; readonly answer: Answer }
  | { readonly id: number; readonly ok: false; readonly error: string };
