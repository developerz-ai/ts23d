import { describe, expect, test } from 'bun:test';
import { Shown, subjectKey } from './shown.ts';

const neural = { recipe: 'ranger', dirs: ['media/neural/ranger/k/'] };

describe('the shown subject', () => {
  test('the CPU tier of the asset on screen is another subject: the name alone does not tell', () => {
    const shown = new Shown();
    expect(shown.arrive({ name: 'ranger', neural })).toBe(true);
    expect(shown.arrive({ name: 'ranger' })).toBe(true);
    expect(shown.arrive({ name: 'ranger', neural })).toBe(true);
    expect(subjectKey({ name: 'ranger', neural })).not.toBe(subjectKey({ name: 'ranger' }));
  });

  test('an asset asked for but never shown does not count: only arrivals do', () => {
    // joint_demo is on screen; palm was requested and abandoned (no arrival), then requested again.
    const shown = new Shown();
    shown.arrive({ name: 'joint_demo' });
    expect(shown.arrive({ name: 'palm' })).toBe(true);
  });

  test('the same asset and tier again (another LOD, another mode) has not changed', () => {
    const shown = new Shown();
    expect(shown.arrive({ name: 'palm' })).toBe(true);
    expect(shown.arrive({ name: 'palm' })).toBe(false);
    shown.arrive({ name: 'ranger', neural });
    expect(shown.arrive({ name: 'ranger', neural })).toBe(false);
  });
});
