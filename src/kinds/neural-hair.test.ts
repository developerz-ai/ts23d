import { describe, expect, it } from 'bun:test';
import { checkSkeleton, type Mesh, MeshBuilder, type Vec3 } from '../core/index.ts';
import { hairRig } from './neural-hair.ts';

/** `n` vertical cards hanging from a scalp at z = 1, 0.3 m long; odd cards wound tip-first. */
function cardsMesh(n: number): Mesh {
  const m = new MeshBuilder();
  for (let c = 0; c < n; c++) {
    const x = c * 0.1;
    const rows = [0, 1, 2, 3, 4].map((k) => (c % 2 ? 4 - k : k));
    const ids = rows.map((k) => [
      m.vertex({ p: [x, -0.01, 1 - k * 0.075], n: [1, 0, 0], uv: [0, k / 4], color: [1, 1, 1] }),
      m.vertex({ p: [x, 0.01, 1 - k * 0.075], n: [1, 0, 0], uv: [1, k / 4], color: [1, 1, 1] }),
    ]);
    for (let k = 0; k < 4; k++)
      m.quad(ids[k]?.[0] ?? 0, ids[k]?.[1] ?? 0, ids[k + 1]?.[1] ?? 0, ids[k + 1]?.[0] ?? 0);
  }
  return m.build();
}
const scalp = (p: Vec3): number => p[2] - 1;
const head = { name: 'head', head: [0, 0, 0.9] as Vec3, tail: [0, 0, 1.1] as Vec3 };

describe('hairRig (model hair cards → chains + springs)', () => {
  const rig = hairRig(cardsMesh(3), { parent: 'head', scalp, segments: 3 });

  it('one chain of `segments` bones per card, rooted at the scalp end whatever the winding', () => {
    expect(rig.bones.length).toBe(9);
    for (const b of rig.bones.filter((x) => x.name.endsWith('_0')))
      expect(b.head[2]).toBeCloseTo(1, 6);
    expect(rig.springs.map((s) => s.bone)).toEqual(rig.bones.map((b) => b.name));
    expect(() => checkSkeleton('t', { bones: [head, ...rig.bones] })).not.toThrow();
  });

  it('skins the root to the first bone and the tip to the last, weights summing to 1', () => {
    const P = rig.mesh.positions;
    const J = rig.mesh.joints ?? new Uint16Array();
    const W = rig.mesh.weights ?? new Float32Array();
    for (let v = 0; v < P.length / 3; v++) {
      expect((W[v * 4] ?? 0) + (W[v * 4 + 1] ?? 0)).toBeCloseTo(1, 6);
      const z = P[v * 3 + 2] ?? 0;
      const card = Math.round((P[v * 3] ?? 0) / 0.1);
      if (z > 0.99) expect([J[v * 4], W[v * 4]]).toEqual([card * 3, 1]);
      if (z < 0.71) expect(J[v * 4 + 1]).toBe(card * 3 + 2);
    }
  });

  it('refuses more cards than the cap', () => {
    expect(() => hairRig(cardsMesh(5), { parent: 'head', scalp, maxCards: 4 })).toThrow(
      'T3D_NEURAL_OUTPUT_INVALID',
    );
  });
});
