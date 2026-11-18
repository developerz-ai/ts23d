// `t3d blender session`: one open Blender for chained work on a mesh, instead of a relaunch per look.
//   start --mesh <glb> [--skeleton <json>] [--name n] [--idle <minutes>] [--undo <n>] [--threads n]
//         [--software-gpu] [--blender <exe>] [--scripts <dir>]
//   run <batch.json> [--timeout <seconds>]     steps as a JSON array, or { steps: [...] }
//   undo · status · stop
//   finish --out <program.json> [--albedo-size px] [--normal-size px] [--orm-size px]
// Every command takes --name and --json. Environment (read here only): T3D_BLENDER_SCRIPTS (the
// scripts directory), T3D_BLENDER_SOFTWARE_GPU=1, T3D_BLENDER_SESSIONS (where sessions live).

import { formatCount, Ts23dError } from '../core/index.ts';
import {
  type BlenderStep,
  blenderSessionStatus,
  finishBlenderSession,
  runBlenderBatch,
  startBlenderSession,
  stopBlenderSession,
  undoBlenderBatch,
} from '../neural/index.ts';
import { usage } from './flags.ts';
import { envelope, printError } from './report.ts';

const HOW =
  't3d blender session start --mesh <glb> · run <batch.json> · undo · status · finish --out <program.json> · stop';
const COMMANDS = ['start', 'run', 'undo', 'status', 'finish', 'stop'];
const VALUED: Readonly<Record<string, readonly string[]>> = {
  start: ['--mesh', '--skeleton', '--idle', '--undo', '--threads', '--blender', '--scripts'],
  run: ['--timeout'],
  undo: [],
  status: [],
  finish: ['--out', '--albedo-size', '--normal-size', '--orm-size'],
  stop: [],
};

interface Parsed {
  readonly command: string;
  readonly flags: Map<string, string>;
  readonly software: boolean;
  readonly file?: string;
}

function parse(argv: readonly string[]): Parsed {
  const command = argv[0] ?? '';
  if (!COMMANDS.includes(command)) throw usage(`unknown session command "${command}"`, HOW);
  const allowed = ['--name', ...(VALUED[command] ?? [])];
  const flags = new Map<string, string>();
  let software = false;
  let file: string | undefined;
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i] ?? '';
    if (a === '--json') continue;
    if (a === '--software-gpu' && command === 'start') {
      software = true;
      continue;
    }
    if (!a.startsWith('-')) {
      if (command !== 'run' || file !== undefined) throw usage(`unexpected argument "${a}"`, HOW);
      file = a;
      continue;
    }
    if (!allowed.includes(a))
      throw usage(`unknown flag ${a} for session ${command}`, `flags: ${allowed.join(' ')} --json`);
    const v = argv[++i];
    if (v === undefined || v.startsWith('--')) throw usage(`${a} needs a value`, HOW);
    flags.set(a, v);
  }
  return { command, flags, software, ...(file === undefined ? {} : { file }) };
}

function count(p: Parsed, flag: string, min = 1): number | undefined {
  const v = p.flags.get(flag);
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min) throw usage(`${flag} ${v} is not a number >= ${min}`, HOW);
  return n;
}

function whole(p: Parsed, flag: string, min = 1): number | undefined {
  const n = count(p, flag, min);
  if (n !== undefined && !Number.isInteger(n)) throw usage(`${flag} ${n} is not whole`, HOW);
  return n;
}

async function batchSteps(path: string): Promise<readonly BlenderStep[]> {
  const file = Bun.file(path);
  if (!(await file.exists())) throw usage(`batch ${path} does not exist`, HOW);
  let doc: unknown;
  try {
    doc = JSON.parse(await file.text());
  } catch (e) {
    throw usage(`${path} is not JSON (${e instanceof Error ? e.message : String(e)})`, HOW);
  }
  const steps = Array.isArray(doc) ? doc : (doc as { steps?: unknown } | null)?.steps;
  if (!Array.isArray(steps)) throw usage(`${path} holds no steps`, 'pass a JSON array of steps');
  return steps as readonly BlenderStep[];
}

