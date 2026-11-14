// The path sweep follows the real motion: a coupling rod resting at the top of a 0.3 m crank
// circle sweeps down to 0.6 m below its rest line, so a bar 0.45 m under it is hit and one 0.75 m
// under is not (a slide along X, the old approximation, would miss the first).
import { describe, expect, it } from 'bun:test';
import { compile, defineAsset } from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { clashes } from './clash.ts';

const c: [number, number, number] = [1, 1, 1];
const rig = (barZ: number, kind: 'orbit' | 'crank') =>
  defineAsset({
    name: 'rig',
    kind: 'prop',
    budget: { triangles: [9999, 9999, 9999] },
    build(ctx) {
      ctx.part('rod', box({ size: [2, 0.05, 0.1], at: [-1, 0, 0], color: c }), {
        at: [0, 0, 1],
        motion:
          kind === 'orbit'
            ? { kind: 'orbit', axis: [0, 1, 0], arm: [0, 0, 0.3], hz: 1 }
            : {
                kind: 'crank',
                axis: [0, 1, 0],
                centre: [-2, 0, -0.3],
                pin: [-2, 0, 0],
                line: [1, 0, 0],
                hz: 1,
              },
      });
      ctx.part('bar', box({ size: [3, 0.3, 0.04], at: [-1, 0, 1 - barZ], color: c }));
    },
  });

describe('clashes on a path', () => {
  it('fails a bar inside the orbit band', () => {
    expect(clashes(compile(rig(0.45, 'orbit'))).map((f) => f.part)).toEqual(['bar']);
  });

  it('passes a bar below the orbit band', () => {
    expect(clashes(compile(rig(0.75, 'orbit')))).toEqual([]);
  });

  it('a connecting rod sweeps its tilting stroke: its big end dips 0.6 m', () => {
    expect(clashes(compile(rig(0.45, 'crank'))).map((f) => f.part)).toEqual(['bar']);
    expect(clashes(compile(rig(0.75, 'crank')))).toEqual([]);
  });
});
