import { describe, expect, it } from 'bun:test';
import { measureHead, proportionFindings } from '../_lib/face/proportions.ts';
import { bodySurface } from './build.ts';
import { ORC_PROPORTIONS, SK } from './spec.ts';
import { gumLine, tuskPath } from './tusks.ts';

const skin = bodySurface(1).field;

describe('orc tusks', () => {
  it('a tusk pulled out of the jaw is caught (its root sits outside the skin)', () => {
    const root = tuskPath()[0] ?? [0, 0, 0];
    const floating: [number, number, number] = [root[0] + 0.06, root[1], root[2]];
    expect(skin(floating)).toBeGreaterThan(0);
  });
  it('roots in the jaw: the root ≥ 5 mm inside the skin, the tip in the air above the gum line', () => {
    const path = tuskPath();
    const root = path[0] ?? [0, 0, 0];
    const tip = path[path.length - 1] ?? [0, 0, 0];
    expect(skin(root)).toBeLessThan(-0.005);
    expect(skin(tip)).toBeGreaterThan(0);
    expect(tip[2]).toBeGreaterThan(gumLine());
  });
});

describe('orc proportions', () => {
  it('a human eye line on the orc head is out of its declared band', () => {
    const m = measureHead(SK, skin);
    expect(proportionFindings({ ...m, eyeLine: 0.5 - 0.01 }, ORC_PROPORTIONS, 'orc')).toHaveLength(
      1,
    );
  });
  it('the built head lands in every declared band', () => {
    expect(proportionFindings(measureHead(SK, skin), ORC_PROPORTIONS, 'orc')).toEqual([]);
  });
});
