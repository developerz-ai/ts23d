// `pathDistance` skips runs of the path that cannot hold the nearest segment; it must still return
// exactly what a scan of every segment returns (the terrain tiles' bank colours depend on it).
import { describe, expect, it } from 'bun:test';
import { createRng, dmath } from '@developerz.ai/ts23d';
import { pathDistance } from './cliff.ts';

/** Every segment, the obvious way. */
function scan(path: readonly [number, number][], x: number, y: number): number {
  let best = Infinity;
  for (let i = 0; i + 1 < path.length; i++) {
    const [ax, ay] = path[i] ?? [0, 0];
    const [qx, qy] = path[i + 1] ?? [0, 0];
    const dx = qx - ax;
    const dy = qy - ay;
    const l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
    best = Math.min(best, dmath.hypot(x - ax - dx * t, y - ay - dy * t));
  }
  return best;
}

describe('pathDistance', () => {
  it('matches a full scan bit for bit on a meandering path', () => {
    const rng = createRng(7);
    const path: [number, number][] = [];
    let [x, y, h] = [-1000, 0, 0];
    for (let i = 0; i < 151; i++) {
      path.push([x, y]);
      h += rng.range(-0.6, 0.6);
      x += 15 * dmath.cos(h);
      y += 15 * dmath.sin(h);
    }
    const d = pathDistance(path);
    const xs = path.map((p) => p[0]);
    const ys = path.map((p) => p[1]);
    // Inside the path's box grown by the 200 m guard every answer is exact.
    for (let i = 0; i < 20000; i++) {
      const qx = rng.range(Math.min(...xs) - 190, Math.max(...xs) + 190);
      const qy = rng.range(Math.min(...ys) - 190, Math.max(...ys) + 190);
      expect(d(qx, qy)).toBe(scan(path, qx, qy));
    }
  });

  it('is ∞ for an empty or one-point path near it', () => {
    expect(pathDistance([])(0, 0)).toBe(Infinity);
    expect(pathDistance([[0, 0]])(1, 1)).toBe(Infinity);
  });
});
