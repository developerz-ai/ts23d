// `t3d blender review`: run a Blender step program with a `review` step added before its export
// and write what an artist would look at into --out: review-<step>-<view>.png sheets (clay, wire,
// weights, poses, turnaround), report.json (the t3d-blender-report/1) and review.md (which tile
// is what, what each step measured). Never cached, never part of a build: look, adjust the
// recipe's steps (`joint`, `weights`, `script`…), look again.
//   t3d blender review <recipe.ts> --out <dir>            the module's `BLENDER_REVIEW` export
//   t3d blender review --mesh <glb> --program <json> [--skeleton <json>] --out <dir>   any GLB
// Flags: --views clay,wire,weights,poses,turnaround · --size <px> · --pose bone:axis:degrees
// (repeatable) · --max-triangles <n> · --scripts <dir> (or T3D_BLENDER_SCRIPTS: examples/blender of
// a checkout, which npm does not ship) · --software-gpu (or T3D_BLENDER_SOFTWARE_GPU=1: render on
// lavapipe, off the GPU) · --json. A program that already has review steps runs as written. Needs
// Blender on this machine: without it T3D_NEURAL_FAILED names `t3d setup tools`. `t3d blender
// session` (blender-session-cmd.ts) keeps one Blender open for chained work.

import { mkdir } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { type NeuralInput, Ts23dError } from '../core/index.ts';
import {
  type BlenderStep,
  blenderAdapter,
  blenderProgram,
  findLavapipe,
  jsonInput,
  looksCrashed,
  type NeuralAdapter,
  nodeExec,
  REVIEW_CRASH_FIX,
  runJob,
  sha256Hex,
  softwareGpuExec,
} from '../neural/index.ts';
import { type ReviewedSheet, reviewMarkdown } from './blender-review-md.ts';
import { blenderSessionMain } from './blender-session-cmd.ts';
import { usage } from './flags.ts';
import { envelope, printError } from './report.ts';

type ReviewStep = Extract<BlenderStep, { op: 'review' }>;
type BlenderReviewView = NonNullable<ReviewStep['views']>[number];
type BlenderPose = NonNullable<ReviewStep['poses']>[number];

/** What a recipe module exports as `BLENDER_REVIEW` so its Blender program can be looked at. */
export interface BlenderReviewSpec {
  /** The GLB the program starts from: bytes, or a path relative to the recipe file. */
  readonly mesh: string | Uint8Array;
  readonly steps: readonly BlenderStep[];
  /** `t3d-skeleton/1` JSON bytes (`skeletonJson(armature)`), when a step binds to a skeleton. */
  readonly skeleton?: Uint8Array;
}

export interface BlenderReviewResult {
  readonly out: string;
  readonly files: readonly string[];
  readonly sheets: readonly ReviewedSheet[];
}

interface Options {
  recipe?: string;
  mesh?: string;
  program?: string;
  skeleton?: string;
  out: string;
  views?: BlenderReviewView[];
  size?: number;
  maxTriangles: number;
  poses: BlenderPose[];
  scripts?: string;
  softwareGpu: boolean;
}

const VIEWS: readonly BlenderReviewView[] = ['clay', 'wire', 'weights', 'poses', 'turnaround'];
const VALUED = [
  '--mesh',
  '--program',
  '--skeleton',
  '--out',
  '--views',
  '--size',
  '--pose',
  '--scripts',
];
const HOW =
  't3d blender review <recipe.ts> --out <dir>, or --mesh <glb> --program <json> --out <dir>; t3d blender session …';

function pose(v: string): BlenderPose {
  const [bone, axis, degrees] = v.split(':');
  if (!bone || (axis !== 'x' && axis !== 'y' && axis !== 'z') || !Number.isFinite(Number(degrees)))
    throw usage(`--pose "${v}" is not bone:axis:degrees`, 'e.g. --pose neck:x:-30');
  return { bone, axis, degrees: Number(degrees) };
}

