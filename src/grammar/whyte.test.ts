import { expect, it } from 'bun:test';
import { parseWhyte } from './whyte.ts';

it('parses Whyte arrangements', () => {
  expect(parseWhyte('4-4-0').map((g) => g.count)).toEqual([4, 4, 0]);
  expect(() => parseWhyte('4-4')).toThrow(/Whyte/);
});
