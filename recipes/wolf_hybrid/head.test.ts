// The head fit's contract: a model with no head refuses with a fix; landmarks under a known
// similarity come back exact; the neck weight runs 0 → 1 from the neck base to the atlas.

import { describe, expect, it } from 'bun:test';
import {
  applySimilarity,
  composeSimilarity,
  type Similarity,
  Ts23dError,
  type Vec3,
  yawSimilarity,
} from '@developerz.ai/ts23d';
import { type HeadMarks, headFit, modelMarks, neckWeight } from './head.ts';

const ours = {
  nose: [0.85, 0, 0.75],
  earL: [0.63, 0.08, 0.94],
  earR: [0.63, -0.08, 0.94],
  eyeL: [0.72, 0.047, 0.8],
  eyeR: [0.72, -0.047, 0.8],
} satisfies Record<string, Vec3>;

describe('wolf_hybrid head fit', () => {
  it('refuses a model mesh with nothing in front (no head to find), with a fix', () => {
    const behind = Float32Array.from([-0.3, 0, 0.5, -0.2, 0.1, 0.6, -0.1, -0.1, 0.4]);
    try {
      modelMarks(behind, new Float32Array(9));
      throw new Error('expected a refusal');
    } catch (e) {
      expect(e).toBeInstanceOf(Ts23dError);
      expect((e as Ts23dError).code).toBe('T3D_NEURAL_OUTPUT_INVALID');
      expect((e as Ts23dError).fix).toContain('re-roll');
    }
  });

  it('recovers a turned, lowered, scaled head from its landmarks', () => {
    const tilt: Similarity = {
      s: 1,
      r: [Math.cos(0.3), 0, Math.sin(0.3), 0, 1, 0, -Math.sin(0.3), 0, Math.cos(0.3)],
      t: [0, 0, 0],
    };
    const truth: Similarity = {
      ...composeSimilarity(yawSimilarity(40), tilt),
      s: 0.9,
      t: [-0.2, 0.1, -0.1],
    };
    const keys = ['nose', 'earL', 'earR', 'eyeL', 'eyeR'] as const;
    // The model's marks are ours moved by the inverse: fitting them back must give ours.
    const model = {
      nose: applySimilarity(truth, ours.nose),
      earL: applySimilarity(truth, ours.earL),
      earR: applySimilarity(truth, ours.earR),
      eyeL: applySimilarity(truth, ours.eyeL),
      eyeR: applySimilarity(truth, ours.eyeR),
    } satisfies HeadMarks;
    const fit = headFit(model, ours);
    for (const k of keys) {
      const q = applySimilarity(fit, model[k]);
      expect(Math.hypot(q[0] - ours[k][0], q[1] - ours[k][1], q[2] - ours[k][2])).toBeLessThan(
        1e-9,
      );
    }
  });

  it('without our eyes (LOD2) the fit stands on nose and ear tips alone', () => {
    const { eyeL: _l, eyeR: _r, ...noEyes } = ours;
    const moved = {
      nose: [0.1, 0, 0] as Vec3,
      earL: [0, 0.1, 0.1] as Vec3,
      earR: [0, -0.1, 0.1] as Vec3,
    };
    const fit = headFit({ ...moved, eyeL: [9, 9, 9], eyeR: [9, 9, 9] }, noEyes);
    const q = applySimilarity(fit, moved.nose);
    expect(Number.isFinite(q[0])).toBe(true);
    expect(fit.s).toBeGreaterThan(0);
  });

  it('the neck takes none of the head move at its base and all of it at the atlas', () => {
    const base: Vec3 = [0.36, 0, 0.63];
    const atlas: Vec3 = [0.58, 0, 0.81];
    const w = neckWeight(base, atlas);
    expect(w(base)).toBe(0);
    expect(w([0.2, 0, 0.6])).toBe(0);
    expect(w(atlas)).toBe(1);
    expect(w([0.7, 0, 0.8])).toBe(1);
    expect(w([0.47, 0, 0.72])).toBeCloseTo(0.5, 1);
  });
});
