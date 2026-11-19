// README's "A recipe" example is real code: extract it, point its import at this tree's src/, build
// it with `t3d build --json` and require QA PASS, so the first recipe a reader copies never rots.

import { afterAll, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '..');
let work = '';
afterAll(() => (work ? rm(work, { recursive: true, force: true }) : undefined));

/** The first ```ts block after the `## A recipe` heading, importing from `lib`. */
function readmeRecipe(readme: string, lib: string): string {
  const at = readme.indexOf('\n## A recipe');
  const block = /```ts\n([\s\S]*?)```/.exec(readme.slice(at));
  if (at < 0 || !block?.[1]) throw new Error('README has no ```ts block under "## A recipe"');
  return block[1].replaceAll("'@developerz.ai/ts23d'", `'${lib}'`);
}

it('the README recipe example builds with QA PASS', async () => {
  work = await mkdtemp(join(tmpdir(), 't3d-readme-'));
  const file = join(work, 'example.ts');
  const readme = await Bun.file(join(ROOT, 'README.md')).text();
  await Bun.write(file, readmeRecipe(readme, join(ROOT, 'src/index.ts')));
  const p = Bun.spawnSync(
    [
      ...['bun', join(ROOT, 'src/cli/bin.ts'), 'build', file],
      ...['--out', join(work, 'out'), '--sheet-size', '512', '--no-shot', '--json'],
    ],
    { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' },
  );
  const last = p.stdout.toString().trim().split('\n').at(-1) ?? '';
  const env = JSON.parse(last) as {
    ok: boolean;
    data: { qa: { findings: { message: string }[] } }[];
  };
  expect(env.data.flatMap((a) => a.qa.findings.map((f) => f.message))).toEqual([]);
  expect(env.ok).toBe(true);
  expect(p.exitCode).toBe(0);
}, 120_000);
