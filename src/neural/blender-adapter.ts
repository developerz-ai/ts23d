// blenderAdapter: Blender's data-level tools as tool tasks — `cloth` (cloth sim drape), `rig`
// (Rigify meta-rig → rig on a humanoid armature), `fracture` (Voronoi cells + rigid-body settle),
// `groom` (guide curves on a scalp → child hair curves styled by an op list → lock cards).
// Not sculpt brushes: headless strokes are unreliable without a viewport; SDF strokes and VDM
// stamps are ts23d's brushes. Two ways to run the same GPL scripts in examples/blender/:
//   mode 'blender' (default): a user's Blender app,
//     blender -b --factory-startup -noaudio -t 1 --python-exit-code 3 --python ts23d_job.py -- job.json
//   mode 'bpy': a Python that has `pip install bpy` (Blender as a module), python -I ts23d_job.py …
// The job dir holds the inputs by sha256, job.json and the report.json the script writes last
// (`{ ok, blender, outputs: [{ file, mime }], error? }`). Supported Blender lines are the LTS ones
// (4.5, 5.2); version + script sha256 enter the cache key and the record (ADR 014), so an upgrade
// is a cache miss, never a silent change. The library never imports the scripts: it spawns them.

import type { NeuralOutput, NeuralTask } from '../core/index.ts';
import {
  fieldsOf,
  inputsOf,
  type NeuralAdapter,
  type NeuralModelInfo,
  pickModel,
  taskResult,
} from './adapter.ts';
import {
  checkProc,
  filesSha256,
  nodeExec,
  probeVersion,
  readOutput,
  type ToolExec,
  toolModel,
  withWorkdir,
  writeBytes,
} from './tool-spawn.ts';
import { DEFAULT_MAX_BYTES, failed } from './wire.ts';

export const BLENDER_TASKS = [
  'cloth',
  'rig',
  'fracture',
  'groom',
] as const satisfies readonly NeuralTask[];
/** Blender LTS lines the scripts are tested on. */
export const BLENDER_LTS = ['4.5', '5.2'] as const;
/** Blender's licence; scripts calling bpy are published GPL-compatible (examples/blender). */
export const BLENDER_LICENCE = 'GPL-2.0-or-later';

export interface BlenderAdapterOptions {
  /** Blender executable (mode 'blender') or a Python with bpy installed (mode 'bpy'). */
  readonly exe?: string;
  readonly mode?: 'blender' | 'bpy';
  /** Directory holding ts23d_job.py and tasks/; default: this package's examples/blender. */
  readonly scriptsDir?: string;
  /** Accept these major.minor lines too (recorded like any other). */
  readonly allowVersions?: readonly string[];
  /** One job, ms. Default 600 000. */
  readonly timeoutMs?: number;
  /** Largest output file, bytes. Default 64 MB. */
  readonly maxBytes?: number;
  readonly exec?: ToolExec;
}

const EXT: Readonly<Record<string, string>> = {
  'model/gltf-binary': 'glb',
  'image/png': 'png',
  'application/json': 'json',
};

/** Arguments that run the dispatcher `entry` on `jobJson` (also used by scripts/vdm-from-blender). */
export function blenderJobArgs(mode: 'blender' | 'bpy', entry: string, jobJson: string): string[] {
  if (mode === 'bpy') return ['-I', entry, '--', jobJson];
  return [
    '-b',
    '--factory-startup',
    '-noaudio',
    '-t',
    '1',
    '--python-exit-code',
    '3',
    '--python',
    entry,
    '--',
    jobJson,
  ];
}

/** examples/blender of this package (ts23d_job.py + tasks/). */
export async function defaultScripts(): Promise<string> {
  const { fileURLToPath } = await import('node:url');
  return fileURLToPath(new URL('../../examples/blender/', import.meta.url));
}

interface Report {
  readonly ok?: unknown;
  readonly error?: unknown;
  readonly outputs?: unknown;
}

