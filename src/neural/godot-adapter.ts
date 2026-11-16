// godotAdapter: the `engine-check` task — does a GLB survive a real game engine's importer? Godot
// (MIT) runs headless twice in a throwaway project: `--import` (the editor's scene importer, which
// turns `-colonly` / `-convcolonly` nodes into collision shapes), then CHECK_GD loads the imported
// scene, counts meshes, skeletons, bones, collision shapes and bodies, plays every animation half
// way, and writes a JSON report. Importer ERROR / WARNING lines are added with the temp path
// masked, so the report is a function of GLB + Godot version. Advisory: the report is cached like
// any neural output; nothing gates on it here.

import type { NeuralTask } from '../core/index.ts';
import {
  inputsOf,
  type NeuralAdapter,
  type NeuralJob,
  type NeuralModelInfo,
  pickModel,
  taskResult,
} from './adapter.ts';
import { sha256Hex } from './sha256.ts';
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
import { failed } from './wire.ts';

export const GODOT_PROJECT =
  'config_version=5\n\n[application]\n\nconfig/name="t3d-engine-check"\n';

/** The check script (GDScript, runs as the main loop). */
export const CHECK_GD = `extends SceneTree

var counts = {"meshes": 0, "skeletons": 0, "bones": 0, "collisionShapes": 0, "bodies": 0}
var players = []

func walk(n):
\tif n is MeshInstance3D: counts.meshes += 1
\tif n is Skeleton3D:
\t\tcounts.skeletons += 1
\t\tcounts.bones += n.get_bone_count()
\tif n is CollisionShape3D: counts.collisionShapes += 1
\tif n is CollisionObject3D: counts.bodies += 1
\tif n is AnimationPlayer: players.append(n)
\tfor c in n.get_children(): walk(c)

func _initialize():
\tvar out = OS.get_cmdline_user_args()[0]
\tvar report = {"engine": "godot", "version": Engine.get_version_info().string, "ok": false}
\tvar scene = load("res://asset.glb")
\tif scene == null:
\t\treport["error"] = "res://asset.glb did not import"
\telse:
\t\tvar root = scene.instantiate()
\t\tget_root().add_child(root)
\t\twalk(root)
\t\tvar clips = []
\t\tfor p in players:
\t\t\tfor name in p.get_animation_list():
\t\t\t\tvar a = p.get_animation(name)
\t\t\t\tp.play(name)
\t\t\t\tp.advance(a.length * 0.5)
\t\t\t\tclips.append({"name": String(name), "length": snappedf(a.length, 0.0001), "tracks": a.get_track_count(), "played": p.is_playing()})
\t\treport.merge(counts)
\t\treport["animations"] = clips
\t\treport["ok"] = counts.meshes > 0
\tvar f = FileAccess.open(out, FileAccess.WRITE)
\tf.store_string(JSON.stringify(report, "  ", true))
\tf.close()
\tquit(0)
`;

export interface GodotAdapterOptions {
  /** Godot 4.2+ editor binary; default `godot` on PATH. */
  readonly exe?: string;
  /** Each of the two runs, ms. Default 300 000. */
  readonly timeoutMs?: number;
  readonly maxBytes?: number;
  readonly exec?: ToolExec;
}

/** Importer ERROR / WARNING lines, temp path masked, de-duplicated, sorted. */
export function importerLines(
  text: string,
  work: string,
): { errors: string[]; warnings: string[] } {
  const lines = text.split('\n').map((l) => l.split(work).join('<work>').trim());
  const pick = (p: string): string[] =>
    [...new Set(lines.filter((l) => l.startsWith(p)).map((l) => l.slice(p.length).trim()))].sort();
  return { errors: pick('ERROR:'), warnings: pick('WARNING:') };
}

export function godotAdapter(o: GodotAdapterOptions = {}): NeuralAdapter {
  const exe = o.exe ?? 'godot';
  const exec = o.exec ?? nodeExec;
  const timeoutMs = o.timeoutMs ?? 300_000;
  const base = { tool: 'godot', exe, exec, maxBytes: 1 << 20 };
  const script = sha256Hex(new TextEncoder().encode(GODOT_PROJECT + CHECK_GD));
  let listed: Promise<readonly NeuralModelInfo[]> | undefined;
  const models = (): Promise<readonly NeuralModelInfo[]> => {
    listed ??= probeVersion(
      { ...base, args: ['--headless', '--version'], timeoutMs: 60_000 },
      /^(\d+\.\d+(?:\.\d+)?\.[\w.]+)/m,
    ).then((version) => {
      const [major = 0, minor = 0] = version.split('.').map(Number);
      if (major < 4 || (major === 4 && minor < 2))
        failed(`Godot ${version} has no --import`, 'use Godot 4.2 or newer (t3d setup tools)');
      return [
        toolModel('godot', 'engine-check', {
          name: 'godot',
          version,
          licence: 'MIT',
          scriptSha256: script,
        }),
      ];
    });
    listed.catch(() => {
      listed = undefined;
    });
    return listed;
  };
  return {
    id: 'godot',
    tasks: ['engine-check'],
    models,
    async run<T extends NeuralTask>(job: NeuralJob<T>) {
      const model = pickModel('godot', await models(), job.task, job.model);
      const [input] = inputsOf(job.task, job.request);
      const bytes = input ? job.inputs?.get(input.sha256) : undefined;
      if (!bytes) return failed('godot: the job sent no GLB bytes', 'pass job.inputs');
      return withWorkdir(async (dir) => {
        await writeBytes(`${dir}/project.godot`, GODOT_PROJECT);
        await writeBytes(`${dir}/t3d_check.gd`, CHECK_GD);
        await writeBytes(`${dir}/asset.glb`, bytes);
        const imported = await runTool({
          ...base,
          args: ['--headless', '--path', dir, '--import'],
          cwd: dir,
          timeoutMs,
        });
        await runTool({
          ...base,
          args: [
            '--headless',
            '--path',
            dir,
            '--script',
            'res://t3d_check.gd',
            '--',
            `${dir}/report.json`,
          ],
          cwd: dir,
          timeoutMs,
        });
        const raw = await readOutput(`${dir}/report.json`, o.maxBytes ?? 1 << 20, 'godot');
        const report = JSON.parse(new TextDecoder().decode(raw)) as Record<string, unknown>;
        const lines = importerLines(`${imported.stdout}\n${imported.stderr}`, dir);
        const full = { ...report, importErrors: lines.errors, importWarnings: lines.warnings };
        const sorted = Object.fromEntries(
          Object.entries(full).sort(([a], [b]) => (a < b ? -1 : 1)),
        );
        const json = `${JSON.stringify(sorted, null, 2)}\n`;
        return {
          result: taskResult(job.task, [
            { bytes: new TextEncoder().encode(json), mime: 'application/json' },
          ]),
          model,
          server: `godot ${model.tool?.version ?? ''}`.trim(),
        };
      });
    },
  };
}
