# Research — Meshy (meshy.ai): what the API does, what it costs, and what ts23d should wrap

**Meshy is a hosted, paid-API 3D generator: image / multi-image / text → textured GLB in 1–4 min,
plus post-processing (remesh, retexture, UV unwrap, rig, animate). It has no seed, keeps files 3
days and needs a paid plan for any API key, so in ts23d it is one more `NeuralAdapter` behind the
committed content-hash cache, never a build-time dependency. Wrap next, in order: harden
image-to-3D (shipped) → Retexture (texture OUR code mesh, no registration) → Multi-Image-to-3D
(front/side/back concepts) → Remesh + UV Unwrap as post-passes for imported meshes → Rigging +
Animation (bipeds only, as an import path). A typical asset costs 15–35 credits (≈ $0.15–0.70).**

Research as of 2026-11-16, from docs.meshy.ai (API reference, pricing, changelog, `llms-full.txt`)
and the Meshy help centre. `www.meshy.ai` (pricing, terms) answers 403 to automated clients;
claims taken from secondary sources are marked *(3rd-party)*, unread ones *(unverified)*. Nothing
here called the Meshy API. Positioning: Meshy is a commercial service ts23d can drive; ts23d stays
the free, code-based option and finishes what any generator produces
([21-import](../idea/21-import.md), [08-neural-adapters](../idea/08-neural-adapters.md)).

Related: `src/neural/meshy-adapter.ts` (shipped `mesh` task: image-to-3D, text-to-3D preview +
optional refine), [`docs/landscape.md`](../landscape.md) (Meshy row), `recipes/wolf_hybrid`
(the hybrid chain this would plug into).

## 1. Rules for any Meshy wrapper (from the docs, binding)

