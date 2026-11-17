// The `texture` task on Meshy: Retexture (POST v1/retexture, 10 credits at 2K / 4K, 15 at 8K)
// paints OUR mesh from the request's prompt and always keeps its UV layout (`enable_original_uv:
// true`; there is no switch: fresh UVs would live in a GLB this task does not return, so the maps
// would not fit the mesh that was sent). The GLB goes up as
// a data URI; `size` picks the resolution (2048 → 2k, 4096 → 4k, 8192 → 8k; nothing else exists).
// Outputs are PNG maps from `texture_urls[0]`: base colour first, then metallic, roughness and
// normal when params.pbr is on. The task's own GLB is not downloaded: the contract's `texture`
// result is images. A request's `control` maps have no Meshy counterpart and are refused.
// Planned, not shipped: Meshy Remesh (v1/remesh) and UV Unwrap. `meshopt` is the nearest task and
// does not fit (it asks for EXT_meshopt compression and a kept fraction; Remesh gives neither).

import type { NeuralOutput } from '../core/index.ts';
import { dataUri, readParams } from './meshy-params.ts';
import type { MeshyOut } from './meshy-rig.ts';
import type { MeshyTasks } from './meshy-task.ts';
import { failed, type WireSignal } from './wire.ts';

/** Retexture `ai_model` values and what each takes (`latest` is meshy-7). */
export const MESHY_TEXTURE_MODELS: Readonly<
  Record<string, { readonly big: boolean; readonly pbr: boolean }>
> = {
  latest: { big: true, pbr: true },
  'meshy-7': { big: true, pbr: true },
  'meshy-6': { big: true, pbr: true },
  'meshy-6-lite': { big: false, pbr: true },
  'meshy-n1': { big: false, pbr: false },
};

const RESOLUTION: Readonly<Record<number, string>> = { 2048: '2k', 4096: '4k', 8192: '8k' };
const TEXTURE_PARAMS = { pbr: 'boolean' } as const;
const MAPS = ['metallic', 'roughness', 'normal'] as const;

/** Credits of one retexture at `size` px. */
export const retextureCost = (size: unknown): number => (size === 8192 ? 15 : 10);

/** The retexture request body; refuses what Meshy answers 400 to. */
export function retextureBody(
  model: string,
  modelUri: string,
  r: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const m = MESHY_TEXTURE_MODELS[model];
  if (!m)
    failed(
      `'${model}' is not a Meshy texture model`,
      `use one of: ${Object.keys(MESHY_TEXTURE_MODELS).join(', ')}`,
    );
  const resolution = RESOLUTION[Number(r['size'])];
  if (!resolution)
    failed(
      `meshy texture: size ${String(r['size'])} is not a Meshy texture resolution`,
      'ask size 2048, 4096 or 8192',
    );
  if (resolution !== '2k' && !m?.big)
    failed(`meshy ${model}: 2k textures only`, "ask size 2048, or model 'latest' / 'meshy-6'");
  const p = readParams('texture', r['params'], TEXTURE_PARAMS);
  if (p['pbr'] && !m?.pbr) failed(`meshy ${model}: no PBR maps`, "drop params.pbr or use 'latest'");
  const prompt = typeof r['prompt'] === 'string' ? r['prompt'].trim() : '';
  if (!prompt || prompt.length > 800)
    failed(
      `meshy texture: the prompt has ${prompt.length} characters`,
      'describe the surface in 1–800 characters',
    );
  if (Array.isArray(r['control']) && r['control'].length)
    failed('meshy texture takes no control maps', 'drop `control`, or use a local texture model');
  return {
    model_url: modelUri,
    text_style_prompt: prompt,
    ai_model: model,
    enable_original_uv: true,
    texture_resolution: resolution,
    target_formats: ['glb'],
    ...(p['pbr'] ? { enable_pbr: true } : {}),
  };
}

export async function runTexture(
  t: MeshyTasks,
  model: string,
  r: Readonly<Record<string, unknown>>,
  inputs: ReadonlyMap<string, Uint8Array> | undefined,
  deadline: WireSignal,
): Promise<MeshyOut> {
  const mesh = r['mesh'] as { sha256: string; mime: string };
  const bytes = inputs?.get(mesh.sha256);
  if (!bytes || mesh.mime !== 'model/gltf-binary')
    failed(
      `meshy texture input is ${bytes ? `'${mesh.mime}'` : 'missing'}`,
      'pass a GLB (model/gltf-binary) with UVs and its bytes in job.inputs',
    );
  const uri = dataUri('texture mesh', bytes as Uint8Array, 'application/octet-stream', true);
  const body = retextureBody(model, uri, r);
  const done = await t.run('v1/retexture', body, 'retexture', deadline);
  const urls = ((done.task['texture_urls'] as unknown[] | null)?.[0] ?? {}) as Record<
    string,
    unknown
  >;
  const outputs: NeuralOutput[] = [];
  for (const map of ['base_color', ...(body['enable_pbr'] ? MAPS : [])]) {
    const png = await t.download(urls[map], `${map} map`, [done], true);
    outputs.push({ bytes: png, mime: 'image/png' });
  }
  t.forget([done]);
  return { steps: [done], outputs };
}
