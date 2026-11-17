import { describe, expect, test } from 'bun:test';
import { type BlenderStep, blenderProgram, checkBlenderSteps } from './blender-steps.ts';

const EXPORT: BlenderStep = { op: 'export' };
const BIND: BlenderStep = { op: 'bind' };
const HEAD = { kind: 'sphere', at: [0.6, 0, 1], r: 0.2 } as const;
const refuses = (steps: readonly unknown[], re: RegExp): void => {
  const e = (() => {
    try {
      blenderProgram(steps as readonly BlenderStep[]);
    } catch (x) {
      return x;
    }
  })();
  expect(String(e)).toContain('T3D_RECIPE_INVALID');
  expect(String(e)).toMatch(re);
  expect((e as { fix?: string }).fix).toBeTruthy();
};

describe('finishing steps: refusals first', () => {
  test('script needs python and a why', () => {
    refuses([{ op: 'script', python: 'obj.data.update()' }, EXPORT], /needs 'why'/);
    refuses([{ op: 'script', python: 'pass', why: '  ' }, EXPORT], /why: is not a non-empty/);
    refuses([{ op: 'script', python: '', why: 'x' }, EXPORT], /python: is not a non-empty/);
    refuses([{ op: 'script', python: 7, why: 'x' }, EXPORT], /python: is not a non-empty/);
  });

  test('isolate comes after bind and names its bones, tip and cut', () => {
    const tail = {
      op: 'isolate',
      bones: ['tail_1', 'tail_2'],
      from: [-0.4, 0, 0.2],
      point: [-0.3, 0, 0.6],
      normal: [-0.2, 0, -1],
      r: 0.1,
    };
    refuses([tail, BIND, EXPORT], /step 0 \(isolate\): needs 'bind' before it/);
    refuses([BIND, { ...tail, bones: [] }, EXPORT], /bones: needs 1\.\.32 entries/);
    refuses([BIND, { ...tail, from: undefined }, EXPORT], /needs 'from'/);
    refuses([BIND, { ...tail, r: 0 }, EXPORT], /r: 0 is outside/);
    refuses([BIND, { ...tail, maxShare: 0 }, EXPORT], /maxShare: 0 is outside/);
    const [, filled] = checkBlenderSteps([BIND, tail, EXPORT] as never) as readonly Record<
      string,
      unknown
    >[];
    expect(filled?.['feather']).toBe(0.03);
    expect(filled?.['maxShare']).toBe(0.25);
  });

  test('weights comes after bind, joint before it and moves something', () => {
    const w = { op: 'weights', kind: 'assign', bone: 'head', mask: HEAD };
    refuses([w, BIND, EXPORT], /step 0 \(weights\): needs 'bind' before it/);
    refuses([w, EXPORT], /needs 'bind' before it/);
    refuses([BIND, { op: 'joint', bone: 'head', tail: [1, 0, 1] }, EXPORT], /comes after 'bind'/);
    refuses([{ op: 'joint', bone: 'head', tail: [1, 0, 1] }, EXPORT], /has no 'bind' after it/);
    refuses([{ op: 'joint', bone: 'head' }, BIND, EXPORT], /step 0 \(joint\): moves nothing/);
    refuses([BIND, { ...w, kind: 'paint' }, EXPORT], /'paint' is not one of/);
    refuses([BIND, { ...w, mask: { kind: 'cone' } }, EXPORT], /kind 'cone' is not/);
    refuses(
      [BIND, { ...w, mask: { kind: 'plane', point: [0, 0, 0], normal: [0, 0, 0] } }, EXPORT],
      /normal: has no length/,
    );
  });

  test('review: weights and poses views need a bind before, poses need poses', () => {
    refuses([{ op: 'review', views: ['weights'] }, EXPORT], /view 'weights' needs 'bind'/);
    refuses([{ op: 'review', views: ['poses'] }, BIND, EXPORT], /view 'poses' needs 'bind'/);
    refuses([BIND, { op: 'review', views: ['poses'] }, EXPORT], /view 'poses' has no poses/);
    refuses([{ op: 'review', views: ['clay', 'clay'] }, EXPORT], /names an entry twice/);
    refuses([{ op: 'review', views: ['xray'] }, EXPORT], /'xray' is not one of/);
  });

  test('a bind from the source rig rules out transform; geometry still stops at bind', () => {
    const matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    refuses(
      [{ op: 'transform', matrix }, { op: 'bind', from: 'source' }, EXPORT],
      /step 0 \(transform\): moves a mesh that keeps its source rig/,
    );
    refuses([{ op: 'bind', from: 'model' }, EXPORT], /'model' is not one of skeleton, source/);
    refuses([BIND, { op: 'clean' }, EXPORT], /changes the mesh after 'bind'/);
    refuses(
      [{ op: 'retopo', triangles: 900 }, { op: 'lods', triangles: [300] }, BIND, EXPORT],
      /comes after 'lods'/,
    );
  });
});

describe('finishing steps: the program', () => {
  test('defaults are filled in; review may repeat and follow lods', () => {
    const steps = checkBlenderSteps([
      { op: 'retopo', triangles: 3000 },
      { op: 'review' },
      { op: 'joint', bone: 'head', head: [0.5, 0, 1] },
      { op: 'bind', from: 'source' },
      {
        op: 'weights',
        kind: 'smooth',
        bone: 'head',
        mask: { kind: 'box', min: [0, 0, 0], max: [1, 1, 1] },
      },
      { op: 'script', python: 'print(len(obj.data.vertices))', why: 'count' },
      { op: 'lods', triangles: [1000] },
      { op: 'review', views: ['poses'], poses: [{ bone: 'head', axis: 'x', degrees: 30 }] },
      EXPORT,
    ]);
    expect(steps[1]).toEqual({ op: 'review', views: ['clay', 'wire'], size: 1024 });
    expect(steps[3]).toEqual({ op: 'bind', from: 'source', maxInfluences: 4 });
    expect(steps[4]).toEqual({
      op: 'weights',
      kind: 'smooth',
      bone: 'head',
      mask: { kind: 'box', min: [0, 0, 0], max: [1, 1, 1], feather: 0 },
      value: 1,
      iterations: 2,
    });
  });

  test('the script text is in the bytes: one changed character is another program', () => {
    const bytes = (python: string): string =>
      new TextDecoder().decode(blenderProgram([{ op: 'script', python, why: 'fix' }, EXPORT]));
    expect(bytes('obj.scale.z = 1.1')).not.toBe(bytes('obj.scale.z = 1.2'));
    expect(bytes('obj.scale.z = 1.1')).toContain('obj.scale.z = 1.1');
  });

  test('retopo close and skin are optional, checked and in the bytes', () => {
    const [plain] = checkBlenderSteps([{ op: 'retopo', triangles: 900 }, EXPORT]);
    expect(plain).not.toHaveProperty('close');
    expect(plain).not.toHaveProperty('skin');
    const [fat] = checkBlenderSteps([
      { op: 'retopo', triangles: 900, close: 2, skin: 0.75 },
      EXPORT,
    ]);
    expect(fat).toMatchObject({ close: 2, skin: 0.75 });
    refuses([{ op: 'retopo', triangles: 900, skin: 3 }, EXPORT], /skin: 3 is outside/);
  });
});
