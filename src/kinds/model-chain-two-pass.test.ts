import { afterEach, describe, expect, it } from 'bun:test';
import {
  clearNeuralSources,
  compile,
  defineAsset,
  type NeuralCtxAsk,
  type NeuralOutput,
  type NeuralSource,
  type NeuralTask,
  provideNeuralSource,
} from '../core/index.ts';
import { writeMeshGlb } from '../neural/index.ts';
import { yawSimilarity } from '../primitives/index.ts';
import { creaturePlan } from './creature.ts';
import { type ChainedModel, modelChain } from './model-chain.ts';
import { applyFit } from './model-fit.ts';
import { albedoPng, capsuleCreature, FIXTURE_WOLF, toGltf } from './model-fixtures.ts';

const png = albedoPng(false);
const rawSha = 'ab'.repeat(32);
const absentMesh: NeuralOutput = {
  bytes: new Uint8Array(),
  mime: 'model/gltf-binary',
  sha256: rawSha,
  absent: true,
};

interface Seen {
  task: NeuralTask;
  request: Record<string, unknown>;
  ask: NeuralCtxAsk | undefined;
}

describe('modelChain, two passes', () => {
  afterEach(clearNeuralSources);

  const plan = creaturePlan(FIXTURE_WOLF).bones;
  const turnedBy = (deg: number): Uint8Array =>
    writeMeshGlb([
      {
        name: 'body',
        mesh: toGltf(
          applyFit(capsuleCreature(plan), { ...yawSimilarity(deg), s: 1.4, t: [1, 0, 0] }),
        ),
      },
    ]);
  const proxyGlb = turnedBy(40);
  const finalGlb = writeMeshGlb([{ name: 'body', mesh: toGltf(capsuleCreature(plan)), png }]);

  /** Answers the proxy ask (no skeleton) and the final ask (with one) separately. */
  function twoPass(o: { proxy?: Uint8Array; final?: Uint8Array; mesh?: NeuralOutput }) {
    const seen: Seen[] = [];
    const source = {
      get(task: NeuralTask, request: object, ask?: NeuralCtxAsk) {
        const r = request as Record<string, unknown>;
        seen.push({ task, request: r, ask });
        const bytes =
          task === 'image' ? png : task === 'blender' ? (r['skeleton'] ? o.final : o.proxy) : null;
        if (task === 'mesh') return { outputs: [o.mesh ?? absentMesh] };
        return bytes ? { outputs: [{ bytes, mime: 'model/gltf-binary' }] } : null;
      },
    } as NeuralSource;
    return { source, seen };
  }

  function chain(name: string, source: NeuralSource): ChainedModel | null | undefined {
    let got: ChainedModel | null | undefined;
    const asset = defineAsset({
      name,
      kind: 'prop',
      budget: { triangles: [10, 10, 10] },
      build(ctx) {
        got = modelChain(ctx, {
          concept: { seed: 1, prompt: 'a grey wolf, side on', width: 1024, height: 1024 },
          surface: { seed: 2, maxTriangles: 1_000_000 },
          spec: FIXTURE_WOLF,
          steps: (rig) => [
            { op: 'clean' },
            { op: 'retopo', triangles: 3000, focus: [{ at: rig.at('head'), r: 0.2, weight: 3 }] },
            { op: 'uv' },
            { op: 'bake' },
            { op: 'bind' },
            { op: 'lods', triangles: [1000, 300] },
            { op: 'export' },
          ],
          maxTriangles: 3000,
          license: 'MIT',
          author: 'fixture',
        });
      },
    });
    provideNeuralSource([name], source);
    compile(asset);
    return got;
  }

  it('needs a spec when the steps depend on the fit', () => {
    const f = twoPass({ proxy: proxyGlb, final: finalGlb });
    const asset = defineAsset({
      name: 'two_no_spec',
      kind: 'prop',
      budget: { triangles: [10, 10, 10] },
      build(ctx) {
        modelChain(ctx, {
          concept: { seed: 1, prompt: 'x', width: 64, height: 64 },
          surface: { seed: 2, maxTriangles: 10 },
          steps: () => [{ op: 'export' }],
          maxTriangles: 10,
          license: 'MIT',
          author: 'fixture',
        });
      },
    });
    provideNeuralSource(['two_no_spec'], f.source);
    expect(() => compile(asset)).toThrow(/T3D_RECIPE_INVALID.*spec/);
  });

  it('returns null when the proxy hits and the final pass misses', () => {
    const f = twoPass({ proxy: proxyGlb });
    expect(chain('two_final_miss', f.source)).toBeNull();
    expect(f.seen.map((s) => s.task)).toEqual(['image', 'mesh', 'blender', 'blender']);
  });

  it('returns null on a proxy miss without asking for the final pass', () => {
    const f = twoPass({ final: finalGlb });
    expect(chain('two_proxy_miss', f.source)).toBeNull();
    expect(f.seen.map((s) => s.task)).toEqual(['image', 'mesh', 'blender']);
  });

  it('works with the raw mesh absent: proxy → fit → final with transform and skeleton', () => {
    const f = twoPass({ proxy: proxyGlb, final: finalGlb });
    const got = chain('two_hit', f.source);
    expect(got?.model.textures).toBeDefined();
    expect(got?.rig?.bones.some((b) => b.name === 'fore_l_3')).toBe(true);
    const [, , proxy, final] = f.seen;
    expect(proxy?.request['skeleton']).toBeUndefined();
    expect(proxy?.request['maxTriangles']).toBe(6000);
    const read = (s: Seen | undefined, field: string): string => {
      const sha = (s?.request[field] as { sha256: string } | undefined)?.sha256 ?? '';
      return new TextDecoder().decode(s?.ask?.inputs?.get(sha));
    };
    const program = JSON.parse(read(final, 'program')) as {
      steps: { op: string; matrix?: number[] }[];
    };
    expect(program.steps.map((s) => s.op)).toEqual([
      'transform',
      'clean',
      'retopo',
      'uv',
      'bake',
      'bind',
      'lods',
      'export',
    ]);
    // The canonical program rounds to 1e-6: Blender moves the mesh by what TS fitted.
    (got?.rig?.fit.matrix ?? [Number.NaN]).forEach((m, i) => {
      expect(program.steps[0]?.matrix?.[i]).toBeCloseTo(m, 5);
    });
    const skeleton = JSON.parse(read(final, 'skeleton')) as { bones: { name: string }[] };
    expect(skeleton.bones.some((b) => b.name.endsWith('_mid'))).toBe(false);
    expect(skeleton.bones.map((b) => b.name)).toContain('hind_r_3');
    // Only the program and the skeleton travel: the raw mesh is not on this machine.
    expect(final?.ask?.inputs?.size).toBe(2);
    expect(final?.request['mesh']).toEqual({ sha256: rawSha, mime: 'model/gltf-binary' });
  });

  it('asks for a different final pass when the fit changes', () => {
    const a = twoPass({ proxy: proxyGlb, final: finalGlb });
    const b = twoPass({ proxy: turnedBy(75), final: finalGlb });
    chain('two_fit_a', a.source);
    chain('two_fit_b', b.source);
    const key = (s: Seen | undefined): string =>
      JSON.stringify([s?.request['program'], s?.request['skeleton']]);
    expect(key(a.seen[2])).toBe(key(b.seen[2]));
    expect(key(a.seen[3])).not.toBe(key(b.seen[3]));
  });

  it('binds in the fitted rest and reposes to the target: both are in the final request', () => {
    const seen: Seen[] = [];
    const source = {
      get(task: NeuralTask, request: object, ask?: NeuralCtxAsk) {
        const r = request as Record<string, unknown>;
        seen.push({ task, request: r, ask });
        if (task === 'mesh') return { outputs: [absentMesh] };
        if (task === 'image') return { outputs: [{ bytes: png, mime: 'image/png' }] };
        return r['skeleton'] ? null : { outputs: [{ bytes: proxyGlb, mime: 'model/gltf-binary' }] };
      },
    } as NeuralSource;
    let rig: ChainedModel['rig'];
    const asset = defineAsset({
      name: 'two_repose',
      kind: 'prop',
      budget: { triangles: [10, 10, 10] },
      build(ctx) {
        modelChain(ctx, {
          concept: { seed: 1, prompt: 'a grey wolf, side on', width: 1024, height: 1024 },
          surface: { seed: 2, maxTriangles: 1_000_000 },
          spec: FIXTURE_WOLF,
          repose: true,
          steps: (r) => {
            rig = r;
            return [
              { op: 'retopo', triangles: 3000 },
              { op: 'bind' },
              { op: 'repose', to: [...(r.target ?? [])] },
              { op: 'export' },
            ];
          },
          maxTriangles: 3000,
          license: 'MIT',
          author: 'fixture',
        });
      },
    });
    provideNeuralSource(['two_repose'], source);
    compile(asset);
    const final = seen[3];
    const text = (field: string): string => {
      const sha = (final?.request[field] as { sha256: string } | undefined)?.sha256 ?? '';
      return new TextDecoder().decode(final?.ask?.inputs?.get(sha));
    };
    const sent = JSON.parse(text('skeleton')) as { bones: { name: string; head: number[] }[] };
    const head = rig?.fitted.find((b) => b.name === 'head');
    // The skeleton file is in the glTF frame: asset (x, y, z) → (y, z, x).
    expect(sent.bones.find((b) => b.name === 'head')?.head[2]).toBeCloseTo(
      head?.head[0] ?? Number.NaN,
      5,
    );
    const program = JSON.parse(text('program')) as {
      steps: { op: string; to?: { name: string }[] }[];
    };
    const repose = program.steps.find((x) => x.op === 'repose');
    expect(repose?.to?.map((b) => b.name)).toEqual(rig?.fitted.map((b) => b.name));
    expect(rig?.bones.find((b) => b.name === 'head')?.tail[1]).toBe(0);
  });
});
