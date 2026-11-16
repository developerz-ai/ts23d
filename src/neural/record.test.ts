import { describe, expect, test } from 'bun:test';
import { mockAdapter } from './mock-adapter.ts';
import { neuralCache } from './recipe-cache.ts';
import { parseRecord, publishable, recordJson } from './record.ts';

const filled = async () =>
  (
    await neuralCache({ recipe: 'r' }).fill(mockAdapter(), {
      task: 'image',
      request: { seed: 3, prompt: 'p', width: 4, height: 4 },
    })
  ).entry.record;

describe('record.json', () => {
  test('malformed records are refused (T3D_NEURAL_OUTPUT_INVALID)', async () => {
    const good = JSON.parse(recordJson(await filled())) as Record<string, unknown>;
    for (const bad of [
      'not json',
      JSON.stringify({ ...good, contract: 't3d-neural/0' }),
      JSON.stringify({ ...good, key: 'abc' }),
      JSON.stringify({ ...good, task: 'dance' }),
      JSON.stringify({ ...good, outputs: [] }),
      JSON.stringify({
        ...good,
        outputs: [{ file: '../x.png', mime: 'image/png', sha256: 'a'.repeat(64) }],
      }),
      JSON.stringify({
        ...good,
        outputs: [{ file: 'output-0.glb', mime: 'model/gltf-binary', sha256: 'a'.repeat(64) }],
      }),
    ])
      expect(() => parseRecord(bad, 'neural/k/record.json')).toThrow('T3D_NEURAL_OUTPUT_INVALID');
  });
  test('records model, licence, weights, request, output hashes and server; bytes are stable', async () => {
    const r = await filled();
    expect(r.model.id).toBe('mock-image');
    expect(r.model.licence).toContain('CC0-1.0');
    expect(r.model.weightsSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(r.server).toBe('ts23d-mock/1');
    expect(r.request).toEqual({ seed: 3, prompt: 'p', width: 4, height: 4 });
    expect(r.outputs[0]?.file).toBe('output-0.png');
    expect(recordJson(await filled())).toBe(recordJson(r));
    expect(parseRecord(recordJson(r), 'x')).toEqual(JSON.parse(recordJson(r)));
  });
  test('publishable: permissive output licences yes, unknown or non-commercial no', async () => {
    const r = await filled();
    expect(publishable(r)).toBe(true);
    for (const licence of ['CC-BY-NC-4.0', 'undeclared by the server', 'Tencent Hunyuan community'])
      expect(publishable({ ...r, model: { ...r.model, licence } })).toBe(false);
  });
});
