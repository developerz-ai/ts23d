import { expect, it } from 'bun:test';
import { checkSource } from './determinism.ts';

it('refuses ambient entropy and ignores comments', () => {
  expect(checkSource('a.ts', 'const x = Math.random();')).toHaveLength(1);
  expect(checkSource('a.ts', 'const t = Date.now();')).toHaveLength(1);
  expect(checkSource('a.ts', '// Math.random() is banned')).toEqual([]);
  expect(checkSource('a.ts', 'const r = ctx.rng.next();')).toEqual([]);
});
