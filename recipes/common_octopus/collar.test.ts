// The collar band under the eyes (D467): the head chain ended at the arm crown with a 5.8 cm
// rounded end cap above the arm roots (4.3 cm), so the cap stood proud over the dorsal arms as a
// ledge and the head read as a cylinder set on the arms. The head must run on into the arm crown
// and end inside it: its last station below every arm root, no wider than an arm's base.

import { describe, expect, it } from 'bun:test';
import { armRadius, OCTOPUS_SPEC } from './anatomy.ts';

describe('head into the arm crown', () => {
  const chain = (name: string) => OCTOPUS_SPEC.chains.find((c) => c.name === name);
  const head = chain('head');
  const arms = OCTOPUS_SPEC.chains.filter((c) => c.name.startsWith('arm_'));

  it('ends below every arm root, narrower than an arm base, so no end cap stands over them', () => {
    const end = head?.path[head.path.length - 1];
    const r = head?.radius[head.radius.length - 1];
    if (!end || r === undefined) throw new Error('no head chain');
    expect(arms.length).toBe(8);
    const lowestRoot = Math.min(...arms.map((a) => a.path[0]?.[2] ?? Infinity));
    expect(end[2]).toBeLessThan(lowestRoot - 0.01);
    expect(r).toBeLessThanOrEqual(armRadius(0) * 1.1);
  });
});
