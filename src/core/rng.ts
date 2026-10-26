// Seeded, forkable PRNG (mulberry32). The only entropy a recipe may read: same seed, same bytes.

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  range(min: number, max: number): number;
  int(min: number, maxInclusive: number): number;
  pick<T>(items: readonly T[]): T;
  /** An independent stream keyed by name, so adding a draw in one part never shifts another. */
  fork(name: string): Rng;
}

function hash(seed: number, name: string): number {
  let h = seed ^ 0x9e3779b9;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 0x85ebca6b);
  return (h ^ (h >>> 13)) >>> 0;
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(items: readonly T[]): T => {
      const item = items[Math.floor(next() * items.length)];
      if (item === undefined) throw new RangeError('pick() from an empty list');
      return item;
    },
    fork: (name) => createRng(hash(seed, name)),
  };
}
