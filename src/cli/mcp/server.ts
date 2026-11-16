// `t3d mcp`: ts23d as a Model Context Protocol server over stdio, so a coding agent calls build /
// shot / hero / blueprint / review / critique / list_recipes / explain_error as tools and sees the
// renders inline. Zero dependencies: JSON-RPC 2.0, one message per line on stdin/stdout; logs go
// to stderr. Tool calls run one at a time (invoke.ts); a failing call never stops the server.
//
// Protocol pinned: MCP revision 2025-06-18 (https://modelcontextprotocol.io/specification/2025-06-18):
// lifecycle (initialize → notifications/initialized), ping, tools/list, tools/call with text and
// image content, isError results. Clients asking for 2025-11-25, 2025-03-26 or 2024-11-05 get that
// version echoed: the shapes used here are unchanged across them. The stateless 2026-07-28 revision
// (server/discover, per-request _meta version) is not implemented; such clients fall back to the
// initialize handshake, which that revision keeps for backward compatibility.

import { Ts23dError } from '../../core/index.ts';
import { versionOf } from '../help.ts';
import { type Sandbox, sandboxOf } from './sandbox.ts';
import { TOOLS } from './schemas.ts';
import { callTool, hasTool } from './tools.ts';

export const PROTOCOL = '2025-06-18';
export const PROTOCOL_VERSIONS: readonly string[] = [
  '2025-11-25',
  PROTOCOL,
  '2025-03-26',
  '2024-11-05',
];

const INSTRUCTIONS = `ts23d compiles TypeScript recipes (defineAsset) to game-ready GLB with QA gates.
Loop: write recipes/<name>/<name>.ts → build → fix every finding (each has code + fix) → shot →
LOOK at the contact sheet, fix the single worst error → hero / blueprint → review → critique →
repeat until two looks in a row find nothing. explain_error turns a T3D_* code into cause + fix.
Paths are relative to the project root; outputs stay in the project.`;

type Id = string | number | null;

interface Rpc {
  readonly jsonrpc?: unknown;
  readonly id?: unknown;
  readonly method?: unknown;
  readonly params?: unknown;
}

const reply = (id: Id, result: unknown): string => JSON.stringify({ jsonrpc: '2.0', id, result });

function fail(id: Id, code: number, message: string, fix?: string, t3d = 'T3D_CLI_USAGE'): string {
  const data = fix === undefined ? undefined : { code: t3d, fix };
  return JSON.stringify({
    jsonrpc: '2.0',
    id,
    error: { code, message, ...(data ? { data } : {}) },
  });
}

const isId = (v: unknown): v is string | number => typeof v === 'string' || typeof v === 'number';

export interface McpServer {
  /** One line from the client → the response line, or undefined for a notification. */
  handle(line: string): Promise<string | undefined>;
}

export function createServer(box: Sandbox, version: string): McpServer {
  async function request(id: Id, method: string, params: Record<string, unknown>): Promise<string> {
    if (method === 'initialize') {
      const asked = params['protocolVersion'];
      const protocolVersion =
        typeof asked === 'string' && PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL;
      return reply(id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'ts23d', title: 'ts23d — TypeScript to 3D', version },
        instructions: INSTRUCTIONS,
      });
    }
    if (method === 'ping') return reply(id, {});
    if (method === 'tools/list') return reply(id, { tools: TOOLS });
    if (method === 'tools/call') {
      const name = params['name'];
      if (typeof name !== 'string' || !hasTool(name))
        return fail(
          id,
          -32602,
          `T3D_CLI_USAGE: unknown tool ${JSON.stringify(name)}`,
          `call one of: ${TOOLS.map((t) => t.name).join(', ')} (tools/list describes them)`,
        );
      return reply(id, await callTool(box, name, params['arguments']));
    }
    return fail(
      id,
      -32601,
      `method not found: ${method}`,
      'ts23d serves initialize, ping, tools/list, tools/call',
    );
  }

  return {
    async handle(line) {
      let msg: unknown;
      try {
        msg = JSON.parse(line);
      } catch {
        return fail(
          null,
          -32700,
          'parse error: not JSON',
          'send one JSON-RPC 2.0 message per line',
        );
      }
      if (typeof msg !== 'object' || msg === null || Array.isArray(msg))
        return fail(
          null,
          -32600,
          'invalid request: expected one JSON-RPC object',
          'batches are not part of MCP 2025-06-18; send one message per line',
        );
      const m = msg as Rpc;
      const id: Id = isId(m.id) ? m.id : null;
      const isRequest = 'id' in m;
      if (m.jsonrpc !== '2.0' || typeof m.method !== 'string')
        return isRequest || !('method' in m)
          ? fail(
              id,
              -32600,
              'invalid request: needs jsonrpc "2.0" and a method',
              'send { "jsonrpc": "2.0", "id": 1, "method": "tools/list" }',
            )
          : undefined;
      // Notifications (initialized, cancelled, …) need no answer.
      if (!isRequest) return undefined;
      const params =
        typeof m.params === 'object' && m.params !== null
          ? (m.params as Record<string, unknown>)
          : {};
      try {
        return await request(id, m.method, params);
      } catch (e) {
        const coded = e instanceof Ts23dError ? e : undefined;
        const message =
          coded?.message ?? `internal error: ${e instanceof Error ? e.message : String(e)}`;
        return fail(
          id,
          -32603,
          message,
          coded?.fix ?? 'retry; if it persists, open an issue with the request',
          coded?.code ?? 'T3D_RECIPE_THREW',
        );
      }
    },
  };
}

/** Serve `input` (bytes, newline-delimited) until it ends; every response goes to `write`. */
export async function serve(
  server: McpServer,
  input: AsyncIterable<Uint8Array | string>,
  write: (line: string) => void,
): Promise<void> {
  const pending: Promise<void>[] = [];
  const decoder = new TextDecoder();
  let buffered = '';
  const dispatch = (line: string): void => {
    if (line.trim() === '') return;
    pending.push(server.handle(line).then((r) => (r === undefined ? undefined : write(r))));
  };
  for await (const chunk of input) {
    buffered += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
    const lines = buffered.split('\n');
    buffered = lines.pop() ?? '';
    lines.forEach(dispatch);
  }
  dispatch(buffered);
  await Promise.all(pending);
}

const USAGE = 'usage: t3d mcp [--root <dir>] [--out <dir>]   (stdio MCP server; logs on stderr)';

/** `t3d mcp [--root dir] [--out dir]` → exit code. stdout carries protocol messages only. */
export async function mcpMain(argv: readonly string[]): Promise<number> {
  const opts: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i] ?? '';
    const value = argv[i + 1];
    if ((flag !== '--root' && flag !== '--out') || value === undefined || value.startsWith('-')) {
      console.error(
        `T3D_CLI_USAGE: t3d mcp: bad argument ${JSON.stringify(flag)}\n  fix: ${USAGE}`,
      );
      return 2;
    }
    opts[flag.slice(2)] = value;
    i++;
  }
  const box = sandboxOf(opts['root'] ?? process.cwd(), opts['out']);
  // Recipes resolve refs/, .ts23d/ caches and relative paths from the working directory.
  process.chdir(box.root);
  console.log = console.error;
  console.info = console.error;
  console.debug = console.error;
  console.error(`ts23d MCP server: root ${box.root}, out ${box.out} (protocol ${PROTOCOL})`);
  const server = createServer(box, await versionOf());
  await serve(server, process.stdin, (line) => process.stdout.write(`${line}\n`));
  return 0;
}
