// blenderAdapter's `blender` task (the step program) against a fake Blender: never the real one.
import { afterEach, describe, expect, test } from 'bun:test';
import { cpSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodePng, type NeuralRequest } from '../core/index.ts';
import { runJob } from './adapter.ts';
import { BLENDER_LINES, BLENDER_STEP_FILES, blenderAdapter } from './blender-adapter.ts';
import { blenderProgram, jsonInput } from './blender-steps.ts';
import { type FakeTool, fakeTool } from './fake-tool.ts';
import { cube } from './fixtures.ts';
import { writeMeshGlb } from './glb-write.ts';
import { sha256Hex } from './sha256.ts';

const box = cube();
const source = writeMeshGlb([{ name: 'model', mesh: box }]);
const lods = writeMeshGlb(['lod0', 'lod1', 'lod2'].map((name) => ({ name, mesh: box })));
const program = blenderProgram([{ op: 'retopo', triangles: 12 }, { op: 'export' }]);
const mesh = { sha256: sha256Hex(source), mime: 'model/gltf-binary' };
const request: NeuralRequest<'blender'> = {
  seed: 1,
  mesh,
  program: jsonInput(program),
  maxTriangles: 12,
};
const inputs = new Map([
  [mesh.sha256, source],
  [request.program.sha256, program],
]);
const job = { task: 'blender' as const, request, inputs };

const VERSION =
  'case "$*" in *--version*) echo "Blender 5.3.0"; exit 0;; esac\nd=$(dirname "$last")';
const report = (outputs: string): string =>
  `printf '%s' '{"ok":true,"blender":"5.3.0","outputs":[${outputs}]}' > "$d/report.json"`;
const GLB = '{"file":"output-0.glb","mime":"model/gltf-binary"}';
const JSON_OUT = '{"file":"output-1.json","mime":"application/json"}';
const WRITE = `cp "$(dirname "$0")/out.glb" "$d/output-0.glb"\nprintf '{"steps":[]}' > "$d/output-1.json"`;

let fakes: FakeTool[] = [];
const fake = (body: string, glb: Uint8Array = lods): FakeTool => {
  const f = fakeTool('blender', `${VERSION}\n${body}`);
  writeFileSync(join(f.dir, 'out.glb'), glb);
  fakes.push(f);
  return f;
};
const run = (f: FakeTool, r: NeuralRequest<'blender'> = request) =>
  runJob(blenderAdapter({ exe: f.exe }), { ...job, request: r });

afterEach(() => {
  for (const f of fakes) f.dispose();
  fakes = [];
});

describe('blender task: failures first', () => {
  test('a report without outputs is refused', async () => {
    await expect(run(fake(report('')))).rejects.toThrow(/blender: the model returned no outputs/);
  });

  test('the report alone, or the report first, is not a result', async () => {
    const e = await run(fake(`${WRITE}\n${report(`${JSON_OUT},${GLB}`)}`)).catch((x: unknown) => x);
    expect(String(e)).toContain('T3D_NEURAL_OUTPUT_INVALID');
    expect(String(e)).toContain('output 0 is not the GLB');
  });

  test('review PNGs come after the report, never before it, and must decode', async () => {
    const PNG_OUT = '{"file":"review-1-clay.png","mime":"image/png"}';
    const sheet = (bytes: Uint8Array, order: string): FakeTool => {
      const f = fake(
        `${WRITE}\ncp "$(dirname "$0")/clay.png" "$d/review-1-clay.png"\n${report(order)}`,
      );
      writeFileSync(join(f.dir, 'clay.png'), bytes);
      return f;
    };
    const png = encodePng(2, 2, new Uint8Array(16).fill(200));
    const early = await run(sheet(png, `${GLB},${PNG_OUT},${JSON_OUT}`)).catch((x: unknown) => x);
    expect(String(early)).toContain('output 1 is image/png, not the JSON report');
    const junk = await run(sheet(new Uint8Array([1, 2, 3]), `${GLB},${JSON_OUT},${PNG_OUT}`)).catch(
      (x: unknown) => x,
    );
    expect(String(junk)).toContain('does not decode as PNG');
    const done = await run(sheet(png, `${GLB},${JSON_OUT},${PNG_OUT}`));
    expect(done.result.outputs.map((o) => o.mime)).toEqual([
      'model/gltf-binary',
      'application/json',
      'image/png',
    ]);
  });

  test("a GLB with no node 'lod0' is refused", async () => {
    const e = await run(fake(`${WRITE}\n${report(`${GLB},${JSON_OUT}`)}`, source)).catch(
      (x: unknown) => x,
    );
    expect(String(e)).toContain("has no mesh node named 'lod0'");
  });

  test('maxTriangles caps LOD0 alone, not the sum of the LODs', async () => {
    const f = fake(`${WRITE}\n${report(`${GLB},${JSON_OUT}`)}`);
    expect((await run(f)).result.outputs).toHaveLength(2);
    await expect(run(f, { ...request, maxTriangles: 11 })).rejects.toThrow(/12 triangles, cap 11/);
  });

  test('params.threads must be a whole number', async () => {
    const f = fake(`${WRITE}\n${report(`${GLB},${JSON_OUT}`)}`);
    await expect(run(f, { ...request, params: { threads: 1.5 } })).rejects.toThrow(
      /params\.threads is 1\.5/,
    );
  });
});

