// httpFinish: the seam to a real image model on the user's machine (a small ComfyUI / diffusers
// wrapper with ControlNet depth + normal) or a hosted provider. One POST of JSON:
//   { model?, prompt, negative, seed, palette, views: [{ name, width, height, camera,
//     maps: { depth, normal, normal_world, part, uv, albedo, beauty? } }], legend }
// maps are base64 PNGs exactly as `exportControlMaps` writes them. Expected reply:
//   { images: [<base64 PNG per view, same order and size>], licence?: string }
// Keys are the caller's (`headers`), never read from the environment. Never runs in the gate:
// results go through the cache (cache.ts) and replay offline.

import { Ts23dError } from '../core/index.ts';
import { exportControlMaps } from './control-maps.ts';
import type { FinishModel, FinishRequest } from './types.ts';

export interface HttpFinishOptions {
  readonly endpoint: string;
  /** Model name sent to the server and recorded in the cache key + provenance. */
  readonly model?: string;
  readonly headers?: Readonly<Record<string, string>>;
  /** Licence / terms of the server's outputs, recorded in the provenance. */
  readonly licence?: string;
  /** Injected fetch (tests, proxies). Default: global fetch. */
  readonly fetch?: (
    url: string,
    init: { method: string; headers: Record<string, string>; body: string },
  ) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
}

const b64 = (b: Uint8Array): string => Buffer.from(b).toString('base64');

function fail(cause: string, endpoint: string): never {
  throw new Ts23dError('T3D_FINISH_MODEL', {
    cause: `${endpoint}: ${cause}`,
    fix: 'start the finish server and check it answers {"images": [base64 PNG per view]} (docs/idea/22-ai-finish.md), or use --model mock',
  });
}

export function requestBody(req: FinishRequest, model: string | undefined): string {
  const maps = exportControlMaps(req.views).files;
  const json = (path: string): unknown => JSON.parse(new TextDecoder().decode(maps.get(path)));
  return JSON.stringify({
    ...(model ? { model } : {}),
    prompt: req.prompt,
    negative: req.negative ?? '',
    seed: req.seed,
    palette: req.palette ?? [],
    legend: json('legend.json'),
    views: req.views.views.map((v) => ({
      name: v.name,
      width: v.width,
      height: v.height,
      camera: v.camera,
      maps: Object.fromEntries(
        ['depth', 'normal', 'normal_world', 'part', 'uv', 'albedo', 'beauty'].flatMap((m) => {
          const f = maps.get(`${v.name}/${m}.png`);
          return f ? [[m, b64(f)]] : [];
        }),
      ),
    })),
  });
}

export function httpFinish(o: HttpFinishOptions): FinishModel {
  if (!/^https?:\/\//.test(o.endpoint))
    throw new Ts23dError('T3D_FINISH_INVALID', {
      cause: `endpoint "${o.endpoint}" is not an http(s) URL`,
      fix: 'pass e.g. --endpoint http://127.0.0.1:8188/ts23d-finish',
    });
  const go = o.fetch ?? ((url, init) => fetch(url, init));
  return {
    id: `http:${o.model ?? 'default'}@${o.endpoint}`,
    licence: o.licence ?? 'per the model / provider terms (not declared: set licence)',
    async run(req) {
      const res = await go(o.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(o.headers ?? {}) },
        body: requestBody(req, o.model),
      }).catch((e: unknown) =>
        fail(`request failed (${e instanceof Error ? e.message : String(e)})`, o.endpoint),
      );
      if (!res.ok) fail(`HTTP ${res.status}`, o.endpoint);
      const body = (await res.json().catch(() => fail('reply is not JSON', o.endpoint))) as {
        images?: unknown;
      };
      const images = body.images;
      if (!Array.isArray(images) || !images.every((s) => typeof s === 'string'))
        fail('reply has no "images" array of base64 strings', o.endpoint);
      return (images as string[]).map((s) => new Uint8Array(Buffer.from(s, 'base64')));
    },
  };
}
