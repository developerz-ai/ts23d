// The input-image gate of `t3d neural run` (D55: cluttered photos make broken AI meshes): every
// view of a `mesh` request — `image` and each of `images` (multi-image models such as Meshy
// multi-image-to-3d), numbered 0… in that order — must pass the input-image rules
// (render/input-image.ts) BEFORE anything is sent. A view without bytes is always an error.

import { isTs23dError, type NeuralRequests, Ts23dError } from '../core/index.ts';
import { decodePng } from '../material/index.ts';
import type { NeuralJob } from '../neural/index.ts';
import { checkInputImage } from '../render/index.ts';

const CLEAN_FIX =
  'generate a clean concept: t3d concept <recipe> (plain background, ¾ view, full frame), or strip the background with an image/segment model';

/**
 * A failing view is T3D_NEURAL_INPUT. With `allowBadInput` the findings come back instead, each
 * prefixed with its view, to print and to record in record.json.
 */
export function checkMeshInputs(recipe: string, job: NeuralJob, allowBadInput = false): string[] {
  if (job.task !== 'mesh') return [];
  const r = job.request as NeuralRequests['mesh'];
  const views = [...(r.image ? [r.image] : []), ...(r.images ?? [])];
  return views.flatMap((image, i) => {
    const where = `${recipe}: mesh input image ${i} ${image.sha256.slice(0, 12)}…`;
    const bytes = job.inputs?.get(image.sha256);
    if (!bytes)
      throw new Ts23dError('T3D_NEURAL_INPUT', {
        cause: `${where}: has no bytes`,
        fix: "pass every view's bytes in ctx.neural(…, { inputs: new Map([[sha256, bytes]]) })",
      });
    const fail = (findings: readonly string[]): string[] => {
      if (allowBadInput) return findings.map((f) => `${where}: ${f} (allowed: --allow-bad-input)`);
      throw new Ts23dError('T3D_NEURAL_INPUT', {
        cause: `${where}: ${findings.join('; ')}`,
        fix: CLEAN_FIX,
      });
    };
    if (image.mime !== 'image/png')
      return fail([`is ${image.mime}: only PNG inputs can be checked`]);
    let png: { data: Uint8Array; width: number; height: number };
    try {
      png = decodePng(bytes, (cause) => {
        throw new Ts23dError('T3D_NEURAL_INPUT', {
          cause: `${where}: ${cause}`,
          fix: 'pass an 8-bit PNG',
        });
      });
    } catch (e) {
      if (!isTs23dError(e)) throw e;
      return fail([e.message]);
    }
    const { findings } = checkInputImage(png.data, png.width, png.height);
    return findings.length ? fail(findings.map((f) => `${f.rule}: ${f.message}`)) : [];
  });
}
