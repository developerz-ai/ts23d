// The hybrid's mesh helpers: the main shell excludes loose pieces, the shrinkwrap lands free
// vertices on the target and leaves pinned ones, smoothing keeps a constant constant.

import { describe, expect, it } from 'bun:test';
import { box, merge, place, sdf, type Vec3 } from '@developerz.ai/ts23d';
import { mainShell, shrinkwrap, smoothOver, weld } from './wrap.ts';

const ball = sdf({
  field: (p) => Math.hypot(p[0], p[1], p[2]) - 0.1,
  bounds: [
    [-0.12, -0.12, -0.12],
    [0.12, 0.12, 0.12],
  ],
  resolution: 0.02,
  color: [0.5, 0.5, 0.5],
});

describe('wolf_hybrid wrap helpers', () => {
  it('mainShell marks only the largest connected piece (a tooth beside a head is not on it)', () => {
    const tooth = place(box({ size: [0.01, 0.01, 0.02], color: [1, 1, 1] }), { at: [0.3, 0, 0] });
    const both = merge([ball, tooth]);
    const w = weld(both);
    const shell = mainShell(w);
    const onTooth = Array.from(both.positions.filter((_, i) => i % 3 === 0)).map((x) => x > 0.2);
    w.of.forEach((id, v) => {
      expect(shell[id]).toBe(onTooth[v] ? 0 : 1);
    });
  });

  it('shrinkwrap lands free vertices on the target sphere and leaves pinned ones', () => {
    const w = weld(ball);
    // Target: a sphere of radius 0.13 about the origin; the move is the exact closest point.
    const move = (p: Vec3): Vec3 => {
      const l = Math.hypot(...p) || 1;
      const k = 0.13 / l - 1;
      return [p[0] * k, p[1] * k, p[2] * k];
    };
    const free = Float64Array.from({ length: w.n }, (_, i) => (i % 2 ? 1 : 0));
    const out = shrinkwrap(ball, w, [0, 0, 0], free, move, 4);
    const P = ball.positions;
    let pinnedMoved = 0;
    let worst = 0;
    w.of.forEach((id, v) => {
      const r = Math.hypot(out[id * 3] ?? 0, out[id * 3 + 1] ?? 0, out[id * 3 + 2] ?? 0);
      if (free[id]) worst = Math.max(worst, Math.abs(r - 0.13));
      else
        pinnedMoved = Math.max(
          pinnedMoved,
          Math.hypot(
            (out[id * 3] ?? 0) - (P[v * 3] ?? 0),
            (out[id * 3 + 1] ?? 0) - (P[v * 3 + 1] ?? 0),
            (out[id * 3 + 2] ?? 0) - (P[v * 3 + 2] ?? 0),
          ),
        );
    });
    expect(worst).toBeLessThan(1e-9);
    expect(pinnedMoved).toBe(0);
  });

  it('smoothOver keeps a constant and averages a spike into its neighbours', () => {
    const w = weld(ball);
    const n = ball.positions.length / 3;
    expect(
      Array.from(smoothOver(w, new Float64Array(n).fill(0.25), 5)).every(
        (x) => Math.abs(x - 0.25) < 1e-12,
      ),
    ).toBe(true);
    const spike = new Float64Array(n);
    spike[0] = 1;
    const s = smoothOver(w, spike, 1);
    expect(s[0]).toBeLessThan(1);
    expect(s[0]).toBeGreaterThan(0);
  });
});
