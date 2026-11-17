// `t3d blender review` against a stub adapter: never the real Blender.
import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodePng, MeshBuilder, type NeuralTask } from '../core/index.ts';
import {
  blenderProgram,
  type NeuralAdapter,
  type NeuralJob,
  writeMeshGlb,
} from '../neural/index.ts';
import { blenderReview, withReview } from './blender-review-cmd.ts';
import { run } from './run.ts';

const corner = (x: number, y: number) => ({
  p: [x, y, 0] as const,
  n: [0, 0, 1] as const,
  uv: [x, y] as const,
  color: [0.8, 0.5, 0.3] as const,
});
const b = new MeshBuilder();
b.tri(b.vertex(corner(0, 0)), b.vertex(corner(1, 0)), b.vertex(corner(0, 1)));
const glb = writeMeshGlb([{ name: 'lod0', mesh: b.build() }]);
const png = encodePng(2, 2, new Uint8Array(16).fill(255));
const text = (v: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(v));

let dirs: string[] = [];
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), 't3d-blender-review-'));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

/** Answers like tasks/blender.py: GLB, report naming one sheet per view of each review step. */
function stub(seen: { steps?: Record<string, unknown>[] } = {}, drop = 0): NeuralAdapter {
  return {
    id: 'stub',
    tasks: ['blender'],
    models: async () => [],
    run: async <T extends NeuralTask>(job: NeuralJob<T>) => {
      const request = job.request as { program: { sha256: string } };
      const program = JSON.parse(
        new TextDecoder().decode(job.inputs?.get(request.program.sha256)),
      ) as { steps: Record<string, unknown>[] };
      seen.steps = program.steps;
      const review = program.steps.flatMap((s, i) =>
        s['op'] === 'review'
          ? (s['views'] as string[]).map((view) => ({
              step: i,
              view,
              file: `review-${i}-${view}.png`,
              size: [2, 2],
              tiles: ['front', 'side'],
            }))
          : [],
      );
      const steps = program.steps.map((s) => ({ op: s['op'], seconds: 0.1, triangles: 1 }));
      const outputs = [
        { bytes: glb, mime: 'model/gltf-binary' },
        { bytes: text({ steps, review }), mime: 'application/json' },
        ...review.slice(drop).map(() => ({ bytes: png, mime: 'image/png' })),
      ];
      return {
        result: { outputs },
        model: { id: 'stub', task: job.task },
        server: 'stub',
      } as never;
    },
  };
}

const files = (): { dir: string; mesh: string; program: string } => {
  const dir = tmp();
  writeFileSync(join(dir, 'in.glb'), glb);
  writeFileSync(
    join(dir, 'program.json'),
    blenderProgram([{ op: 'retopo', triangles: 900 }, { op: 'bind' }, { op: 'export' }]),
  );
  return { dir, mesh: join(dir, 'in.glb'), program: join(dir, 'program.json') };
};

describe('t3d blender review: failures first', () => {
  test('usage: no program, unknown flag, bad pose, bad view, missing file', async () => {
    const f = files();
    const fails = (argv: string[], re: RegExp) =>
      expect(blenderReview(argv, stub())).rejects.toThrow(re);
    await fails(['review'], /needs a recipe, or --mesh and --program/);
    await fails(['bake'], /unknown blender command "bake"/);
    await fails(['review', '--mesh', f.mesh], /needs a recipe, or --mesh and --program/);
    await fails(
      ['review', '--mesh', f.mesh, '--program', f.program, '--fast', '1'],
      /unknown flag/,
    );
    await fails(['review', '--mesh', f.mesh, '--program', f.program, '--pose', 'neck'], /--pose/);
    await fails(['review', '--mesh', f.mesh, '--program', f.program, '--views', 'xray'], /"xray"/);
    await fails(
      ['review', '--mesh', join(f.dir, 'no.glb'), '--program', f.program],
      /does not exist/,
    );
    expect(await run(['blender', 'review'])).toBe(2);
  });

  test('a recipe without BLENDER_REVIEW and a report that names more sheets than it sent', async () => {
    const f = files();
    writeFileSync(join(f.dir, 'plain.ts'), 'export const x = 1;\n');
    await expect(blenderReview(['review', join(f.dir, 'plain.ts')], stub())).rejects.toThrow(
      /T3D_RECIPE_INVALID.*exports no BLENDER_REVIEW/s,
    );
    await expect(
      blenderReview(['review', '--mesh', f.mesh, '--program', f.program], stub({}, 1)),
    ).rejects.toThrow(/T3D_NEURAL_OUTPUT_INVALID/);
  });
});

describe('t3d blender review', () => {
  test('--mesh/--program: a review step goes in before export; sheets, report and legend land in --out', async () => {
    const f = files();
    const seen: { steps?: Record<string, unknown>[] } = {};
    const out = join(f.dir, 'out');
    const r = await blenderReview(
      [
        'review',
        '--mesh',
        f.mesh,
        '--program',
        f.program,
        '--out',
        out,
        '--pose',
        'neck:x:-30',
        '--size',
        '512',
      ],
      stub(seen),
    );
    expect(seen.steps?.map((s) => s['op'])).toEqual(['retopo', 'bind', 'review', 'export']);
    expect(seen.steps?.[2]).toMatchObject({
      views: ['clay', 'wire', 'turnaround', 'weights', 'poses'],
      size: 512,
      poses: [{ bone: 'neck', axis: 'x', degrees: -30 }],
    });
    expect(r.sheets.map((s) => s.view)).toEqual(['clay', 'wire', 'turnaround', 'weights', 'poses']);
    for (const file of r.files) expect(existsSync(file)).toBe(true);
    expect(readFileSync(join(out, 'review-2-clay.png'))).toEqual(Buffer.from(png));
    const legend = readFileSync(join(out, 'review.md'), 'utf8');
    expect(legend).toContain('## review-2-weights.png (weights, after step 1, 2×2 px)');
    expect(legend).toContain('| 1 | bind |');
  });

  test('a recipe exports BLENDER_REVIEW with a mesh path beside it; its own review steps are kept', async () => {
    const f = files();
    writeFileSync(
      join(f.dir, 'wolf.ts'),
      "export const BLENDER_REVIEW = { mesh: 'in.glb', steps: [{ op: 'retopo', triangles: 900 }, { op: 'review', views: ['wire'] }, { op: 'export' }] };\n",
    );
    const seen: { steps?: Record<string, unknown>[] } = {};
    const r = await blenderReview(
      ['review', join(f.dir, 'wolf.ts'), '--out', join(f.dir, 'o')],
      stub(seen),
    );
    expect(seen.steps?.map((s) => s['op'])).toEqual(['retopo', 'review', 'export']);
    expect(r.sheets.map((s) => s.file)).toEqual(['review-1-wire.png']);
  });

  test('withReview: no bind, no weights view; explicit views win', () => {
    const plain = withReview([{ op: 'retopo', triangles: 900 }, { op: 'export' }]);
    expect(plain[1]).toEqual({ op: 'review', views: ['clay', 'wire', 'turnaround'] });
    const asked = withReview([{ op: 'review' }, { op: 'export' }], { views: ['clay'] });
    expect(asked.map((s) => s.op)).toEqual(['review', 'review', 'export']);
  });
});