function options(argv: readonly string[]): Options {
  if (argv[0] !== 'review') throw usage(`unknown blender command "${argv[0] ?? ''}"`, `run ${HOW}`);
  const scripts = process.env['T3D_BLENDER_SCRIPTS'];
  const o: Options = {
    out: 'review',
    maxTriangles: 10_000_000,
    poses: [],
    softwareGpu: process.env['T3D_BLENDER_SOFTWARE_GPU'] === '1',
    ...(scripts ? { scripts } : {}),
  };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i] ?? '';
    if (a === '--json') continue;
    if (a === '--software-gpu') {
      o.softwareGpu = true;
      continue;
    }
    if (!a.startsWith('-')) {
      o.recipe = a;
      continue;
    }
    const v = argv[++i];
    if (![...VALUED, '--max-triangles'].includes(a))
      throw usage(
        `unknown flag ${a} for t3d blender review`,
        `flags: ${VALUED.join(' ')} --software-gpu --json`,
      );
    if (v === undefined || v.startsWith('--')) throw usage(`${a} needs a value`, `run ${HOW}`);
    if (a === '--views') {
      const views = v.split(',');
      const bad = views.find((x) => !VIEWS.includes(x as BlenderReviewView));
      if (bad !== undefined) throw usage(`--views names "${bad}"`, `views: ${VIEWS.join(', ')}`);
      o.views = views as BlenderReviewView[];
    } else if (a === '--size' || a === '--max-triangles') {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1) throw usage(`${a} ${v} is not a count`, `pass ${a} 1024`);
      if (a === '--size') o.size = n;
      else o.maxTriangles = n;
    } else if (a === '--pose') o.poses.push(pose(v));
    else if (a === '--mesh') o.mesh = v;
    else if (a === '--program') o.program = v;
    else if (a === '--skeleton') o.skeleton = v;
    else if (a === '--scripts') o.scripts = v;
    else o.out = v;
  }
  if (o.recipe === undefined && (o.mesh === undefined || o.program === undefined))
    throw usage('t3d blender review needs a recipe, or --mesh and --program', `run ${HOW}`);
  return o;
}

const read = async (path: string, what: string): Promise<Uint8Array> => {
  const file = Bun.file(path);
  if (!(await file.exists())) throw usage(`${what} ${path} does not exist`, 'check the path');
  return new Uint8Array(await file.arrayBuffer());
};

/** The steps of a `--program` file: the canonical `t3d-blender-steps/1` JSON or a bare array. */
function stepsOf(bytes: Uint8Array, path: string): readonly BlenderStep[] {
  let doc: unknown;
  try {
    doc = JSON.parse(new TextDecoder().decode(bytes));
  } catch (e) {
    throw usage(`${path} is not JSON (${e instanceof Error ? e.message : String(e)})`, HOW);
  }
  const steps = Array.isArray(doc) ? doc : (doc as { steps?: unknown } | null)?.steps;
  if (!Array.isArray(steps))
    throw usage(`${path} holds no steps`, 'pass blenderProgram() bytes or a JSON array of steps');
  return steps as readonly BlenderStep[];
}

async function specOf(o: Options): Promise<BlenderReviewSpec> {
  if (o.recipe === undefined) {
    const program = await read(o.program ?? '', '--program');
    return {
      mesh: await read(o.mesh ?? '', '--mesh'),
      steps: stepsOf(program, o.program ?? ''),
      ...(o.skeleton ? { skeleton: await read(o.skeleton, '--skeleton') } : {}),
    };
  }
  const file = resolve(o.recipe);
  if (!(await Bun.file(file).exists())) throw usage(`recipe ${o.recipe} does not exist`, HOW);
  const mod = (await import(pathToFileURL(file).href)) as { BLENDER_REVIEW?: BlenderReviewSpec };
  const spec = mod.BLENDER_REVIEW;
  if (!spec || !Array.isArray(spec.steps) || spec.mesh === undefined)
    throw new Ts23dError('T3D_RECIPE_INVALID', {
      cause: `${o.recipe} exports no BLENDER_REVIEW = { mesh, steps, skeleton? }`,
      fix: 'export it from the recipe (mesh: a GLB path beside the recipe, steps: its Blender program), or pass --mesh and --program',
    });
  if (typeof spec.mesh !== 'string') return spec;
  const path = isAbsolute(spec.mesh) ? spec.mesh : join(dirname(file), spec.mesh);
  return { ...spec, mesh: await read(path, 'BLENDER_REVIEW.mesh') };
}

