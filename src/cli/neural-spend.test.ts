// The spend guard of `t3d neural run` (neural-spend.ts): priced adapters are estimated before
// anything is sent, the limit holds for the whole command, and --yes-spend lifts it.

import { afterAll, describe, expect, it } from 'bun:test';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { mockAdapter } from '../neural/index.ts';
import { resolveConfig } from './config.ts';
import { neuralMain, neuralRun } from './neural-cmd.ts';

const dir = join(import.meta.dir, '../../tmp/cli-neural-spend-test');
afterAll(() => rm(dir, { recursive: true, force: true }));
const lib = join(import.meta.dir, '../index.ts');
const quiet = { json: true } as const;

describe('t3d neural run: the spend guard', () => {
  /** Two image requests on a paid adapter (30 credits each): 60 > the 50-credit limit. */
  const PAID = `import { box, defineAsset } from '${lib}';
export const coin = defineAsset({
  name: 'coin',
  kind: 'prop',
  budget: { triangles: [12, 12, 12] },
  build: (ctx) => {
    const a = ctx.neural('image', { seed: 1, prompt: 'heads', width: 4, height: 4 });
    const b = ctx.neural('image', { seed: 2, prompt: 'tails', width: 4, height: 4 });
    ctx.part('body', box({ size: [1, 1, a && b ? 1 : 0.5], color: [0.5, 0.5, 0.5] }));
  },
});
`;
  const paid = () => {
    const mock = mockAdapter();
    return {
      mock,
      config: resolveConfig({
        neural: {
          image: { ...mock, estimate: () => 30, balance: () => Promise.resolve({ balance: 44 }) },
        },
      }),
    };
  };

  it('a run estimated above 50 credits sends nothing without --yes-spend (exit 2)', async () => {
    const f = join(dir, 'coin', 'coin.ts');
    await Bun.write(f, PAID);
    const { mock, config } = paid();
    const lines: string[] = [];
    await expect(neuralRun(f, config, false, { log: (l) => void lines.push(l) })).rejects.toThrow(
      /T3D_CLI_USAGE: coin: this run is estimated at 60 credits, above 50/,
    );
    expect(mock.calls()).toBe(0);
    expect(lines).toEqual([
      '~ mock balance: 44 credits',
      '~ coin image on mock: about 30 credits',
      '~ coin image on mock: about 30 credits',
    ]);
    expect(await neuralMain(['run', f], { ...quiet, requireNeural: false, config })).toBe(2);
    expect(mock.calls()).toBe(0);
  });

  it('two recipes in one command share ONE limit: 30 + 30 credits stop at the second file', async () => {
    const one = (name: string) =>
      PAID.replaceAll('coin', name).replace(/\n {4}const b = [^\n]*\n/, '\n    const b = a;\n');
    const [a, b] = [join(dir, 'ace', 'ace.ts'), join(dir, 'bet', 'bet.ts')];
    await Bun.write(a, one('ace'));
    await Bun.write(b, one('bet'));
    const { mock, config } = paid();
    // Each alone is under the limit; together they are not: the first is sent, the second never.
    expect(await neuralMain(['run', a, b], { ...quiet, requireNeural: false, config })).toBe(2);
    expect(mock.calls()).toBe(1);
  });

  it('--yes-spend runs it and reports the estimate; the cached rerun estimates 0', async () => {
    const f = join(dir, 'coin', 'coin.ts');
    const { mock, config } = paid();
    const r = await neuralRun(f, config, false, { yesSpend: true });
    expect([r.estimatedCredits, r.filled.length, mock.calls()]).toEqual([60, 2, 2]);
    const again = await neuralRun(f, config, false);
    expect([again.estimatedCredits, again.filled.every((x) => x.cached)]).toEqual([0, true]);
  });
});
