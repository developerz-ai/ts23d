import { describe, expect, it } from 'bun:test';
import { type Mesh, Ts23dError, type Vec3 } from '../core/index.ts';
import { beam } from './beam.ts';
import { box } from './box.ts';
import { cylinder, lathe } from './lathe.ts';
import { planar } from './planar.ts';
import { prism } from './prism.ts';

const wood: Vec3 = [0.48, 0.33, 0.19];
/** Options as a recipe without types (or with a typo) passes them. */
type Loose = Record<string, unknown>;
const calls: Record<string, (o: Loose) => Mesh> = {
  box: (o) => box({ size: [1, 1, 1], ...o } as never),
  lathe: (o) =>
    lathe({
      profile: [
        [0.5, 0],
        [0.5, 1],
      ],
      segments: 8,
      ...o,
    } as never),
  cylinder: (o) => cylinder({ radius: 0.3, length: 1, segments: 8, ...o } as never),
  prism: (o) =>
    prism({
      profile: [
        [0, 0],
        [1, 0],
        [0, 1],
      ],
      depth: 0.5,
      ...o,
    } as never),
  beam: (o) => beam({ from: [0, 0, 0], to: [1, 0, 0], width: 0.1, ...o } as never),
  'round beam': (o) =>
    beam({ from: [0, 0, 0], to: [1, 0, 0], width: 0.1, segments: 6, ...o } as never),
  planar: (o) =>
    planar({
      points: [
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
      ],
      ...o,
    } as never),
};

const failure = (f: () => unknown): Ts23dError => {
  try {
    f();
  } catch (e) {
    if (e instanceof Ts23dError) return e;
    throw e;
  }
  throw new Error('expected a Ts23dError');
};

describe('primitive color check', () => {
  for (const [name, call] of Object.entries(calls)) {
    it(`${name}: a misspelt colour is T3D_RECIPE_INVALID naming color and the stray key`, () => {
      const e = failure(() => call({ colour: wood }));
      expect(e.code).toBe('T3D_RECIPE_INVALID');
      expect(e.message).toContain('color is missing');
      expect(e.message).toContain("'colour'");
      expect(e.fix).toContain("color: hex('#7a5530')");
    });

    it(`${name}: a colour that is not 3 finite numbers is refused`, () => {
      for (const color of [[1, 0], [1, 0, Number.NaN], '#7a5530', null]) {
        const e = failure(() => call({ color }));
        expect(e.message).toContain('color is');
        expect(e.message).not.toContain('unknown option');
      }
    });

    it(`${name}: a valid colour builds`, () => {
      expect(call({ color: wood }).positions.length).toBeGreaterThan(0);
    });
  }
});
