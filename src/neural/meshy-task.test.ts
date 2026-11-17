// meshy-task.ts against the fake API: a create is never repeated blindly, a lost reply is
// resolved by listing, and a refused download says whether a rerun costs anything.

import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { Ts23dError } from '../core/index.ts';
import { cube } from './fixtures.ts';
import { writeMeshGlb } from './glb-write.ts';
import { FAKE_API, FAKE_CDN, fakeMeshy } from './meshy-fake.ts';
import { memoryPending } from './meshy-net.ts';
import { meshyTasks } from './meshy-task.ts';

const api = fakeMeshy();
const GLB = writeMeshGlb([{ name: 'm', mesh: cube() }]);
const PATH = 'v1/image-to-3d';
const BODY = { image_url: 'data:image/png;base64,AA' };
const done = { body: { status: 'SUCCEEDED', consumed_credits: 20, model_urls: { glb: 'x' } } };
const tasks = (pending = memoryPending(), jobTimeoutMs = 5000) =>
  meshyTasks({
    apiKey: 'msy_fake',
    baseUrl: FAKE_API,
    fetch: api.fetch,
    pollMs: 1,
    backoffMs: 1,
    pending,
    jobTimeoutMs,
  });
const go = (pending = memoryPending()) =>
  tasks(pending).run(PATH, BODY, 'image-to-3d', AbortSignal.timeout(5000));
const err = async (p: Promise<unknown>): Promise<Ts23dError> => {
  const e = await p.then(
    () => undefined,
    (x: unknown) => x,
  );
  if (!(e instanceof Ts23dError)) throw new Error(`expected a Ts23dError, got ${String(e)}`);
  return e;
};

afterAll(() => expect(api.stray).toEqual([]));
beforeEach(() => api.reset(GLB));

describe('meshy tasks: a create is never repeated blindly', () => {
  test('a POST whose reply is lost → no retry, a marker stays, the fix says wait and rerun', async () => {
    const pending = memoryPending();
    api.script.lists = [[{ id: 'old-9' }]];
    api.script.drop = 1;
    const e = await err(go(pending));
    expect([e.code, e.message.includes('may exist and be charged')]).toEqual([
      'T3D_NEURAL_FAILED',
      true,
    ]);
    expect(e.fix).toContain('never posted twice');
    expect(api.posts(PATH).length).toBe(1);
    expect([...pending.map.values()]).toEqual(['?old-9']);
  });

  test('the rerun lists: one newer task is adopted and polled, with no second POST', async () => {
    const pending = memoryPending();
    api.script.lists = [[{ id: 'old-9' }], [{ id: 'new-1' }, { id: 'old-9' }]];
    api.script.drop = 1;
    await err(go(pending));
    api.script.polls = [done];
    const got = await go(pending);
    expect([got.id, got.resumed, got.credits]).toEqual(['new-1', true, 20]);
    expect(api.posts(PATH).length).toBe(1);
    expect(api.seen.at(-1)?.url).toBe(`${FAKE_API}/openapi/${PATH}/new-1`);
  });

  test('the rerun lists: several newer tasks → refused, naming them; none → posted again', async () => {
    const pending = memoryPending();
    api.script.lists = [[{ id: 'old-9' }], [{ id: 'b' }, { id: 'a' }, { id: 'old-9' }]];
    api.script.drop = 1;
    await err(go(pending));
    const e = await err(go(pending));
    expect([e.message.includes('b, a'), e.fix.includes('pending.json')]).toEqual([true, true]);
    expect(api.posts(PATH).length).toBe(1);
    // Nothing newer than the marker: the POST never arrived, so creating is safe.
    api.script.lists = [[{ id: 'old-9' }]];
    api.script.polls = [done];
    expect((await go(pending)).resumed).toBe(false);
    expect(api.posts(PATH).length).toBe(2);
  });

  test('a clear refusal (HTTP 400) leaves no marker: fixing the input and rerunning posts', async () => {
    const pending = memoryPending();
    api.script.create = [{ status: 400, body: { message: 'bad image' } }];
    const e = await err(go(pending));
    expect(e.message).toContain('HTTP 400');
    expect(pending.map.size).toBe(0);
  });

  test('HTTP 5xx on create is not a refusal: the marker stays', async () => {
    const pending = memoryPending();
    api.script.create = [{ status: 502, body: {} }];
    await err(go(pending));
    expect([...pending.map.values()]).toEqual(['?']);
  });
});

describe('meshy tasks: downloads', () => {
  const url = `${FAKE_CDN}/out/model.glb?Signature=secret`;
  test('an expired signed URL on a fresh task → pending kept, rerun resumes at no charge', async () => {
    const pending = memoryPending();
    const t = tasks(pending);
    api.script.polls = [done];
    const step = await t.run(PATH, BODY, 'image-to-3d', AbortSignal.timeout(5000));
    api.script.fileStatus = 403;
    const e = await err(t.download(url, 'model_urls.glb', [step]));
    expect([e.fix.includes('no new charge'), e.message.includes('secret')]).toEqual([true, false]);
    expect([...pending.map.values()]).toEqual(['i-1']);
  });

  test('the same on a resumed task → files are gone (3 days), entry dropped, rerun is charged', async () => {
    const pending = memoryPending();
    api.script.polls = [done, done];
    await go(pending);
    const t = tasks(pending);
    const step = await t.run(PATH, BODY, 'image-to-3d', AbortSignal.timeout(5000));
    expect(step.resumed).toBe(true);
    api.script.fileStatus = 404;
    const e = await err(t.download(url, 'model_urls.glb', [step]));
    expect(e.fix).toContain('charged');
    expect(pending.map.size).toBe(0);
  });

  test('downloads carry no API key', async () => {
    const t = tasks();
    expect((await t.download(url, 'model_urls.glb', [])).length).toBe(GLB.length);
    expect(api.seen.at(-1)?.auth).toBeUndefined();
  });
});
