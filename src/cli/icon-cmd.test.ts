import { afterAll, expect, it } from 'bun:test';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { run } from './run.ts';

const out = join(import.meta.dir, '../../tmp/cli-icon-test');
afterAll(() => rm(out, { recursive: true, force: true }));

/** A unit with a team slab on its roof, or buried inside the body. */
async function fixture(name: string, buried: boolean): Promise<string> {
  const file = join(out, `${name}.ts`);
  await Bun.write(
    file,
    `import { box, defineAsset } from '${join(import.meta.dir, '../index.ts')}';
export const ${name} = defineAsset({ name: '${name}', kind: 'prop', budget: { triangles: [24, 24, 24] },
  paint: { team: '#b3261e' }, variants: { red: { team: '#b3261e' }, blue: { team: '#1f4fb8' } },
  build(ctx) {
    ctx.part('body', box({ size: [1, 1, 1.6], color: [0.3, 0.3, 0.28] }));
    ctx.part('roof', box({ size: [0.9, 0.9, 0.1], at: [0, 0, ${buried ? 0.6 : 1.6}], color: [0.45, 0.02, 0.013] }), { paint: 'team' });
  } });`,
  );
  return file;
}

async function icons(
  file: string,
): Promise<{ code: number; data: { files: string[]; warnings: { code: string }[] }[] }> {
  const lines: string[] = [];
  const log = console.log;
  console.log = (s: string) => lines.push(s);
  const code = await run(['icon', file, '--out', out, '--sheet-size', '512', '--json']);
  console.log = log;
  return { code, data: JSON.parse(lines.join('\n')).data };
}

it('warns with a code and a fix when the team colour is buried', async () => {
  const r = await icons(await fixture('buried', true));
  expect(r.data[0]?.warnings.map((w) => w.code)).toEqual(['T3D_TEAM_COLOUR_HIDDEN']);
}, 30000);

it('writes icon.png (256²), portrait.png (512²) and rts.png (64²) per asset', async () => {
  const r = await icons(await fixture('scout', false));
  expect(r.code).toBe(0);
  expect(r.data[0]?.warnings).toEqual([]);
  for (const [f, size] of [
    ['icon.png', 256],
    ['portrait.png', 512],
    ['rts.png', 64],
  ] as const) {
    const png = new Uint8Array(await Bun.file(join(out, 'scout', f)).arrayBuffer());
    const dv = new DataView(png.buffer);
    expect([dv.getUint32(16), dv.getUint32(20)]).toEqual([size, size]);
  }
}, 30000);
