import { afterEach, describe, expect, test } from 'bun:test';
import { encodePng } from '../core/index.ts';
import { runJob } from './adapter.ts';
import { type FakeTool, fakeTool } from './fake-tool.ts';
import { cube } from './fixtures.ts';
import { writeMeshGlb } from './glb-write.ts';
import { neuralCache } from './recipe-cache.ts';
import { sha256Hex } from './sha256.ts';
import { basisuAdapter, basisuArgs, gltfpackAdapter, gltfpackArgs } from './tool-adapters.ts';

const glb = writeMeshGlb([{ name: 'wolf', mesh: cube() }]);
const glbRef = { sha256: sha256Hex(glb), mime: 'model/gltf-binary' };
const png = encodePng(4, 4, new Uint8Array(64).fill(128));
const pngRef = { sha256: sha256Hex(png), mime: 'image/png' };
const meshopt = {
  task: 'meshopt' as const,
  request: { seed: 0, mesh: glbRef, compress: true, simplify: 0.5 },
  inputs: new Map([[glbRef.sha256, glb]]),
};
const ktx2 = {
  task: 'ktx2' as const,
  request: { seed: 0, image: pngRef, mode: 'uastc' as const },
  inputs: new Map([[pngRef.sha256, png]]),
};

// gltfpack: copy -i to -o. basisu: write a KTX2 identifier + zero header to -output_file.
const GLTFPACK = `[ "$1" = "-v" ] && { echo "gltfpack 1.3"; exit 0; }\ncp "$2" "$4"`;
const KTX2_ID = '\\253KTX 20\\273\\r\\n\\032\\n';
const BASISU = `[ "$1" = "-version" ] && { echo "Basis Universal LDR/HDR GPU Texture v2.50.0"; exit 0; }\n{ printf '${KTX2_ID}'; head -c 100 /dev/zero; } > "$last"`;

let fakes: FakeTool[] = [];
const fake = (name: string, body: string): FakeTool => {
  const f = fakeTool(name, body);
  fakes.push(f);
  return f;
};
afterEach(() => {
  for (const f of fakes) f.dispose();
  fakes = [];
});

describe('tool adapters: failures first', () => {
  test('missing gltfpack / basisu → T3D_NEURAL_FAILED naming t3d setup tools', async () => {
    for (const a of [
      gltfpackAdapter({ exe: '/no/gltfpack' }),
      basisuAdapter({ exe: '/no/basisu' }),
    ]) {
      const e = await a.models().catch((x: unknown) => x);
      expect(String(e)).toContain('T3D_NEURAL_FAILED');
      expect((e as { fix?: string }).fix).toContain('t3d setup tools');
    }
  });

  test('a tool that crashes → its stderr tail; one that writes nothing → no output', async () => {
    const f = fake(
      'gltfpack',
      `[ "$1" = "-v" ] && { echo "gltfpack 1.3"; exit 0; }\necho "Error loading in.glb" >&2\nexit 2`,
    );
    await expect(runJob(gltfpackAdapter({ exe: f.exe }), meshopt)).rejects.toThrow(
      /exited 2:\nError loading in\.glb/,
    );
    f.rewrite(`[ "$1" = "-v" ] && { echo "gltfpack 1.3"; exit 0; }\nexit 0`);
    await expect(runJob(gltfpackAdapter({ exe: f.exe }), meshopt)).rejects.toThrow(
      /wrote no out\.glb/,
    );
  });

  test('a basisu that writes something else than KTX2 → T3D_NEURAL_OUTPUT_INVALID', async () => {
    const f = fake(
      'basisu',
      `[ "$1" = "-version" ] && { echo "Basis Universal v2.50.0"; exit 0; }\necho junk > "$last"`,
    );
    await expect(runJob(basisuAdapter({ exe: f.exe }), ktx2)).rejects.toThrow(
      'T3D_NEURAL_OUTPUT_INVALID',
    );
  });

  test('bad requests are refused before spawning', () => {
    expect(() => gltfpackArgs({ simplify: 0 }, 'i', 'o')).toThrow(/outside \(0, 1\]/);
    expect(() => basisuArgs({ mode: 'bc7' }, 'i', 'o')).toThrow(/mode 'bc7'/);
  });

  test('an output over maxBytes is refused', async () => {
    const f = fake('gltfpack', GLTFPACK);
    await expect(runJob(gltfpackAdapter({ exe: f.exe, maxBytes: 10 }), meshopt)).rejects.toThrow(
      /cap 10/,
    );
  });
});

describe('tool adapters: contract', () => {
  test('gltfpack flags keep pivots, clips and extras; compress or plain', () => {
    expect(gltfpackArgs({ compress: true, simplify: 0.5 }, 'in.glb', 'out.glb')).toEqual([
      '-i',
      'in.glb',
      '-o',
      'out.glb',
      '-kn',
      '-km',
      '-ke',
      '-ac',
      '-af',
      '0',
      '-c',
      '-si',
      '0.5',
    ]);
    expect(gltfpackArgs({ compress: false }, 'a', 'b')).toContain('-noq');
  });

  test('basisu flags: UASTC/ETC1S, mipmaps by default, sRGB or linear', () => {
    expect(basisuArgs({ mode: 'uastc' }, 'in.png', 'out.ktx2')).toEqual([
      '-ktx2',
      '-uastc',
      '-mipmap',
      '-srgb',
      '-file',
      'in.png',
      '-output_file',
      'out.ktx2',
    ]);
    expect(basisuArgs({ mode: 'etc1s', mipmaps: false, srgb: false }, 'a', 'b')).toEqual([
      '-ktx2',
      '-etc1s',
      '-linear',
      '-file',
      'a',
      '-output_file',
      'b',
    ]);
  });

  test('meshopt through a fake gltfpack: compressed GLB passes, version recorded', async () => {
    const f = fake('gltfpack', GLTFPACK);
    const run = await runJob(gltfpackAdapter({ exe: f.exe }), meshopt);
    expect(run.result.outputs[0]?.bytes).toEqual(glb);
    expect(run.model.tool).toEqual({ name: 'gltfpack', version: '1.3', licence: 'MIT' });
    expect(run.model.licence).toBe('own');
  });

  test('ktx2 through a fake basisu; a cache hit never spawns it', async () => {
    const f = fake('basisu', BASISU);
    const a = basisuAdapter({ exe: f.exe });
    const cache = neuralCache({ recipe: 'trim' });
    const first = await cache.fill(a, ktx2);
    expect(first.entry.record.outputs[0]?.file).toBe('output-0.ktx2');
    expect(first.entry.record.model.tool?.version).toBe('2.50.0');
    const n = f.calls().length;
    expect((await cache.fill(a, ktx2)).cached).toBe(true);
    expect(f.calls().length).toBe(n);
  });

  test('a new tool version is a new cache key', async () => {
    const f = fake('gltfpack', GLTFPACK);
    const a = (await gltfpackAdapter({ exe: f.exe }).models())[0]?.weightsSha256;
    f.rewrite(GLTFPACK.replace('1.3', '1.4'));
    const b = (await gltfpackAdapter({ exe: f.exe }).models())[0]?.weightsSha256;
    expect(a).not.toBe(b);
  });
});
