import { describe, expect, it } from 'bun:test';
import { type BenchRow, benchTable, formatKib, formatMs, readmeRows } from './bench-table.ts';

const row = (asset: string): BenchRow => ({
  asset,
  triangles: [188016, 21860, 1062],
  kib: [16863, 1819, 85],
  parts: 28,
  animated: 0,
  drawCalls: 1,
  ms: 1543,
  qa: 'PASS',
});

describe('bench table', () => {
  it('writes counts, sizes and times for people', () => {
    expect(benchTable([row('eiffel_tower')])).toContain(
      '| `eiffel_tower` | 188k / 21.9k / 1.06k | 16.5 MB / 1.78 MB / 85 KB | 28 | 0 | 1 | 1.54 s | PASS |',
    );
  });

  it('formats sizes and times on both sides of the unit change', () => {
    expect([1023, 1024].map(formatKib)).toEqual(['1023 KB', '1 MB']);
    expect([999, 1000].map(formatMs)).toEqual(['999 ms', '1 s']);
  });

  it('puts only the README assets in the README', () => {
    expect(readmeRows([row('great_white'), row('boxcar')]).map((r) => r.asset)).toEqual([
      'great_white',
    ]);
  });
});
