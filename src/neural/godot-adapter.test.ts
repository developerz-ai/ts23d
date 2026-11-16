import { afterEach, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { runJob } from './adapter.ts';
import { type FakeTool, fakeTool } from './fake-tool.ts';
import { cube } from './fixtures.ts';
import { writeMeshGlb } from './glb-write.ts';
import { CHECK_GD, GODOT_PROJECT, godotAdapter, importerLines } from './godot-adapter.ts';
import { sha256Hex } from './sha256.ts';

const glb = writeMeshGlb([{ name: 'wolf', mesh: cube() }]);
const ref = { sha256: sha256Hex(glb), mime: 'model/gltf-binary' };
const job = {
  task: 'engine-check' as const,
  request: { seed: 0, mesh: ref, engine: 'godot' as const },
  inputs: new Map([[ref.sha256, glb]]),
};

// --version; --import prints importer lines naming the temp project; --script writes the report.
const GODOT = `case "$*" in
  *--version*) echo "4.7.2.stable.official.ed1daf0bf"; exit 0;;
  *--import*) echo "ERROR: Can't open file from path '$3/../tex.png'."; echo "WARNING: glTF: skipped"; exit 0;;
  *--script*) printf '{"engine":"godot","ok":true,"meshes":1,"animations":[{"name":"walk","length":0.8,"played":true,"tracks":4}],"collisionShapes":1,"bodies":1}' > "$last";;
esac`;

let fakes: FakeTool[] = [];
const fake = (body: string): FakeTool => {
  const f = fakeTool('godot', body);
  fakes.push(f);
  return f;
};
afterEach(() => {
  for (const f of fakes) f.dispose();
  fakes = [];
});

describe('godotAdapter: failures first', () => {
  test('no Godot → T3D_NEURAL_FAILED naming t3d setup tools', async () => {
    const e = await godotAdapter({ exe: '/no/godot' })
      .models()
      .catch((x: unknown) => x);
    expect((e as { fix?: string }).fix).toContain('t3d setup tools');
  });

  test('a Godot without --import (< 4.2) is refused', async () => {
    const f = fake('echo "4.1.3.stable.official.abc"');
    await expect(godotAdapter({ exe: f.exe }).models()).rejects.toThrow(/has no --import/);
  });

  test('a check that writes no report fails', async () => {
    const f = fake(GODOT.replace(/\*--script\*\)[^\n]*/, '*--script*) exit 0;;'));
    await expect(runJob(godotAdapter({ exe: f.exe }), job)).rejects.toThrow(
      /wrote no report\.json/,
    );
  });
});

describe('godotAdapter: contract', () => {
  test('imports then checks; importer lines masked and folded into a stable JSON report', async () => {
    const f = fake(GODOT);
    const run = await runJob(godotAdapter({ exe: f.exe }), job);
    const out = run.result.outputs[0];
    expect(out?.mime).toBe('application/json');
    const report = JSON.parse(new TextDecoder().decode(out?.bytes));
    expect(report.collisionShapes).toBe(1);
    expect(report.animations[0].name).toBe('walk');
    expect(report.importErrors).toEqual(["Can't open file from path '<work>/../tex.png'."]);
    expect(report.importWarnings).toEqual(['glTF: skipped']);
    expect(Object.keys(report)).toEqual([...Object.keys(report)].sort());
    expect(run.model.tool?.scriptSha256).toMatch(/^[0-9a-f]{64}$/);
    const calls = f.calls();
    expect(calls[1]).toMatch(/^--headless --path \S+ --import$/);
    expect(calls[2]).toMatch(/--script res:\/\/t3d_check\.gd -- \S+report\.json$/);
    const again = await runJob(godotAdapter({ exe: f.exe }), job);
    expect(again.result.outputs[0]?.bytes).toEqual(out?.bytes);
  });

  test('the server plug-in runs the same project and check script', async () => {
    const py = await Bun.file(
      join(import.meta.dir, '../../examples/neural-server/plugins/tool_godot.py'),
    ).text();
    const esc = (t: string): string => t.replaceAll('\\', '\\\\').replaceAll('\t', '\\t');
    expect(py).toContain(`CHECK_GD = """${esc(CHECK_GD)}"""`);
    expect(py).toContain(`GODOT_PROJECT = """${esc(GODOT_PROJECT)}"""`);
  });

  test('importerLines dedupes and sorts', () => {
    const t = 'ERROR: b /tmp/x/a\nERROR: a\nERROR: b /tmp/x/a\nnoise\nWARNING: w';
    expect(importerLines(t, '/tmp/x')).toEqual({ errors: ['a', 'b <work>/a'], warnings: ['w'] });
  });
});
