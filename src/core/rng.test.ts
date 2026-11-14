import { describe, expect, it } from 'bun:test';
import { Ts23dError } from './errors.ts';
import { createRng } from './rng.ts';

describe('createRng', () => {
  it('is deterministic per seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
  });

  it('forks are independent of draws on the parent', () => {
    const a = createRng(7);
    a.next();
    expect(a.fork('wheels').next()).toBe(createRng(7).fork('wheels').next());
  });

  it('differs across seeds', () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next());
  });
});

describe('createRng input', () => {
  it('refuses a non-integer or non-finite seed with T3D_RECIPE_INVALID', () => {
    for (const seed of [1.7, Number.NaN, Number.POSITIVE_INFINITY])
      expect(() => createRng(seed)).toThrow(Ts23dError);
    expect(() => createRng(-3)).not.toThrow();
  });

  it('pick([]) throws a coded error with a fix', () => {
    let err: unknown;
    try {
      createRng(1).pick([]);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(Ts23dError);
    expect((err as Ts23dError).code).toBe('T3D_RECIPE_INVALID');
    expect((err as Ts23dError).fix).toMatch(/at least one/);
  });
});
