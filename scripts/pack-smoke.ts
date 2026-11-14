// Installs the packed tarball into an empty project and uses it as a consumer would, so what npm
// serves is what the gate tested: (1) `bunx t3d build` a two-box recipe to QA PASS; (2) import
// every `exports` subpath under Bun and under Node (skipped with a notice when `node` is not on
// PATH); (3) `tsc` a file importing every subpath with `skipLibCheck: false` and no DOM lib;
// (4) the tarball ships no tests, maps or demo PNGs, ships CLAUDE.md, NOTICE and every exports target.
// AGENTS.md is a symlink to CLAUDE.md, and npm and bun pack both skip symlinks: CLAUDE.md is the copy
// agents in a consumer project read.
// Offline-safe: the package has no runtime dependencies, so `bun add <tarball>` fetches nothing.
// Run: bun run scripts/pack-smoke.ts   (any failure is T3D_RELEASE with the failing step in fix)

import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Ts23dError } from '../src/core/index.ts';
import { TIERS } from './lib/tiers.ts';

const NAME = '@developerz.ai/ts23d';
const ROOT = resolve(import.meta.dir, '..');

/** The `exports` keys the package must advertise: the root, one per public module, package.json. */
export function expectedExports(): string[] {
  const modules = Object.keys(TIERS).filter((m) => m !== 'cli');
  return ['.', ...modules.map((m) => `./${m}`), './package.json'];
}

