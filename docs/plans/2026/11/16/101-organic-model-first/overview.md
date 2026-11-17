# 101 — Organic assets go model-first and Blender-first

## Goal
A recipe for a creature or a humanoid no longer sculpts its body from code primitives: it writes an
ordered list of **Blender steps** in TypeScript, run headless and cached like any model output
(ADR 014), on a body that comes from an image-to-3D model (local GPU: Z-Image → Pixal3D /
TRELLIS.2; hosted: Meshy) or from Blender itself. The model's mesh and textures stay whole, as a
**textured part on every LOD**; code keeps real scale, skeleton, clips, LOD budgets and QA.
Hard-surface assets are untouched.

## Why (measured 2026-11-16)
| Fact | Evidence |
|---|---|
| Raw Pixal3D / TRELLIS.2 wolves read as wolves; `wolf_hybrid` (shrinkwrap of the model onto the code body, colour into vertex colour) does not | `~/workspace/lab/neural-models/out/best/renders/new_pixal3d_threequarter.png` vs `recipes/wolf_hybrid/out/wolf_hybrid/hero.png` |
| Headless Blender 5.3 turns the 955 337-face Pixal3D wolf into 29 987 triangles + fresh UVs + 2048² albedo and normal in 33 s; the result still reads as the model | spike: `~/workspace/lab/neural-models/out/blender-steps/low_threequarter.png`, `wolf_low.glb` |
| Albedo must be baked as EMIT from the source base colour (a DIFFUSE bake of the generator's metallic material is black) | same spike, first run |
| Smart UV Project on a noisy fur surface needs a wide angle limit (≈ 83°) or it shatters into specks | same spike |
| Owner: trains and tanks look good; dragon, bear, wolf and humans do not; "put in code steps for Blender" | session 2026-11-16 |

## Roadmap
M4 `creature` next (:120) and quadruped base meshes (:256) · M5 neural adapters and import
(:138–144: Blender bridge) · Gaps: inverse procedural modelling (:267). Continues plan
2026/11/15/101 slice 17 (flagships), which this supersedes for organic flagships.

## Falsified
| Claim | Found |
|---|---|
| "Sculpt in Blender is not wrappable" (`src/neural/blender-adapter.ts:3`, idea 12) | True for brush strokes only. Remesh, decimate, UV, bake, modifiers, bone-heat weights are data-level and run with `-b` (spike; details in `docs/research/blender-organic-workflows.md`, written by this plan's research task) |
| "The model adds the skin, code owns the animal" gives the best result (`recipes/wolf_hybrid/README.md`) | The blend is where the quality is lost; code should own scale, skeleton, motion and QA, not the surface |
| `importGlb` can carry a model's look (`docs/idea/21-import.md`) | It merges primitives, drops skins and projects the albedo into vertex colour; own textures exist only as a post-process script (`scripts/import-textured.ts`, `src/export/own-textures.ts`) and no renderer samples them |
| The 8 MB per-recipe neural cap fits a chain | image ≈ 1 MB + decimated mesh 6.6 MB already fill it (`recipes/wolf_hybrid/neural/`); the Blender output needs room |

## Slices
Waves run in order; slices inside a wave are path-disjoint and parallel (≤ 4). The coordinator
alone edits barrels (`src/index.ts`, `src/*/index.ts`), `docs/architecture/errors.md` and
`CHANGELOG.md`, from the lines each slice reports. GPU and Blender-bake jobs run **one at a time**
(62 GB RAM shared; one model on the card).

| Wave | Slice | One line |
|---|---|---|
| A | [01-textured-parts-core](01-textured-parts-core.md) | `TextureSet` in the IR: a part may carry its own albedo / normal / ORM on every LOD; budget and ADR 016 |
| A | [02-blender-steps](02-blender-steps.md) | task `blender`: typed step program in TS → headless ops (clean, remesh, deform, retopo, UV, bake, bind, LODs) → GLB + report; contracts for multi-view mesh and rig clips |
| B | [03-import-model](03-import-model.md) | `importModel`: a GLB with UVs, textures, skin, skeleton, clips and LOD meshes as IR values |
| B | [04-meshy](04-meshy.md) | Meshy: multi-image, pose mode, rigging + animation, retexture, remesh behind the adapter |
| B | [05-export-textures](05-export-textures.md) | GLB writer: one material per texture set, tangents, all LODs, manifest and draw accounting |
| B | [06-render-textures](06-render-textures.md) | Raster beauty, path tracer and contact sheet sample texture sets |
| C | [07-model-body](07-model-body.md) | `/kinds`: fit a skeleton into a model mesh, bind, clips, LOD pick; `/qa`: texture and model gates |
| C | [14-local-outputs](14-local-outputs.md) | Raw 70–100 MB model outputs stay local (git-ignored, sha256 committed); the chain still resolves on a fresh clone |
| C | [15-agent-finishing](15-agent-finishing.md) | Steps `script`, `joint`, `weights`, `review`: an agent adjusts rig and surface and reads Blender's review renders |
| C | [16-model-character](16-model-character.md) | Rigged-model characters in the library (`defineModelCharacter`), loop closing at import, input-image and in-place gait gate fixes |
| D | [08-wolf](08-wolf.md) | `wolf_hybrid` rebuilt model-first (existing cache + Blender steps) |
| D | [09-humanoid](09-humanoid.md) | A full-body humanoid: concept → Meshy (a-pose, rig, clips) → Blender steps; local-GPU variant noted |
| D | [10-bear](10-bear.md) | `brown_bear` gets the model tier (GPU chain), code bear stays the fallback |
| D | [11-dragon](11-dragon.md) | `dragon` gets the model tier; wings are the risk |
| E | [12-site](12-site.md) | Gallery viewer shows textured parts and the tier toggle for the new assets |
| E | [13-docs-release](13-docs-release.md) | Skills, playbooks, idea docs, roadmap, CHANGELOG, release 0.10.0 |

## Done when
- `bun run verify` green; `t3d build` QA PASS for wolf_hybrid, brown_bear, dragon and the humanoid.
- Each of the four has a committed `hero.png` + `sheet.png` that a fresh-eyes visual review scores
  above its predecessor, and plays its clips (walk for quadrupeds; idle + walk for the humanoid).
- A fresh clone without Blender, GPU or keys still builds everything (cache hits; CPU fallback on
  a miss), and CI never calls Blender, a model or Meshy.
- 0.10.0 on npm.

## Risks / open questions
| Risk | Handling |
|---|---|
| Model pose ≠ rest pose (turned head, mid-stride legs) | Concept prompt asks a square neutral stand; slice 07 fits the skeleton to the mesh (joints snapped to the limb's medial axis), gait keys are relative to the fitted rest pose; deform QA is the judge |
| Bone heat fails on generator meshes | Slice 02 `bind` falls back to a voxel-remeshed proxy + weight transfer; slice 07 may bind in TS (`src/passes/skin-heat.ts`) |
| Dragon wing membranes fuse or tear in image-to-3D | Slice 11 may keep code wings on a model body; says so in the README |
| Repo growth from committed textures | Cap 12 MB per recipe; albedo 2048² + normal 1024² PNG; re-rolls replace key directories |
| Blender output is not bit-reproducible across versions | Same answer as ADR 014: version + script hash in the cache key; the committed output is the input to the build |
| Meshy credits | ≤ 120 credits total for slice 09, balance read first, every call deliberate (never in tests) |
