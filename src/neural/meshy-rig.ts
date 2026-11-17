// The `rig` task on Meshy: auto-rig a textured biped (POST v1/rigging, 5 credits), then bake the
// request's `clips` from Meshy's animation library onto it (POST v1/animations with `action_ids`,
// 3 credits per action). Output: ONE GLB. With clips it is the animation task's
// `animation_glb_url`, which Meshy documents as one merged file with one clip per action in the
// order sent (so clip i is request.clips[i]); without clips it is `rigged_character_glb_url`.
// The mesh goes up as `input_task_id` when this adapter made it (meshy-task.ts remembers the task
// of every GLB it downloaded; files live 3 days, a 404 falls back to the upload), else as a data
// URI. Everything Meshy would refuse is refused here first, before a credit is spent: > 380 000
// triangles, a bad height or skeleton, an unknown / duplicate clip (name or numeric id), more than
// 10 clips. Clips are resolved against the free library listing (`meshyAnimations`), never cached on disk.
// Meshy rigs bipeds only; quadrupeds keep our own skeletons. Not used: the walking / running GLBs
// every rigging task also returns (`basic_animations`: separate files, one clip each).

import type { NeuralOutput } from '../core/index.ts';
import { list, readGlb, uint } from './glb-read.ts';
import { dataUri, readParams } from './meshy-params.ts';
import type { MeshyDone, MeshyTasks } from './meshy-task.ts';
import { failed, type WireSignal } from './wire.ts';

/** `skeleton_template` values (default 'meshyrig': 24 bones, centimetres; the others metres). */
export const MESHY_SKELETONS = [
  'meshyrig',
  'mixamo',
  'ue5_mannequin',
  'max_biped',
  'unity_humanoid',
  'maya_human_ik',
  'blender_rigify_basic_human',
  'cc5_hd_neutral_base',
  'daz_genesis9',
] as const;

/** Triangles Meshy rigging accepts (a quad counts as two). */
export const MESHY_RIG_TRIANGLES = 380_000;

/** One entry of Meshy's animation library. */
export interface MeshyAnimation {
  /** `action_id`: what an animation task takes. */
  readonly id: number;
  /** Display name; not guaranteed unique. */
  readonly name: string;
  /** Unique, stable slug: the name to write in `rig.clips`. */
  readonly key: string;
  readonly category: string;
  readonly subCategory: string;
}

/** What one Meshy task run hands back to the adapter. */
export interface MeshyOut {
  readonly steps: readonly MeshyDone[];
  readonly outputs: readonly NeuralOutput[];
}

/** The animation library (0 credits). `search` matches name or key; `category` e.g. 'WalkAndRun'. */
export async function meshyAnimations(
  t: Pick<MeshyTasks, 'get'>,
  q: { readonly search?: string; readonly category?: string } = {},
): Promise<readonly MeshyAnimation[]> {
  const query = Object.entries(q)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');
  const got = await t.get(`v1/animations/library${query ? `?${query}` : ''}`, 'list animations');
  if (!Array.isArray(got))
    failed('the Meshy animation library did not answer a list', 'check baseUrl and the API key');
  return (got as Record<string, unknown>[])
    .filter((a) => Number.isInteger(a?.['action_id']) && typeof a['key'] === 'string')
    .map((a) => ({
      id: a['action_id'] as number,
      name: String(a['name'] ?? a['key']),
      key: a['key'] as string,
      category: String(a['category'] ?? ''),
      subCategory: String(a['sub_category'] ?? ''),
    }));
}

const norm = (s: string): string =>
  s
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

/** `clips` → action ids: a library key (or a unique display name), any case; or a numeric id. */
export function resolveClips(
  clips: readonly string[],
  library: readonly MeshyAnimation[],
): number[] {
  if (clips.length > 10)
    failed(`meshy rig: ${clips.length} clips`, 'one animation task takes 1–10 clips; ask fewer');
  const ids = clips.map((clip) => {
    if (/^\d+$/.test(clip)) {
      // A numeric id is checked too: an unknown one would fail only after rigging was paid for.
      if (!library.some((x) => x.id === Number(clip)))
        failed(
          `meshy rig: no animation with id ${clip} in the library`,
          'list the library (meshyAnimations) and use an id or a name from it',
        );
      return Number(clip);
    }
    const want = norm(clip);
    const byKey = library.filter((a) => norm(a.key) === want);
    const hit = byKey.length ? byKey : library.filter((a) => norm(a.name) === want);
    if (hit.length === 1 && hit[0]) return hit[0].id;
    const near = (hit.length ? hit : library.filter((a) => norm(a.key).includes(want))).slice(0, 8);
    return failed(
      `meshy rig: clip '${clip}' ${hit.length ? `names ${hit.length} library animations` : 'is not in the Meshy animation library'}`,
      near.length
        ? `use a key: ${near.map((a) => `${a.key} (${a.id})`).join(', ')}`
        : 'list the keys with meshyAdapter(…).animations({ search }) (categories: WalkAndRun, BodyMovements, DailyActions, Fighting, Dancing)',
    );
  });
  const twice = ids.find((id, i) => ids.indexOf(id) !== i);
  if (twice !== undefined)
    failed(`meshy rig: clip action ${twice} is asked twice`, 'name every clip once');
  return ids;
}

