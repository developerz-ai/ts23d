import { afterEach, describe, expect, test } from 'bun:test';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { NeuralRequest } from '../core/index.ts';
import { runJob } from './adapter.ts';
import { BLENDER_TASKS, blenderAdapter } from './blender-adapter.ts';
import { type FakeTool, fakeTool } from './fake-tool.ts';
import { cube } from './fixtures.ts';
import { writeMeshGlb } from './glb-write.ts';
import { neuralCache } from './recipe-cache.ts';
import { sha256Hex } from './sha256.ts';

const glb = writeMeshGlb([{ name: 'garment', mesh: cube() }]);
const ref = { sha256: sha256Hex(glb), mime: 'model/gltf-binary' };
const request: NeuralRequest<'cloth'> = { seed: 0, garment: ref, body: ref, frames: 12 };
const job = { task: 'cloth' as const, request, inputs: new Map([[ref.sha256, glb]]) };

const VERSION =
  'case "$*" in *--version*) echo "Blender 5.2.4 LTS"; exit 0;; esac\nd=$(dirname "$last")';
const REPORT_OK =
  '{"ok":true,"blender":"5.2.4 LTS","outputs":[{"file":"output-0.glb","mime":"model/gltf-binary"}]}';

let fakes: FakeTool[] = [];
const fake = (body: string): FakeTool => {
  const f = fakeTool('blender', `${VERSION}\n${body}`);
  writeFileSync(join(f.dir, 'out.glb'), glb);
  fakes.push(f);
  return f;
};
const happy = (): FakeTool =>
  fake(
    `cp "$(dirname "$0")/out.glb" "$d/output-0.glb"\nprintf '%s' '${REPORT_OK}' > "$d/report.json"`,
  );

afterEach(() => {
  for (const f of fakes) f.dispose();
  fakes = [];
});

describe('blenderAdapter: failures first', () => {
  test('no Blender → T3D_NEURAL_FAILED naming t3d setup tools', async () => {
    const a = blenderAdapter({ exe: '/nonexistent/blender' });
    const e = await a.models().catch((x: unknown) => x);
    expect(String(e)).toContain('T3D_NEURAL_FAILED');
    expect((e as { fix?: string }).fix).toContain('t3d setup tools');
  });

  test('a Blender outside the LTS lines is refused with allowVersions as the fix', async () => {
    const f = fakeTool('blender', 'echo "Blender 3.6.0"');
    fakes.push(f);
    const e = await blenderAdapter({ exe: f.exe })
      .models()
      .catch((x: unknown) => x);
    expect(String(e)).toContain('not a supported line');
    expect((e as { fix?: string }).fix).toContain("allowVersions: ['3.6']");
    expect((await blenderAdapter({ exe: f.exe, allowVersions: ['3.6'] }).models()).length).toBe(
      BLENDER_TASKS.length,
    );
  });

  test('a job that writes no report fails', async () => {
    const f = fake('exit 0');
    await expect(runJob(blenderAdapter({ exe: f.exe }), job)).rejects.toThrow(
      /wrote no report\.json/,
    );
  });

  test('a task exception: the report error and the stderr tail, exit code kept', async () => {
    const f = fake(
      `printf '{"ok":false,"error":"ValueError: boom"}' > "$d/report.json"\necho "Traceback: line 7" >&2\nexit 3`,
    );
    const e = await runJob(blenderAdapter({ exe: f.exe }), job).catch((x: unknown) => x);
    expect(String(e)).toContain('ValueError: boom');
    expect(String(e)).toContain('exited 3');
    expect(String(e)).toContain('Traceback: line 7');
  });

  test('a report naming a file outside the job dir is refused', async () => {
    const f = fake(
      `printf '%s' '{"ok":true,"outputs":[{"file":"../x.glb","mime":"model/gltf-binary"}]}' > "$d/report.json"`,
    );
    await expect(runJob(blenderAdapter({ exe: f.exe }), job)).rejects.toThrow(/names output/);
  });

  test('a job over its deadline is killed', async () => {
    const f = fake('sleep 5');
    const a = blenderAdapter({ exe: f.exe, timeoutMs: 300 });
    await expect(runJob(a, job)).rejects.toThrow(/did not finish within 300 ms/);
  });

  test('an invalid output (not a GLB) is T3D_NEURAL_OUTPUT_INVALID', async () => {
    const f = fake(`echo nope > "$d/output-0.glb"\nprintf '%s' '${REPORT_OK}' > "$d/report.json"`);
    await expect(runJob(blenderAdapter({ exe: f.exe }), job)).rejects.toThrow(
      'T3D_NEURAL_OUTPUT_INVALID',
    );
  });
});

