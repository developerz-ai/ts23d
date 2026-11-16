// MCP `tools/call` handlers. Each tool checks its arguments, confines every path to the project
// root and the output directory (sandbox.ts), runs the matching `t3d` command in-process with
// --json (invoke.ts) and answers with a small JSON summary plus the PNGs as image blocks. Full
// detail stays on disk (manifest.json, review.md) and is named by path. Errors come back as a
// result with isError and the T3D_* code + fix, never a stack; the server stays up.

import { join, relative } from 'node:path';
import { Ts23dError } from '../../core/index.ts';
import type { AssetManifest } from '../manifest.ts';
import type { ErrorJson, Failed } from '../report.ts';
import { explain } from './explain.ts';
import { type ImageBlock, imageBlocks } from './images.ts';
import { invoke } from './invoke.ts';
import { confine, type Sandbox } from './sandbox.ts';
import { TOOLS } from './schemas.ts';

export interface TextBlock {
  readonly type: 'text';
  readonly text: string;
}

export interface ToolResult {
  readonly content: (TextBlock | ImageBlock)[];
  readonly isError?: boolean;
}

type ArgMap = Readonly<Record<string, unknown>>;

/** Findings shown inline per asset; the rest are in manifest.json. */
const FINDINGS_SHOWN = 20;

const text = (value: unknown): TextBlock => ({ type: 'text', text: JSON.stringify(value) });

/** A coded error as a tool result the agent can act on. */
export const failure = (e: ErrorJson): ToolResult => ({
  content: [text({ error: e })],
  isError: true,
});

function bad(tool: string, cause: string, fix: string): Ts23dError {
  return new Ts23dError('T3D_CLI_USAGE', { cause: `${tool}: ${cause}`, fix });
}

/** The tool's arguments against its schema: known keys, right types, required present. */
function checked(name: string, raw: unknown): ArgMap {
  const def = TOOLS.find((t) => t.name === name);
  const args: ArgMap = raw === undefined ? {} : (raw as ArgMap);
  if (!def) throw bad(name, 'unknown tool', `call one of: ${TOOLS.map((t) => t.name).join(', ')}`);
  if (typeof args !== 'object' || args === null || Array.isArray(args))
    throw bad(name, 'arguments must be an object', 'pass { "recipe": "recipes/<name>/<name>.ts" }');
  const props = def.inputSchema.properties as Record<string, { type: string }>;
  for (const [k, v] of Object.entries(args)) {
    const want = props[k]?.type;
    if (want === undefined)
      throw bad(name, `unknown argument '${k}'`, `use: ${Object.keys(props).join(', ')}`);
    const ok = want === 'integer' ? Number.isInteger(v) : typeof v === want;
    if (!ok) throw bad(name, `'${k}' must be ${want}, got ${JSON.stringify(v)}`, 'fix the type');
  }
  for (const k of def.inputSchema.required ?? [])
    if (args[k] === undefined) throw bad(name, `'${k}' is required`, `pass "${k}"`);
  return args;
}

const isFailed = (x: unknown): x is Failed =>
  typeof x === 'object' && x !== null && 'error' in x && 'file' in x;

const itemsOf = (data: unknown): unknown[] => (Array.isArray(data) ? data : []);

/** argv for a recipe command: `<cmd> <recipe> --out <out> [flag value…]`. */
function argvOf(box: Sandbox, cmd: string, args: ArgMap, flags: Record<string, string>): string[] {
  const recipe = confine(box, String(args['recipe']), 'recipe', [box.root]);
  const out = confine(box, typeof args['out'] === 'string' ? args['out'] : box.out, 'out');
  const argv = [cmd, recipe, '--out', out];
  for (const [key, flag] of Object.entries(flags))
    if (args[key] !== undefined) argv.push(flag, String(args[key]));
  return argv;
}

const shown = (box: Sandbox, p: string): string => relative(box.root, p) || p;

function manifestSummary(box: Sandbox, out: string, m: AssetManifest) {
  const dir = join(out, m.name);
  const f = m.files;
  return {
    asset: m.name,
    qa: m.qa.pass ? 'PASS' : 'FAIL',
    findings: m.qa.findings.slice(0, FINDINGS_SHOWN).map((x) => ({
      code: x.code,
      gate: x.gate,
      ...(x.part ? { part: x.part } : {}),
      message: x.message,
      fix: x.fix,
    })),
    ...(m.qa.findings.length > FINDINGS_SHOWN
      ? { more: `${m.qa.findings.length - FINDINGS_SHOWN} more in the manifest` }
      : {}),
    triangles: m.triangles,
    drawCalls: m.drawCalls,
    manifest: shown(box, join(dir, 'manifest.json')),
    files: [
      ...f.lods,
      ...(f.single ? [f.single] : []),
      ...(f.hero ? [f.hero] : []),
      ...(f.sheet ? [f.sheet] : []),
    ].map((p) => shown(box, join(dir, p))),
  };
}