| Rule | Why (source) |
|---|---|
| Cache every output by content hash; CI runs offline | No `seed` parameter on any endpoint (`llms-full.txt`, 0 matches): same request ≠ same bytes. Determinism comes only from the committed cache + `record.json` |
| Download at `SUCCEEDED`, never store a Meshy URL | Files deleted after **3 days** on every plan but Enterprise; signed URLs stop at `expires_at` ([asset retention](https://docs.meshy.ai/en/api/asset-retention)) |
| Never re-POST after a timeout / dropped connection / 5xx | No idempotency key; the task may exist and is already charged. List newest tasks (`sort_by=-created_at`) after ~1 min instead ([task lifecycle](https://docs.meshy.ai/en/api/task-lifecycle)) |
| Record the task id before polling; resume by id | Recommended overall wait ≥ **60 min** from `created_at` (median 1–4 min, long tail at peak) |
| Poll at `Retry-After` or 5 s; GET timeout 30 s, POST 60 s (120 s with a > 100 MB `model_url`) | Polls count toward the rate limit (same page) |
| Two kinds of 429 | `Rate limit exceeded` → wait `Retry-After`. `NoMorePendingTasks` / `NoMoreConcurrentTasks` → no header; wait for one of your tasks to finish ([rate limits](https://docs.meshy.ai/en/api/rate-limits)) |
| `DELETE` cancels only `PENDING` (refunded); `IN_PROGRESS` → 409 and keeps running | [image-to-3d](https://docs.meshy.ai/en/api/image-to-3d) |
| `FAILED` = refunded (`consumed_credits: 0`) | every endpoint page |
| Key only from the server side, `Authorization: Bearer msy_…` | "Don't call the API from browser JavaScript" (`llms-full.txt` §11): the gallery must never hold a key |
| Send `target_formats: ["glb"]` | Default generates glb + obj + fbx + stl + usdz; we only read GLB |

## 2. Capabilities (API, `https://api.meshy.ai/openapi/…`)

Every endpoint: `POST` create → `{ result: id }`; `GET /:id`; `GET /:id/stream` (SSE);
`GET` list (`page_num` ≤ 255, `page_size` ≤ 100); `DELETE /:id`. Status `PENDING → IN_PROGRESS →
SUCCEEDED | FAILED | CANCELED`; `progress` 0–100; `consumed_credits`; `preceding_tasks` (queue).

| Endpoint | Path | Input | Output | Credits |
|---|---|---|---|---|
| Text to 3D preview | `v2/text-to-3d` (`mode: preview`) | prompt ≤ 800 chars | untextured mesh | 20 (7.1 / 6) · 5 (6-lite, t2, t2.5) |
| Text to 3D refine | `v2/text-to-3d` (`mode: refine`, `preview_task_id`) | `texture_prompt` or `texture_image_url` | textured mesh | 10 (2K/4K) · 15 (8K) |
| Image to 3D | `v1/image-to-3d` | `image_url` (URL or data URI; jpg/png/webp, ≤ 20 MB, ≥ 32 px) or `input_task_id` (a text-to-image task) | GLB (+ PBR maps) | mesh 20 / 2K-4K tex 30 / 8K 35 (7.1, 6); 5 / 15 (6-lite, t2.x) |
| Multi-Image to 3D | `v1/multi-image-to-3d` | 1–4 `image_urls`, first = front on 7.1; optional `texture_image_urls` | same | as image-to-3D; no t2.x, no `4k` geometry |
| Retexture | `v1/retexture` | `input_task_id` or `model_url` (GLB/glTF/OBJ/FBX/STL ≤ 400 MB URL, 100 MB data URI) + `text_style_prompt` or `image_style_url`; `enable_original_uv` | new textures on the same mesh | 10 (2K/4K) · 15 (8K) |
| Remesh | `v1/remesh` | task or `model_url`; `topology` `triangle`/`quad`; `target_polycount` 100–300 000 or `decimation_mode` 1–4 | glb (default) / fbx / obj / usdz / blend / stl / 3mf; textures kept | 5 |
| UV Unwrap | `v1/uv-unwrap` | GLB ≤ **40 000 faces** | same shape, fresh UVs, grey material | 5 |
| Convert · Resize | `v1/convert` · `v1/resize` | format change · `resize_height` / `resize_longest_side` (m) / `auto_size`, `origin_at` | | 1 · 1 |
| Rigging | `v1/rigging` | textured humanoid, ≤ 380 000 tris, face toward **+Z**, GLB, `height_meters` (1.7), `skeleton_template`, `include_fingers` | rigged GLB + FBX, walk + run clips | 5 |
| Animation | `v1/animations` (+ free `GET …/library`) | `rig_task_id` + 1–10 `action_ids` or a `motion_task_id`; `post_process` (fps 24/25/30/60, fbx→usdz, armature) | GLB / FBX, one clip per action | 3 per action |
| Text to Motion | `v1/text-to-motion` | prompt ≤ 400 chars, `duration` 2–10 s, `mode` `prime` / `swift` | FBX (prime) / BVH (swift) clip, no character | 10 / 3 |
| Text to Image · Image to Image | `v1/text-to-image` · `v1/image-to-image` | prompt, `ai_model` (nano-banana family, gpt-image-2.x), `aspect_ratio`, `generate_multi_view`, `pose_mode`, `remove_background` | PNG(s) | 3–9 · 3–12 |
| Auto Split | `v1/print/split` | Meshy 6/7 task, ≤ 8 M faces | parts as separate objects, flat colour per part unless `keep_texture` | 10 |
| Print / Relief / Creative Lab | `v1/print/*`, `v1/relief`, `creative-lab/*` | 3D-print merchandise | | 0–50 (out of scope) |
| Balance · Usage | `v1/balance` · usage (Studio/Enterprise) | | credits left | 0 |

Sources: [text-to-3d](https://docs.meshy.ai/en/api/text-to-3d) · [image-to-3d](https://docs.meshy.ai/en/api/image-to-3d) · [multi-image-to-3d](https://docs.meshy.ai/en/api/multi-image-to-3d) · [retexture](https://docs.meshy.ai/en/api/retexture) · [remesh](https://docs.meshy.ai/en/api/remesh) · [uv-unwrap](https://docs.meshy.ai/en/api/uv-unwrap) · [rigging](https://docs.meshy.ai/en/api/rigging) · [animation](https://docs.meshy.ai/en/api/animation) · [text-to-motion](https://docs.meshy.ai/en/api/text-to-motion) · [text-to-image](https://docs.meshy.ai/en/api/text-to-image) · [pricing](https://docs.meshy.ai/en/api/pricing).

### 2.1 Generation parameters (image-to-3D; text-to-3D preview takes the same geometry set)

| Parameter | Values | Notes for ts23d |
|---|---|---|
| `model_type` | `standard` · `smart-topology` | Smart Topology = low-poly game mesh, triangles only |
| `ai_model` | `latest` (= `meshy-7.1`), `meshy-7.1`, `meshy-6`, `meshy-6-lite`; smart: `meshy-t2`, `meshy-t2.5` (default) | `meshy-7` retires 2026-12-31 (400 after); `lowpoly` / T1 → 400 from 2026-11-30; `meshy-5` retired 2026-10-10 |
| `geometry_resolution` | `standard` · `2k` · `4k` (7.1 only; `4k` not on multi-image) | +5 credits; `4k` reaches ~10 M faces |
| `should_remesh` · `topology` · `target_polycount` · `decimation_mode` | remesh default on only for 6-lite; `triangle`/`quad`; 100–300 000 (standard), **100–15 000 (t2)**, 100–30 000 (t2.5); 1–4 overrides polycount | Remesh inside the generation call costs nothing extra; `save_pre_remeshed_model` also returns the dense GLB |
| `should_texture` · `texture_model` | `meshy-7` (PBR, 2K–8K), `meshy-n1` (2K base colour only, from reference images), `meshy-6-lite`, `meshy-6` (only one with emission) | Non-default texture model = mesh price + retexture price |
| `enable_pbr` | adds metallic, roughness, normal (+ emission on meshy-6) | Separate PNG maps in `texture_urls` |
| `texture_resolution` | `2k` · `4k` · `8k` | 8K = no emission, 35 credits |
| `texture_prompt` / `texture_image_url` | ≤ 800 chars / image | prompt wins if both sent |
| `remove_lighting` | default true, **meshy-6 texture model only**; 7 / 7.1 ignore it | De-lighting is not a parameter on the default 7.1 path |
| `pose_mode` | `a-pose` · `t-pose` · omitted | For anything that will be rigged |
| `image_enhancement` | default true (6, 7.1) | `false` keeps the input image's exact look: use for our own concept images |
| `symmetry_mode`, `art_style`, `is_a_t_pose`, `surface_mode`, `ultra_mode`, `hd_texture` | deprecated / no effect | Do not send |
| `auto_size` + `origin_at` | AI-estimated real height | We fit by `real` height ourselves; leave off |
| `alpha_thumbnail`, `multi_view_thumbnails` | 4 × 512² views (+~5 s) | Cheap pre-download sanity check for an agent |
| `moderation` | default false | |

### 2.2 Outputs

- `model_urls`: `glb`, `fbx`, `obj` + `mtl`, `usdz` (metres since 2026-10-12), `stl`, `3mf` on request, `pre_remeshed_glb`.
- `texture_urls[0]`: `base_color` always; `metallic`, `roughness`, `normal`, `emission` per options.
- Size: standard 7.1 ≈ 890 k faces, 6 ≈ 680 k, 6-lite 30 k (remeshed), t2 ≈ 4.4 k, t2.5 ≈ 15.7 k
  (example outputs on [models](https://docs.meshy.ai/en/api/models)).
- Rigging: default 24-bone `meshyrig` in **centimetres**; other templates (`mixamo`, `ue5_mannequin`,
  `unity_humanoid`, `blender_rigify_basic_human`, `daz_genesis9`, …) in metres, clip named
  `retarget_clip`. API rigging is for bipeds; quadruped rigs exist (web app "auto-rigs humanoid
  and quadruped") but reject `skeleton_template`, fingers and text-to-motion.

### 2.3 Timing (median, production, Sept 2026, task-lifecycle page)

| | 7.1 | 6 | 6-lite | t2 |
|---|---|---|---|---|
| Image to 3D, mesh only | 75 s | 90 s | 40 s | 4 s |
| Image to 3D, 2K textures | 2 min | 3 min | 75 s | 60 s |
| Image to 3D, 8K textures | 3.5 min | 4 min | — | 2.5 min |
| Multi-Image, 2K textures | 2.5 min | 3.5 min | 85 s | — |

PBR adds 30–60 s; ultra geometry up to 1 min.

### 2.4 Rate limits and webhooks

| Plan | Req/s | Concurrent tasks |
|---|---|---|
| Pro | 20 | 10 |
| Premium | 20 | 30 |
| Studio | 20 | 60 (20 on older plans) |
| Ultra | 20 | 100 |
| Enterprise | 100 | 100 / custom |

Headers: `Retry-After`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.
**Webhooks** ([docs](https://docs.meshy.ai/en/api/webhooks)): HTTPS only, ≤ 5 active / 10 total per
account, every active hook gets every task; body = task object; auth is a shared secret in
`X-MESHY-API-WEBHOOK-SECRET-KEY` (no HMAC signature); out-of-order and duplicate deliveries;
retries ×4 (in progress) / ×9 (final). ts23d has no server: **polling stays right for us**.

### 2.5 Agent tooling Meshy ships

MCP server `@meshy-ai/meshy-mcp-server` (tools for every endpoint above), skill pack
`meshy-dev/meshy-3d-agent`, CLI `meshy-cli` (browser sign-in), `llms.txt` / `llms-full.txt`, `.md`
on every page ([AI integration](https://docs.meshy.ai/en/api/ai)). An agent can already call
Meshy directly; ts23d's value is the part after: cache, record, licence, import, register, LOD,
QA, renders.

## 3. Plans, credits, free tier

| Plan | $/month | Credits/month | API | $/credit |
|---|---|---|---|---|
| Free | 0 | 100 | **No keys** (Playground built-in test key, image-to-3D only); API → 402 | — |
| Pro | 20 | 1,000 *(3rd-party)* | yes | 0.020 |
| Premium | 40 | 3,000 *(3rd-party)* | yes | 0.013 |
| Studio | 70 / team | 4,000 *(3rd-party)* | yes | 0.018 |
| Ultra | 100 | 10,000 per CostBench 2026-11-05; 8,000 in our `landscape.md` *(conflict, unverified)* | yes | 0.010–0.013 |
| Enterprise | custom | custom | yes, files kept indefinitely | — |

- Paid plans share "API access, unlimited downloads, commercial rights"; differ in credits
  ([help: plans](https://help.meshy.ai/en/articles/12062933-meshy-pricing-plans-free-pro-studio-enterprise)).
  Credits reset monthly at 00:00 UTC on the 1st; packs don't expire; failed tasks refunded
  ([webapp pricing](https://docs.meshy.ai/en/webapp/pricing)).
- Free plan: 100 credits, CC BY 4.0, download limits on Meshy 6/7 models *(3rd-party, varies by
  date)*; a "Starter" plan in some countries (250 credits, 20 downloads).
- Web app differs from API pricing: remesh and rigging cost 0 credits in the web app, 5 each by API.

## 4. Licence and ownership

| Source of the GLB | Licence | ts23d `licence` | Gallery + npm package OK? |
|---|---|---|---|
| API (any key = paid plan) | "full private ownership of all assets you create" provided inputs don't infringe and the asset isn't published to the Meshy Community ([help: ownership](https://help.meshy.ai/en/articles/10137554-what-is-the-ownership-of-the-generated-models)) | `own` + terms URL | Yes: the owner may release it under the repo's MIT licence; credit line in `record.json` / NOTICE as courtesy |
| Web app, Free plan, then `importGlb` | CC BY 4.0, credit "Model created with Meshy – CC BY 4.0 License" ([help: commercial](https://help.meshy.ai/en/articles/9992001-can-i-use-my-generated-assets-for-commercial-projects)) | `CC-BY-4.0` | Yes, with the credit carried in the manifest and NOTICE (CC BY allows redistribution and commercial use) |
| Paid-plan asset after downgrade | keeps paid rights *(3rd-party)* | `own` | Yes |

Facts that matter for this repo:
- `recipes/*/neural/**` (GLB + `record.json`) **ships in the npm tarball** (`package.json` `files`
  includes `recipes`, excludes only tests, PNGs and `out/`). A committed Meshy GLB is redistributed
  on npm, so only `own` or CC BY outputs may be committed.
- Our input image must be ours to give: a Z-Image-Turbo concept (Apache-2.0 model, our prompt)
  qualifies; a scraped photo does not.
- *(unverified)* The Terms of Use page (`meshy.ai/terms-of-use`) returned 403; its clauses on the
  licence Meshy takes over inputs/outputs (training, marketing) and any output-use restrictions
  were not read. Read it in a browser before the first committed Meshy asset and record the
  date in `record.json`.

## 5. Quality (facts, sources noted)

| Area | Observation | Source |
|---|---|---|
| Image fidelity, hard-surface | Cars from 1 Ultra-4K image or 4 views "accurate in every dimension"; latticed grilles and intricate rims not fully resolved | VoxelMatters, Meshy 7/7.1, 2026-09-30 (hands-on) |
| Dense output | Default (standard) meshes are 0.1–1.5 M faces; "consistently produced more faces than necessary", even for a cube; non-manifold edges needed repair | 3D Printing Industry, Meshy 6, 2026-09-07 (hands-on) |
| Topology | Triangulated and uneven unless remeshed or Smart Topology; reviewers call topology the main weakness for game use | Techsy, G2 user reviews *(3rd-party aggregators)*; Neural4D *(competitor blog)* |
| Faces, eyes, hands | Meshy 7: hands have the right finger count but artefacts (fur on a hand); "faces, especially eyeballs … problematic"; earlier versions "good from the front, disastrous from the back" | 3DPrint.com, 2026-09 (hands-on) |
| Textures | Usable as-is for colour printing; grainy texture that prompting could not fix (Meshy 6); 8K native on Meshy 7; `meshy-n1` softer faces/text | 3DPrint.com; 3DPI; [models](https://docs.meshy.ai/en/api/models) |
| Lighting in albedo | `remove_lighting` exists only on the Meshy 6 texture model; 7 / 7.1 ignore it | API docs |
| Game-ready low-poly | T2 / T2.5: 4 k / 15 k faces default, parts kept separate (T2), "for game characters to rig" (T2.5) | [models](https://docs.meshy.ai/en/api/models) |
| Rankings | No neutral 2026 head-to-head found covering Meshy, TRELLIS.2 and Pixal3D. A vendor-run arena (Sloyd blog, 2026-08) lists Meshy 6 at ELO 1004 | [Sloyd](https://www.sloyd.ai/blog/ai-3d-model-generator-rankings) *(competitor)* |

Against the open models ts23d already wraps (facts only):

| | Meshy (7.1 / T2.5) | TRELLIS.2-4B | Pixal3D |
|---|---|---|---|
| Runs on | Meshy's servers; paid key | own GPU ≥ 24 GB (A100/H100 tested) | own GPU (TRELLIS.2 stack, `--low_vram`) |
| Input | text, 1 image, 1–4 images | 1 image | 1 image |
| Output | GLB, PBR to 8K, remesh/quad/low-poly in-call | mesh + PBR (incl. opacity), 4K in example; may have small holes | geometry + PBR |
| Reproducible | no seed | seeded, local | seeded, local |
| Weights licence | n/a (service) | MIT | MIT (HF card `license: mit`, checked 2026-11-16; weights gated, EU access disallowed by the card) |
| Marginal cost | 15–35 credits ≈ $0.15–0.70 | GPU time | GPU time |
| Post-process | remesh, UV unwrap, rig, animate, retexture | texture an existing mesh | — |

The measurable comparison belongs in our own lab: same Z-Image concept → each adapter → the same
`importGlb` report (shells, holes, non-manifold), silhouette IoU against the concept, back-side
plausibility in `sheet.png`, and the hybrid's registration residual. That is a check, not an opinion.

## 6. Fit in the ts23d pipeline

```
Z-Image concept (local / Kubeez)  ──► checkInputImage (D55)
   ├─ 1 view  ─► Meshy image-to-3d ──┐
   └─ 2–4 views (front first) ─► multi-image-to-3d ─┤   image_enhancement:false, pose_mode for bipeds,
                                                    │   target_formats:["glb"], save_pre_remeshed_model
code mesh (bust / creature skin, with UVs) ─► Meshy retexture (enable_original_uv) ─► own textures
                                                    ▼
          record.json + content-hash cache (no seed!) ─► importGlb (Y-up +Z-front → Z-up +X-front)
          ─► cleanMesh ─► register onto code skeleton (wolf_hybrid) ─► simplify ×3 LODs ─► QA ─► shots
```

| Step | Use Meshy for | Keep in ts23d | Why |
|---|---|---|---|
| Concept | — (we have Z-Image / Kubeez / OpenAI image) | concept as code | Meshy text-to-image adds nothing we lack |
| Surface | image-to-3D / multi-image-to-3D, `meshy-7.1`, untextured or 2K PBR | registration, blend, QA | Code owns the animal; the model adds the skin (wolf_hybrid) |
| Texture on code geometry | **Retexture** with `enable_original_uv: true` | form, topology, LODs | Skips registration entirely; output is an own-texture material → the opt-in `own` path (`withOwnTextures`), visible in `budget.draws` |
| LODs | in-call `target_polycount` only to keep downloads small | `simplify` ×3 (ADR 011) | Deterministic and on our cache; Meshy remesh is not reproducible |
| Quad topology for skinned parts | Remesh `topology: quad` | — | We have no quad remesher; deforming skins benefit |
| UVs for own-texture bakes | UV Unwrap (≤ 40 k faces) | `bakeNormals` | Fresh UVs before baking the dense surface onto the LOD0 cage |
| Rig | Rigging → GLB with `mixamo` / `ue5_mannequin` names, as an *import* | our skeleton IR, clips, deformation QA | Bipeds only, +Z face, cm default; our creatures are quadrupeds/birds with their own bones |
| Motion | Animation library / text-to-motion as reference clips | baked clips in our IR | FBX/BVH need importers we don't have; retarget onto our rig is the open problem |

### 6.1 Typical credit cost per asset

| Asset | Calls | Credits | ≈ $ at Pro |
|---|---|---|---|
| Hybrid creature skin (wolf_hybrid style) | image-to-3D 7.1 mesh only (+5 ultra 2k) | 20–25 | 0.40–0.50 |
| Same, textured + PBR 2K | image-to-3D 7.1, `enable_pbr` | 30 | 0.60 |
| Game prop, low-poly textured | image-to-3D t2.5, 2K | 15 | 0.30 |
| Retexture a code-built bust | retexture 2K/4K | 10 | 0.20 |
| Multi-view character, textured | multi-image 7.1, 2K | 30 | 0.60 |
| Rigged + 5 clips biped | generation 30 + (remesh 5 if > 380 k tris) + rig 5 + 5 × 3 | 50–55 | 1.00–1.10 |
| Draft / A/B sweep (4 variants) | 4 × image-to-3D 6-lite mesh only | 20 | 0.40 |

## 7. Recommended wrap priority

| # | What | Credits | Notes |
|---|---|---|---|
| 1 | **Harden shipped image-to-3D / text-to-3D** | — | See §7.1; fixes, not features |
| 2 | **Retexture** (`texture` or `refine` task on a code mesh) | 10–15 | Fits "code owns form" best; no registration; GLB in, GLB out, `refine` protocol already exists ([21-import](../idea/21-import.md#refine-adapter-protocol-only)) |
| 3 | **Multi-Image-to-3D** (`images[]`, front first) | 20–35 | Addresses the back-side failure of single-image models; Z-Image can render the views |
| 4 | **Remesh** (quad) + **UV Unwrap** as `refine`-style post-passes on imported meshes | 5 + 5 | Gaps we don't fill in code; keep `simplify` for LODs |
| 5 | **Rigging + Animation** (bipeds), import-only, skeleton-name map → our IR | 5 + 3/clip | Lower: our skeleton IR already owns rigs; useful as a baseline for humanoid bodies (not built) |
| — | Skip: text-to-image, image-to-image, text-to-motion (FBX/BVH), Auto Split (print-oriented, flat colours), print, relief, Creative Lab, webhooks, balance beyond a `doctor` check | | |

### 7.1 Gaps found in the shipped `meshy-adapter.ts` (for its owner)

| Gap | Doc fact | Suggested change |
|---|---|---|
| `meshy-t2` clamp is 30 000 | t2 range is 100–15 000 → 400 | per-model max (t2 15 000, t2.5 30 000, standard 300 000) |
| Job deadline 15 min, then error | docs: wait ≥ 60 min; task keeps running and is charged | default 60 min; persist the task id so a rerun resumes the poll instead of re-creating |
| Poll every 3 s | `Retry-After` or 5 s | honour `Retry-After`; default 5 s |
| 429 `NoMorePendingTasks` has no `Retry-After` | concurrency limit, not request rate | back off until a task finishes; name the plan's concurrency in the fix |
| All formats generated | default = 5 formats | send `target_formats: ["glb"]` |
| Cost list ignores ultra (+5), non-default texture model, refine (+10) | pricing table | compute from the request; record `consumed_credits` from the task in `record.json` |
| No `enable_pbr`, `pose_mode`, `texture_model`, `texture_resolution`, `image_enhancement`, `geometry_resolution` | §2.1 | pass-through fields on the request; default `image_enhancement: false` for our own concepts |
| `licence: 'CC-BY-4.0'` option | Free accounts cannot create API keys | API outputs are always paid-plan → `own`; keep CC BY only for web-app GLBs imported by hand |
| `meshy-7` retirement | 400 from 2026-12-31 | already absent from `MESHY_MODELS`; keep `latest` → 7.1 |
| PBR maps arrive as separate `texture_urls` | not embedded guarantees *(unverified for GLB)* | read the GLB's own materials first; fetch maps only if missing |

## Sources

- Meshy API docs (fetched 2026-11-16): [Text to 3D](https://docs.meshy.ai/en/api/text-to-3d) · [Image to 3D](https://docs.meshy.ai/en/api/image-to-3d) · [Multi-Image to 3D](https://docs.meshy.ai/en/api/multi-image-to-3d) · [Retexture](https://docs.meshy.ai/en/api/retexture) · [Remesh](https://docs.meshy.ai/en/api/remesh) · [UV Unwrap](https://docs.meshy.ai/en/api/uv-unwrap) · [Rigging](https://docs.meshy.ai/en/api/rigging) · [Animation](https://docs.meshy.ai/en/api/animation) · [Text to Motion](https://docs.meshy.ai/en/api/text-to-motion) · [Text to Image](https://docs.meshy.ai/en/api/text-to-image) · [Models](https://docs.meshy.ai/en/api/models) · [Pricing](https://docs.meshy.ai/en/api/pricing) · [Rate limits](https://docs.meshy.ai/en/api/rate-limits) · [Webhooks](https://docs.meshy.ai/en/api/webhooks) · [Asset retention](https://docs.meshy.ai/en/api/asset-retention) · [Task lifecycle](https://docs.meshy.ai/en/api/task-lifecycle) · [AI integration](https://docs.meshy.ai/en/api/ai) · [Changelog](https://docs.meshy.ai/en/api/changelog) · [Quickstart](https://docs.meshy.ai/en/api/quick-start) · [llms-full.txt](https://docs.meshy.ai/llms-full.txt)
- Meshy web app: [Pricing and credits](https://docs.meshy.ai/en/webapp/pricing)
- Meshy help centre: [Ownership of generated models](https://help.meshy.ai/en/articles/10137554-what-is-the-ownership-of-the-generated-models) · [Commercial use](https://help.meshy.ai/en/articles/9992001-can-i-use-my-generated-assets-for-commercial-projects) · [Plans](https://help.meshy.ai/en/articles/12062933-meshy-pricing-plans-free-pro-studio-enterprise)
- Not readable by our client (403): [meshy.ai/pricing](https://www.meshy.ai/pricing) · [meshy.ai/terms-of-use](https://www.meshy.ai/terms-of-use)
- Plan prices *(3rd-party)*: [CostBench, Meshy plans](https://costbench.com/software/ai-3d-generation/meshy/) (checked 2026-11-05)
- Reviews: D. Sher, [Meshy 7 review](https://www.voxelmatters.com/meshy-7-review-how-can-humans-keep-up/), VoxelMatters, 2026-09-30 · A. Shaikhnag, [Meshy tested across six tests](https://3dprintingindustry.com/news/review-meshy-ai-tested-across-six-practical-3d-modelling-tests-254447/), 3D Printing Industry, 2026-09-07 · [Meshy 7: all the fingers and toes](https://3dprint.com/331847/meshy-7-all-the-fingers-and-toes/amp/), 3DPrint.com, 2026-09 · [Techsy: best AI game asset generators](https://techsy.io/en/blog/best-ai-game-asset-generators) *(aggregator)* · [G2 reviews](https://www.g2.com/products/meshy) · [Neural4D on Meshy 7](https://blog.neural4d.com/comparisons/meshy-7-release-date-and-alternative/) *(competitor)* · [Sloyd arena rankings](https://www.sloyd.ai/blog/ai-3d-model-generator-rankings) *(competitor)*
- Open models: [TRELLIS.2-4B model card](https://huggingface.co/microsoft/TRELLIS.2-4B) · [Pixal3D repo](https://github.com/TencentARC/Pixal3D) · [Pixal3D HF card](https://huggingface.co/TencentARC/Pixal3D)