/** Triangles of a GLB from its accessors alone (no geometry decoded). */
export function glbTriangles(bytes: Uint8Array): number {
  const { json } = readGlb(bytes);
  const accessors = list(json, 'accessors');
  let n = 0;
  for (const m of list(json, 'meshes'))
    for (const p of list(m, 'primitives')) {
      const attrs = (p['attributes'] ?? {}) as Record<string, unknown>;
      const i = typeof p['indices'] === 'number' ? p['indices'] : attrs['POSITION'];
      const a = typeof i === 'number' ? accessors[i] : undefined;
      if (a && (p['mode'] === undefined || p['mode'] === 4)) n += Math.floor(uint(a, 'count') / 3);
    }
  return n;
}

const RIG_PARAMS = { skeletonTemplate: MESHY_SKELETONS, includeFingers: 'boolean' } as const;

export async function runRig(
  t: MeshyTasks,
  r: Readonly<Record<string, unknown>>,
  inputs: ReadonlyMap<string, Uint8Array> | undefined,
  deadline: WireSignal,
): Promise<MeshyOut> {
  const mesh = r['mesh'] as { sha256: string; mime: string };
  const bytes = inputs?.get(mesh.sha256);
  if (!bytes || mesh.mime !== 'model/gltf-binary')
    failed(
      `meshy rig input is ${bytes ? `'${mesh.mime}'` : 'missing'}`,
      'pass a GLB (model/gltf-binary) and its bytes in job.inputs',
    );
  const glb = bytes as Uint8Array;
  const tris = glbTriangles(glb);
  if (tris > MESHY_RIG_TRIANGLES)
    failed(
      `meshy rig: the mesh has ${tris} triangles, Meshy rigs at most ${MESHY_RIG_TRIANGLES}`,
      'ask the mesh with maxTriangles ≤ 300000 (remeshed in the same call, no extra credits) or decimate it with a Blender step',
    );
  const height = r['height'];
  if (height !== undefined && !(typeof height === 'number' && height > 0 && height < 100))
    failed(`meshy rig: height is ${String(height)}`, 'pass the character height in metres');
  const p = readParams('rig', r['params'], RIG_PARAMS);
  const template = r['template'] ?? p['skeletonTemplate'];
  if (template !== undefined && !(MESHY_SKELETONS as readonly unknown[]).includes(template))
    failed(
      `meshy rig: template '${String(template)}' is not a Meshy skeleton`,
      `use one of: ${MESHY_SKELETONS.join(', ')} (or none: meshyrig)`,
    );
  const clips = (r['clips'] ?? []) as readonly string[];
  const actions = resolveClips(clips, clips.length ? await meshyAnimations(t) : []);
  const knobs = {
    ...(height === undefined ? {} : { height_meters: height }),
    ...(template === undefined ? {} : { skeleton_template: template }),
    ...(p['includeFingers'] === undefined ? {} : { include_fingers: p['includeFingers'] }),
  };
  const memo = `glb:${mesh.sha256}`;
  const upstream = t.store().get(memo);
  const upload = (): Promise<MeshyDone> =>
    t.run(
      'v1/rigging',
      { model_url: dataUri('rig mesh', glb, 'application/octet-stream', true), ...knobs },
      'rigging',
      deadline,
    );
  const rig = upstream
    ? await t
        .run('v1/rigging', { input_task_id: upstream, ...knobs }, 'rigging', deadline)
        .catch((e: unknown) => {
          // The upstream task's files are gone (kept 3 days): nothing was created, upload instead.
          if (!(e instanceof Error && /create rigging .*HTTP 404/.test(e.message))) throw e;
          t.store().delete(memo);
          return upload();
        })
    : await upload();
  const steps = [rig];
  let url = (rig.task['result'] as Record<string, unknown> | null)?.['rigged_character_glb_url'];
  if (actions.length) {
    const body = { rig_task_id: rig.id, action_ids: actions };
    const anim = await t.run('v1/animations', body, 'animation', deadline);
    steps.push(anim);
    url = (anim.task['result'] as Record<string, unknown> | null)?.['animation_glb_url'];
  }
  const out = await t.download(url, actions.length ? 'animation GLB' : 'rigged GLB', steps);
  t.forget(steps);
  return { steps, outputs: [{ bytes: out, mime: 'model/gltf-binary' }] };
}
