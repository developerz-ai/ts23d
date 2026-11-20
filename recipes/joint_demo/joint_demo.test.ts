import { describe, expect, it } from 'bun:test';
import { compile, jointFit, worldMeshes } from '@developerz.ai/ts23d';
import { ALL_LODS, assertClosed, assertManifold, assertQaPass } from '@developerz.ai/ts23d/testing';
import { joint_demo, jointDemo } from './joint_demo.ts';

const issues = (asset: ReturnType<typeof jointDemo>) => {
  const c = compile(asset);
  return (c.joints ?? []).flatMap((j) => jointFit(c, j).findings);
};

describe('joint_demo', () => {
  it('fails a hand twice the wrist with T3D_JOINT_MISMATCH and the scale fix', () => {
    const [f, ...rest] = issues(jointDemo(2, 'joint_demo_big_hand'));
    expect(rest).toEqual([]);
    expect(f?.message).toMatch(/^T3D_JOINT_MISMATCH joint 'wrist'.*105% larger/);
    expect(f?.fix).toContain('scale hand ×0.49');
  });

  it('fits at every joint and passes QA', () => {
    expect(issues(joint_demo)).toEqual([]);
    expect(() => assertQaPass(joint_demo)).not.toThrow();
  });

  it('reaches the upper arm from the shoulder at every LOD, with no zero-area triangle', () => {
    for (const lod of ALL_LODS) {
      const parts = new Map(worldMeshes(compile(joint_demo, { lod }).parts));
      const [shoulder, upper] = [parts.get('shoulder'), parts.get('upper_arm')];
      if (!shoulder || !upper) throw new Error(`LOD${lod}: no shoulder or upper arm`);
      const xs = (m: typeof shoulder): number[] =>
        Array.from(m.positions.filter((_, i) => i % 3 === 0));
      // The far shoulder ended 3 cm short of the arm (D423).
      expect(Math.max(...xs(shoulder))).toBeGreaterThanOrEqual(Math.min(...xs(upper)) - 1e-6);
      const P = shoulder.positions;
      const at = (v: number): number[] => [P[v * 3] ?? 0, P[v * 3 + 1] ?? 0, P[v * 3 + 2] ?? 0];
      for (let t = 0; t < shoulder.indices.length; t += 3) {
        const [a, b, c] = [0, 1, 2].map((k) => at(shoulder.indices[t + k] ?? 0));
        const u = [0, 1, 2].map((k) => (b?.[k] ?? 0) - (a?.[k] ?? 0));
        const w = [0, 1, 2].map((k) => (c?.[k] ?? 0) - (a?.[k] ?? 0));
        const n = [
          (u[1] ?? 0) * (w[2] ?? 0) - (u[2] ?? 0) * (w[1] ?? 0),
          (u[2] ?? 0) * (w[0] ?? 0) - (u[0] ?? 0) * (w[2] ?? 0),
          (u[0] ?? 0) * (w[1] ?? 0) - (u[1] ?? 0) * (w[0] ?? 0),
        ];
        expect(Math.abs(n[0] ?? 0) + Math.abs(n[1] ?? 0) + Math.abs(n[2] ?? 0)).toBeGreaterThan(
          1e-12,
        );
      }
      expect(shoulder.normals.every(Number.isFinite)).toBe(true);
    }
  });

  it('closes the blade at its point and its shoulders at every LOD (no hole at the tip)', () => {
    for (const lod of ALL_LODS) {
      assertClosed(joint_demo, { lod, parts: 'sword_blade' });
      assertManifold(joint_demo, { lod, parts: 'sword_blade' });
    }
  });
});
