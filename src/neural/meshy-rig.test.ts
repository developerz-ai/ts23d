// The Meshy `rig` task against the fake API: refusals before any credit, the rigging → animation
// chain, chaining onto a Meshy mesh by task id, and the multi-image mesh that feeds it.

import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { encodePng, Ts23dError } from '../core/index.ts';
import { runJob } from './adapter.ts';
import { cube } from './fixtures.ts';
import { readGlb } from './glb-read.ts';
import { packGlb, writeMeshGlb } from './glb-write.ts';
import { MESHY_RIG_MODEL, meshyAdapter } from './meshy-adapter.ts';
import { FAKE_API, FAKE_CDN, type FakeReply, fakeMeshy } from './meshy-fake.ts';
import { memoryPending } from './meshy-net.ts';
import type { MeshyOptions } from './meshy-params.ts';
import { glbTriangles, type MeshyAnimation, resolveClips } from './meshy-rig.ts';
import { sha256Hex } from './sha256.ts';

const api = fakeMeshy();
const MESH = writeMeshGlb([{ name: 'body', mesh: cube() }]);
/** The same GLB with a skin entry: what Meshy's rigged / animated GLB must carry. */
const SKINNED = (() => {
  const doc = readGlb(MESH);
  return packGlb({ ...doc.json, skins: [{ joints: [0] }] }, doc.bin ?? new Uint8Array());
})();
const SHA = sha256Hex(MESH);
const inputs = new Map([[SHA, MESH]]);
const RIG = { seed: 1, mesh: { sha256: SHA, mime: 'model/gltf-binary' }, height: 1.8 };
const LIBRARY = [
  { action_id: 0, name: 'Idle', key: 'Idle', category: 'DailyActions', sub_category: 'Idle' },
  { action_id: 30, name: 'Walking', key: 'Casual_Walk', category: 'WalkAndRun', sub_category: 'W' },
  { action_id: 31, name: 'Walking', key: 'Sneak_Walk', category: 'WalkAndRun', sub_category: 'W' },
  { action_id: 14, name: 'Run', key: 'Run_02', category: 'WalkAndRun', sub_category: 'R' },
];
const opts = (more: Partial<MeshyOptions> = {}): MeshyOptions => ({
  apiKey: 'msy_fake',
  baseUrl: FAKE_API,
  fetch: api.fetch,
  pollMs: 1,
  backoffMs: 1,
  pending: memoryPending(),
  ...more,
});
const ok = (result: object, credits: number): FakeReply => ({
  body: { status: 'SUCCEEDED', consumed_credits: credits, result },
});
const rigged = ok({ rigged_character_glb_url: `${FAKE_CDN}/rig.glb?sig=1` }, 5);
const animated = ok({ animation_glb_url: `${FAKE_CDN}/anim.glb?sig=1` }, 9);
const rig = (o: MeshyOptions, request: object = RIG) =>
  runJob(meshyAdapter(o), { task: 'rig', request: request as typeof RIG, inputs });
const err = async (p: Promise<unknown>): Promise<Ts23dError> => {
  const e = await p.then(
    () => undefined,
    (x: unknown) => x,
  );
  if (!(e instanceof Ts23dError)) throw new Error(`expected a Ts23dError, got ${String(e)}`);
  return e;
};
const spent = (): number => api.seen.filter((s) => s.method === 'POST').length;

afterAll(() => expect(api.stray).toEqual([]));
beforeEach(() => {
  api.reset(SKINNED);
  api.script.library = LIBRARY;
});

