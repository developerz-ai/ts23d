import { expect, it } from 'bun:test';
import { quatFromAxisAngle } from '../core/index.ts';
import { cyclesOf, LOOP_SECONDS } from './motion.ts';

it('rounds every motion to whole cycles so the loop has no seam', () => {
  expect(cyclesOf(0.8)).toBe(3); // 0.8 rps × 4 s = 3.2 → 3 whole turns
  expect(cyclesOf(0.05)).toBe(1); // slower than one cycle per clip still loops once
  expect(cyclesOf(-0.6)).toBe(-2);
  const last = quatFromAxisAngle([0, 1, 0], cyclesOf(0.8) * Math.PI * 2);
  const first = quatFromAxisAngle([0, 1, 0], 0);
  // q and -q are the same rotation: compare up to sign.
  const dot = last.reduce((s, v, i) => s + v * (first[i] ?? 0), 0);
  expect(Math.abs(dot)).toBeCloseTo(1, 6);
  expect(LOOP_SECONDS).toBe(4);
});