const required = (p: Parsed, flag: string): string => {
  const v = p.flags.get(flag);
  if (v === undefined) throw usage(`session ${p.command} needs ${flag}`, HOW);
  return v;
};

export async function blenderSession(argv: readonly string[]): Promise<Record<string, unknown>> {
  const p = parse(argv);
  const name = p.flags.get('--name');
  const root = process.env['T3D_BLENDER_SESSIONS'];
  const at = { ...(name ? { name } : {}), ...(root ? { root } : {}) };
  if (p.command === 'start') {
    const scripts = p.flags.get('--scripts') ?? process.env['T3D_BLENDER_SCRIPTS'];
    const idle = count(p, '--idle', 0.01);
    const undo = whole(p, '--undo', 0);
    const threads = whole(p, '--threads', 0);
    const skeleton = p.flags.get('--skeleton');
    const exe = p.flags.get('--blender');
    return startBlenderSession({
      ...at,
      mesh: required(p, '--mesh'),
      ...(skeleton ? { skeleton } : {}),
      ...(exe ? { exe } : {}),
      ...(scripts ? { scriptsDir: scripts } : {}),
      ...(idle === undefined ? {} : { idleSeconds: idle * 60 }),
      ...(undo === undefined ? {} : { undoDepth: undo }),
      ...(threads === undefined ? {} : { threads }),
      softwareGpu: p.software || process.env['T3D_BLENDER_SOFTWARE_GPU'] === '1',
    });
  }
  if (p.command === 'run') {
    if (p.file === undefined) throw usage('session run needs a batch file', HOW);
    const timeout = count(p, '--timeout');
    return runBlenderBatch(
      { ...at, ...(timeout === undefined ? {} : { timeoutMs: timeout * 1000 }) },
      await batchSteps(p.file),
    );
  }
  if (p.command === 'undo') return undoBlenderBatch(at);
  if (p.command === 'status') return blenderSessionStatus(at);
  if (p.command === 'stop') return stopBlenderSession(at);
  const albedoSize = whole(p, '--albedo-size', 16);
  const normalSize = whole(p, '--normal-size', 16);
  const ormSize = whole(p, '--orm-size', 16);
  return finishBlenderSession({
    ...at,
    out: required(p, '--out'),
    export: {
      ...(albedoSize ? { albedoSize } : {}),
      ...(normalSize ? { normalSize } : {}),
      ...(ormSize ? { ormSize } : {}),
    },
  });
}

function human(command: string, r: Record<string, unknown>): void {
  const kept = Array.isArray(r['kept']) ? (r['kept'] as string[]).join(' → ') : '';
  if (command === 'start')
    console.log(
      `session '${String(r['name'])}' ready (pid ${String(r['pid'])}) in ${String(r['dir'])}`,
    );
  else if (command === 'run') {
    for (const s of r['steps'] as Record<string, unknown>[])
      console.log(
        `  ${String(s['op'])}: ${String(s['seconds'])} s, ${formatCount(Number(s['triangles']))} triangles`,
      );
    for (const s of (r['reviews'] ?? []) as Record<string, unknown>[])
      console.log(`  READ ${String(s['file'])}`);
    console.log(`batch ${String(r['batch'])} ok in ${String(r['seconds'])} s · kept: ${kept}`);
  } else if (command === 'finish') {
    console.log(`program → ${String(r['out'])} (${(r['steps'] as string[]).join(' → ')})`);
    console.log(String(r['note']));
  } else if (command === 'stop') console.log(`session ${String(r['stopped'])}`);
  else console.log(JSON.stringify(r, null, 2));
}

export async function blenderSessionMain(argv: readonly string[], json: boolean): Promise<number> {
  try {
    const r = await blenderSession(argv);
    if (json) envelope(true, r);
    else human(argv[0] ?? '', r);
    return 0;
  } catch (e) {
    if (e instanceof Ts23dError) return printError(e, json);
    throw e;
  }
}
