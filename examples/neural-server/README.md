# Reference model server (`t3d-neural/1`)

A small FastAPI server that runs AI models on **your own GPU** and answers ts23d's `http(…)`
adapter (`src/neural/http-adapter.ts`). Every model is a plug-in file in `plugins/`; a TOML profile
picks which run. It is an example: not in the npm package, not part of `bun run verify`, never
called by a build. Only `t3d neural run` talks to it, and what it returns is validated and cached
under `recipes/<name>/neural/` (ADR 014). Models and their licences are your choice (ADR 015).

## Quick start (no GPU)

```sh
cd examples/neural-server
uv run pytest                                          # contract test, dummy plug-ins
uv run server.py --profile profiles/dummy.toml         # http://127.0.0.1:8190
```

Then in your project, `t3d.config.ts` (start from `t3d.config.example.ts` at the repo root):

```ts
import { defineConfig, http } from '@developerz.ai/ts23d';
export const config = defineConfig({
  neural: { mesh: http('http://127.0.0.1:8190', 'pixal3d', { jobTimeoutMs: 1_800_000 }) },
});
```

```sh
bunx -p @developerz.ai/ts23d t3d neural ls                       # models the server offers, licence, VRAM
bunx -p @developerz.ai/ts23d t3d neural run recipes/wolf/wolf.ts # fills recipes/wolf/neural/<key>/ for every request that missed
```

From the repo root the test is `uv run --project examples/neural-server pytest examples/neural-server`.

## GPU setup (what ran on an RTX 3090 24 GB)

The GPU plug-ins import the model code from a checkout of the model repo and need its CUDA
extensions, so they run in a model venv, not in `uv run`'s server-only env. The server itself only
needs `fastapi` and `uvicorn` on top (already in that venv via the model requirements).

1. Python 3.12 venv; `torch==2.6.0 torchvision==0.21.0` from the cu124 index.
2. A local CUDA **12.4** toolkit for the extensions (torch refuses to build them with another CUDA
   major) and gcc ≤ 13 first on `PATH` (CUDA 12.4 rejects newer gcc).
3. Pixal3D `requirements.txt` (relax `trimesh` to `>=4.11`), the utils3d 0.0.2 wheel, the prebuilt
   `flash_attn-2.7.3+cu12torch2.6` wheel.
4. Build with `--no-build-isolation`: nvdiffrast v0.4.0, nvdiffrec (renderutils branch), CuMesh,
   FlexGEMM, TRELLIS.2's `o-voxel` (needs `git submodule update --init --recursive`).
5. Clone `github.com/TencentARC/Pixal3D` and `github.com/microsoft/TRELLIS.2`; set `repo` for each in
   your profile (copy `profiles/rtx3090.toml`).
6. `export HF_TOKEN=…` in the shell that starts the server (weights download on first use into
   `~/.cache/huggingface`; the token is never written anywhere). Download ahead of time
   (`hf download TencentARC/Pixal3D` …) so the first `GET /v1/models` already reports
   `weightsSha256`: the server hashes the cached snapshot at start, and that hash is part of every
   job key.

```sh
source <model venv>/bin/activate
python server.py --profile profiles/rtx3090.toml
```

Two dependencies are gated on Hugging Face and swapped automatically (`plugins/_trellis.py`):
`facebook/dinov3-vitl16-pretrain-lvd1689m` → `camenduru/` mirror (same weights) and
`briaai/RMBG-2.0` (**CC BY-NC 4.0**) → `ZhengPeng7/BiRefNet` (MIT). Set
`REMBG_MODEL=briaai/RMBG-2.0` after accepting its licence to keep the original.

Small cards (4–12 GB): run TRELLIS.2 from ComfyUI with GGUF weights and offloading:
[`../comfy-workflows/trellis2-low-vram.json`](../comfy-workflows/trellis2-low-vram.json)
(Aero-Ex/ComfyUI-Trellis2-GGUF nodes, Q4_K_M, 20 k triangles, 1024² texture).

