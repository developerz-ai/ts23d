import { describe, expect, it } from 'bun:test';
import { Ts23dError } from './errors.ts';
import { withTolerances } from './limit-tolerance.ts';
import type { Bone } from './skeleton.ts';

const why = 'the mesh fuses the tail to the thigh';
const bone = (name: string): Bone => ({
  name,
  head: [0, 0, 0],
  tail: [0, 0, 1],
  limit: { axis: [0, 1, 0], min: -1, max: 1, stretch: 5, why },
});

describe('withTolerances', () => {
  it('refuses a tolerance for a bone that is missing or has no limit', () => {
    const plain: Bone = { name: 'spine', head: [0, 0, 0], tail: [0, 0, 1] };
    for (const name of ['nope', 'spine']) {
      let caught: unknown;
      try {
        withTolerances('wolf', [plain], { [name]: { stretch: 5, why } });
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(Ts23dError);
      expect((caught as Ts23dError).code).toBe('T3D_RECIPE_INVALID');
    }
  });

  it("keeps a limit's own stretch on bones named like Object.prototype members", () => {
    for (const name of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
      const [b] = withTolerances('wolf', [bone(name)]);
      expect(b?.limit?.stretch).toBe(5);
      expect(b?.limit?.why).toBe(why);
    }
  });

  it('writes a named tolerance onto that bone only', () => {
    const out = withTolerances('wolf', [bone('hind_r_0'), bone('constructor')], {
      constructor: { stretch: 6, why: 'declared' },
    });
    expect(out[0]?.limit?.stretch).toBe(5);
    expect(out[1]?.limit).toMatchObject({ stretch: 6, why: 'declared' });
  });
});
