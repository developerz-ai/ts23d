import { describe, expect, it } from 'bun:test';
import { type Mesh, merge, Ts23dError } from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { tube } from './skin-fixtures.ts';
import { heatWeights } from './skin-heat.ts';
import { skinWeights, type WeightBone } from './skin-weights.ts';

const shift = (m: Mesh, dy: number): Mesh => {
  const positions = m.positions.slice();
  for (let i = 1; i < positions.length; i += 3) positions[i] = (positions[i] ?? 0) + dy;
  return { ...m, positions };
};

// Two legs 3 cm apart joined by a hip block at x < 0.
const legs = merge([
  tube(1, 0.05, 21),
  shift(tube(1, 0.05, 21), 0.13),
  box({ size: [0.2, 0.3, 0.12], at: [-0.08, 0.065, 0], color: [1, 1, 1] }),
]);
const bones: WeightBone[] = [
  { a: [0, 0, 0], b: [1, 0, 0] },
  { a: [0, 0.13, 0], b: [1, 0.13, 0] },
];

/** Weight of bone `j` on the inner-side vertex of leg A at mid-length (y = +0.05, x = 0.5). */
const innerWeight = (m: Mesh, j: number): number => {
  const v = 10 * 16 + 4; // ring 10 (x = 0.5), angle 90° (y = +r)
  let w = 0;
  for (let s = 0; s < 4; s++) if (m.joints?.[v * 4 + s] === j) w += m.weights?.[v * 4 + s] ?? 0;
  return w;
};

describe('heatWeights', () => {
  it('refuses a zero blend radius', () => {
    expect(() => heatWeights(legs, bones, { blend: 0, cell: 0.01 })).toThrow(Ts23dError);
  });

  it('refuses a cell or voxel cap that would hang or size a NaN grid', async () => {
    // Off the main thread with a deadline: a regression (cell 0 never coarsens) fails, not hangs.
    const probe = `
      import { heatWeights } from ${JSON.stringify(new URL('./skin-heat.ts', import.meta.url).pathname)};
      import { box } from ${JSON.stringify(new URL('../primitives/index.ts', import.meta.url).pathname)};
      const m = box({ size: [1, 1, 1], color: [1, 1, 1] });
      const bones = [{ a: [0, 0, 0], b: [0, 0, 1] }];
      const bad = [{ cell: 0 }, { cell: NaN }, { cell: -0.1 }, { cell: Infinity },
        { cell: 0.1, maxVoxels: 26 }, { cell: 0.1, maxVoxels: 1000.5 }, { cell: 0.1, maxVoxels: NaN }];
      const codes = bad.map((o) => {
        try { heatWeights(m, bones, { blend: 0.05, ...o }); return 'ok'; }
        catch (e) { return e.code ?? e.constructor.name; }
      });
      console.log(JSON.stringify(codes));`;
    const run = Bun.spawn(['bun', '-e', probe], { stdout: 'pipe', stderr: 'pipe', timeout: 30000 });
    const [out, exit] = await Promise.all([new Response(run.stdout).text(), run.exited]);
    expect(exit).toBe(0);
    expect(JSON.parse(out)).toEqual(Array.from({ length: 7 }, () => 'T3D_SKIN_INVALID'));
  }, 60000);

  it('straight-line weights bleed across the leg gap; geodesic heat does not', () => {
    const k = 0.06;
    expect(innerWeight(skinWeights(legs, bones, { blend: k }), 1)).toBeGreaterThan(0.1);
    const heat = heatWeights(legs, bones, { blend: k, cell: 0.012 });
    expect(innerWeight(heat, 1)).toBe(0);
    expect(innerWeight(heat, 0)).toBe(1);
    const n = heat.positions.length / 3;
    for (let v = 0; v < n; v++) {
      let s = 0;
      for (let q = 0; q < 4; q++) s += Math.round((heat.weights?.[v * 4 + q] ?? 0) * 255);
      expect(s).toBe(255);
    }
  });

  it('is deterministic', () => {
    const a = heatWeights(legs, bones, { blend: 0.05, cell: 0.02 });
    const b = heatWeights(legs, bones, { blend: 0.05, cell: 0.02 });
    expect(a.weights).toEqual(b.weights);
    expect(a.joints).toEqual(b.joints);
  });
});
