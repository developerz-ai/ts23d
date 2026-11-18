import { describe, expect, test } from 'bun:test';
import { BLENDER_OPS } from './blender-step-fields.ts';
import { BLENDER_BRUSHES } from './blender-step-stroke.ts';
import { type BlenderStep, blenderProgram, checkBlenderSteps } from './blender-steps.ts';
import { sha256Hex } from './sha256.ts';

const EXPORT: BlenderStep = { op: 'export' };
const PATH = [
  [0, 0, 0.1],
  [0, 0, 0.3],
] as const;
const STROKE: BlenderStep = {
  op: 'stroke',
  brush: 'draw',
  path: PATH,
  radius: 0.05,
  strength: 0.01,
};

const refuses = (steps: readonly unknown[], re: RegExp): void => {
  let error: unknown;
  try {
    checkBlenderSteps(steps as readonly BlenderStep[]);
  } catch (e) {
    error = e;
  }
  expect(String(error)).toContain('T3D_RECIPE_INVALID');
  expect(String(error)).toMatch(re);
  expect((error as { fix?: string }).fix).toBeTruthy();
};

describe('stroke: refusals first', () => {
  const s = (more: Record<string, unknown>): unknown[] => [{ ...STROKE, ...more }, EXPORT];

  test('field rules', () => {
    refuses(s({ brush: 'pose' }), /is not one of draw/);
    refuses(s({ path: [] }), /needs 1\.\.4096 entries/);
    refuses(s({ radius: 0 }), /radius: 0 is outside/);
    refuses(s({ radius: [0.1] }), /1 radii for 2 path points/);
    refuses(s({ strength: undefined }), /draw needs 'strength'/);
    refuses(s({ strength: 0 }), /strength is 0/);
    refuses(s({ spacing: 0 }), /spacing: 0 is outside/);
    refuses(s({ symmetry: 'q' }), /is not one of x, y, z/);
    refuses(s({ wobble: 1 }), /unknown field 'wobble'/);
  });

  test('brush rules: grab, vdm', () => {
    refuses(s({ brush: 'grab', strength: undefined, path: [PATH[0]] }), /grab has 1 path points/);
    refuses(s({ brush: 'grab' }), /grab takes no strength/);
    refuses(s({ brush: 'vdm' }), /vdm needs 'stamp'/);
    refuses(s({ stamp: { size: 3, grid: new Array(27).fill(0) } }), /draw takes no stamp/);
    refuses(s({ brush: 'vdm', stamp: { size: 4, grid: new Array(27).fill(0) } }), /has 27 numbers/);
  });

  test('order: before uv, never after what it would invalidate', () => {
    const uv = { op: 'uv' };
    refuses([uv, STROKE, EXPORT], /comes after 'uv'/);
    refuses([{ op: 'retopo', triangles: 900 }, uv, { op: 'bake' }, STROKE, EXPORT], /after 'uv'/);
    refuses([{ op: 'bind' }, STROKE, EXPORT], /comes after 'bind'/);
    refuses([{ op: 'lods', triangles: [100] }, STROKE, EXPORT], /comes after 'lods'/);
  });
});

describe('stroke: what is accepted', () => {
  test('every brush, on the source and on the shell, more than once', () => {
    const stamp = { size: 3, grid: new Array(27).fill(0.1) };
    const brushes = BLENDER_BRUSHES.map((brush): BlenderStep => {
      if (brush === 'grab') return { op: 'stroke', brush, path: PATH, radius: [0.05, 0.05] };
      return { ...STROKE, brush, ...(brush === 'vdm' ? { stamp } : {}) } as BlenderStep;
    });
    const out = checkBlenderSteps([
      ...brushes,
      { op: 'retopo', triangles: 900 },
      STROKE,
      { op: 'uv' },
      EXPORT,
    ]);
    expect(out[0]).toMatchObject({ spacing: 0.2, brush: 'draw' });
    expect(out[0]).not.toHaveProperty('symmetry');
    expect(BLENDER_OPS).toContain('stroke');
  });
});

describe('the canonical bytes of existing programs', () => {
  const cap = { head: [0, 0, 0.5], tail: [0.3, 0, 0.5], r: 0.05 } as const;
  const other = { head: [0, 0.3, 0.5], tail: [0.3, 0.3, 0.5], r: 0.05 } as const;
  const focus = [{ at: [0.5, 0, 0.5], r: 0.2, weight: 3 }] as const;
  const every: readonly BlenderStep[] = [
    { op: 'transform', matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
    { op: 'clean' },
    { op: 'symmetrize' },
    { op: 'amputate', limbs: [[cap]] },
    { op: 'unweb', limbs: [[cap], [other]] },
    { op: 'voxelRemesh', voxel: 0.01 },
    { op: 'smooth', iterations: 2, factor: 0.5 },
    { op: 'displace', strength: 0.01, scale: 0.1, mask: { kind: 'z', min: 0, max: 1 } },
    { op: 'inflate', distance: 0.002, mask: { kind: 'sphere', at: [0, 0, 0.5], r: 0.2 } },
    { op: 'retopo', triangles: 30000, focus },
    { op: 'uv' },
    { op: 'bake', size: 2048, maps: ['albedo', 'normal', 'ao'] },
    { op: 'joint', bone: 'head', tail: [0.8, 0, 0.6] },
    { op: 'bind' },
    {
      op: 'weights',
      kind: 'assign',
      bone: 'head',
      mask: { kind: 'box', min: [0, 0, 0], max: [1, 1, 1] },
    },
    {
      op: 'isolate',
      bones: ['tail'],
      from: [-1, 0, 0.5],
      point: [-0.5, 0, 0.5],
      normal: [-1, 0, 0],
      r: 0.1,
    },
    { op: 'script', python: 'pass', why: 'noop' },
    { op: 'review' },
    { op: 'repose', to: [{ name: 'head', head: [0, 0, 0], tail: [0, 0, 1] }] },
    { op: 'lods', triangles: [10000, 2500], focus },
    { op: 'export', normalSize: 1024, ormSize: 1024 },
  ];

  test('a program using every existing op hashes as it did before stroke and cageFit', () => {
    // Hashed from the code before this feature: committed recipes find outputs through these bytes.
    const bytes = blenderProgram(every);
    expect(sha256Hex(bytes)).toBe(
      'f72b7c4b0f488c07c4686126baf7cb2cb076fbaa6c56951da3782d7d5333d17d',
    );
    expect(bytes.length).toBe(1785);
  });

  test('cageFit appears only when asked for', () => {
    const bake = (more: object): string =>
      new TextDecoder().decode(blenderProgram([{ op: 'uv' }, { op: 'bake', ...more }, EXPORT]));
    expect(bake({})).not.toContain('cageFit');
    expect(bake({ cageFit: true })).toContain('"cageFit":true');
    refuses([{ op: 'uv' }, { op: 'bake', cageFit: 1 }, EXPORT], /cageFit: 1 is not a boolean/);
  });
});
