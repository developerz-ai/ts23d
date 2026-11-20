// Springs: the baked follow-through is periodic (a cold start is not), at rest nothing moves, and
// a shaken parent swings its child the other way first.

import { describe, expect, it } from 'bun:test';
import type { Bone, Quat, Vec3 } from '../core/index.ts';
import { dmath } from '../core/index.ts';
import { qexp } from './pose.ts';
import { bakeSprings, periodicResponse } from './springs.ts';

const n = 48;
const step = 1 / n;
const forcing = Array.from({ length: n }, (_, i) => dmath.sin((2 * Math.PI * i) / n) * 40);

/** Largest gap between a loop and the next one integrated on from it (0 when periodic). */
function seam(hz: number, damping: number): number {
  const twice = periodicResponse([...forcing, ...forcing], step, hz, damping);
  return Math.max(...forcing.map((_, i) => Math.abs((twice[i] ?? 0) - (twice[i + n] ?? 0))));
}

describe('springs', () => {
  it('a cold start (rest, zero velocity) is not periodic after one loop: the error is visible', () => {
    // A lightly damped spring forced from rest has not settled within a loop.
    let x = 0;
    let v = 0;
    const w = 2 * Math.PI * 2.2;
    const dt = step / 8;
    const first: number[] = [];
    for (let l = 0; l < 2; l++)
      for (const f of forcing) {
        if (l === 0) first.push(x);
        for (let s = 0; s < 8; s++) {
          v += (f - w * w * x - 2 * 0.1 * w * v) * dt;
          x += v * dt;
        }
      }
    expect(Math.abs((first[0] ?? 0) - x)).toBeGreaterThan(1e-3);
  });

  it('the solved response closes its seam below 1e-4', () => {
    const r = periodicResponse(forcing, step, 2.2, 0.1);
    expect(seam(2.2, 0.1)).toBeLessThan(1e-4);
    expect(Math.max(...r.map(Math.abs))).toBeGreaterThan(0.01);
  });

  const chain: Bone[] = [
    { name: 'root', head: [0.3, 0, 1], tail: [0.5, 0, 1] },
    { name: 'tail_0', parent: 'root', head: [0, 0, 1], tail: [-0.3, 0, 1] },
  ];

  it('nothing moves when nothing accelerates', () => {
    const keys = Array.from({ length: n }, () => new Map<string, Quat>());
    const roots = Array.from({ length: n }, (_, i): Vec3 => [i * 0.01, 0, 0]);
    const out = bakeSprings(
      chain,
      keys,
      roots,
      step,
      [{ bone: 'tail_0', hz: 2, damping: 0.3 }],
      [n * 0.01, 0, 0],
    );
    for (const k of out) expect(Math.abs((k.get('tail_0') ?? [0, 0, 0, 1])[3])).toBeCloseTo(1, 9);
  });

  it('a body yawing about a point ahead swings the tail root sideways: the tail follows, within its cap', () => {
    const keys = Array.from(
      { length: n },
      (_, i) =>
        new Map<string, Quat>([['root', qexp([0, 0, 0.2 * dmath.sin((2 * Math.PI * i) / n)])]]),
    );
    const roots = keys.map((): Vec3 => [0, 0, 0]);
    const out = bakeSprings(chain, keys, roots, step, [
      { bone: 'tail_0', hz: 3, damping: 0.3, max: 15 },
    ]);
    const angle = (q: Quat): number =>
      2 * dmath.atan2(dmath.hypot(q[0], q[1], q[2]), Math.abs(q[3]));
    const peak = Math.max(...out.map((k) => angle(k.get('tail_0') ?? [0, 0, 0, 1])));
    expect(peak).toBeGreaterThan(0.01);
    expect(peak).toBeLessThanOrEqual((15 * Math.PI) / 180 + 1e-9);
  });
});
