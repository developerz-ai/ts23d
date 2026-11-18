// The benchmark table people read in the README: counts as 188k, sizes in KB or MB, times in ms or
// s. `bun run bench --json` keeps the exact numbers.

import { formatCount } from '../../src/core/index.ts';

export interface BenchRow {
  readonly asset: string;
  readonly triangles: readonly number[];
  readonly kib: readonly number[];
  readonly parts: number;
  readonly animated: number;
  readonly drawCalls: number;
  readonly ms: number;
  readonly qa: 'PASS' | 'FAIL';
}

/** The assets the README lists; every recipe is still measured for `--json`. */
const README_ASSETS: ReadonlySet<string> = new Set([
  'bluefin_tuna',
  'common_octopus',
  'eiffel_tower',
  'great_white',
  'hydra',
  'king_cobra',
  'loco_440',
  'material_swatches',
  'oak',
  'palm',
  'pine',
  't34',
  't34_1941',
  'tiger_1',
]);

const digits = (n: number): number => Number(n.toPrecision(3));

export const formatKib = (kib: number): string =>
  kib < 1024 ? `${kib} KB` : `${digits(kib / 1024)} MB`;

export const formatMs = (ms: number): string => (ms < 1000 ? `${ms} ms` : `${digits(ms / 1000)} s`);

export const readmeRows = (rows: readonly BenchRow[]): BenchRow[] =>
  rows.filter((r) => README_ASSETS.has(r.asset));

export const benchTable = (rows: readonly BenchRow[]): string =>
  [
    '| asset | tris LOD0 / 1 / 2 | GLB size LOD0 / 1 / 2 | parts | animated | draw calls (1 material) | compile + QA, 3 LODs | QA |',
    '|---|---|---|---|---|---|---|---|',
    ...rows.map(
      (r) =>
        `| \`${r.asset}\` | ${r.triangles.map(formatCount).join(' / ')} | ${r.kib.map(formatKib).join(' / ')} | ${r.parts} | ${r.animated} | ${r.drawCalls} | ${formatMs(r.ms)} | ${r.qa} |`,
    ),
  ].join('\n');