export function blenderAdapter(o: BlenderAdapterOptions = {}): NeuralAdapter {
  const mode = o.mode ?? 'blender';
  const exe = o.exe ?? (mode === 'bpy' ? 'python3' : 'blender');
  const exec = o.exec ?? nodeExec;
  const timeoutMs = o.timeoutMs ?? 600_000;
  const maxBytes = o.maxBytes ?? DEFAULT_MAX_BYTES;
  const lines = [...BLENDER_LTS, ...(o.allowVersions ?? [])];
  const id = `blender:${mode}`;
  const call = (args: readonly string[], cwd?: string, ms = timeoutMs) => ({
    tool: 'blender',
    exe,
    args,
    exec,
    timeoutMs: ms,
    maxBytes: 1 << 20,
    ...(cwd ? { cwd } : {}),
  });
  const scripts = async (): Promise<string> =>
    (o.scriptsDir ?? (await defaultScripts())).replace(/\/+$/, '');
  const scriptsOf = (dir: string, task: string): string[] => [
    `${dir}/ts23d_job.py`,
    `${dir}/tasks/common.py`,
    `${dir}/tasks/${task}.py`,
  ];

  let listed: Promise<readonly NeuralModelInfo[]> | undefined;
  const models = (): Promise<readonly NeuralModelInfo[]> => {
    listed ??= (async () => {
      const args =
        mode === 'bpy'
          ? ['-I', '-c', "import bpy; print('Blender', bpy.app.version_string)"]
          : ['--factory-startup', '-noaudio', '--version'];
      const version = await probeVersion(
        call(args, undefined, 120_000),
        /Blender (\d+\.\d+\.\d+[^\n]*)/,
      );
      const line = /^\d+\.\d+/.exec(version)?.[0] ?? '';
      if (!lines.includes(line))
        failed(
          `Blender ${version} is not a supported line (${lines.join(', ')})`,
          `install Blender ${BLENDER_LTS.at(-1)} LTS (or pip install bpy==${BLENDER_LTS.at(-1)}.*), or pass allowVersions: ['${line}']`,
        );
      const dir = await scripts();
      const out: NeuralModelInfo[] = [];
      for (const task of BLENDER_TASKS)
        out.push(
          toolModel(`blender-${task}`, task, {
            name: 'blender',
            version,
            licence: BLENDER_LICENCE,
            scriptSha256: await filesSha256(scriptsOf(dir, task), 'blender'),
          }),
        );
      return out;
    })();
    listed.catch(() => {
      listed = undefined;
    });
    return listed;
  };

  return {
    id,
    tasks: BLENDER_TASKS,
    models,
    async run(job) {
      const model = pickModel(id, await models(), job.task, job.model);
      const dir = await scripts();
      return withWorkdir(async (work) => {
        const files: Record<string, string> = {};
        for (const i of inputsOf(job.task, job.request)) {
          const bytes = job.inputs?.get(i.sha256);
          if (!bytes) continue;
          const name = `in-${i.sha256.slice(0, 16)}.${EXT[i.mime] ?? 'bin'}`;
          await writeBytes(`${work}/${name}`, bytes);
          files[i.sha256] = name;
        }
        const spec = {
          contract: 't3d-blender/1',
          task: job.task,
          request: fieldsOf(job.request),
          inputs: files,
        };
        await writeBytes(`${work}/job.json`, JSON.stringify(spec));
        const entry = `${dir}/ts23d_job.py`;
        const args = blenderJobArgs(mode, entry, `${work}/job.json`);
        const c = call(args, work);
        const proc = await exec(exe, args, c);
        const report = proc.missing ? undefined : await readReport(work);
        // A report that says why beats an exit code; no report at all is a failure too.
        checkProc(
          c,
          proc,
          report === undefined
            ? proc.code === 0
              ? `blender ${job.task} wrote no report.json`
              : undefined
            : report.ok === true
              ? undefined
              : `blender ${job.task}: ${String(report.error ?? 'report says not ok')}`,
        );
        const outputs: NeuralOutput[] = [];
        const list = Array.isArray(report?.outputs)
          ? (report?.outputs as { file?: unknown; mime?: unknown }[])
          : [];
        for (const x of list) {
          const file = String(x?.file ?? '');
          if (!/^[\w.-]+$/.test(file))
            failed(
              `blender report names output '${file}'`,
              'write outputs into the job directory by bare name',
            );
          outputs.push({
            bytes: await readOutput(`${work}/${file}`, maxBytes, 'blender'),
            mime: String(x?.mime ?? ''),
          });
        }
        return {
          result: taskResult(job.task, outputs),
          model,
          server: `blender ${model.tool?.version ?? ''}`.trim(),
        };
      });
    },
  };
}

async function readReport(work: string): Promise<Report | undefined> {
  const { readFile } = await import('node:fs/promises');
  const text = await readFile(`${work}/report.json`, 'utf8').catch(() => undefined);
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text) as Report;
  } catch {
    return { ok: false, error: 'report.json is not JSON' };
  }
}
