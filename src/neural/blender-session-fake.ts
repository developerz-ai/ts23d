// Test fixture (not exported): stands in for Blender behind `fakeBlenderSession`. It serves the
// session socket exactly as examples/blender/tasks/session.py does (same frames, same files) with
// canned step facts, so the session client is tested against a real process and a real socket.
// A `script` step whose `why` is 'boom' fails; one whose `why` is 'crash', or a `review` of size 77,
// kills the process.

import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Socket } from 'node:net';
import { dirname, join } from 'node:path';
import { decodeFrame, encodeFrame } from './blender-session-wire.ts';

type Step = Readonly<Record<string, unknown>>;
type Request = {
  readonly cmd?: string;
  readonly revision?: number;
  readonly steps?: readonly Step[];
};

const jobPath = process.argv[2] ?? '';
const dir = dirname(jobPath);
JSON.parse(readFileSync(jobPath, 'utf8'));
const put = (name: string, value: unknown): void => {
  writeFileSync(join(dir, `${name}.tmp`), JSON.stringify(value));
  renameSync(join(dir, `${name}.tmp`), join(dir, name));
};

let kept: readonly Step[] = [];
let revision = 0;
let batch = 0;
const undo: (readonly Step[])[] = [];
const facts = (): Record<string, unknown> => ({
  pid: process.pid,
  blender: '5.3.0',
  revision,
  batches: batch,
  kept: kept.map((s) => s['op']),
  undo: undo.length,
  triangles: 10,
});
const keep = (): void => put('kept.json', { revision, steps: kept });

function runBatch(r: Request): Record<string, unknown> {
  if (r.revision !== revision)
    return { ok: false, code: 'stale', error: 'old revision', fix: 'run it again' };
  const steps = r.steps ?? [];
  batch += 1;
  const out: Record<string, unknown>[] = [];
  const reviews: Record<string, unknown>[] = [];
  for (const [i, s] of steps.entries()) {
    put('activity.json', { batch, step: i, op: s['op'] });
    if (s['why'] === 'crash' || (s['op'] === 'review' && s['size'] === 77))
      process.kill(process.pid, 'SIGKILL');
    if (s['why'] === 'boom')
      return {
        ok: false,
        code: 'step',
        step: i,
        op: s['op'],
        restored: true,
        error: `step ${i} (script): it broke. fix: do not break it`,
      };
    if (s['op'] === 'review') {
      const folder = join(dir, `batch-${batch}`);
      mkdirSync(folder, { recursive: true });
      const file = join(folder, 'review-0-clay.png');
      writeFileSync(file, 'png');
      reviews.push({ view: 'clay', file });
    }
    out.push({ op: s['op'], seconds: 0, triangles: 10 });
  }
  put('activity.json', { batch: null });
  const changed = steps.filter((s) => s['op'] !== 'review');
  if (changed.length > 0) {
    undo.push(kept);
    kept = [...kept, ...changed];
    revision += 1;
    keep();
  }
  return { ok: true, batch, steps: out, reviews, seconds: 0, ...facts() };
}

function answer(r: Request): Record<string, unknown> {
  if (r.cmd === 'status') return { ok: true, ...facts() };
  if (r.cmd === 'run') return runBatch(r);
  if (r.cmd === 'undo') {
    const back = undo.pop();
    if (back === undefined) return { ok: false, code: 'empty', error: 'nothing to undo' };
    kept = back;
    revision += 1;
    keep();
    return { ok: true, ...facts() };
  }
  return { ok: false, code: 'usage', error: `unknown command ${String(r.cmd)}` };
}

const server = createServer((c: Socket) => {
  let got = new Uint8Array(0);
  c.on('data', (chunk: Uint8Array) => {
    got = new Uint8Array([...got, ...chunk]);
    const r = decodeFrame(got) as Request | undefined;
    if (r === undefined) return;
    if (r.cmd === 'stop') {
      c.end(encodeFrame({ ok: true, stopped: true }), () => {
        server.close();
        rmSync(join(dir, 'sock'), { force: true });
        put('ended.json', { reason: 'stopped' });
        process.exit(0);
      });
      return;
    }
    c.end(encodeFrame(answer(r)));
  });
});
server.listen(join(dir, 'sock'), () => {
  keep();
  put('ready.json', { contract: 't3d-blender-session/1', source: { triangles: 10 }, ...facts() });
});
