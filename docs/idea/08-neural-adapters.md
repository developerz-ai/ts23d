# 08 — Neural adapters

**Optional. Never a core dependency. Any model, through an adapter. Outputs are committed inputs to the build, cached by content hash, validated before use; CI never runs a model.** Source: `src/neural/`. Decisions: [ADR 014](../decisions/014-neural-outputs-are-cached-inputs.md) (outputs are cached inputs, committed with the recipe) and [ADR 015](../decisions/015-models-by-adapter.md) (models are the user's choice; licences recorded, not gated). Status as of 2026-11.

## Why

Recipes are weak on living things and sculpted forms ([07](07-what-fits.md)). Models are strong there: image, image-to-3D, texture, rig, motion, hair, scoring. ts23d defines the **tasks** and their request / result shapes; you plug in whatever model you can run. No model is bundled or required.

## Status (as of 2026-11)

| Entry point | Status | Notes |
|---|---|---|
| `NeuralAdapter`, `runJob`, `jobKey` | Shipped | The contract and the one way a job reaches a model (`adapter.ts`) |
| `httpAdapter` / `http(url, model)` | Shipped | `t3d-neural/1` wire protocol, below |
| `comfyAdapter` | Shipped | Your ComfyUI workflow (API format) for `image` / `texture`; no input upload yet |
| `openaiImageAdapter` / `openaiImage(url, model)` | Shipped | Any OpenAI-compatible `/v1/images/generations` for `image` |
| `kubeezAdapter({ apiKey, model?, baseUrl?, resolution? })` | Shipped | kubeez.com (partner, disclosed below) for `image`, text-to-image or image-to-image; for users without a GPU |
| `mockAdapter` | Shipped | Deterministic fake for every task: tests, demos, CI |
| `neuralCache`, `provideNeural`, `providedNeural` | Shipped | The per-recipe committed cache (`recipe-cache.ts`) |
| `t3d neural run` / `t3d neural ls` | Shipped | Fill the cache; list configured models (`src/cli/neural-cmd.ts`) |
| `localGenerator` | Shipped | Thin wrapper over the `mesh` task on a `t3d-neural/1` server |
| `refine`, `t3d finish --model http`, `neuralFinish` | Shipped | `neuralFinish(adapter)` runs a finish as one `image` job per view |
| `ctx.neural(task, req)` in recipes | Shipped (plan 101 slice 15) | Reads the provided recipe cache (`provideNeural` serves it): hit → validated bytes, miss → `null`, the CPU path; `recipes/wolf_hybrid` is the demo |
| `importGlb` | Shipped | [21-import](21-import.md) |

## Tasks

`NEURAL_TASKS` in `src/core/neural-task.ts`: `image`, `mesh`, `texture`, `rig`, `motion`, `hair`, `score`. Every request carries `seed` and optional `params`; inputs (images, meshes, skeletons) are named by sha256, the bytes travel beside the request. Every output is bytes + mime.

| Task | Validation before use (`T3D_NEURAL_OUTPUT_INVALID`) |
|---|---|
| `image` | PNG decodes, at the asked `width × height` |
| `texture` | PNG decodes, `size × size` |
| `mesh` | GLB parses, finite positions, at least one triangle, ≤ `maxTriangles` |
| `rig` | GLB with a skin, or JSON |
| `motion`, `hair` | GLB or JSON that parses |
| `score` | Score in 0..10, JSON / PNG outputs |

## Adapters

```ts
interface NeuralAdapter {
  id: string;                                   // 'http:http://gpu:8190', 'comfy:…', 'mock'
  tasks: readonly NeuralTask[];
  models(): Promise<NeuralModelInfo[]>;         // { id, task, licence, weightsSha256?, vramGb? }
  run<T>(job: NeuralJob<T>): Promise<NeuralRun<T>>;  // { result, model, server? }
}
```

Write your own in a few lines: map the request to your server, return outputs as bytes + mime. `runJob(adapter, job)` checks the inputs against their bytes, runs it and validates every output.

### `t3d-neural/1` (http adapter)

| Call | Body / reply |
|---|---|
| `GET /v1/models` | `[{ id, task, licence, weightsSha256?, vramGb? }]` |
| `POST /v1/jobs` | `{ contract: 't3d-neural/1', task, model, request, inputs: { <sha256>: base64 } }` → `{ id }` |
| `GET /v1/jobs/:id` | `{ status: queued \| running \| done \| failed, error?, server?, outputs?: [{ mime, data: base64 }], score? }` |

Every request has a deadline (`timeoutMs`, 60 s) and a reply cap (`maxBytes`, 64 MB, checked on `content-length` and on the body); the whole job has its own deadline (`jobTimeoutMs`, 30 min). Replies must be `application/json`. HTTP errors, failed jobs and timeouts are `T3D_NEURAL_FAILED` with a fix; a reply of the wrong type, size or mime is `T3D_NEURAL_OUTPUT_INVALID`.

## Configure: `t3d.config.ts`

```ts
import { defineConfig, http, openaiImage, comfyAdapter } from '@developerz.ai/ts23d';

export const config = defineConfig({
  neural: {
    mesh: http('http://gpu:8190', 'pixal3d'),
    image: openaiImage('http://127.0.0.1:8080', 'sdxl', { headers: { authorization: `Bearer ${key}` } }),
  },
  requireNeural: false,
});
```

Keys go in `headers`; the library never reads the environment.

## The cache (ADR 014)

```
recipes/<name>/neural/<key>/output-0.png
                           record.json   model, licence, weights hash, adapter, server, request, output hashes
```

| Rule | |
|---|---|
| Job key | sha256 of canonical JSON `{contract, task, model, weightsSha256, request}`: sorted keys, floats rounded to 1e-6. Changes with seed, model, weights, params, inputs |
| Lookup in a build | By request (`requestKey`), optionally pinned to a model; lowest key wins when several models answered |
| Cap | 8 MB of outputs per recipe; `fill` refuses past it (`T3D_NEURAL_FAILED`) |
| Hit | No GPU, no network. Files and record are re-hashed and re-validated on load |
| Miss | `{ fallback: true }` + a `T3D_NEURAL_MISSING` notice naming `t3d neural run`; the recipe takes its CPU path |
| `--require-neural` | A miss is an error |
| Fill | `t3d neural run <recipe.ts>`: compiles LOD 0-2, collects the misses, runs each through the task's configured adapter, writes the key directory |
| Licence | Recorded in `record.json` and the credits, never gated for your builds. This repository's recipes gate refuses committed outputs whose licence does not allow publishing (`publishable`, ADR 015) |

`.ts23d/neural/` is superseded. `t3d finish` still caches in the gitignored `.ts23d/finish/` until it moves to the recipe cache.

## Hybrid recipes (code skeleton, model surface)

Code owns skeleton, measures, rig, LODs and QA; a model may supply the surface, texture, motion,
hair or concept images. Prompts, seeds and models are TypeScript in the recipe folder
(`concept.ts`, `surface.ts`); outputs come from the committed cache, so a build never calls a model.

| Piece | Where | Does |
|---|---|---|
| `ctx.neural(task, req, { model, inputs })` | core/neural-ctx.ts | cached result or `null` |
| `meshBrick` / `meshField` / `meshDetail` / `displaceMesh` | primitives/sculpt-mesh-*.ts | mesh → int16 brick SDF (winding-number sign, Lipschitz-clamped) → sculpt edit, or its high-pass as relief |
| `similarityFit` / `fitToSurface` | primitives/similarity-fit.ts | landmark or trimmed-ICP similarity onto the code body |
| `closestColour` / `projectViews` / `highPassOver` / `delight` | finish/neural-texture.ts | model texture or 12-view projection → high-pass over the recipe colours |
| `cropPart` / `splitParts` | finish/split-parts.ts | concept cropped per part (part masks) → mesh per part → fitted into its box → blended fields |
| `neuralMotionClip` / `hairRig` | kinds/neural-motion.ts, neural-hair.ts | motion JSON → whole-cycle, foot-locked clip; hair cards → spring chains |
| `t3d concept` | cli/concept-cmd.ts | CPU silhouette sheet + `concept.ts`; fills its image requests with an `image` adapter |
| `refFromConcept` | qa/ref-from-concept.ts | turnaround → ref.json for invented assets |

A `mesh` request's PNG passes the input-image rules (render/input-image.ts) before `t3d neural
run` sends it: an image our cache generated fails hard, a user's image gets a notice.

## Models worth wrapping

Facts from [landscape.md](../landscape.md), as of 2026-10. Check each licence yourself before shipping outputs.

| Model | Input | Licence | GPU | Note |
|---|---|---|---|---|
| TRELLIS.2 (Microsoft) | Single image | MIT | ≥ 24 GB, tested on A100/H100 | PBR GLB; can texture an existing mesh |
| Hunyuan3D 2.1 (Tencent) | Image, multi-view | Tencent community licence: excludes EU/UK/South Korea, terms above 1M MAU, no training other models on outputs | ~29 GB shape + texture | Read the licence before relying on it |
| SF3D / SPAR3D (Stability) | Single image 512² | Stability Community Licence: free under $1M revenue | See model card | UV-unwrapped, delighted textures; SPAR3D adds point-cloud editing |

## No GPU: kubeez.com

**Disclosure: ts23d works with [kubeez.com](https://kubeez.com) as a partner.** It is one hosted option for the `image` task; every other adapter works the same way, and nothing in ts23d requires it.

```ts
import { defineConfig, kubeezAdapter } from '@developerz.ai/ts23d';
export const config = defineConfig({
  neural: { image: kubeezAdapter({ apiKey: process.env.KUBEEZ_API_KEY }) },
});
```

| Step | API (`https://api.kubeez.com/v1`, header `X-API-Key: sk_live_…`) |
|---|---|
| Models (`t3d neural ls`, with cost) | `GET /models?model_type=image` → `models[].model_id`, `cost_per_generation` |
| Source images (image-to-image) | Each `control` input → `POST /upload/media` (multipart `file`) → `urls[0]` → `source_media_urls` |
| Generate | `POST /generate/media` `{ prompt, model, generation_type, aspect_ratio, seed, output_format: 'png', negative_prompt?, resolution? }` → `generation_id` |
| Poll | `GET /generate/media/{id}` until `completed` with every `outputs[].url` set (the CDN can lag: keep polling) or `failed` |
| Download | Each URL, **without** the API key (another host); the PNG is centre-cropped to the asked aspect and resampled to `width × height` (`png-fit.ts`) |

HTTP 429 backs off (doubling, honouring the job deadline); 401/402/403 are `T3D_NEURAL_FAILED` with a fix (403: the key needs the `generate:media` scope). The key is the caller's: the library never reads the environment, and the key never reaches `record.json`, the cache, logs or errors. Records carry licence `own` and `terms: https://kubeez.com/legal/terms` (Kubeez terms: you retain the rights to outputs generated using your prompts, subject to third-party rights). Seeds pass through; determinism comes from the committed cache, as for any model.

## Non-goals

- Bundling model weights or a Python runtime. Adapters speak HTTP to a server you run.
- Running a model inside `t3d build`: outputs are inputs, filled explicitly.
- Hosted inference billed through ts23d.
- Making generated meshes the default path for anything recipes already do well.
