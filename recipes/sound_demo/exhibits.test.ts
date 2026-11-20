// The crate's mud decals lie on the planks, 1 mm proud, and show above the bottom batten. (A review
// read them as buried in the battens; only their lowest 5 cm are behind the batten, as meant: the
// batten stands 2 cm proud of the planks and the mud runs up the planks behind and above it.)
import { describe, expect, it } from 'bun:test';
import { hex } from '@developerz.ai/ts23d';
import { crateMesh } from './exhibits.ts';

const MUD = hex('#4a3a28');

describe('crate mud', () => {
  it('sits 1 mm off the plank faces and reaches 9 cm above the bottom batten', () => {
    const [L, W, H] = [0.8, 0.6, 0.6];
    const [b, bt] = [0.05, 0.02];
    const m = crateMesh(0, [L, W, H]);
    const xs: number[] = [];
    let top = 0;
    for (let i = 0; i < m.positions.length / 3; i++) {
      const c = [m.colors[i * 3] ?? 0, m.colors[i * 3 + 1] ?? 0, m.colors[i * 3 + 2] ?? 0];
      if (c.some((v, k) => Math.abs(v - (MUD[k] ?? 0)) > 1e-4)) continue;
      const [x, y] = [Math.abs(m.positions[i * 3] ?? 0), Math.abs(m.positions[i * 3 + 1] ?? 0)];
      // On the ±X faces: 1 mm out from the plank face at L/2 − bt (±Y alike).
      xs.push(
        Math.abs(x - (L / 2 - bt)) < Math.abs(y - (W / 2 - bt))
          ? x - (L / 2 - bt)
          : y - (W / 2 - bt),
      );
      top = Math.max(top, m.positions[i * 3 + 2] ?? 0);
    }
    expect(xs.length).toBeGreaterThanOrEqual(16);
    for (const d of xs) expect(d).toBeCloseTo(0.001, 6);
    expect(top - b).toBeCloseTo(0.09, 6);
  });
});
