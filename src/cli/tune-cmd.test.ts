import { describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Ts23dError } from '../core/index.ts';
import { parseArgs } from './args.ts';
import { run } from './run.ts';

const code = (f: () => unknown): string => {
  try {
    f();
  } catch (e) {
    return e instanceof Ts23dError ? e.code : 'not a Ts23dError';
  }
  return 'no throw';
};

const FIXTURE = `import { box, defineAsset } from '${resolve('src/index.ts')}';
export const slab = defineAsset({
  name: 'slab',
  kind: 'prop',
  budget: { triangles: [12, 12, 12] },
  tune: {
    params: { width: { min: 0.5, max: 4, default: 1, step: 0.001 } },
    objectives: [{ kind: 'silhouette', view: '+X', mask: 'front.svg' }],
  },
  build(ctx) {
    ctx.part('slab', box({ size: [0.2, ctx.tuned('width'), 1], color: [0.5, 0.5, 0.5] }));
  },
});
`;

describe('t3d tune', () => {
  it('refuses bad flags with T3D_TUNE_INVALID', () => {
    expect(code(() => parseArgs(['tune', 'x.ts', '--evals', '0']))).toBe('T3D_TUNE_INVALID');
    expect(code(() => parseArgs(['tune', 'x.ts', '--evals', 'many']))).toBe('T3D_TUNE_INVALID');
    expect(code(() => parseArgs(['tune', 'x.ts', '--seed', '-1']))).toBe('T3D_TUNE_INVALID');
    expect(code(() => parseArgs(['tune', 'x.ts', '--method', 'genetic']))).toBe('T3D_TUNE_INVALID');
    const a = parseArgs(['tune', 'x.ts', '--evals', '40', '--seed', '3', '--method', 'coordinate']);
    expect([a.evals, a.seed, a.method]).toEqual([40, 3, 'coordinate']);
  });

  it('exits 1 on a recipe without tune', async () => {
    expect(await run(['tune', 'recipes/boulders/boulders.ts'])).toBe(1);
    expect(existsSync('recipes/boulders/tune.json')).toBe(false); // no stray file left behind
  });

  it('writes tune.json, the report and the strip; same seed → same bytes', async () => {
    const dir = resolve('tmp/tune-cmd-test');
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'slab.ts'), FIXTURE);
    writeFileSync(
      join(dir, 'front.svg'),
      '<svg viewBox="0 0 200 100"><rect width="200" height="100"/></svg>',
    );
    const file = join(dir, 'slab.ts');
    expect(await run(['tune', file, '--evals', '24', '--seed', '2'])).toBe(0);
    const first = readFileSync(join(dir, 'tune.json'), 'utf8');
    expect(await run(['tune', file, '--evals', '24', '--seed', '2'])).toBe(0);
    expect(readFileSync(join(dir, 'tune.json'), 'utf8')).toBe(first);
    const width = (JSON.parse(first) as { slab: { values: { width: number } } }).slab.values.width;
    expect(Math.abs(width - 2)).toBeLessThan(0.2);
    expect(existsSync(join(dir, 'tune-report.md'))).toBe(true);
    expect(existsSync(join(dir, 'tune-strip.png'))).toBe(true);
  }, 60000);
});
