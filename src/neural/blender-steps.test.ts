import { describe, expect, test } from 'bun:test';
import type { NeuralRequest } from '../core/index.ts';
import { jobKey } from './adapter.ts';
import { BLENDER_OPS } from './blender-step-fields.ts';
import {
  BLENDER_STEPS_CONTRACT,
  type BlenderStep,
  blenderProgram,
  checkBlenderSteps,
  jsonInput,
} from './blender-steps.ts';

const EXPORT: BlenderStep = { op: 'export' };
const SPIKE: readonly BlenderStep[] = [
  { op: 'clean' },
  { op: 'retopo', triangles: 30000 },
  { op: 'uv' },
  { op: 'bake' },
  { op: 'bind' },
  { op: 'lods', triangles: [10000, 2500] },
  EXPORT,
];
const text = (steps: readonly BlenderStep[]): string =>
  new TextDecoder().decode(blenderProgram(steps));
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

describe('blenderProgram: refusals first', () => {
  test('an unknown op names its step index and the known ops', () => {
    refuses([{ op: 'clean' }, { op: 'sculpt' }, EXPORT], /step 1: unknown op 'sculpt'/);
    refuses([{ triangles: 3 }, EXPORT], /step 0: unknown op 'undefined'/);
  });

  test('order: no export, export not last, bake before uv, lods before retopo', () => {
    refuses([], /has no steps/);
    refuses([{ op: 'clean' }], /ends with 'clean', not 'export'/);
    refuses([EXPORT, { op: 'clean' }], /ends with 'clean'/);
    refuses([{ op: 'bake' }, { op: 'uv' }, EXPORT], /step 0 \(bake\): 'bake' needs 'uv' before it/);
    refuses([{ op: 'bake' }, EXPORT], /needs 'uv' before it/);
    refuses(
      [{ op: 'lods', triangles: [100] }, { op: 'retopo', triangles: 500 }, EXPORT],
      /step 1 \(retopo\): comes after 'lods'/,
    );
    refuses([{ op: 'uv' }, { op: 'retopo', triangles: 500 }, EXPORT], /comes after 'uv'/);
    refuses([{ op: 'uv' }, { op: 'uv' }, EXPORT], /'uv' appears twice/);
    refuses([{ op: 'bind' }, { op: 'clean' }, EXPORT], /changes the mesh after 'bind'/);
    refuses(
      [
        { op: 'clean' },
        { op: 'metaballs', balls: [{ at: [0, 0, 0], r: 1 }], resolution: 0.1 },
        EXPORT,
      ],
      /a build op is not the first step/,
    );
  });

  test('numbers: non-finite, out of range, fractional counts, wrong lengths', () => {
    refuses(
      [{ op: 'voxelRemesh', voxel: Number.NaN }, EXPORT],
      /step 0 \(voxelRemesh\)\.voxel: NaN/,
    );
    refuses(
      [{ op: 'inflate', distance: Number.POSITIVE_INFINITY }, EXPORT],
      /Infinity is not a finite/,
    );
    refuses([{ op: 'voxelRemesh', voxel: 0 }, EXPORT], /0 is outside \(0/);
    refuses([{ op: 'retopo', triangles: 30000.5 }, EXPORT], /is not an integer/);
    refuses([{ op: 'transform', matrix: [1, 0, 0] }, EXPORT], /matrix: needs 16\.\.16 entries/);
    refuses([{ op: 'lods', triangles: [100, 500] }, EXPORT], /does not fall/);
    refuses([{ op: 'uv', angle: 3 }, EXPORT], /step 0 \(uv\)\.angle: 3 is outside/);
  });

  test('fields: unknown, missing, wrong enum, twice-named map, bad mask', () => {
    refuses([{ op: 'bake', sise: 1024 }, EXPORT], /has unknown field 'sise'/);
    refuses([{ op: 'retopo' }, EXPORT], /step 0 \(retopo\): needs 'triangles'/);
    refuses(
      [{ op: 'retopo', triangles: 9, strategy: 'instant' }, EXPORT],
      /'instant' is not one of/,
    );
    refuses(
      [{ op: 'uv' }, { op: 'bake', maps: ['albedo', 'albedo'] }, EXPORT],
      /names a map twice/,
    );
    refuses([{ op: 'inflate', distance: 1, mask: { kind: 'box' } }, EXPORT], /kind 'box'/);
    refuses([{ op: 'skinBody', bones: [] }, EXPORT], /bones: needs 1\.\.256 entries/);
  });
});

describe('blenderProgram: the canonical program', () => {
  test('defaults are filled in, so Blender reads no default of its own', () => {
    const steps = checkBlenderSteps(SPIKE);
    expect(steps[0]).toEqual({
      op: 'clean',
      weld: 1e-5,
      minShell: 0.002,
      fillHoles: 64,
      manifold: true,
    });
    expect(steps[1]).toEqual({
      op: 'retopo',
      strategy: 'shell',
      reduce: 'decimate',
      triangles: 30000,
      smooth: 0,
      preserveSymmetry: false,
    });
    expect(steps[2]).toEqual({ op: 'uv', kind: 'smart', angle: 1.45, margin: 0.003, smooth: 30 });
    expect(steps[3]).toEqual({
      op: 'bake',
      size: 2048,
      maps: ['albedo', 'normal'],
      samples: 1,
      aoSamples: 32,
      margin: 16,
    });
    expect(steps[4]).toEqual({ op: 'bind', from: 'skeleton', maxInfluences: 4 });
    expect(JSON.parse(text(SPIKE)).contract).toBe(BLENDER_STEPS_CONTRACT);
    expect(JSON.parse(text(SPIKE)).frame).toBe('asset');
  });

  test('bytes are stable under key order and explicit defaults', () => {
    const a = text([{ op: 'retopo', triangles: 500, strategy: 'shell' }, EXPORT]);
    const b = text([{ strategy: 'shell', triangles: 500, op: 'retopo' }, EXPORT]);
    expect(a).toBe(b);
    expect(text([{ op: 'retopo', triangles: 500 }, EXPORT])).toBe(a);
  });

  test('any step field changes the bytes, the input sha256 and the job key', () => {
    const key = (steps: readonly BlenderStep[]): string => {
      const request: NeuralRequest<'blender'> = {
        seed: 1,
        program: jsonInput(blenderProgram(steps)),
        maxTriangles: 30000,
      };
      return jobKey('blender', request, { id: 'blender-blender', weightsSha256: 'x' });
    };
    const variants: (readonly BlenderStep[])[] = [
      SPIKE,
      SPIKE.map((s) => (s.op === 'retopo' ? { ...s, triangles: 29999 } : s)),
      SPIKE.map((s) => (s.op === 'uv' ? { ...s, angle: 1.4 } : s)),
      SPIKE.map((s) => (s.op === 'bake' ? { ...s, cage: 0.02 } : s)),
      SPIKE.map((s) => (s.op === 'bind' ? { ...s, maxInfluences: 3 } : s)),
      SPIKE.map((s) => (s.op === 'export' ? { ...s, normalSize: 1024 } : s)),
      SPIKE.filter((s) => s.op !== 'bind'),
    ];
    expect(new Set(variants.map(key)).size).toBe(variants.length);
  });

  test('every op of the table builds (a subset needs no bind)', () => {
    const all: readonly BlenderStep[] = [
      { op: 'skinBody', bones: [{ head: [0, 0, 0], tail: [1, 0, 0], r0: 0.2, r1: 0.1 }] },
      { op: 'transform', matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
      { op: 'clean' },
      { op: 'symmetrize' },
      { op: 'amputate', limbs: [[{ head: [0, -0.1, 0.4], tail: [0, -0.1, 0], r: 0.03 }]] },
      {
        op: 'unweb',
        limbs: [
          [{ head: [0, 0.1, 0.4], tail: [0, 0.1, 0], r: 0.03 }],
          [{ head: [-0.1, 0, 0.6], tail: [-0.1, 0, 0.2], r: 0.05 }],
        ],
      },
      { op: 'voxelRemesh', voxel: 0.01 },
      { op: 'smooth', iterations: 2, factor: 0.5 },
      { op: 'displace', strength: 0.01, scale: 0.1, mask: { kind: 'z', min: 0, max: 1 } },
      { op: 'inflate', distance: 0.01, mask: { kind: 'sphere', at: [0, 0, 0], r: 1 } },
      { op: 'stroke', brush: 'draw', path: [[0, 0, 0]], radius: 0.1, strength: 0.01 },
      { op: 'retopo', triangles: 2000, focus: [{ at: [0.5, 0, 1], r: 0.2, weight: 3 }] },
      { op: 'uv' },
      { op: 'bake' },
      { op: 'joint', bone: 'head', tail: [0.7, 0, 1] },
      { op: 'bind' },
      { op: 'repose', to: [{ name: 'spine_0', head: [0, 0, 1], tail: [1, 0, 1] }] },
      {
        op: 'weights',
        kind: 'assign',
        bone: 'head',
        mask: { kind: 'sphere', at: [0, 0, 1], r: 1 },
      },
      {
        op: 'weights',
        kind: 'scale',
        bone: 'head',
        value: 0.5,
        mask: { kind: 'plane', point: [0, 0, 1], normal: [1, 0, 0], feather: 0.02 },
      },
      {
        op: 'isolate',
        bones: ['tail_1'],
        from: [-0.6, 0, 0.3],
        point: [-0.5, 0, 0.7],
        normal: [-1, 0, 0],
        r: 0.1,
      },
      { op: 'script', python: 'obj.data.update()', why: 'refresh' },
      { op: 'review', views: ['clay', 'weights'] },
      { op: 'lods', triangles: [1000, 250] },
      EXPORT,
    ];
    const meta: BlenderStep = {
      op: 'metaballs',
      balls: [{ at: [0, 0, 0], r: 1 }],
      resolution: 0.1,
    };
    expect(checkBlenderSteps(all)).toHaveLength(all.length);
    expect(new Set<string>([...all, meta].map((s) => s.op))).toEqual(new Set(BLENDER_OPS));
    expect(checkBlenderSteps([meta, { op: 'retopo', triangles: 800 }, EXPORT])).toHaveLength(3);
  });
});
