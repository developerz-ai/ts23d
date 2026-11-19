// meshyAdapter: meshy.ai, a hosted paid service, behind the adapter contract, for users without a
// GPU. One adapter among many; any other works the same way. Tasks:
//   mesh    `image` → POST v1/image-to-3d; `images` (1–4 views, front first, `image` counts as the
//           first) → v1/multi-image-to-3d; a prompt alone → v2/text-to-3d (preview, then refine
//           when textured). `pose` → pose_mode; `params` override the options (meshy-params.ts).
//   rig     rigging + library animation clips on a biped → one skinned GLB (meshy-rig.ts).
//   texture retexture of our mesh on its own UVs → PNG maps (meshy-post.ts).
// Every task follows meshy-task.ts: the task id is stored before polling, a create is never
// repeated blindly, a rerun resumes, results are downloaded at SUCCEEDED without the key. The key
// is the caller's (`apiKey`: process.env.MESHY_API_KEY in t3d.config.ts); it goes only into the
// Authorization header, never into records, the pending file, logs or errors. Licence: every API
// key belongs to a paid plan, whose outputs the user owns (Meshy help centre, "full private
// ownership") → 'own' + terms URL. Task ids and consumed_credits go into the record's `server`
// line. `estimate`, `balance` and `animations` cost nothing and let a caller look before spending.

import {
  fieldsOf,
  type NeuralAdapter,
  type NeuralJob,
  type NeuralModelInfo,
  pickModel,
  taskResult,
} from './adapter.ts';
import { type MeshyBalance, meshyBalance, meshyEstimate } from './meshy-credits.ts';
import {
  checkOptions,
  dataUri,
  imageBody,
  MESHY_MODELS,
  type MeshyOptions,
  meshOptions,
  meshyCost,
  multiBody,
  previewBody,
  refineBody,
} from './meshy-params.ts';
import { MESHY_TEXTURE_MODELS, retextureCost, runTexture } from './meshy-post.ts';
import { type MeshyAnimation, type MeshyOut, meshyAnimations, runRig } from './meshy-rig.ts';
import { type MeshyDone, type MeshyTasks, meshyTasks } from './meshy-task.ts';
import { sha256Hex } from './sha256.ts';
import { failed, type WireSignal } from './wire.ts';

export const MESHY_TERMS = 'https://www.meshy.ai/terms-of-use';

/** The one `rig` model: Meshy's auto-rigger. */
export const MESHY_RIG_MODEL = 'meshy-rigging';

const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp'];

export interface MeshyAdapter extends NeuralAdapter {
  /** Credits `job` is expected to cost (an estimate; nothing is sent). */
  estimate(job: Pick<NeuralJob, 'task' | 'request' | 'model'>): number;
  /** Credits left on the account (free call). */
  balance(): Promise<MeshyBalance>;
  /** The animation library whose keys `rig.clips` names (free call). */
  animations(q?: {
    readonly search?: string;
    readonly category?: string;
  }): Promise<readonly MeshyAnimation[]>;
}

async function runMesh(
  t: MeshyTasks,
  base: MeshyOptions,
  id: string,
  r: Readonly<Record<string, unknown>>,
  inputs: ReadonlyMap<string, Uint8Array> | undefined,
  deadline: WireSignal,
): Promise<MeshyOut> {
  const o = meshOptions(base, r);
  checkOptions(o, id);
  const cap = typeof r['maxTriangles'] === 'number' ? r['maxTriangles'] : undefined;
  const prompt = typeof r['prompt'] === 'string' && r['prompt'].trim() ? r['prompt'] : undefined;
  type In = { sha256: string; mime: string };
  const more = (r['images'] ?? []) as readonly In[];
  const views = [...(r['image'] ? [r['image'] as In] : []), ...more];
  const uris = views.map((v, i) => {
    const bytes = inputs?.get(v.sha256);
    if (!bytes || !IMAGE_MIMES.includes(v.mime))
      failed(
        `meshy mesh input image ${i} is ${bytes ? `'${v.mime}'` : 'missing'}`,
        `pass a ${IMAGE_MIMES.join(' / ')} image and its bytes in job.inputs`,
      );
    return dataUri(`mesh input image ${i}`, bytes as Uint8Array, v.mime);
  });
  const steps: MeshyDone[] = [];
  if (more.length)
    steps.push(
      await t.run(
        'v1/multi-image-to-3d',
        multiBody(o, id, uris, cap, prompt),
        'multi-image-to-3d',
        deadline,
      ),
    );
  else if (uris[0])
    steps.push(
      await t.run(
        'v1/image-to-3d',
        imageBody(o, id, uris[0], cap, prompt),
        'image-to-3d',
        deadline,
      ),
    );
  else {
    if (!prompt)
      failed(
        'meshy mesh request has neither image nor prompt',
        'give the mesh request an image, images or a prompt',
      );
    const text = prompt as string;
    const preview = await t.run(
      'v2/text-to-3d',
      previewBody(o, id, text, cap),
      'text-to-3d preview',
      deadline,
    );
    steps.push(preview);
    if (o.texture)
      steps.push(
        await t.run(
          'v2/text-to-3d',
          refineBody(o, preview.id, text),
          'text-to-3d refine',
          deadline,
        ),
      );
  }
  const last = steps[steps.length - 1] as MeshyDone;
  const urls = last.task['model_urls'] as { glb?: unknown } | null;
  const bytes = await t.download(urls?.glb, 'model_urls.glb', steps);
  t.forget(steps);
  // So a rig of these bytes can name the task instead of uploading them.
  t.store().set(`glb:${sha256Hex(bytes)}`, last.id);
  return { steps, outputs: [{ bytes, mime: 'model/gltf-binary' }] };
}

export function meshyAdapter(o: MeshyOptions): MeshyAdapter {
  const t = meshyTasks(o);
  const pick = o.model ?? 'latest';
  checkOptions(o, pick);
  const own = { licence: 'own', terms: MESHY_TERMS };
  const models = (): Promise<readonly NeuralModelInfo[]> =>
    Promise.resolve([
      ...Object.keys(MESHY_MODELS)
        .map((id) => ({ id, task: 'mesh' as const, ...own, cost: meshyCost(o, id) }))
        .sort((a, b) => Number(b.id === pick) - Number(a.id === pick)),
      { id: MESHY_RIG_MODEL, task: 'rig' as const, ...own, cost: 5 },
      ...Object.keys(MESHY_TEXTURE_MODELS).map((id) => ({
        id,
        task: 'texture' as const,
        ...own,
        cost: retextureCost(2048),
      })),
    ]);
  return {
    id: 'meshy',
    tasks: ['mesh', 'rig', 'texture'],
    models,
    paid: true,
    estimate: (job) => meshyEstimate(o, job),
    balance: () => meshyBalance(t),
    animations: (q) => meshyAnimations(t, q),
    async run(job) {
      const model = pickModel('meshy', await models(), job.task, job.model);
      const deadline = AbortSignal.timeout(t.jobMs);
      const r = fieldsOf(job.request);
      const out =
        job.task === 'rig'
          ? await runRig(t, r, job.inputs, deadline)
          : job.task === 'texture'
            ? await runTexture(t, model.id, r, job.inputs, deadline)
            : await runMesh(t, o, model.id, r, job.inputs, deadline);
      const credits = out.steps.reduce((n, s) => n + s.credits, 0);
      const server = `meshy task ${out.steps.map((s) => s.id).join(' + ')}; consumed_credits ${credits}`;
      return { result: taskResult(job.task, out.outputs), model, server };
    },
  };
}