/** The program with a review step before its export, unless it already reviews. */
export function withReview(
  steps: readonly BlenderStep[],
  o: { views?: readonly BlenderReviewView[]; size?: number; poses?: readonly BlenderPose[] } = {},
): readonly BlenderStep[] {
  if (steps.some((s) => s.op === 'review') && !o.views) return steps;
  const bound = steps.some((s) => s.op === 'bind');
  const poses = o.poses ?? [];
  const views = o.views ?? [
    'clay',
    'wire',
    'turnaround',
    ...(bound ? (['weights'] as const) : []),
    ...(bound && poses.length ? (['poses'] as const) : []),
  ];
  const review: BlenderStep = {
    op: 'review',
    views,
    ...(o.size ? { size: o.size } : {}),
    ...(poses.length ? { poses } : {}),
  };
  const end = steps.at(-1)?.op === 'export' ? steps.length - 1 : steps.length;
  return [...steps.slice(0, end), review, ...steps.slice(end)];
}

/** The adapter a review runs on: this CLI's scripts directory and software-GPU choice. */
async function reviewAdapter(o: Options): Promise<NeuralAdapter> {
  return blenderAdapter({
    timeoutMs: 1_800_000,
    ...(o.scripts ? { scriptsDir: o.scripts } : {}),
    ...(o.softwareGpu ? { exec: softwareGpuExec(nodeExec, await findLavapipe()) } : {}),
  });
}

/** A crash during a review is usually the missing graphics driver: say so. */
function explainCrash(e: unknown): never {
  if (e instanceof Ts23dError && e.code === 'T3D_NEURAL_FAILED' && looksCrashed(e.message))
    throw new Ts23dError(e.code, { cause: e.message, fix: REVIEW_CRASH_FIX });
  throw e;
}

export async function blenderReview(
  argv: readonly string[],
  given?: NeuralAdapter,
): Promise<BlenderReviewResult> {
  const o = options(argv);
  const adapter = given ?? (await reviewAdapter(o));
  const spec = await specOf(o);
  const mesh = spec.mesh as Uint8Array;
  const program = blenderProgram(withReview(spec.steps, o));
  const named = (bytes: Uint8Array, mime: string): NeuralInput => ({
    sha256: sha256Hex(bytes),
    mime,
  });
  const inputs = new Map<string, Uint8Array>([
    [sha256Hex(mesh), mesh],
    [jsonInput(program).sha256, program],
  ]);
  if (spec.skeleton) inputs.set(sha256Hex(spec.skeleton), spec.skeleton);
  const run = await runJob(adapter, {
    task: 'blender',
    request: {
      seed: 1,
      mesh: named(mesh, 'model/gltf-binary'),
      program: jsonInput(program),
      ...(spec.skeleton ? { skeleton: jsonInput(spec.skeleton) } : {}),
      maxTriangles: o.maxTriangles,
    },
    inputs,
  }).catch(explainCrash);
  const [, reportOut, ...pngs] = run.result.outputs;
  const report = JSON.parse(new TextDecoder().decode(reportOut?.bytes ?? new Uint8Array())) as {
    review?: ReviewedSheet[];
    steps?: Record<string, unknown>[];
  };
  const sheets = report.review ?? [];
  if (sheets.length !== pngs.length || sheets.length === 0)
    throw new Ts23dError('T3D_NEURAL_OUTPUT_INVALID', {
      cause: `blender returned ${pngs.length} review PNG(s), its report names ${sheets.length}`,
      fix: 'update examples/blender (tasks/steps/review.py writes one PNG per view)',
    });
  await mkdir(o.out, { recursive: true });
  const files: string[] = [];
  for (const [i, sheet] of sheets.entries()) {
    files.push(join(o.out, sheet.file));
    await Bun.write(files[i] ?? '', pngs[i]?.bytes ?? new Uint8Array());
  }
  files.push(join(o.out, 'report.json'), join(o.out, 'review.md'));
  await Bun.write(files.at(-2) ?? '', reportOut?.bytes ?? new Uint8Array());
  await Bun.write(files.at(-1) ?? '', reviewMarkdown(sheets, report.steps ?? []));
  return { out: o.out, files, sheets };
}

export async function blenderMain(argv: readonly string[], json: boolean): Promise<number> {
  if (argv[0] === 'session') return blenderSessionMain(argv.slice(1), json);
  try {
    const r = await blenderReview(argv);
    if (json) envelope(true, r);
    else {
      console.log(`review → ${r.out} (READ the PNGs, then review.md)`);
      for (const f of r.files) console.log(`  ${f}`);
    }
    return 0;
  } catch (e) {
    if (e instanceof Ts23dError) return printError(e, json);
    throw e;
  }
}