## Plug-ins

Licences are of the model's **outputs** as its card states them, quoted verbatim after an SPDX id.
They are recorded in every `record.json` and never gate your builds; this repository refuses to
commit outputs whose licence does not allow publishing (ADR 015).

| id | task | model | licence (outputs) | status | measured |
|---|---|---|---|---|---|
| `pixal3d` | mesh | TencentARC/Pixal3D, `low_vram` 1024 cascade | MIT (gated download; the card disallows EU access) | **tested** (3090, wolf photo) | see below |
| `trellis2` | mesh | microsoft/TRELLIS.2-4B, 1024 cascade | MIT | **tested** (3090, wolf photo) | see below |
| `trellis2-texture` | texture | TRELLIS.2-4B texturing pipeline (keeps the mesh's UVs) | MIT | untested | – |
| `dinov2` | score | facebook/dinov2-base, CLS cosine × 10 | Apache-2.0 | **tested** (3090) | see below |
| `z-image` | image | Tongyi-MAI/Z-Image-Turbo (6B, 8 steps), the default local image model (kubeez hosts `z-image` too) | Apache-2.0 | **tested** (3090, wolf inputs) | see below |
| `qwen-image` | image | Qwen/Qwen-Image; `concept` / `turnaround` templates | Apache-2.0 | untested: 58 GB weights | – |
| `qwen-edit-split` | image | Qwen/Qwen-Image-Edit-2511; one part per job | Apache-2.0 | untested: 58 GB weights | – |
| `unirig` | rig | VAST-AI/UniRig launch scripts, own env (bpy, spconv) | MIT | ran 2026-11-16 (RTX 3090): a 30 k-triangle bear GLB with three LOD nodes → 27 bones (`bone_0…`: spine, head, two ears, four 4-bone legs) and skin weights on every LOD, about 60 s for skeleton + skin + merge | not measured (README: ≥ 8 GB) |
| `unimate` | motion | Friedrich-M/UniMate sample + animate, own env | **CC-BY-NC-4.0** (checkpoints; code MIT) | untested: needs a `rig_preprocess`ed asset | – |
| `hairdeck` | hair | hyz317/HairDeck `image_to_hair.py`, own env | Apache-2.0 | untested: gated SAM 3 / DINOv3 | – |
| `video-motion` | motion | MediaPipe Pose Landmarker (BlazePose GHUM 3D) | Apache-2.0 | **tested** (CPU, public-domain Muybridge clip) | see below |
| `dummy-mesh` / `-image` / `-score` | | deterministic fakes | CC0-1.0 | contract test | – |

Blender plug-ins (`blender_*.py`, `tool_*.py`: cloth, fracture, engine-check, ktx2, meshopt) are
documented in `examples/blender/`; scripts that import `bpy` are GPL-2.0-or-later. None of the
plug-ins above imports `bpy`: UniRig uses it inside its own env, through its own scripts.

Not included:
- **UltraTex** (2K multi-view texturing): its inference entry point reads a prepared G-buffer eval
  JSON, not a mesh, and its base models (FLUX.1-dev / FLUX.2-Klein) carry non-commercial licences;
  the weights' own licence is not stated (code: MIT). Wire it through ComfyUI-UltraTex if you need it.
- **SMPL-based video mocap** (WHAM, GVHMR, 4DHumans): the SMPL body-model licence forbids
  commercial use; `video-motion` uses MediaPipe instead.

### Measured on an RTX 3090 (whole-card `nvidia-smi` peak incl. ~1.5 GB desktop; cold = first job loads the model)

| job | wall (cold) | of which load | peak VRAM | output |
|---|---|---|---|---|
| `pixal3d` mesh, wolf photo, maxTriangles 40 000, 1024² texture | 165–187 s | 85–87 s | 18.5–18.7 GB | 37 619 tris, 3.8 MB GLB |
| `trellis2` mesh, same request, right after `pixal3d` | 264 s | 117 s | 23.0 GB | 36 356 tris, 6.8 MB GLB |
| `dinov2` score, render vs photo | 20 s (warm: 0.1 s) | 19 s | < 1 GB | JSON + score |
| `video-motion`, 20 frames of a 167×207 clip, CPU | 2 s | – | 0 | 57 KB JSON |
| `z-image` 1024² (CPU offload; ~4 GB of other apps on the card) | 97 s cold, 39–46 s warm | ~55 s | 20.6 GB | PNG |

GPU outputs are not bit-identical between runs (two Pixal3D runs of one request gave different
bytes): that is why they are cached and committed as inputs, never regenerated by a build.

Only one plug-in is resident at a time: a job for another model unloads the current one first.
GPU plug-ins run in a child process (`isolate = True`, `isolated.py`) that ends on unload: freeing
the pipelines in-process left ~6 GB held after Pixal3D and TRELLIS.2 then ran out of memory; with
isolation the card drops back to the desktop baseline and TRELLIS.2 after Pixal3D fits. A failing
job (out of memory, a crashed process) unloads its plug-in so the next job starts clean.

## One model per machine

Two model processes on one machine run out of memory (defect D54), so the rule is one loaded model
per machine. GPU plug-ins (`gpu = True`) take a machine-wide lease, an exclusive `flock` on
`$TS23D_HOME/gpu/machine.lock` (default `~/.ts23d`), before loading, and hold it while resident.
Any other server, or a script using `gpu.gpu_lease()`, waits its turn; the kernel drops the lock if
the holder dies. Inside the lease the server also waits until nvidia-smi reports the plug-in's
`vram_gb` + 1 GB free and `/proc/meminfo` MemAvailable covers its `ram_gb` + 4 GB (desktops, game
engines and other apps share the card and the RAM). While it waits, the job stays `queued` and
`GET /v1/jobs/{id}` says why (`waiting: "gpu busy: pid 4242 pixal3d (t3d-neural-server)"`,
`position`); `t3d neural run` prints that line. Profile `[server]` knobs: `gpu_wait_s` (1800; then
the job fails naming the holder), `idle_release_s` (120; an idle model is unloaded so others get
their turn), `vram_margin_gb` (1), `ram_margin_gb` (4).

**Lease and `t3d` queue.** The lease is the server's own rule and is always on. The `t3d` CLI adds
a queue in front of it (ADR 017 in the ts23d repo, `docs/decisions/017-machine-resource-queue.md`):
a job that `t3d neural run`, `t3d concept` or `t3d finish --model http` sends to a loopback URL
first takes the machine-wide `gpu` class, first come, first served, so clients line up before they
post and their wait does not eat the job deadline. `t3d queue status` shows that line and the
lease holder (`pid <n> <model>`, read from `machine.lock`). The queue never replaces the lease: a
lab script or a second server still meets it here.

```python
from gpu import gpu_lease  # lab scripts: same line, same lock

with gpu_lease("trellis2 lab run", need_gb=23, ram_gb=16):
    run_the_model()
```

## Requests and outputs per plug-in

| id | reads | params | returns |
|---|---|---|---|
| `pixal3d` | `image`, `seed`, `maxTriangles` | `resolution` 1024\|1536, `steps`, `fov` (rad), `triangles` (50 000), `texture_size` (1024) | GLB, glTF Y-up, photo camera frame |
| `trellis2` | `image`, `seed`, `maxTriangles` | `pipeline`, `triangles`, `texture_size` | GLB facing +X |
| `trellis2-texture` | `mesh` (GLB with UVs), `control[0]` (reference image), `size` | `resolution` | albedo PNG, metallic-roughness PNG |
| `dinov2` | `images[0]` render, `images[1..]` references | `model` | JSON `{cosine[], mean}`, score 0..10 |
| `z-image` | `prompt`, `width`, `height` | `template` raw\|concept\|turnaround, `steps` (9) | PNG |
| `qwen-image` | `prompt`, `negative`, `width`, `height` | `template` raw\|concept\|turnaround, `steps`, `cfg` | PNG |
| `qwen-edit-split` | `control[0]` concept, `prompt` | `part` head\|torso\|arms\|legs\|clothing\|hair\|weapon | PNG |
| `unirig` | `mesh` (GLB) | – | rigged GLB |
| `unimate` | `skeleton` JSON `{"unimate": "<asset ref>"}`, `prompt`, seconds × fps = 60 | – | animated GLB |
| `hairdeck` | `image` (character) | – | hair cards GLB, chains JSON |
| `video-motion` | `video`, `seconds`, `fps` | – | JSON `t3d-pose-tracks/1` (33 joints, metres) |

Mesh plug-ins decimate on the server to `min(params.triangles, 0.95 × maxTriangles)` and bake one
PNG texture, so a result fits the 12 MB committed recipe cache (ADR 014; larger outputs stay local with `keep: 'local'`) and passes ts23d's triangle cap.

## Write a plug-in

Drop `plugins/<name>.py` in; nothing else to edit. The registry imports every `plugins/*.py`
(except `base.py` and `_*.py` helpers) and registers each `Plugin` subclass defined there with a
`name`. Then enable it in a profile with a `[plugins.<name>]` table (its keys arrive as `options`).

```python
from plugins.base import Job, Output, Plugin, PluginError, Result, hf_weights_sha256


class MyMesher(Plugin):
    name = "my-mesher"  # model id on the wire
    task = "mesh"  # image | mesh | texture | rig | motion | hair | score
    licence = 'MIT (model card org/my-mesher: "license: mit")'  # SPDX id first, then verbatim
    vram_gb = 12.0  # measured peak, or None

    def available(self):  # None, or why it cannot run here (checked at start)
        return None if self.option_path("repo") else "set `repo` in the profile"

    def weights_sha256(self):  # names the exact weights; part of every job key
        return hf_weights_sha256("org/my-mesher")

    def load(self):  # import torch here, never at module level
        super().load()

    def unload(self):
        super().unload()

    def run(self, job: Job) -> Result:  # job.input("image") -> (bytes, mime); job.param(k, default)
        glb = ...
        return Result([Output("model/gltf-binary", glb)])
```

Rules the server enforces: each output's mime must be allowed for the task (the same table as
`NEURAL_MIMES` in `src/core/neural-task.ts`), outputs are non-empty, a `score` is within 0..10. A
plug-in that raises fails only its job. Models with their own environment (bpy, old numpy) use
`plugins/_proc.py` to run their documented CLI with that env's `python`.

## Wire contract

`GET /v1/models` → `[{ id, task, licence, weightsSha256?, vramGb? }]` ·
`POST /v1/jobs` ← `{ contract: "t3d-neural/1", task, model, request, inputs: { <sha256>: base64 } }`
→ `{ id }` · `GET /v1/jobs/{id}` → `{ status, error?, server, outputs?: [{ mime, data }], score? }`.
The server refuses (HTTP 400/404/413, JSON `{ error }`): another contract, an unknown model, a task
the model does not run, a request without an integer `seed`, input bytes that do not match their
sha256, an input the request names but the body lacks, inputs over `max_input_mb`. Finished jobs
are kept for the last `keep_jobs`. It binds 127.0.0.1 by default and has no authentication: put
it behind your own proxy before exposing it.

## Needs on the TypeScript side (not in this example)

- `comfyAdapter` runs image/texture workflows only and does not upload inputs, so the low-VRAM
  TRELLIS.2 workflow needs a `mesh` mode (upload the photo, fetch the exported GLB) to be used
  from `t3d.config.ts`.
