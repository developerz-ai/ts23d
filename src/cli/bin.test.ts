// Spawns the real `t3d` binary: exit codes, which stream carries what, and the --json envelope.
import { afterAll, beforeAll, expect, it } from 'bun:test';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';

const dir = join(import.meta.dir, '../../tmp/cli-bin-test');
const bin = join(import.meta.dir, 'bin.ts');
const lib = join(import.meta.dir, '../index.ts');
const fx = (name: string): string => join(dir, `${name}.ts`);
const asset = (name: string, body: string): string =>
  `import { box, cylinder, defineAsset } from '${lib}';\nexport const ${name} = defineAsset(${body});\n`;
const crate = (name: string): string =>
  asset(
    name,
    `{ name: '${name}', kind: 'prop', budget: { triangles: [12, 12, 12] },
  build: (ctx) => ctx.part('body', box({ size: [1, 1, 1], color: [1, 1, 1] })) }`,
  );

beforeAll(async () => {
  await Bun.write(fx('crate'), crate('crate'));
  await Bun.write(fx('barrel'), crate('barrel'));
  await Bun.write(fx('crate_again'), crate('crate'));
  await Bun.write(
    fx('throws'),
    asset(
      'boom',
      `{ name: 'boom', kind: 'prop', budget: { triangles: [12, 12, 12] },
  build: () => { throw new Error('kaboom'); } }`,
    ),
  );
  await Bun.write(
    fx('nobudget'),
    `// @ts-nocheck\n${asset('nb', `{ name: 'nb', kind: 'prop', build: (ctx) => ctx.part('b', box({ size: [1, 1, 1], color: [1, 1, 1] })) }`)}`,
  );
  await Bun.write(
    fx('inverted'),
    asset(
      'inverted',
      `{ name: 'inverted', kind: 'prop', budget: { triangles: [2000, 2000, 2000] },
  build: (ctx) => ctx.part('drum', cylinder({ radius: 0.3, length: 1, segments: ctx.pick([8, 32, 128]), color: [1, 1, 1] })) }`,
    ),
  );
});
afterAll(() => rm(dir, { recursive: true, force: true }));