describe('meshy rig: refused before any credit', () => {
  test('422 (no humanoid pose found) → fix says biped facing +Z, not charged, nothing pending', async () => {
    const pending = memoryPending();
    api.script.create = [{ status: 422, body: { message: 'Pose estimation failed' } }];
    const e = await err(rig(opts({ pending })));
    expect([e.code, e.fix.includes('biped'), e.fix.includes('not charged')]).toEqual([
      'T3D_NEURAL_FAILED',
      true,
      true,
    ]);
    expect(pending.map.size).toBe(0);
  });
  test('a FAILED rigging task → refunded, never retried, no animation task', async () => {
    api.script.polls = [
      {
        body: { status: 'FAILED', task_error: { message: 'not a humanoid' }, consumed_credits: 0 },
      },
    ];
    const e = await err(rig(opts(), { ...RIG, clips: ['0'] }));
    expect([e.message.includes('not a humanoid'), e.message.includes('refunded')]).toEqual([
      true,
      true,
    ]);
    expect([api.posts('v1/rigging').length, api.posts('v1/animations').length]).toEqual([1, 0]);
  });
  test('unknown, ambiguous and duplicate clips, > 10 clips, bad height / template: no POST', async () => {
    const cases: [object, RegExp][] = [
      [{ clips: ['moonwalk'] }, /not in the Meshy animation library/],
      [{ clips: ['walking'] }, /names 2 library animations/],
      [{ clips: ['idle', 'Idle'] }, /asked twice/],
      [{ clips: Array.from({ length: 11 }, (_, i) => String(i)) }, /11 clips/],
      [{ height: -1 }, /height is -1/],
      [{ template: 'human' }, /not a Meshy skeleton/],
      [{ params: { fingers: true } }, /params\.fingers is not a Meshy knob/],
      [{ mesh: { sha256: SHA, mime: 'model/obj' } }, /rig input is 'model\/obj'/],
    ];
    for (const [more, want] of cases)
      expect((await err(rig(opts(), { ...RIG, ...more }))).message).toMatch(want);
    expect((await err(rig(opts(), { ...RIG, clips: ['walking'] }))).fix).toContain('Casual_Walk');
    expect(spent()).toBe(0);
  });
  test('a mesh over 380 000 triangles is refused before the upload', async () => {
    const doc = readGlb(MESH);
    const accessors = (doc.json['accessors'] as { count: number }[]).map((a) => ({ ...a }));
    const prim = (doc.json['meshes'] as { primitives: { indices: number }[] }[])[0]?.primitives[0];
    const idx = accessors[prim?.indices ?? 0];
    if (idx) idx.count = 1_200_000;
    const big = packGlb({ ...doc.json, accessors }, doc.bin ?? new Uint8Array());
    expect(glbTriangles(big)).toBe(400_000);
    const sha = sha256Hex(big);
    const e = await err(
      runJob(meshyAdapter(opts()), {
        task: 'rig',
        request: { ...RIG, mesh: { sha256: sha, mime: 'model/gltf-binary' } },
        inputs: new Map([[sha, big]]),
      }),
    );
    expect([e.message.includes('400000 triangles'), e.fix.includes('maxTriangles')]).toEqual([
      true,
      true,
    ]);
    expect(spent()).toBe(0);
  });
  test('an output without a skin is refused by runJob (T3D_NEURAL_OUTPUT_INVALID)', async () => {
    api.script.polls = [rigged];
    api.script.file = MESH;
    expect((await err(rig(opts()))).code).toBe('T3D_NEURAL_OUTPUT_INVALID');
  });
});

