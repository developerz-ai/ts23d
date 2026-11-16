# 20 — Blender (and Material Maker) as tool adapters (optional, cached; neural tier 2 + example server plug-ins)

Rule: Blender is a power tool behind the same adapter contract as the model server (ADR 014/015): the user's own Blender runs headless, outputs are cached by content hash and validated by our QA; recipes stay TypeScript and a missing cache falls back to the CPU tier.

## Files
| Path | State | Why |
|---|---|---|
| `examples/neural-server/plugins/blender_*.py` | new | **primary path**: Blender as a Python module (`pip install bpy`, PyPI, pinned to one LTS, matching Python) inside the slice-14 server — tool tasks over the same `t3d-neural/1` HTTP contract, no Blender app install |
| `src/neural/blender-adapter.ts` + `.test.ts` | new | fallback for users with a Blender app: `blenderAdapter({ exe })` spawns `blender -b --factory-startup -noaudio --python-exit-code 3 --python <job.py> -- job.json`; reads `report.json`; timeouts, size caps, `T3D_NEURAL_FAILED` with stderr tail |
| `src/neural/material-maker-adapter.ts` + `.test.ts` | new | `texture` tool task: runs Material Maker's CLI batch export (1.5+, MIT) on a user `.ptex` graph → albedo/normal/ORM tiles → baked into a trim-sheet strip by `defineMaterial` images (cached like any neural output) |
| `src/core/neural-task.ts` | changed | tool tasks: `cloth` (drape a garment mesh on a body under gravity, pinned vertices), `bake` (multires/high→low maps), `remesh` (voxel remesh + decimate + UV smart project), `groom` (hair curves → card strips) |
| `examples/blender/ts23d_job.py` | new | dispatcher: reads job.json, imports GLB(s) via the bundled glTF importer, runs the task, exports GLB/PNG + report.json; pins `bpy.app.version` into the report |
| `examples/blender/tasks/{cloth,bake,remesh,groom}.py` | new | one task per file; deterministic settings (fixed seeds, fixed substeps, single thread where Blender is otherwise nondeterministic) |
| `scripts/vdm-from-blender.ts` + `.test.ts` | new | extract VDM brush assets from a user's Blender asset library into slice 19's `.vdm.bin` (licence recorded per asset; refuse non-redistributable ones for committed outputs) |
| `recipes/_lib/bust/cloth-sim.ts` | new | opt-in: garment drape through `ctx.neural('cloth', …)`; cache miss → slice's stroke folds |

## Tool menu (decided 2026-11-15; first six built here, the rest listed for later slices)
| Order | Tool | Task | Why |
|---|---|---|---|
| 1 | Blender cloth sim | `cloth` | drape for clothes, capes, flags, banners, tents |
| 2 | Blender Rigify | `rig` (humanoid) | full human rig with face controls from a generated meta-rig on our armature |
| 3 | Blender cell fracture + rigid body | `fracture` | destruction variants (broken crate/wall/debris) as LOD'd parts |
| 4 | Godot headless (MIT) | `engine-check` | engine-import QA: every GLB opens, plays its clips, keeps colliders (advisory, cached report) |
| 5 | Basis Universal (Apache-2.0) | `ktx2` | KTX2/UASTC textures (roadmap M2) without writing an encoder; bytes pinned by encoder version in `record.json` |
| 6 | meshoptimizer (MIT) | `meshopt` | `EXT_meshopt_compression` and import simplification |
| later | Blender softbody/jiggle bake, multires/Cycles bake + lightmaps, QuadriFlow + UV unwrap, data transfer, USD/FBX export, ocean | various | |
| 7 | MPFB2 (MakeHuman plugin; GPL code, CC0 assets) | `human` (body shape, expressions, CC0 clothes/hair proxies on the base our heads use) | biggest character win; assets CC0 so outputs publishable |
| 8 | Cycles bake on GPU (OptiX) | `bake` | fast high→low normal/AO/curvature; alternative backend for slice 11 (CPU baker stays default) |
| 9 | Sapling Tree Gen, A.N.T. Landscape (bundled extensions, GPL) | `tree`, `terrain` | second opinions vs our own tree/terrain kinds |
| later | Material Maker CLI (MIT), Meshroom/COLMAP photogrammetry, CadQuery/OpenCascade B-rep | various | |
| no | paid add-ons (Auto-Rig Pro, UVPackmaster, Simple Bake, HairTool), BlenderKit (mixed licences) | — | users never need paid software; licence-clean outputs |

## Depends on
13 (adapter contract + recipe cache), 19 (VDM format), clothes round (garment meshes).

## Change
- Not wrapped (research 2026-11-15): sculpt brush strokes via `bpy.ops.sculpt.brush_stroke` — unreliable without a viewport context (Blender devs call non-interactive use a limitation); our SDF strokes (04) and VDM stamps (19) are the brushes. Blender MCP servers drive a live UI — fine for humans, not reproducible, out of scope.
- `record.json` holds Blender version, script sha256, task params; the cache key includes them, so a Blender upgrade is a cache miss, never a silent change.
- Outputs re-validated (manifold-ish, bounds, budgets, `connections` on the draped garment).
- GPL note: our scripts calling `bpy` are published GPL-compatible in `examples/blender/` (Blender licence); the library itself never imports them.

## Tests
Failure first: missing Blender → clear `T3D_NEURAL_FAILED` with `fix:` (install path / `--blender`); a job that writes no report fails; cache hit never spawns Blender; contract test with a fake `blender` executable script.

## Checks
`bun test src/neural/blender-adapter.test.ts scripts/vdm-from-blender.test.ts` · `--only lint,typecheck,boundaries,determinism,pack` · manual: Blender 4.5 LTS / 5.x on the dev box drapes the human bust's tunic.

## Docs
`docs/idea/12-blender-bridge.md` status → shipped parts; README "Bring your own tools".

## Done when
`t3d neural run recipes/human_head/human_head.ts` with the Blender adapter caches a cloth drape that the bust uses; without the cache the bust builds identically to the CPU tier.
