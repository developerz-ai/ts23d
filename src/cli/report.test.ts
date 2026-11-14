import { expect, it } from 'bun:test';
import type { Finding } from '../qa/index.ts';
import { findingLine, foldLods, lodLabel } from './report.ts';

const f = (message: string, extra: Partial<Finding> = {}): Finding => ({
  gate: 'floating-parts',
  code: 'T3D_QA_FLOATING_PARTS',
  part: 'wheel',
  message,
  fix: 'move it onto hull',
  ...extra,
});

it('labels LOD sets as a range only when contiguous', () => {
  expect(lodLabel([0, 1, 2])).toBe('0-2');
  expect(lodLabel([0, 2])).toBe('0,2');
  expect(lodLabel([2, 0])).toBe('0,2');
  expect(lodLabel([1])).toBe('1');
});

it('folds a finding that holds at every LOD into one LOD0-2 line, keeps different ones apart', () => {
  const folded = foldLods([
    { lod: 0, findings: [f('floats'), f('sunk', { gate: 'clashes', code: 'T3D_QA_CLASHES' })] },
    { lod: 1, findings: [f('floats')] },
    { lod: 2, findings: [f('floats'), f('floats', { gap: 0.05 })] },
  ]);
  expect(folded.map((x) => x.message)).toEqual(['LOD0-2: floats', 'LOD0: sunk', 'LOD2: floats']);
  expect(folded[2]?.gap).toBe(0.05);
});

it('prints the code, and gap / nearest when present', () => {
  const line = findingLine(f('LOD0: floats', { gap: 0.0312, nearest: 'hull' }));
  expect(line).toContain('T3D_QA_FLOATING_PARTS floating-parts [wheel]: LOD0: floats');
  expect(line).toContain('gap 0.031 m, nearest hull');
  expect(line).toContain('fix: move it onto hull');
  expect(findingLine(f('x'))).not.toContain('gap');
});