describe('meshy rig: the chain', () => {
  test('resolveClips: keys in any case and spelling, unique names, numeric ids, request order', () => {
    const lib: MeshyAnimation[] = LIBRARY.map((a) => ({
      id: a.action_id,
      name: a.name,
      key: a.key,
      category: a.category,
      subCategory: a.sub_category,
    }));
    // An id the library does not hold is refused here, before rigging is paid for.
    expect(() => resolveClips(['92'], lib)).toThrow(/no animation with id 92/);
    expect(resolveClips(['run_02', 'casual walk', 'IDLE', '31'], lib)).toEqual([14, 30, 0, 31]);
    expect(resolveClips(['Run'], lib)).toEqual([14]);
  });
  test('no clips: upload as a data URI with height → the rigged GLB, 5 credits', async () => {
    api.script.polls = [rigged];
    const run = await rig(opts());
    const body = JSON.parse(api.posts('v1/rigging')[0]?.body ?? '{}');
    expect(body.model_url.startsWith('data:application/octet-stream;base64,')).toBe(true);
    expect([body.height_meters, 'input_task_id' in body]).toEqual([1.8, false]);
    expect([run.model.id, run.model.licence, run.server]).toEqual([
      MESHY_RIG_MODEL,
      'own',
      'meshy task r-1; consumed_credits 5',
    ]);
    expect(api.seen.at(-1)?.url).toBe(`${FAKE_CDN}/rig.glb?sig=1`);
    expect(api.seen.some((s) => s.url.includes('library'))).toBe(false);
  });
  test('clips: library lookup, one animation task with action_ids in order, one GLB out', async () => {
    api.script.polls = [rigged, animated];
    const pending = memoryPending();
    const request = {
      ...RIG,
      clips: ['Idle', 'casual_walk', 'Run_02'],
      template: 'mixamo',
      params: { includeFingers: true },
    };
    const adapter = meshyAdapter(opts({ pending }));
    expect(adapter.estimate({ task: 'rig', request })).toBe(14);
    const run = await runJob(adapter, { task: 'rig', request, inputs });
    expect(JSON.parse(api.posts('v1/rigging')[0]?.body ?? '{}')).toMatchObject({
      height_meters: 1.8,
      skeleton_template: 'mixamo',
      include_fingers: true,
    });
    expect(JSON.parse(api.posts('v1/animations')[0]?.body ?? '{}')).toEqual({
      rig_task_id: 'r-1',
      action_ids: [0, 30, 14],
    });
    expect(run.result.outputs.map((o) => o.mime)).toEqual(['model/gltf-binary']);
    expect(run.server).toBe('meshy task r-1 + a-1; consumed_credits 14');
    expect(api.seen.at(-1)?.url).toBe(`${FAKE_CDN}/anim.glb?sig=1`);
    expect(pending.map.size).toBe(0);
    expect((await adapter.animations({ search: 'walk' })).map((a) => a.key)).toContain('Idle');
    expect(api.seen.at(-1)?.url).toBe(`${FAKE_API}/openapi/v1/animations/library?search=walk`);
  });
  test('timeout between rigging and animation: the rerun resumes both, no second rigging', async () => {
    const pending = memoryPending();
    api.script.polls = [rigged];
    await err(rig(opts({ pending, jobTimeoutMs: 30 }), { ...RIG, clips: ['0'] }));
    api.script.polls = [rigged, animated];
    await rig(opts({ pending }), { ...RIG, clips: ['0'] });
    expect([api.posts('v1/rigging').length, api.posts('v1/animations').length]).toEqual([1, 1]);
  });
  test('multi-image a-pose mesh → rig names the Meshy task (no upload); 404 falls back to it', async () => {
    const png = encodePng(32, 32, new Uint8Array(32 * 32 * 4).fill(180));
    const side = encodePng(32, 32, new Uint8Array(32 * 32 * 4).fill(90));
    const [a, b] = [sha256Hex(png), sha256Hex(side)];
    const pending = memoryPending();
    const adapter = meshyAdapter(opts({ pending }));
    const request = {
      seed: 1,
      image: { sha256: a, mime: 'image/png' },
      images: [{ sha256: b, mime: 'image/png' }],
      pose: 'a-pose' as const,
      maxTriangles: 100_000,
      params: { texture: true, pbr: true, textureResolution: '2k' },
    };
    expect(adapter.estimate({ task: 'mesh', request })).toBe(30);
    api.script.file = MESH;
    api.script.polls = [
      { body: { status: 'SUCCEEDED', consumed_credits: 30, model_urls: { glb: `${FAKE_CDN}/m` } } },
    ];
    await runJob(adapter, {
      task: 'mesh',
      request,
      inputs: new Map([
        [a, png],
        [b, side],
      ]),
    });
    const sent = JSON.parse(api.posts('v1/multi-image-to-3d')[0]?.body ?? '{}');
    expect(sent).toMatchObject({
      ai_model: 'latest',
      pose_mode: 'a-pose',
      image_enhancement: false,
      should_texture: true,
      enable_pbr: true,
      texture_resolution: '2k',
      target_formats: ['glb'],
      target_polycount: 90_000,
    });
    expect([sent.image_urls.length, 'image_url' in sent]).toEqual([2, false]);
    expect(sent.image_urls[0]).toContain(Buffer.from(png).toString('base64'));
    api.script.file = SKINNED;
    api.script.polls = [rigged];
    await runJob(adapter, { task: 'rig', request: RIG, inputs });
    expect(JSON.parse(api.posts('v1/rigging')[0]?.body ?? '{}')).toEqual({
      input_task_id: 'm-1',
      height_meters: 1.8,
    });
    // The upstream files expired (3 days): Meshy answers 404, nothing was created → upload.
    api.script.create = [{ status: 404, body: { message: 'input task files are gone' } }];
    api.script.polls = [rigged];
    await runJob(adapter, { task: 'rig', request: { ...RIG, height: 1.7 }, inputs });
    const last = JSON.parse(api.posts('v1/rigging').at(-1)?.body ?? '{}');
    expect(['input_task_id' in last, last.model_url.startsWith('data:')]).toEqual([false, true]);
    expect(pending.map.has(`glb:${SHA}`)).toBe(false);
  });
});
