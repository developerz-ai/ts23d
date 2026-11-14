// <out>/index.json: every asset built into <out>, keyed by name and sorted, with its QA verdict.
// A run merges into the index already there, so building A then B into one --out lists both.

import { join } from 'node:path';
import type { AssetManifest } from './manifest.ts';

export interface IndexEntry {
  readonly name: string;
  readonly qa: 'PASS' | 'FAIL';
  readonly triangles: readonly number[];
  /** Relative to <out>/. */
  readonly manifest: string;
}

export interface IndexFile {
  readonly ok: boolean;
  readonly assets: readonly IndexEntry[];
}

const entryOf = (m: AssetManifest): IndexEntry => ({
  name: m.name,
  qa: m.qa.pass ? 'PASS' : 'FAIL',
  triangles: m.triangles,
  manifest: join(m.name, 'manifest.json'),
});

/** Entries of an existing index.json; a file that is not one is regenerated from this run. */
async function existing(path: string): Promise<IndexEntry[]> {
  const f = Bun.file(path);
  if (!(await f.exists())) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(await f.text());
  } catch {
    // index.json is derived output, never a source: a corrupt one is replaced, not repaired.
    return [];
  }
  const assets = (parsed as { assets?: unknown }).assets;
  return Array.isArray(assets)
    ? assets.filter(
        (a): a is IndexEntry =>
          typeof a === 'object' && a !== null && typeof (a as IndexEntry).name === 'string',
      )
    : [];
}

export function mergeIndex(old: readonly IndexEntry[], built: readonly AssetManifest[]): IndexFile {
  const byName = new Map(old.map((e) => [e.name, e]));
  for (const m of built) byName.set(m.name, entryOf(m));
  const assets = [...byName.values()].sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
  return { ok: assets.every((a) => a.qa === 'PASS'), assets };
}

export async function writeIndex(out: string, built: readonly AssetManifest[]): Promise<void> {
  const path = join(out, 'index.json');
  const merged = mergeIndex(await existing(path), built);
  await Bun.write(path, `${JSON.stringify(merged, null, 2)}\n`);
}
