import { describe, expect, it } from 'bun:test';
import { Ts23dError } from '../core/index.ts';
import { parseSplit, split } from './split.ts';

const total = (slots: { size: number }[]): number => slots.reduce((s, x) => s + x.size, 0);

const code = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    if (e instanceof Ts23dError) return e.code;
    throw e;
  }
  return 'no error';
};

describe('split grammar: bad input', () => {
  it('refuses stray braces and groups without `*`', () => {
    for (const src of ['{arch:2}', 'a:1}b:2', 'a:1 | {b:1', '{a:1 | {b:1}*}*', '{a:1}* x', ''])
      expect(code(() => parseSplit(src))).toBe('T3D_GRAMMAR_SYNTAX');
    expect(code(() => split('{arch:2}', 4))).toBe('T3D_GRAMMAR_SYNTAX');
    expect(code(() => split('a:1}b:2', 3))).toBe('T3D_GRAMMAR_SYNTAX');
  });

  it('refuses empty terms and bad syntax', () => {
    expect(code(() => parseSplit('door=3'))).toBe('T3D_GRAMMAR_SYNTAX');
    expect(code(() => parseSplit('a:1 || b:1'))).toBe('T3D_GRAMMAR_SYNTAX');
    expect(code(() => parseSplit('a:1 | {}*'))).toBe('T3D_GRAMMAR_SYNTAX');
  });

  it('refuses a length that is not finite metres >= 0', () => {
    for (const length of [Number.NaN, Number.POSITIVE_INFINITY, -1])
      expect(code(() => split('a:1', length))).toBe('T3D_GRAMMAR_SYNTAX');
  });

  it('refuses metres nothing can absorb with T3D_GRAMMAR_UNDERFILL', () => {
    expect(code(() => split('a:1|b:1', 5))).toBe('T3D_GRAMMAR_UNDERFILL');
    expect(code(() => split('a:1|{b:2}*', 2.5))).toBe('T3D_GRAMMAR_UNDERFILL');
    expect(code(() => split('a:1|b:~0', 3))).toBe('T3D_GRAMMAR_UNDERFILL');
  });

  it('refuses an overflow with a code', () => {
    expect(code(() => split('door:3 | door:3', 5))).toBe('T3D_GRAMMAR_OVERFLOW');
  });
});

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
    expect(total(split('a:1|b:~|c:1', 5))).toBeCloseTo(5, 9);
  });

  it('widens repeats when nothing stretches', () => {
    const slots = split('{win:1 | wall:0.5}*', 10);
    expect(total(slots)).toBeCloseTo(10, 9);
  });

  it('accepts an exact fit and an empty strip of stretches', () => {
    expect(total(split('a:1|b:1.5', 2.5))).toBeCloseTo(2.5, 9);
    expect(total(split('a:~', 0))).toBe(0);
  });
});
