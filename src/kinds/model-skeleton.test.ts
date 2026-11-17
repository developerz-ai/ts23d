import { describe, expect, it } from 'bun:test';
import { creaturePlan } from './creature.ts';
import { MID } from './creature-helpers.ts';
import { rigBones } from './creature-limits.ts';
import { bindModel } from './model-bind.ts';
import { modelClips } from './model-clips.ts';
import { capsuleCreature, FIXTURE_WOLF } from './model-fixtures.ts';
import { fitSkeleton, STRETCH } from './model-skeleton.ts';

const { bones } = creaturePlan(FIXTURE_WOLF);
const body = capsuleCreature(bones);

describe('fitSkeleton', () => {
  it('fails loudly on a model with a missing leg', () => {
    // The left fore leg's capsules are gone (x ahead of the trunk's middle, y > 0, below it).
    const three = capsuleCreature(bones, (c) => !(c.a[1] > 0.01 && c.a[0] > 0.1 && c.b[2] < 0.5));
    expect(() => fitSkeleton(three, bones)).toThrow(/T3D_MODEL_SKELETON.*leg/);
  });

  it('a lenient fit of a broken model does not answer a later strict ask', () => {
    // Legs squashed to 45 % of their height: every joint is found, the upper hind bone is 0.55×
    // its plan length. The lenient fit returns (to read residuals); the strict one must throw.
    const P = Float32Array.from(body.positions);
    let top = 0;
    for (let v = 0; v < P.length / 3; v++) top = Math.max(top, P[v * 3 + 2] ?? 0);
    const belly = top * 0.5;
    for (let v = 0; v < P.length / 3; v++) {
      const z = P[v * 3 + 2] ?? 0;
      P[v * 3 + 2] = z < belly ? z * 0.45 : z + belly * (0.45 - 1);
    }
    const short = { ...body, positions: P };
    const lenient = fitSkeleton(short, bones, '', false);
    expect(lenient.residuals.some((r) => r.stretch < STRETCH[0])).toBe(true);
    expect(() => fitSkeleton(short, bones)).toThrow(/T3D_MODEL_SKELETON.*plan length/);
    expect(fitSkeleton(short, bones, '', false)).toBe(lenient);
    // And a fit is per plan: another plan object on the same mesh is fitted afresh.
    const other = creaturePlan(FIXTURE_WOLF).bones;
    expect(fitSkeleton(body, other)).not.toBe(fitSkeleton(body, bones));
    expect(fitSkeleton(body, bones)).toBe(fitSkeleton(body, bones));
  });

  it('fails on fore paws fused into one block', () => {
    const P = Float32Array.from(body.positions);
    // Squash the fore legs' lowest 30 cm onto the mid-plane: one leg where the plan has two, well
    // above where toes may touch (legs are told apart up to six slabs off the ground).
    for (let v = 0; v < P.length / 3; v++)
      if ((P[v * 3] ?? 0) > 0.15 && (P[v * 3 + 2] ?? 0) < 0.3)
        P[v * 3 + 1] = (P[v * 3 + 1] ?? 0) * 0.1;
    expect(() => fitSkeleton({ ...body, positions: P }, bones)).toThrow(
      /T3D_MODEL_SKELETON.*(fused|missing)/,
    );
  });

  it("keeps the plan's bones, order and parents, and puts every joint inside the mesh", () => {
    const sk = fitSkeleton(body, bones, 'w_');
    const plan = rigBones(bones, null, null, 'w_').filter((b) => !b.name.endsWith(MID));
    const fitted = sk.bones.filter((b) => !b.name.endsWith(MID));
    expect(fitted.map((b) => [b.name, b.parent])).toEqual(plan.map((b) => [b.name, b.parent]));
    expect(sk.bones.filter((b) => b.name.endsWith(MID)).length).toBe(12);
    for (const r of sk.residuals.filter((x) => /_(fore|hind)_/.test(x.bone))) {
      expect(r.stretch).toBeGreaterThan(STRETCH[0]);
      expect(r.stretch).toBeLessThan(STRETCH[1]);
      expect(r.moved).toBeLessThan(0.12 * bones.height);
    }
    const y = (n: string): number => sk.bones.find((b) => b.name === n)?.tail[1] ?? 0;
    expect(y('w_fore_l_3')).toBeGreaterThan(0);
    expect(y('w_fore_r_3')).toBeLessThan(0);
    expect(Object.keys(sk.legs).sort()).toEqual(['fore_l', 'fore_r', 'hind_l', 'hind_r']);
  });
});

describe('bindModel + modelClips', () => {
  const sk = fitSkeleton(body, bones);
  const rig = modelClips(sk.bones);

  it('drops the clips a fused head cannot play and keeps the gaits', () => {
    expect(rig.clips.map((c) => c.name)).toEqual(['idle', 'look', 'walk', 'trot', 'gallop']);
    expect(rig.dropped).toEqual(['bite', 'blink']);
    expect(modelClips(sk.bones, '', ['gallop']).clips.map((c) => c.name)).not.toContain('gallop');
  });

  it('gives every vertex ≤ 4 influences in 255ths that sum to exactly 1', () => {
    const skinned = bindModel(body, rig.bones, bones.height, sk.legs);
    const [J, W] = [skinned.joints, skinned.weights];
    expect(J?.length).toBe((body.positions.length / 3) * 4);
    for (let v = 0; v < body.positions.length / 3; v++) {
      const w = [0, 1, 2, 3].map((s) => W?.[v * 4 + s] ?? Number.NaN);
      expect(Math.round(w.reduce((a, b) => a + b, 0) * 255)).toBe(255);
      for (const x of w) expect(Math.abs(x * 255 - Math.round(x * 255))).toBeLessThan(1e-4);
    }
  });

  it('never lets a free leg follow another leg or the tail', () => {
    const skinned = bindModel(body, rig.bones, bones.height, sk.legs);
    const P = skinned.positions;
    let checked = 0;
    for (let v = 0; v < P.length / 3; v++) {
      // Left fore leg below the belly.
      if (!((P[v * 3] ?? 0) > 0.15 && (P[v * 3 + 1] ?? 0) > 0.03 && (P[v * 3 + 2] ?? 0) < 0.25))
        continue;
      checked++;
      for (let s = 0; s < 4; s++) {
        if ((skinned.weights?.[v * 4 + s] ?? 0) === 0) continue;
        const name = rig.bones[skinned.joints?.[v * 4 + s] ?? 0]?.name ?? '';
        expect(name).not.toMatch(/^(tail|hind|fore_r)/);
      }
    }
    expect(checked).toBeGreaterThan(20);
  });
});