/** build / shot: manifests (+ the contact sheets for shot). */
async function built(box: Sandbox, argv: string[], look: boolean): Promise<ToolResult> {
  const out = argv[3] ?? box.out;
  const { envelope } = await invoke(argv);
  const assets = itemsOf(envelope.data).filter((x): x is AssetManifest => !isFailed(x));
  const failed = itemsOf(envelope.data).filter(isFailed);
  const sheets = look
    ? assets.flatMap((m) => (m.files.sheet ? [join(out, m.name, m.files.sheet)] : []))
    : [];
  const imgs = await imageBlocks(sheets);
  const summary = {
    ok: envelope.ok,
    ...(envelope.error ? { error: envelope.error } : {}),
    assets: assets.map((m) => manifestSummary(box, out, m)),
    ...(failed.length ? { failed } : {}),
    ...(imgs.listed.length ? { notShown: imgs.listed } : {}),
  };
  return { content: [text(summary), ...imgs.blocks], ...(envelope.error ? { isError: true } : {}) };
}

interface Rendered {
  readonly name: string;
  readonly files: readonly string[];
  readonly warnings: readonly unknown[];
}

/** hero / blueprint / review / critique: paths + warnings, and the PNGs when `look`. */
async function rendered(box: Sandbox, argv: string[], look: boolean): Promise<ToolResult> {
  const { envelope } = await invoke(argv);
  const items = itemsOf(envelope.data);
  const done = items.filter((x): x is Rendered => !isFailed(x));
  const pngs = look ? done.flatMap((r) => r.files.filter((f) => f.endsWith('.png'))) : [];
  const imgs = await imageBlocks(pngs);
  const summary = {
    ok: envelope.ok,
    ...(envelope.error ? { error: envelope.error } : {}),
    assets: done.map((r) => ({
      asset: r.name,
      files: r.files.map((f) => shown(box, f)),
      warnings: r.warnings,
    })),
    ...(items.some(isFailed) ? { failed: items.filter(isFailed) } : {}),
    ...(imgs.listed.length ? { notShown: imgs.listed } : {}),
  };
  return { content: [text(summary), ...imgs.blocks], ...(envelope.error ? { isError: true } : {}) };
}

const DEFAULT_GLOBS = ['recipes/*/*.ts', 'assets/**/*.ts'];

async function listRecipes(box: Sandbox, args: ArgMap): Promise<ToolResult> {
  const globs = typeof args['glob'] === 'string' ? [args['glob']] : DEFAULT_GLOBS;
  const files = new Set<string>();
  for (const g of globs)
    for await (const f of new Bun.Glob(g).scan({ cwd: box.root, onlyFiles: true }))
      if (!f.endsWith('.test.ts') && !f.split('/').some((s) => s.startsWith('_')))
        files.add(confine(box, f, 'recipe', [box.root]));
  if (files.size === 0) return { content: [text({ recipes: [], globs })] };
  const { envelope } = await invoke(['list', ...[...files].sort()]);
  const items = itemsOf(envelope.data);
  const recipes = items
    .filter((x): x is { asset: string; file: string } => !isFailed(x))
    .map((x) => ({ asset: x.asset, file: shown(box, x.file) }));
  // Sibling modules (head.ts beside wolf.ts) export no asset: not recipes, not errors.
  const failed = items.filter(isFailed).filter((x) => x.error.code !== 'T3D_NO_ASSET_EXPORT');
  return { content: [text({ recipes, ...(failed.length ? { failed } : {}) })] };
}

const HERO_FLAGS = {
  az: '--az',
  el: '--el',
  size: '--size',
  variant: '--variant',
  quality: '--quality',
};

/** Run tool `name`; any coded error becomes an isError result (the caller handles the rest). */
export async function callTool(box: Sandbox, name: string, raw: unknown): Promise<ToolResult> {
  try {
    const args = checked(name, raw);
    if (name === 'build')
      return await built(
        box,
        argvOf(box, 'build', args, { sheetSize: '--sheet-size', lods: '--lods' }),
        false,
      );
    if (name === 'shot') return await built(box, argvOf(box, 'shot', args, {}), true);
    if (name === 'hero') return await rendered(box, argvOf(box, 'hero', args, HERO_FLAGS), true);
    if (name === 'blueprint') return await rendered(box, argvOf(box, 'blueprint', args, {}), true);
    if (name === 'review') return await rendered(box, argvOf(box, 'review', args, {}), true);
    if (name === 'critique') return await rendered(box, argvOf(box, 'critique', args, {}), false);
    if (name === 'list_recipes') return await listRecipes(box, args);
    return { content: [text({ explained: await explain(String(args['code'])) })] };
  } catch (e) {
    if (e instanceof Ts23dError) return failure(e.toJSON());
    throw e;
  }
}

/** True when `name` is a tool this server offers (unknown names are a protocol error). */
export const hasTool = (name: string): boolean => TOOLS.some((t) => t.name === name);
