import { describe, expect, it } from 'bun:test';
import {
  type CompiledAsset,
  compile,
  defineAsset,
  type Mesh,
  merge,
  Ts23dError,
} from '../core/index.ts';
import { toGlb } from '../export/index.ts';
import { inverseBind, skinWeights, weightBonesOf } from '../passes/index.ts';
import { box } from '../primitives/index.ts';
import { skin, skinFindings } from './skin.ts';

const c: [number, number, number] = [0.5, 0.5, 0.5];
const bones = [
  { name: 'upper', head: [0, 0, 0.1], tail: [1, 0, 0.1] },
  { name: 'lower', parent: 'upper', head: [1, 0, 0.1], tail: [2, 0, 0.1] },
] as const;
const limb = (): Mesh =>
  skinWeights(
    merge([
      box({ size: [1, 0.2, 0.2], at: [0.5, 0, 0], color: c }),
      box({ size: [1, 0.2, 0.2], at: [1.5, 0, 0], color: c }),
    ]),
    weightBonesOf(bones.map((b) => ({ ...b, head: [...b.head], tail: [...b.tail] }))),
    { blend: 0.1 },
  );

const rigged = (mesh: Mesh, extra = false): CompiledAsset =>
  compile(
    defineAsset({
      name: 'limb',
      kind: 'creature',
      budget: { triangles: [9999, 9999, 9999] },
      build(ctx) {
        for (const b of bones)
          ctx.bone(b.name, {
            head: [...b.head],
            tail: [...b.tail],
            ...('parent' in b ? { parent: b.parent } : {}),
          });
        if (extra) ctx.bone('spare', { parent: 'lower', head: [2, 0, 0.1], tail: [2.5, 0, 0.1] });
        ctx.part('body', mesh);
      },
    }),
  );

const withWeights = (a: CompiledAsset, f: (w: Float32Array) => void): CompiledAsset => {
  const part = a.parts[0];
  const weights = new Float32Array(part?.mesh?.weights ?? []);
  f(weights);
  return {
    ...a,
    parts: a.parts.map((p, i) => (i === 0 && p.mesh ? { ...p, mesh: { ...p.mesh, weights } } : p)),
  };
};

describe('QA skin', () => {
  it('fails weights that sum to 0.98', () => {
    const a = withWeights(rigged(limb()), (w) => {
      w[0] = (w[0] ?? 0) - 0.02;
    });
    const f = skin(a);
    expect(f.length).toBe(1);
    expect(f[0]?.code).toBe('T3D_SKIN_INVALID');
    expect(f[0]?.message).toContain('do not sum to 1');
  });

  it('fails 5 influences per vertex (the GLB writer refuses them too)', () => {
    const m = limb();
    const n = m.positions.length / 3;
    const five = {
      ...m,
      joints: new Uint16Array(n * 5),
      weights: new Float32Array(n * 5).fill(0.2),
    };
    const forced = rigged(five);
    expect(skinFindings(forced)[0]?.message).toContain('240 joints');
    expect(skinFindings(forced)[0]?.fix).toContain('exactly 4 influences');
    expect(() => toGlb(forced)).toThrow(Ts23dError);
  });

  it('fails a bind pose 1e-4 m off the rest positions', () => {
    const a = rigged(limb());
    const sk = a.skeleton;
    expect(sk).toBeDefined();
    const ibm = inverseBind(sk ?? { bones: [] });
    ibm[12] = (ibm[12] ?? 0) + 1e-4;
    expect(skinFindings(a, ibm)[0]?.message).toContain('bind pose');
  });

  it('fails a bone that drives nothing', () => {
    const f = skin(rigged(limb(), true));
    expect(f[0]?.message).toContain('[spare] drive no vertex');
  });

  it('passes a valid skin, and stays silent on unskinned assets', () => {
    expect(skin(rigged(limb()))).toEqual([]);
    expect(skin(rigged(box({ size: [1, 1, 1], color: c })))).toEqual([]);
  });
});
