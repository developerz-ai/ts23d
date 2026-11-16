// CLI tool adapters with one input and one output file: `meshopt` through gltfpack
// (meshoptimizer, MIT) and `ktx2` through basisu (Basis Universal, Apache-2.0). Each probes the
// tool's version once (it enters the cache key and record.json: an encoder upgrade is a cache
// miss), writes the input into a temp dir, runs the tool with fixed flags and reads the output.
// Both tools are deterministic with these flags (same input + version → same bytes, checked on
// gltfpack 1.3 and basisu 2.50). Outputs are the user's ('own'). Godot: godot-adapter.ts.

import type { NeuralTask } from '../core/index.ts';
import {
  fieldsOf,
  inputsOf,
  type NeuralAdapter,
  type NeuralJob,
  type NeuralModelInfo,
  pickModel,
  taskResult,
} from './adapter.ts';
import {
  nodeExec,
  probeVersion,
  readOutput,
  runTool,
  type ToolExec,
  toolModel,
  withWorkdir,
  writeBytes,
} from './tool-spawn.ts';
import { DEFAULT_MAX_BYTES, failed } from './wire.ts';

export interface ToolAdapterOptions {
  /** The executable; default its name on PATH. */
  readonly exe?: string;
  /** One job, ms. Default 300 000. */
  readonly timeoutMs?: number;
  /** Largest output file, bytes. Default 64 MB. */
  readonly maxBytes?: number;
  readonly exec?: ToolExec;
}

interface FileTool {
  readonly name: string;
  readonly task: NeuralTask;
  readonly licence: string;
  readonly versionArgs: readonly string[];
  readonly versionRe: RegExp;
  readonly inExt: string;
  readonly outExt: string;
  readonly mime: string;
  /** Tool arguments for one job (input and output are relative file names). */
  args(request: Readonly<Record<string, unknown>>, input: string, output: string): string[];
}

function fileToolAdapter(t: FileTool, o: ToolAdapterOptions): NeuralAdapter {
  const exe = o.exe ?? t.name;
  const exec = o.exec ?? nodeExec;
  const timeoutMs = o.timeoutMs ?? 300_000;
  const maxBytes = o.maxBytes ?? DEFAULT_MAX_BYTES;
  const base = { tool: t.name, exe, exec, maxBytes: 1 << 20 };
  let listed: Promise<readonly NeuralModelInfo[]> | undefined;
  const models = (): Promise<readonly NeuralModelInfo[]> => {
    listed ??= probeVersion({ ...base, args: t.versionArgs, timeoutMs: 60_000 }, t.versionRe).then(
      (version) => [toolModel(t.name, t.task, { name: t.name, version, licence: t.licence })],
    );
    listed.catch(() => {
      listed = undefined;
    });
    return listed;
  };
  return {
    id: t.name,
    tasks: [t.task],
    models,
    async run<T extends NeuralTask>(job: NeuralJob<T>) {
      const model = pickModel(t.name, await models(), job.task, job.model);
      const [input] = inputsOf(job.task, job.request);
      const bytes = input ? job.inputs?.get(input.sha256) : undefined;
      if (!bytes) return failed(`${t.name}: the job sent no input bytes`, 'pass job.inputs');
      return withWorkdir(async (dir) => {
        const inName = `in.${t.inExt}`;
        const outName = `out.${t.outExt}`;
        await writeBytes(`${dir}/${inName}`, bytes);
        const args = t.args(fieldsOf(job.request), inName, outName);
        await runTool({ ...base, args, cwd: dir, timeoutMs });
        const out = await readOutput(`${dir}/${outName}`, maxBytes, t.name);
        return {
          result: taskResult(job.task, [{ bytes: out, mime: t.mime }]),
          model,
          server: `${t.name} ${model.tool?.version ?? ''}`.trim(),
        };
      });
    },
  };
}

/** gltfpack flags for a meshopt request; exported for tests. */
export function gltfpackArgs(r: Readonly<Record<string, unknown>>, i: string, o: string): string[] {
  const ratio = r['simplify'] === undefined ? 1 : Number(r['simplify']);
  if (!(ratio > 0 && ratio <= 1))
    failed(`meshopt simplify ${String(r['simplify'])} is outside (0, 1]`, 'pass 0 < simplify ≤ 1');
  // -kn/-km/-ke: keep named pivots, materials and extras (ts23d's engine contract); -ac keeps
  // constant clips (a `rest` pose would vanish) and -af 0 keeps baked keys instead of resampling.
  return [
    '-i',
    i,
    '-o',
    o,
    '-kn',
    '-km',
    '-ke',
    '-ac',
    '-af',
    '0',
    ...(r['compress'] === true ? ['-c'] : ['-noq']),
    ...(ratio < 1 ? ['-si', String(ratio)] : []),
  ];
}

/** basisu flags for a ktx2 request; exported for tests. */
export function basisuArgs(r: Readonly<Record<string, unknown>>, i: string, o: string): string[] {
  const mode = r['mode'];
  if (mode !== 'uastc' && mode !== 'etc1s')
    failed(`ktx2 mode '${String(mode)}' is unknown`, "pass mode: 'uastc' or 'etc1s'");
  return [
    '-ktx2',
    mode === 'uastc' ? '-uastc' : '-etc1s',
    ...(r['mipmaps'] === false ? [] : ['-mipmap']),
    r['srgb'] === false ? '-linear' : '-srgb',
    '-file',
    i,
    '-output_file',
    o,
  ];
}

/** `meshopt` via gltfpack (meshoptimizer): `-c` = EXT_meshopt_compression + quantization. */
export const gltfpackAdapter = (o: ToolAdapterOptions = {}): NeuralAdapter =>
  fileToolAdapter(
    {
      name: 'gltfpack',
      task: 'meshopt',
      licence: 'MIT',
      versionArgs: ['-v'],
      versionRe: /gltfpack (\d+\.\d+(?:\.\d+)?)/,
      inExt: 'glb',
      outExt: 'glb',
      mime: 'model/gltf-binary',
      args: gltfpackArgs,
    },
    o,
  );

/** `ktx2` via basisu (Basis Universal): UASTC LDR 4x4 or ETC1S, mipmapped, sRGB or linear. */
export const basisuAdapter = (o: ToolAdapterOptions = {}): NeuralAdapter =>
  fileToolAdapter(
    {
      name: 'basisu',
      task: 'ktx2',
      licence: 'Apache-2.0',
      versionArgs: ['-version'],
      versionRe: /Basis Universal[^\n]*?v(\d+\.\d+(?:\.\d+)?)/,
      inExt: 'png',
      outExt: 'ktx2',
      mime: 'image/ktx2',
      args: basisuArgs,
    },
    o,
  );