interface Ran {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

async function t3d(...argv: string[]): Promise<Ran> {
  const p = Bun.spawn(['bun', bin, ...argv], { stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, code] = await Promise.all([
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
    p.exited,
  ]);
  return { code, stdout, stderr };
}

const fast = ['--sheet', 'none', '--no-shot'];
const BAD: readonly [string, () => string[], string, number][] = [
  [
    'missing file',
    () => ['build', fx('missing'), '--out', join(dir, 'o'), ...fast],
    'T3D_RECIPE_NOT_FOUND',
    1,
  ],
  [
    'recipe that throws',
    () => ['build', fx('throws'), '--out', join(dir, 'o'), ...fast],
    'T3D_RECIPE_THREW',
    1,
  ],
  [
    'recipe without budget',
    () => ['build', fx('nobudget'), '--out', join(dir, 'o'), ...fast],
    'T3D_RECIPE_INVALID',
    1,
  ],
  ['--nope', () => ['build', fx('crate'), '--nope'], 'T3D_CLI_USAGE', 2],
  ['--lods 7', () => ['build', fx('crate'), '--lods', '7'], 'T3D_CLI_USAGE', 2],
  ['trailing --out', () => ['build', fx('crate'), '--out'], 'T3D_CLI_USAGE', 2],
  ['biuld', () => ['biuld', fx('crate')], 'T3D_CLI_USAGE', 2],
];

const codes = (text: string): string[] => [...new Set(text.match(/T3D_[A-Z_]+/g) ?? [])];
const stackLines = (text: string): string[] => text.split('\n').filter((l) => /^\s+at /.test(l));

for (const [what, argv, want, exit] of BAD) {
  it(`${what}: one coded error with a fix, no stack`, async () => {
    const r = await t3d(...argv());
    expect(r.code).toBe(exit);
    expect(codes(r.stderr)).toEqual([want]);
    expect(r.stderr).toMatch(/fix: \S/);
    expect(stackLines(r.stderr + r.stdout)).toEqual([]);
  });
  it(`${what} --json: one JSON object on stdout with ok: false, no JSON on stderr`, async () => {
    const r = await t3d(...argv(), '--json');
    expect(r.code).toBe(exit);
    const env = JSON.parse(r.stdout);
    expect(r.stdout.trim().split('\n')).toHaveLength(1);
    expect(env.ok).toBe(false);
    expect(env.error.code).toBe(want);
    expect(env.error.fix.length).toBeGreaterThan(0);
    expect(r.stderr).not.toMatch(/^\s*[{[]/m);
  });
}

it('--help, build --help and --version exit 0', async () => {
  const [all, one, version] = await Promise.all([
    t3d('--help'),
    t3d('build', '--help'),
    t3d('--version'),
  ]);
  expect([all.code, one.code, version.code]).toEqual([0, 0, 0]);
  expect(all.stdout).toContain('requires Bun');
  expect(all.stdout).toContain('--animations');
  expect(one.stdout).toContain('t3d build');
  expect(one.stdout).not.toContain('blueprint  measured');
  const pkg = await Bun.file(join(import.meta.dir, '../../package.json')).json();
  expect(version.stdout.trim()).toBe(pkg.version);
});

it('a LOD chain whose triangles grow (8 / 32 / 128 segments) fails the build', async () => {
  const r = await t3d('build', fx('inverted'), '--out', join(dir, 'inv'), ...fast, '--json');
  expect(r.code).toBe(1);
  const gates = JSON.parse(r.stdout).data[0].qa.findings.map((f: { gate: string }) => f.gate);
  expect(gates).toContain('lod-triangles');
});

it('writes the same manifest.json into two absolute --out dirs', async () => {
  const [a, b] = [join(dir, 'abs_a'), join(dir, 'abs_b')];
  const runs = await Promise.all([a, b].map((o) => t3d('build', fx('crate'), '--out', o, ...fast)));
  expect(runs.map((r) => r.code)).toEqual([0, 0]);
  const [ma, mb] = await Promise.all(
    [a, b].map((o) => Bun.file(join(o, 'crate', 'manifest.json')).text()),
  );
  expect(ma).toBe(mb ?? '');
  expect(ma).not.toContain(dir);
});

it('refuses two assets with one name; building A then B into one --out indexes both', async () => {
  const dup = await t3d(
    'build',
    fx('crate'),
    fx('crate_again'),
    '--out',
    join(dir, 'dup'),
    ...fast,
    '--json',
  );
  expect(dup.code).toBe(1);
  expect(JSON.parse(dup.stdout).error.code).toBe('T3D_ASSET_DUPLICATE');
  const out = join(dir, 'both');
  expect((await t3d('build', fx('crate'), '--out', out, ...fast)).code).toBe(0);
  expect((await t3d('build', fx('barrel'), '--out', out, ...fast)).code).toBe(0);
  const index = await Bun.file(join(out, 'index.json')).json();
  expect(index.assets.map((x: { name: string }) => x.name)).toEqual(['barrel', 'crate']);
});

it('a multi-recipe run builds what it can and reports the failure in data[]', async () => {
  const r = await t3d(
    'build',
    fx('missing'),
    fx('crate'),
    '--out',
    join(dir, 'multi'),
    ...fast,
    '--json',
  );
  expect(r.code).toBe(1);
  const env = JSON.parse(r.stdout);
  expect(env.error.code).toBe('T3D_RECIPE_NOT_FOUND');
  expect(env.data.map((d: { name?: string; error?: unknown }) => d.name ?? 'failed')).toEqual([
    'crate',
    'failed',
  ]);
});

it('list --json is one envelope, not NDJSON', async () => {
  const r = await t3d('list', fx('crate'), fx('barrel'), '--json');
  expect(r.code).toBe(0);
  expect(JSON.parse(r.stdout).data.map((d: { asset: string }) => d.asset)).toEqual([
    'crate',
    'barrel',
  ]);
});
