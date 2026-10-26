import { describe, expect, it } from 'bun:test';
import { Ts23dError } from '../core/index.ts';
import { parseSplit, split } from './split.ts';

const total = (slots: { size: number }[]): number => slots.reduce((s, x) => s + x.size, 0);

describe('split grammar', () => {
  it('parses fixed, repeat and stretch terms', () => {
    expect(parseSplit('pier:0.9 | {arch:2.5}* | door:3 | pier:~').map((t) => t.kind)).toEqual([
      'fixed',
      'repeat',
      'fixed',
      'stretch',
    ]);
  });

  it('fills the strip exactly', () => {
    const slots = split('pier:0.9 | {arch:2.5}* | door:3 | pier:~', 20);
    expect(total(slots)).toBeCloseTo(20, 9);
    expect(slots.filter((s) => s.symbol === 'arch')).toHaveLength(6);
  });

  it('widens repeats when nothing stretches', () => {
    const slots = split('{win:1 | wall:0.5}*', 10);
    expect(total(slots)).toBeCloseTo(10, 9);
  });

  it('refuses an overflow with a code', () => {
    expect(() => split('door:3 | door:3', 5)).toThrow(Ts23dError);
  });

  it('refuses bad syntax', () => {
    expect(() => parseSplit('door=3')).toThrow(/T3D_GRAMMAR_SYNTAX/);
  });
});