/** Every file path an `exports` map points at (conditions flattened), without the leading `./`. */
export function exportTargets(exportsMap: Record<string, unknown>): string[] {
  const out: string[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === 'string') out.push(v.replace(/^\.\//, ''));
    else if (v && typeof v === 'object') for (const x of Object.values(v)) walk(x);
  };
  walk(exportsMap);
  return [...new Set(out)].sort();
}

/** What is wrong with a tarball listing (paths relative to the package root); empty = fine. */
export function tarballProblems(files: readonly string[], targets: readonly string[]): string[] {
  const set = new Set(files);
  const problems: string[] = [];
  for (const f of files) {
    if (f.endsWith('.test.ts')) problems.push(`ships a test file: ${f}`);
    else if (f.startsWith('recipes/') && f.endsWith('.png'))
      problems.push(`ships a demo PNG: ${f}`);
    else if (f.startsWith('dist/') && f.endsWith('.map')) problems.push(`ships a source map: ${f}`);
  }
  if (!set.has('CLAUDE.md'))
    problems.push('CLAUDE.md (the agent brain AGENTS.md links to) is missing');
  if (!set.has('NOTICE')) problems.push('NOTICE (third-party acknowledgements) is missing');
  for (const t of targets) if (!set.has(t)) problems.push(`exports target missing: ${t}`);
  return problems;
}

const RECIPE = `import { box, defineAsset } from '${NAME}';
export const stack = defineAsset({
  name: 'stack',
  kind: 'prop',
  budget: { triangles: [24, 24, 24] },
  build: (ctx) => {
    ctx.part('base', box({ size: [1, 1, 0.5], color: [0.5, 0.4, 0.3] }));
    ctx.part('top', box({ size: [0.6, 0.6, 0.4], at: [0, 0, 0.5], color: [0.3, 0.4, 0.5] }));
  },
});
`;

function fail(step: string, cause: string): never {
  throw new Ts23dError('T3D_RELEASE', {
    cause: `pack smoke failed: ${cause}`,
    fix: `step ${step}: reproduce with \`bun run scripts/pack-smoke.ts\` and fix what it printed`,
  });
}

function sh(step: string, cmd: string[], cwd: string): string {
  const p = Bun.spawnSync(cmd, { cwd, stdout: 'pipe', stderr: 'pipe' });
  const out = `${p.stdout.toString()}${p.stderr.toString()}`;
  if (p.exitCode !== 0) fail(step, `\`${cmd.join(' ')}\` exited ${p.exitCode}\n${out.trim()}`);
  return out;
}

function importScript(specifiers: readonly string[]): string {
  return `const failed = [];
for (const s of ${JSON.stringify(specifiers)}) {
  try {
    await (s.endsWith('package.json') ? import(s, { with: { type: 'json' } }) : import(s));
  } catch (e) {
    failed.push(s + ': ' + (e instanceof Error ? e.message : String(e)));
  }
}
if (failed.length > 0) { console.error(failed.join('\\n')); process.exit(1); }
`;
}

const TSCONFIG = {
  compilerOptions: {
    strict: true,
    noEmit: true,
    skipLibCheck: false,
    module: 'nodenext',
    moduleResolution: 'nodenext',
    target: 'es2023',
    lib: ['es2023'],
    types: [],
  },
  files: ['types.ts'],
};

async function smoke(): Promise<void> {
  const t0 = performance.now();
  const work = await mkdtemp(join(tmpdir(), 'ts23d-pack-'));
  try {
    const packDir = join(work, 'pack');
    const app = join(work, 'app');
    await mkdir(packDir);
    await mkdir(app);
    // `bun pm pack` runs `prepack` (= bun run build), so dist/ is fresh from this tree.
    const tgz = sh('0 pack', ['bun', 'pm', 'pack', '--destination', packDir, '--quiet'], ROOT)
      .trim()
      .split('\n')
      .filter((l) => l.endsWith('.tgz'))
      .at(-1);
    if (!tgz) fail('0 pack', 'bun pm pack printed no .tgz path');
    const tarball = resolve(packDir, tgz);

    const pkg = (await Bun.file(join(ROOT, 'package.json')).json()) as {
      exports: Record<string, unknown>;
    };
    const keys = Object.keys(pkg.exports);
    if (keys.join() !== expectedExports().join())
      fail('4 tarball', `exports keys ${keys.join(', ')} ≠ ${expectedExports().join(', ')}`);
    const listing = sh('4 tarball', ['tar', 'tzf', tarball], work)
      .trim()
      .split('\n')
      .map((l) => l.replace(/^package\//, ''));
    const problems = tarballProblems(listing, exportTargets(pkg.exports));
    if (problems.length > 0) fail('4 tarball', problems.join('\n'));
    console.log(
      `✔ (4) tarball: ${listing.length} files, no tests/maps/demo PNGs, CLAUDE.md, NOTICE`,
    );

    await Bun.write(
      join(app, 'package.json'),
      '{ "name": "smoke", "private": true, "type": "module" }\n',
    );
    sh('1 install', ['bun', 'add', tarball], app);
    await Bun.write(join(app, 'stack.ts'), RECIPE);
    const built = sh(
      '1 t3d build',
      [
        'bun',
        'x',
        't3d',
        'build',
        'stack.ts',
        '--out',
        'out',
        '--size',
        '160x90',
        '--sheet-size',
        '512',
      ],
      app,
    );
    if (!built.includes('QA PASS')) fail('1 t3d build', `no QA PASS in:\n${built}`);
    console.log('✔ (1) bunx t3d build: QA PASS');

    const specifiers = expectedExports().map((k) => (k === '.' ? NAME : `${NAME}/${k.slice(2)}`));
    await Bun.write(join(app, 'imports.mjs'), importScript(specifiers));
    sh('2 bun imports', ['bun', 'imports.mjs'], app);
    if (Bun.which('node')) {
      sh('2 node imports', ['node', 'imports.mjs'], app);
      console.log(`✔ (2) ${specifiers.length} subpaths import under bun and node`);
    } else {
      console.log(
        `✔ (2) ${specifiers.length} subpaths import under bun; notice: node not on PATH, Node import skipped`,
      );
    }

    const ts = specifiers
      .filter((s) => !s.endsWith('package.json'))
      .map((s, i) => `import * as m${i} from '${s}';\nexport const x${i} = m${i};`)
      .join('\n');
    await Bun.write(join(app, 'types.ts'), `${ts}\n`);
    await Bun.write(join(app, 'tsconfig.json'), JSON.stringify(TSCONFIG, null, 2));
    sh('3 tsc', [join(ROOT, 'node_modules/.bin/tsc'), '-p', 'tsconfig.json'], app);
    console.log('✔ (3) tsc: published types check with skipLibCheck false, no DOM lib');
    console.log(`✔ pack smoke: ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  try {
    await smoke();
  } catch (e) {
    if (!(e instanceof Ts23dError)) throw e;
    console.error(`${e.message}\n  fix: ${e.fix}`);
    process.exit(1);
  }
}
