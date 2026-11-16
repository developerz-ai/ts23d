import { afterAll, beforeAll, expect, it } from 'bun:test';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { decodePng } from '../../material/index.ts';
import { sandboxOf } from './sandbox.ts';
import { createServer, PROTOCOL } from './server.ts';

const root = join(import.meta.dir, '../../../tmp/mcp-server-test');
const server = () => createServer(sandboxOf(root), '0.0.0-test');
const rpc = async (line: string): Promise<Record<string, unknown> | undefined> => {
  const r = await server().handle(line);
  return r === undefined ? undefined : JSON.parse(r);
};
/** One key of a JSON-RPC message, typed by the test (an absent key fails the expectation). */
const field = <T>(m: Record<string, unknown> | undefined, key: string): T => (m?.[key] ?? {}) as T;
const msg = (id: number, method: string, params?: unknown): string =>
  JSON.stringify({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) });

beforeAll(() =>
  Bun.write(
    join(root, 'recipes/crate/crate.ts'),
    `import { box, defineAsset } from '${join(import.meta.dir, '../../index.ts')}';
export const crate = defineAsset({ name: 'crate', kind: 'prop', budget: { triangles: [12, 12, 12] },
  build: (ctx) => ctx.part('body', box({ size: [1, 1, 1], color: [1, 1, 1] })) });
export const thrower = defineAsset({ name: 'thrower', kind: 'prop', budget: { triangles: [12, 12, 12] },
  build: () => { throw new Error('boom'); } });`,
  ),
);
afterAll(() => rm(root, { recursive: true, force: true }));

it('answers an unknown tool with a JSON-RPC error carrying the T3D code and a fix', async () => {
  const r = await rpc(msg(1, 'tools/call', { name: 'paint_it', arguments: {} }));
  expect(r?.['error']).toMatchObject({ code: -32602, data: { code: 'T3D_CLI_USAGE' } });
  expect(field<{ data: { fix: string } }>(r, 'error').data.fix).toContain('build');
});

it('answers malformed input with parse / invalid-request / method-not-found errors', async () => {
  expect((await rpc('{nope'))?.['error']).toMatchObject({ code: -32700 });
  expect((await rpc('[1,2]'))?.['error']).toMatchObject({ code: -32600 });
  expect((await rpc('{"id":1,"method":"ping"}'))?.['error']).toMatchObject({ code: -32600 });
  expect((await rpc(msg(2, 'resources/list')))?.['error']).toMatchObject({ code: -32601 });
});

it('stays silent on notifications and negotiates the protocol version', async () => {
  expect(await rpc('{"jsonrpc":"2.0","method":"notifications/initialized"}')).toBeUndefined();
  const asked = async (v: string) =>
    field<{ protocolVersion: string }>(
      await rpc(msg(1, 'initialize', { protocolVersion: v })),
      'result',
    ).protocolVersion;
  expect(await asked('2025-11-25')).toBe('2025-11-25');
  expect(await asked('1999-01-01')).toBe(PROTOCOL);
});

/** One stdio session against a real `t3d mcp` process: lines in, lines out. */
it('serves a session over stdio: initialize, tools/list, build, shot image, error, ping', async () => {
  const entry = join(import.meta.dir, 'server.ts');
  const proc = Bun.spawn(
    [
      'bun',
      '-e',
      `import { mcpMain } from '${entry}'; process.exitCode = await mcpMain(['--root', '${root}']);`,
    ],
    { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' },
  );
  const lines = [
    msg(1, 'initialize', {
      protocolVersion: PROTOCOL,
      capabilities: {},
      clientInfo: { name: 't', version: '1' },
    }),
    '{"jsonrpc":"2.0","method":"notifications/initialized"}',
    msg(2, 'tools/list'),
    msg(3, 'tools/call', {
      name: 'build',
      arguments: { recipe: 'recipes/crate/crate.ts', sheetSize: 512 },
    }),
    msg(4, 'tools/call', { name: 'shot', arguments: { recipe: 'recipes/crate/crate.ts' } }),
    msg(5, 'tools/call', { name: 'shot', arguments: { recipe: 'recipes/missing.ts' } }),
    msg(6, 'ping'),
  ];
  proc.stdin.write(`${lines.join('\n')}\n`);
  proc.stdin.end();
  const out = await new Response(proc.stdout).text();
  expect(await proc.exited).toBe(0);
  const byId = new Map<number, Record<string, unknown>>();
  for (const l of out.trim().split('\n')) {
    const m = JSON.parse(l);
    byId.set(m.id, m);
  }
  expect([...byId.keys()].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  expect(byId.get(1)?.['result']).toMatchObject({
    protocolVersion: PROTOCOL,
    serverInfo: { name: 'ts23d' },
  });
  const tools = field<{ tools: { name: string }[] }>(byId.get(2), 'result').tools.map(
    (t) => t.name,
  );
  expect(tools).toEqual([
    'build',
    'shot',
    'hero',
    'blueprint',
    'review',
    'critique',
    'list_recipes',
    'explain_error',
  ]);
  // Two assets in the file: crate passes, thrower comes back coded; the result is an error.
  const build = byId.get(3)?.['result'] as {
    content: { type: string; text: string }[];
    isError?: boolean;
  };
  const summary = JSON.parse(build.content[0]?.text ?? '{}');
  expect(summary.assets[0]).toMatchObject({ asset: 'crate', qa: 'PASS' });
  expect(summary.failed[0].error.code).toBe('T3D_RECIPE_THREW');
  expect(build.isError).toBe(true);
  const shot = byId.get(4)?.['result'] as { content: { type: string; data?: string }[] };
  const image = shot.content.find((c) => c.type === 'image');
  const png = decodePng(Buffer.from(image?.data ?? '', 'base64'));
  expect(Math.max(png.width, png.height)).toBeLessThanOrEqual(1024);
  const missing = byId.get(5)?.['result'] as { content: { text: string }[]; isError: boolean };
  expect(missing.isError).toBe(true);
  expect(JSON.parse(missing.content[0]?.text ?? '{}').error.code).toBe('T3D_RECIPE_NOT_FOUND');
  expect(byId.get(6)?.['result']).toEqual({});
}, 60_000);
