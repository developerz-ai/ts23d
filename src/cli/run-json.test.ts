// `t3d … --json` envelope shapes: whenever `ok` is false there is an `error` object an agent can
// read (`error.code`, `error.fix`), and a build's relative `files` say what they are relative to.

import { afterAll, expect, it } from 'bun:test';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { run } from './run.ts';

const out = join(import.meta.dir, '../../tmp/cli-json-test');
afterAll(() => rm(out, { recursive: true, force: true }));

const lib = join(import.meta.dir, '../index.ts');

async function envelopeOf(argv: string[]): Promise<{ code: number; env: Record<string, unknown> }> {
  const log = console.log;
  let printed = '';
  console.log = (m: string) => {
    printed += m;
  };
  try {
    const code = await run([...argv, '--json']);
    return { code, env: JSON.parse(printed) };
  } finally {
    console.log = log;
  }
}

it('a QA failure carries error T3D_QA_FAILED (count + fix pointing at data[].qa) beside data', async () => {
  const fixture = join(out, 'ghost.ts');
  await Bun.write(
    fixture,
    `import { box, defineAsset } from '${lib}';
export const ghost = defineAsset({ name: 'ghost', kind: 'prop', budget: { triangles: [24, 24, 24] },
  build: (ctx) => { ctx.part('base', box({ size: [1, 1, 1], color: [1, 1, 1] }));
    ctx.part('top', box({ size: [1, 1, 1], at: [0, 0, 3], color: [1, 1, 1] })); } });`,
  );
  const { code, env } = await envelopeOf(['build', fixture, '--out', out, '--sheet', 'none']);
  expect(code).toBe(1);
  expect(env['ok']).toBe(false);
  const error = env['error'] as { code: string; message: string; fix: string };
  expect(error.code).toBe('T3D_QA_FAILED');
  expect(error.message).toMatch(/\d+ finding\(s\) on 1 asset\(s\): ghost/);
  expect(error.fix).toContain('data[].qa.findings');
  const [m] = env['data'] as {
    name: string;
    dir: string;
    files: { lods: string[] };
    qa: { pass: boolean };
  }[];
  expect(m?.qa.pass).toBe(false);
  expect(m?.files.lods).toEqual(['lod0.glb', 'lod1.glb', 'lod2.glb']);
  expect(m?.dir).toBe(join(out, 'ghost'));
}, 60_000);

it('a passing build has no error and still names the folder its files are in', async () => {
  const fixture = join(out, 'crate.ts');
  await Bun.write(
    fixture,
    `import { box, defineAsset } from '${lib}';
export const crate = defineAsset({ name: 'crate', kind: 'prop', budget: { triangles: [12, 12, 12] },
  build: (ctx) => ctx.part('body', box({ size: [1, 1, 1], color: [1, 1, 1] })) });`,
  );
  const { code, env } = await envelopeOf(['build', fixture, '--out', out, '--sheet', 'none']);
  expect(code).toBe(0);
  expect(env['error']).toBeUndefined();
  expect((env['data'] as { dir: string }[])[0]?.dir).toBe(join(out, 'crate'));
}, 60_000);
