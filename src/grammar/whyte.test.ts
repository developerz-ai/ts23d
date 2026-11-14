import { expect, it } from 'bun:test';
import { parseWhyte } from './whyte.ts';

it('refuses anything but digits-digits-digits with even counts and drivers', () => {
  for (const bad of [
    '--',
    '4-0-0',
    '4-4',
    ' 4-4-0',
    '4-4-0 ',
    '4-4-0x',
    '+4-4-0',
    '4-4.0-0',
    '4-3-0',
  ])
    expect(() => parseWhyte(bad)).toThrow(/T3D_GRAMMAR_SYNTAX/);
});

it('parses Whyte arrangements', () => {
  expect(parseWhyte('4-4-0').map((g) => g.count)).toEqual([4, 4, 0]);
  expect(parseWhyte('2-10-2').map((g) => g.role)).toEqual(['leading', 'driving', 'trailing']);
});