describe('blenderAdapter: contract', () => {
  test('runs the dispatcher headless, factory settings, one thread, exit code 3', async () => {
    const f = happy();
    const run = await runJob(blenderAdapter({ exe: f.exe }), job);
    expect(run.result.outputs[0]?.bytes).toEqual(glb);
    expect(run.model.id).toBe('blender-cloth');
    expect(run.model.licence).toBe('own');
    expect(run.model.tool?.version).toBe('5.2.4 LTS');
    expect(run.model.tool?.scriptSha256).toMatch(/^[0-9a-f]{64}$/);
    const call = f.calls().at(-1) ?? '';
    for (const a of ['-b', '--factory-startup', '-noaudio', '-t 1', '--python-exit-code 3'])
      expect(call).toContain(a);
    expect(call).toMatch(/ts23d_job\.py -- .*job\.json$/);
  });

  test('bpy mode runs the same dispatcher under python -I', async () => {
    const f = fake(
      `case "$*" in *import\\ bpy*) echo "Blender 5.2.4 LTS"; exit 0;; esac\ncp "$(dirname "$0")/out.glb" "$d/output-0.glb"\nprintf '%s' '${REPORT_OK}' > "$d/report.json"`,
    );
    const run = await runJob(blenderAdapter({ exe: f.exe, mode: 'bpy' }), job);
    expect(run.model.tool?.version).toBe('5.2.4 LTS');
    expect(f.calls().at(-1)).toMatch(/^-I .*ts23d_job\.py -- /);
  });

  test('a cache hit never spawns Blender', async () => {
    const f = happy();
    const a = blenderAdapter({ exe: f.exe });
    const cache = neuralCache({ recipe: 'bust' });
    const first = await cache.fill(a, job);
    const jobs = (): number => f.calls().filter((c) => c.includes('job.json')).length;
    expect([first.cached, jobs()]).toEqual([false, 1]);
    const again = await cache.fill(a, job);
    expect([again.cached, jobs()]).toEqual([true, 1]);
  });

  test('a changed task script or Blender version is a different cache key', async () => {
    const f = happy();
    const scripts = mkdtempSync(join(tmpdir(), 't3d-scripts-'));
    try {
      cpSync(join(import.meta.dir, '../../examples/blender'), scripts, { recursive: true });
      const key = async (): Promise<string | undefined> =>
        (await blenderAdapter({ exe: f.exe, scriptsDir: scripts }).models()).find(
          (m) => m.task === 'cloth',
        )?.weightsSha256;
      const before = await key();
      writeFileSync(join(scripts, 'tasks/cloth.py'), '# changed\n');
      const after = await key();
      f.rewrite(VERSION.replace('5.2.4', '5.2.5'));
      const upgraded = await key();
      expect(new Set([before, after, upgraded]).size).toBe(3);
    } finally {
      rmSync(scripts, { recursive: true, force: true });
    }
  });

  test('offers cloth, rig, fracture and groom', async () => {
    const f = happy();
    const models = await blenderAdapter({ exe: f.exe }).models();
    expect(models.map((m) => m.task)).toEqual([...BLENDER_TASKS]);
    expect(models.map((m) => m.id)).toContain('blender-groom');
  });

  test('groom: the scalp GLB and the guides JSON both reach the job dir, by sha256', async () => {
    const guides = new TextEncoder().encode('{"contract":"t3d-groom/1","guides":[]}');
    const g = { sha256: sha256Hex(guides), mime: 'application/json' };
    // Refuses unless job.json names two inputs and the guides landed as .json.
    const f = fake(
      `n=$(grep -o '"in-[0-9a-f]*\\.[a-z]*"' "$last" | wc -l)\n[ "$n" = 2 ] || exit 9\nls "$d"/in-*.json >/dev/null || exit 8\ncp "$(dirname "$0")/out.glb" "$d/output-0.glb"\nprintf '%s' '${REPORT_OK}' > "$d/report.json"`,
    );
    const run = await runJob(blenderAdapter({ exe: f.exe }), {
      task: 'groom',
      request: {
        seed: 1,
        mesh: ref,
        guides: g,
        children: 8,
        cards: 4,
        points: 5,
        maxTriangles: 64,
      },
      inputs: new Map([
        [ref.sha256, glb],
        [g.sha256, guides],
      ]),
    });
    expect(run.model.id).toBe('blender-groom');
    expect(run.result.outputs[0]?.mime).toBe('model/gltf-binary');
  });

  test('groom: a cards GLB over maxTriangles is refused before use', async () => {
    const guides = new TextEncoder().encode('{}');
    const g = { sha256: sha256Hex(guides), mime: 'application/json' };
    const e = await runJob(blenderAdapter({ exe: happy().exe }), {
      task: 'groom',
      request: { seed: 1, mesh: ref, guides: g, children: 8, cards: 4, points: 5, maxTriangles: 2 },
      inputs: new Map([
        [ref.sha256, glb],
        [g.sha256, guides],
      ]),
    }).catch((x: unknown) => x);
    expect(String(e)).toContain('T3D_NEURAL_OUTPUT_INVALID');
    expect(String(e)).toContain('cap 2');
  });
});
