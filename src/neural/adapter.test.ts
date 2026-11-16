import { describe, expect, test } from 'bun:test';
import { type NeuralRequest, Ts23dError } from '../core/index.ts';
import {
  canonicalJson,
  jobKey,
  type NeuralAdapter,
  requestKey,
  runJob,
  taskResult,
} from './adapter.ts';
import { mockAdapter } from './mock-adapter.ts';
import { sha256Hex } from './sha256.ts';

const code = async (p: Promise<unknown>): Promise<string> =>
  p.then(
    () => 'resolved',
    (e: unknown) => (e instanceof Ts23dError ? e.code : String(e)),
  );

const IMG: NeuralRequest<'image'> = { seed: 1, prompt: 'oak bark', width: 8, height: 8 };
const M = { id: 'sdxl', weightsSha256: 'a'.repeat(64) };

/** Answers whatever `outputs` says, for every task. */
const fake = (mime: string, bytes: Uint8Array): NeuralAdapter => ({
  id: 'fake',
  tasks: ['image', 'mesh'],
  models: async () => [{ id: 'sdxl', task: 'image', licence: 'MIT' }],
  run: async (job) => ({
    result: taskResult(job.task, [{ mime, bytes }]),
    model: { id: 'sdxl', task: 'image', licence: 'MIT' },
  }),
});

describe('runJob: validation (failure first)', () => {
  test('wrong mime → T3D_NEURAL_OUTPUT_INVALID', async () => {
    const a = fake('image/jpeg', new Uint8Array([1, 2, 3]));
    expect(await code(runJob(a, { task: 'image', request: IMG }))).toBe(
      'T3D_NEURAL_OUTPUT_INVALID',
    );
  });
  test('right mime, bytes that are not a PNG → T3D_NEURAL_OUTPUT_INVALID', async () => {
    const a = fake('image/png', new Uint8Array(40));
    expect(await code(runJob(a, { task: 'image', request: IMG }))).toBe(
      'T3D_NEURAL_OUTPUT_INVALID',
    );
  });
  test('a PNG at the wrong size → T3D_NEURAL_OUTPUT_INVALID', async () => {
    const png = (await mockAdapter().run({ task: 'image', request: { ...IMG, width: 4 } })).result;
    const a = fake('image/png', png.outputs[0]?.bytes ?? new Uint8Array());
    expect(await code(runJob(a, { task: 'image', request: IMG }))).toBe(
      'T3D_NEURAL_OUTPUT_INVALID',
    );
  });
  test('a mesh over maxTriangles → T3D_NEURAL_OUTPUT_INVALID', async () => {
    const req = { seed: 0, prompt: 'rock', maxTriangles: 4 };
    expect(await code(runJob(mockAdapter(), { task: 'mesh', request: req }))).toBe(
      'T3D_NEURAL_OUTPUT_INVALID',
    );
  });
  test('an input without its bytes → T3D_RECIPE_INVALID; a task it lacks → T3D_NEURAL_FAILED', async () => {
    const mesh = { sha256: sha256Hex(new Uint8Array([1])), mime: 'model/gltf-binary' };
    const job = { task: 'rig' as const, request: { seed: 0, mesh } };
    expect(await code(runJob(mockAdapter(), job))).toBe('T3D_RECIPE_INVALID');
    const ok = { ...job, inputs: new Map([[mesh.sha256, new Uint8Array([1])]]) };
    expect(await code(runJob(mockAdapter(['image']), ok))).toBe('T3D_NEURAL_FAILED');
  });
  test('a foreign throw becomes T3D_NEURAL_FAILED', async () => {
    const a: NeuralAdapter = {
      ...mockAdapter(),
      run: () => Promise.reject(new TypeError('socket hang up')),
    };
    expect(await code(runJob(a, { task: 'image', request: IMG }))).toBe('T3D_NEURAL_FAILED');
  });
});

describe('job key', () => {
  test('same request twice → same key; key order and float noise do not matter', () => {
    const a = jobKey('image', IMG, M);
    const b = jobKey('image', { height: 8, width: 8, prompt: 'oak bark', seed: 1 }, M);
    expect(b).toBe(a);
    const p1 = { ...IMG, params: { guidance: 7.0000001 } };
    const p2 = { ...IMG, params: { guidance: 7 } };
    expect(jobKey('image', p1, M)).toBe(jobKey('image', p2, M));
  });
  test('changes with seed, model, weights, params and task', () => {
    const base = jobKey('image', IMG, M);
    const others = [
      jobKey('image', { ...IMG, seed: 2 }, M),
      jobKey('image', IMG, { ...M, id: 'flux' }),
      jobKey('image', IMG, { ...M, weightsSha256: 'b'.repeat(64) }),
      jobKey('image', { ...IMG, params: { steps: 30 } }, M),
      jobKey(
        'texture',
        {
          seed: 1,
          prompt: 'oak bark',
          size: 8,
          mesh: { sha256: 'c'.repeat(64), mime: 'model/gltf-binary' },
        },
        M,
      ),
    ];
    expect(new Set([base, ...others]).size).toBe(others.length + 1);
    expect(requestKey('image', IMG)).not.toBe(base);
  });
  test('NaN in a request → T3D_RECIPE_INVALID; canonical JSON sorts keys', () => {
    expect(() => canonicalJson({ a: Number.NaN })).toThrow('T3D_RECIPE_INVALID');
    expect(canonicalJson({ b: 1, a: [0.1234567, -0], c: undefined })).toBe(
      '{"a":[0.123457,0],"b":1}',
    );
  });
});
