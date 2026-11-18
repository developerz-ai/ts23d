import { describe, expect, it } from 'bun:test';
import {
  type CompiledAsset,
  compile,
  defineAsset,
  encodePng,
  type Mesh,
  merge,
} from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { skin } from './skin.ts';
import { crossedLimbFindings } from './skin-sides.ts';

// Two legs, 0.2 m apart: leg_<s>_0 hip (z 1) → _1 knee (0.6) → _2 hock (0.2) → ground. Bone
// indices: leg_l_0..2 = 0..2, leg_r_0..2 = 3..5.
const SIDES = [
  ['l', 0.1],
  ['r', -0.1],
] as const;
const legs = (): Mesh => {
  const m = merge(
    SIDES.flatMap(([, y]) => [
      box({ size: [0.1, 0.08, 0.2], at: [0, y, 0.1], color: [0.5, 0.5, 0.5] }),
      box({ size: [0.1, 0.08, 0.6], at: [0, y, 0.6], color: [0.5, 0.5, 0.5] }),
    ]),
  );
  const n = m.positions.length / 3;
  const joints = new Uint16Array(n * 4);
  const weights = new Float32Array(n * 4);
  for (let v = 0; v < n; v++) {
    const left = (m.positions[v * 3 + 1] ?? 0) > 0;
    const z = m.positions[v * 3 + 2] ?? 0;
    joints[v * 4] = (left ? 0 : 3) + (z < 0.2 ? 2 : z < 0.6 ? 1 : 0);
    weights[v * 4] = 1;
  }
  return { ...m, joints, weights };
};

/** The legs as a model-built part (its own texture set) or as a code-built one. */
const rigged = (mesh: Mesh, model = true): CompiledAsset =>
  compile(
    defineAsset({
      name: 'legs',
      kind: 'creature',
      budget: { triangles: [9999, 9999, 9999], textureSets: { count: 1, size: 1024 } },
      build(ctx) {
        for (const [s, y] of SIDES) {
          ctx.bone(`leg_${s}_0`, { head: [0, y, 1], tail: [0, y, 0.6] });
          ctx.bone(`leg_${s}_1`, { parent: `leg_${s}_0`, head: [0, y, 0.6], tail: [0, y, 0.2] });
          ctx.bone(`leg_${s}_2`, { parent: `leg_${s}_1`, head: [0, y, 0.2], tail: [0, y, 0] });
        }
        const albedo = encodePng(4, 4, new Uint8Array(64).fill(128));
        ctx.part('body', mesh, model ? { textures: { name: 'body', albedo } } : {});
      },
    }),
  );

/** `m` with vertex `v` weighted half to its own side's bone, half to the other side's. */
const crossed = (m: Mesh, v: number): Mesh => {
  const joints = new Uint16Array(m.joints ?? []);
  const weights = new Float32Array(m.weights ?? []);
  const own = joints[v * 4] ?? 0;
  joints[v * 4 + 1] = own < 3 ? own + 3 : own - 3;
  weights[v * 4] = 0.5;
  weights[v * 4 + 1] = 0.5;
  return { ...m, joints, weights };
};

const lowest = (m: Mesh): number => {
  let best = 0;
  for (let v = 0; v < m.positions.length / 3; v++)
    if ((m.positions[v * 3 + 2] ?? 0) < (m.positions[best * 3 + 2] ?? 0)) best = v;
  return best;
};

describe('QA skin: crossed limbs (D72)', () => {
  it('fails a paw vertex weighted to both legs', () => {
    const m = legs();
    const f = skin(rigged(crossed(m, lowest(m))));
    expect(f.length).toBe(1);
    expect(f[0]?.code).toBe('T3D_SKIN_CROSSED');
    expect(f[0]?.message).toContain('1 vertices below 0.200 m');
    expect(f[0]?.message).toContain('leg_l and leg_r');
    expect(f[0]?.fix).toContain("kind 'scale'");
  });

  it('passes legs that keep their own weights', () => {
    expect(crossedLimbFindings(rigged(legs()))).toEqual([]);
  });

  it('leaves a code-built part to the sculpt (D73, open)', () => {
    const m = legs();
    expect(crossedLimbFindings(rigged(crossed(m, lowest(m)), false))).toEqual([]);
  });

  it('allows shared weights above the hock (brisket, groin)', () => {
    const m = legs();
    let top = 0;
    for (let v = 0; v < m.positions.length / 3; v++)
      if ((m.positions[v * 3 + 2] ?? 0) > (m.positions[top * 3 + 2] ?? 0)) top = v;
    expect(crossedLimbFindings(rigged(crossed(m, top)))).toEqual([]);
  });
});
