import { describe, expect, it } from 'bun:test';
import { compile, jointFit } from '@developerz.ai/ts23d';
import { assertQaPass } from '@developerz.ai/ts23d/testing';
import { joint_demo, jointDemo } from './joint_demo.ts';

const issues = (asset: ReturnType<typeof jointDemo>) => {
  const c = compile(asset);
  return (c.joints ?? []).flatMap((j) => jointFit(c, j).findings);
};

describe('joint_demo', () => {
  it('fails a hand twice the wrist with T3D_JOINT_MISMATCH and the scale fix', () => {
    const [f, ...rest] = issues(jointDemo(2, 'joint_demo_big_hand'));
    expect(rest).toEqual([]);
    expect(f?.message).toMatch(/^T3D_JOINT_MISMATCH joint 'wrist'.*95% larger/);
    expect(f?.fix).toContain('scale hand ×0.51');
  });

  it('fits at every joint and passes QA', () => {
    expect(issues(joint_demo)).toEqual([]);
    expect(() => assertQaPass(joint_demo)).not.toThrow();
  });
});
