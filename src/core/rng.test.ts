import { describe, expect, it } from 'bun:test';
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