describe('blender task: contract', () => {
  test('mesh, program and skeleton reach the job dir by sha256; -t follows params.threads', async () => {
    const skeleton = new TextEncoder().encode('{"contract":"t3d-skeleton/1","bones":[]}');
    // Refuses unless job.json names three inputs, two of them .json.
    const f = fake(
      `n=$(grep -o '"in-[0-9a-f]*\\.[a-z]*"' "$last" | wc -l)\n[ "$n" = 3 ] || exit 9\n[ "$(ls "$d"/in-*.json | wc -l)" = 2 ] || exit 8\n${WRITE}\n${report(`${GLB},${JSON_OUT}`)}`,
    );
    const r = { ...request, skeleton: jsonInput(skeleton), params: { threads: 4 } };
    const done = await runJob(blenderAdapter({ exe: f.exe }), {
      task: 'blender',
      request: r,
      inputs: new Map([...inputs, [r.skeleton.sha256, skeleton]]),
    });
    expect(done.model.id).toBe('blender-blender');
    expect(done.model.tool?.version).toBe('5.3.0');
    expect(done.result.outputs.map((o) => o.mime)).toEqual([
      'model/gltf-binary',
      'application/json',
    ]);
    expect(f.calls().at(-1)).toContain('-t 4 ');
    await run(f).catch(() => undefined);
    expect(f.calls().at(-1)).toContain('-t 1 ');
  });

  test('5.3 is a supported line beside the LTS ones', () => {
    expect([...BLENDER_LINES]).toEqual(['4.5', '5.2', '5.3']);
  });

  test('the hashed step files are the ones on disk; editing one changes only the blender key', async () => {
    const dir = join(import.meta.dir, '../../examples/blender');
    const onDisk = readdirSync(join(dir, 'tasks/steps'))
      .filter((n) => n.endsWith('.py') && !n.startsWith('test_'))
      .map((n) => n.slice(0, -3));
    expect(onDisk.sort()).toEqual([...BLENDER_STEP_FILES].sort());
    const scripts = mkdtempSync(join(tmpdir(), 't3d-scripts-'));
    try {
      cpSync(dir, scripts, { recursive: true });
      const f = fake('exit 0');
      const keys = async (): Promise<(string | undefined)[]> => {
        const models = await blenderAdapter({ exe: f.exe, scriptsDir: scripts }).models();
        return ['blender', 'cloth'].map((t) => models.find((m) => m.task === t)?.weightsSha256);
      };
      const before = await keys();
      writeFileSync(join(scripts, 'tasks/steps/bake.py'), '# changed\n');
      const after = await keys();
      expect(after[0]).not.toBe(before[0]);
      expect(after[1]).toBe(before[1]);
    } finally {
      rmSync(scripts, { recursive: true, force: true });
    }
  });
});
