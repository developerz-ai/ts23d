import { expect, it } from 'bun:test';
import { type IndexEntry, mergeIndex } from './index-json.ts';
import type { AssetManifest } from './manifest.ts';

const built = (name: string, pass: boolean): AssetManifest =>
  ({ name, triangles: [12], qa: { pass, findings: [] } }) as unknown as AssetManifest;
const entry = (name: string): IndexEntry => ({
  name,
  qa: 'PASS',
  triangles: [1],
  manifest: `${name}/manifest.json`,
});

it('merges a run into the existing index by name, sorted, ok only when all pass', () => {
  const merged = mergeIndex([entry('zeppelin'), entry('crate')], [built('crate', false)]);
  expect(merged.assets.map((a) => [a.name, a.qa])).toEqual([
    ['crate', 'FAIL'],
    ['zeppelin', 'PASS'],
  ]);
  expect(merged.ok).toBe(false);
  expect(mergeIndex([], [built('a', true)]).ok).toBe(true);
});
