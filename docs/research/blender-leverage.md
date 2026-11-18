# Research: leveraging Blender further on AI-generated meshes (headless)

**The best next Blender work is small, typed ops that use data-level APIs, not more dependence on
Blender's interactive tools. A numpy stroke op can brush an existing mesh headless: nine brush
modes ran on a 112,640-vertex mesh in about 2 s per stroke, with surface-distance falloff that left
a wall 3 cm away untouched, and with identical bytes at `-t 1` and `-t 4`. The windowed
`sculpt.brush_stroke` lane does work, but only when each stroke point's `mouse` lands on the mesh,
and it changes bytes above one thread. Four other results are large enough to act on: rebaking a
normal map for LOD2 cut its shading error from 10.6° to 0.2°; a log-domain lighting fit cut albedo
error from 0.254 to 0.101 on a synthetic test; a fitted bake cage removed 13.9 % wrong-surface
texels without shortening ray reach; and baking Spline IK to bones survived glTF with 0.0 mm error,
while a B-bone exported as is lost 149 mm of its bend. Blender 5.3's exporter now writes meshopt and
KTX2 itself, but ts23d already has tool tasks for both, so that is not a priority.**

Research as of 2026-11-18. Local tests ran on Blender 5.3.0 (build 2026-11-10), Linux, CPU only
(Cycles CPU; Workbench and EEVEE on Mesa llvmpipe / lavapipe), one process at a time, on generated
meshes. No real Pixal3D, TRELLIS or Meshy mesh was used, so every number here is a mechanism result
to be confirmed on real output. Statements with neither a source nor a local test are marked
*(unverified)*. Search excerpts that were not opened as pages are marked *(excerpt)*.

Builds on [`blender-organic-workflows.md`](blender-organic-workflows.md),
[`../idea/12-blender-bridge.md`](../idea/12-blender-bridge.md) and
[`../../examples/blender/README.md`](../../examples/blender/README.md); it does not repeat them.
Creature locomotion belongs to `swim-and-tentacle-animation.md`.

**Constraints every proposal below respects.** Blender never runs in the gate or CI; results are
cached inputs. A step program is typed TypeScript data plus one Python module per op family (≤ 300
lines). A new default on an existing op changes canonical JSON and invalidates every committed
request key, so new behaviour goes in new ops, or in new optional fields with no default.
Python under `examples/blender/` is GPL-2.0-or-later; nothing GPL enters `src/`.

## 1. Retopology beyond voxel + decimate

### 1.1 Tools

| Tool | What it is | Licence | Headless | Fit for ts23d |
|---|---|---|---|---|
| QuadriFlow (in Blender) | Field-aligned quads, already behind `retopo reduce: 'quadriflow'` | Ships in Blender | Yes (local, prior doc) | Keep. Local: asked for 6.65k faces, got 4,802; asked for 1,662, got 1,512, and at that budget it left target points up to 274 mm away |
| [QuadWild Bi-MDF](https://github.com/cgg-bern/quadwild-bimdf) | Feature-line patch layout + flow quantisation | GPL-3.0 ("QuadWild as well as our additions and changes") | CLI: `quadwild <mesh.obj> 2 <prep config>`, then `quad_from_patches <mesh_rem_p0.obj> 123 <config>`; binaries for Linux, Windows, macOS | User-installed subprocess only. Not run here: downloaded binaries were not executed |
| [QRemeshify](https://github.com/ksami/QRemeshify) | Blender add-on over QuadWild; symmetry, sharp detection, seam and material guides | GPL-3.0 | N-panel tool; README lists Windows as confirmed and Linux as "still testing"; no headless mode documented | Skip; call QuadWild directly |
| [Instant Meshes](https://github.com/wjakob/instant-meshes) | Field-aligned remesher | [BSD-3-Clause](https://raw.githubusercontent.com/wjakob/instant-meshes/master/LICENSE.txt) | Batch via [`main.cpp`](https://raw.githubusercontent.com/wjakob/instant-meshes/master/src/main.cpp): `-o`, `-f`, `-v`, `-s`, `-c` crease, `-d` deterministic, `-b` boundaries, `-S` smooth, `-r`/`-p`, `-D`, `-i`, `-t` | The most permissive external option. Not run here |
| [Quad Remesher](https://exoside.com/quadremesher/quadremesher-doc/) | Commercial remesher ($109.90 perpetual Pro: [pricing](https://exoside.com/quadremesher/quadremesher-buy/)) | Proprietary | Vendor says the purchased licence does not allow SDK use and to contact them for an "automated process" | Keep out of any default path |
| [Meshy Remesh](https://docs.meshy.ai/en/api/remesh) | Hosted; `topology: 'quad'`, `target_polycount` 100..300,000 | Service terms | API | Paid; the page does not say whether input textures survive, so test before relying on it |
| Neural layouts: [SQuadGen](https://microsoft.github.io/SQuadGen/), [TopGen](https://arxiv.org/html/2603.10606v1), [NeurCross](https://arxiv.org/html/2405.13745v3) | Learned quad layouts or cross fields | Paper licences; code status not confirmed for the first two | Unknown | Watch list only |

### 1.2 Skeleton-swept template wrap (tested)

The owner's goal is deformation-ready topology. An authored template with joint loops can be
generated from the skeleton the recipe already has: a Skin modifier over the bones, with rings
clustered towards joints, then wrapped onto the model. No external tool, no base-mesh asset.

Method tested: Skin + one or two Subdivision levels; each vertex cast **inward from outside**
along its direction from the nearest bone, so the first hit is the outer surface and internal layers
of a generated mesh are ignored; misses (4.3 %) use nearest-surface; six relax + reproject passes.

Target: an independent 51,422-face quadruped (metaballs, voxel remesh, noise) with two ears the
skeleton does not know. All three meshes were bound by bone heat; forearm bent 75°; zone = within
11 cm of the elbow.

| Measure | Wrap (6,648 quads, 13.3k tris) | Decimate (13.3k tris) | QuadriFlow (4,802 quads, 9.6k tris) |
|---|---|---|---|
| Vertices in the elbow zone | **256** | 145 | 85 |
| Edges aligned with or across the limb | 100 % | 63 % | 98.7 % |
| Mean dihedral rest → posed | 12.7° → 16.6° (**+3.9°**) | 10.8° → 16.7° (+5.9°) | 17.9° → 24.9° (+7.0°) |
| Edges sharper than 60° when posed | **1.8 %** | 4.5 % | 5.8 % |
| Faces squeezed under 25 % area | 5.5 % | 4.1 % | 4.6 % |
| Target → mesh mean, excluding ears | 2.0 mm | **0.31 mm** | 0.96 mm |
| Target → mesh mean on the ears | **11.8 mm** | 0.3 mm | 3.4 mm |

What this shows: the wrap puts more of the budget at the joint and bends more cleanly, but fits the
surface worse and **loses anything without a bone** (ears, horns, crests). QuadriFlow's limb edges
were also well aligned, so "QuadriFlow gives no joint loops" in the earlier doc is too strong for
tube-like limbs; what it lacks is density at the joint. QuadriFlow's lower triangle count makes that
column not strictly comparable. The normal bake would restore surface detail, not missing volume.
One elbow on one synthetic body is thin evidence: run it against `t3d blender review` poses first.

Commercial wrap add-ons exist ([B-Skin](https://superhivemarket.com/products/b-skin), GPL, landmark
pairs; [Wrap for Blender](https://superhivemarket.com/products/wrap4blender), $49, GPL); both are
*(excerpt)* and neither is needed for this approach.

## 2. Baking and texture

### 2.1 De-lighting

ts23d already has `delight` in `src/finish/neural-texture.ts`, which divides by baked occlusion or
irradiance. A test of what that misses: an albedo of 40 random colour regions, lit by a sun and sky,
baked to 512² next to an object-space normal map. Estimate shading as a second-order spherical
harmonic of the normal, fitted to log luminance with a robust loop, then divide it out.

| Case (texels: 115,980) | Input RMSE | Divide by AO | SH fit on log luminance | Exact shading (control) |
|---|---|---|---|---|
| Albedo unrelated to the normal | 0.254 | 0.254 | **0.101** | 0.003 |
| Albedo really is darker on the back | 0.231 | 0.231 | **0.130** | 0.002 |

Correlation of the leftover ratio with N·L fell from 0.995 to 0.045 in the first case and to 0.374 in
the second: **real countershading is partly taken for light**, which is the method's known risk. AO
division did nothing here because this test's lighting contains no occlusion term. A first attempt
fitted in linear space gave only 0.202 (shadow regions blew up); the log fit is the one to keep.

Model routes, for local GPU or hosted use, all as optional neural tasks rather than Blender ops:

| Model | Output | Licence | Note |
|---|---|---|---|
| [Marigold IID Appearance / Lighting](https://huggingface.co/prs-eth/marigold-iid-appearance-v1-1) | Albedo + roughness + metallic, or albedo + shading + residual | CreativeML Open RAIL++-M *(excerpt for Appearance; Lighting card names it)* | Image-space: needs multi-view projection back onto UVs |
| [Hunyuan3D delight v2](https://huggingface.co/tencent/Hunyuan3D-2/tree/main/hunyuan3d-delight-v2-0) | De-lit image | Tencent Hunyuan Community *(excerpt)* | Read the licence terms before any use |
| [StableDelight](https://huggingface.co/Stable-X/yoso-delight-v0-4-base) | Specular removal | Unresolved: sources conflict, no upstream LICENSE confirmed | Do not adopt until confirmed |

### 2.2 Cage, LOD normals, atlases

| Topic | Finding | Evidence |
|---|---|---|
| Fitted cage | Two tubes 6 mm apart. Extrusion 20 mm: **13.9 %** of texels took the other tube's colour. A cage offset per vertex by min(20 mm, 0.45 × distance to the opposite wall) gave **0 %** with 0 misses, offsets 2.7..20 mm. A flat 2 mm extrusion also gave 0 % here, but it cannot reach detail further away | Local `t11`. `use_cage` + `cage_object` with `max_ray_distance=0` |
| Per-LOD normal map | LOD2 (800 tris from a 12,000-tri LOD0, UVs kept). Mean shading error against the high mesh: no map 11.5°, **LOD0's map reused 10.6°**, map rebaked for LOD2 **0.23°** (p95 19.7° → 0.87°) | Local `t10`. A tangent map encodes the difference from its own low mesh's normals, so reuse on a much coarser mesh adds almost nothing. UVs need no change, only a second, smaller image |
| Bake quality | Cycles 5.3 improved baking for small or thin triangles and near margins | [5.3 Cycles notes](https://developer.blender.org/docs/release_notes/5.3/cycles/) |
| UDIM vs atlas | Stay with one atlas. Core glTF has no UDIM concept ([discussion](https://github.com/KhronosGroup/glTF/issues/1442)); Godot lacks native support per a [proposal](https://v-sekai.github.io/manuals/decisions/20241219-unpack-fbx-udimms.html) *(excerpt)* | No op proposed |
| Curvature, thickness, position | Already proven as EMIT bakes in the prior doc. They are masks for wear and for a roughness guess; useful as an additional map family | [Prior doc §2.5](blender-organic-workflows.md) |
| Texel density | Already a check for trim-sheet parts (`assertTexelDensity`), and `uv` averages island scale | `src/testing/texture-density.ts`. Gap: no px/m report for baked model parts |

## 3. Geometry Nodes as a headless engine

**Scriptable status (local, 5.3):** 312 node and related RNA types matched the geometry-node,
bundle and closure prefixes, 46 of them about grids, SDFs or volumes. Trees built from Python ran
and applied in `-b`.

| Capability | Since | Local result | Use for ts23d |
|---|---|---|---|
| SDF and volume grids: Mesh/Points to SDF, boolean, offset, fillet, filters | [5.0](https://developer.blender.org/docs/release_notes/5.0/geometry_nodes/) | Already used by `retopo` | Keep |
| Grid dilate/erode, mean, median, clip | [5.1](https://developer.blender.org/docs/release_notes/5.1/geometry_nodes/) | Not run | Could replace parts of the closing in `shell.py`; not needed now |
| Rasterize Points, Poisson Solver, Grid Topology Boolean | [5.3](https://developer.blender.org/docs/release_notes/5.3/geometry_nodes/) | Poisson type present, not run | 5.3-only, while 4.5 and 5.2 are also supported lines |
| Bundles, closures | 5.0, no longer experimental ([workshop](https://code.blender.org/2025/10/geometry-nodes-workshop-september-2025/)) | **A closure built and evaluated from Python returned the right value** (0.25 × 2 = 0.5) | Not needed: step programs already give reuse in TypeScript |
| Lists, Transfer Attributes, Merge Points, Cluster by Distance, Mesh Bevel | [5.2](https://developer.blender.org/docs/release_notes/5.2/geometry_nodes/) | Types present | Mesh Bevel and Transfer Attributes are worth a look for a 5.2+ path |
| Surface scatter: Distribute (Poisson) → Instance on Points → Realize | Long-standing | Cone scales on a sphere: 18.2k vertices, **identical bytes twice**, then a CPU normal bake onto a low sphere in 0.1 s (normal R/G std 0.10) | **Candidate `scatter`**: scales, studs, bark plates as baked detail |
| XPBD physics, Hair and Cloth Dynamics assets | [5.2](https://developer.blender.org/docs/release_notes/5.2/geometry_nodes/), experimental; manual page [XPBD Solver](https://docs.blender.org/manual/en/5.2/modeling/geometry_nodes/simulation/xpbd_solver.html) | Asset file `geometry_nodes_dynamics_assets.blend` holds `Hair Dynamics` and `Cloth Dynamics (Experimental)`; not run | Wait: experimental, and 5.2+ only |

API trap, already handled in the prior doc: from 5.2 modifier inputs are set through
`mod.properties.inputs` ([5.2 notes](https://developer.blender.org/docs/release_notes/5.2/python_api/)).
Fixed-value trees avoid the difference across versions.

## 4. Animation, headless

### 4.1 API changes that affect any new op

- **`action.fcurves`, `action.groups` and `action.id_root` are gone since 5.0**; F-curves live in
  channelbags reached through a slot ([5.0 Python API](https://developer.blender.org/docs/release_notes/5.0/python_api/)).
  Local 5.3: `hasattr(action, 'fcurves')` is false;
  `action.layers[0].strips[0].channelbag(slot).fcurves` returned 80 curves in 8 groups.
- The 4.5 LTS line still needs its own path for this; not tested here (no 4.5 install).
- 5.3 adds `convert_rotation_mode` on objects and pose bones
  ([5.3 Python API](https://developer.blender.org/docs/release_notes/5.3/python_api/)).

### 4.2 What survives to glTF

| Source | Test | Result |
|---|---|---|
| **Spline IK** chain of 8 bones following an animated curve | `nla.bake(visual_keying=True, clear_constraints=True, bake_types={'POSE'})`, bones with `inherit_scale='ALIGNED'`, export, re-import, compare 1.04k vertices at 4 frames | **0.0 mm** after the bake and 0.0 mm through GLB. Older reports of inaccurate Spline IK bakes ([#52063](https://projects.blender.org/blender/blender/issues/52063), [#79670](https://projects.blender.org/blender/blender/issues/79670)) did not reproduce with these settings |
| **B-bone**, 8 segments, curved by `bbone_curve*` | Export directly | 1 joint in the GLB; **the bend is lost: 148.95 mm** maximum error |
| Same B-bone resampled to 8 plain bones | Joints read from the evaluated pose bone's `bbone_segment_matrix`, each new bone aimed along its chord, weights blended along the length, keys exported | **24.4 mm**, the same inside Blender and after GLB. Six times better, not exact: bone scale is ignored and only 8 segments were used |
| **Corrective shape key** driven by a joint angle | Driver sampled per frame into keys (0 → 0.5 → 1.0), then exported | Works. Drivers themselves do not export |
| Skeleton + morph clip, default | `export_animation_mode='ACTIONS'`, separate actions | **Two glTF animations** (`bend`: TRS; `cAction`: weights), which engines play separately |
| Skeleton + morph clip, **one action with two slots** | Same action assigned to the armature and to the shape keys (slots `OBarm`, `KEkeys`) | **One animation** with rotation, scale, translation and weights. This is the clean recipe |
| `NLA_TRACKS` mode without tracks | Export | No animations (expected) |

`src/neural/` has no morph import path (only a refusal of sparse morph accessors in `glb-read.ts`),
so `importModel` must learn morph targets before a corrective op is useful end to end.

### 4.3 Rigging tools

| Tool | Licence | Headless | Verdict |
|---|---|---|---|
| Rigify (bundled) | GPL, already used by the `rig` task | Yes | Keep. Its deform bones are not one clean hierarchy ([proposal to fix](https://projects.blender.org/blender/blender-addons/pulls/104644)) |
| [GameRig](https://github.com/Arminando/GameRig) | Not confirmed | Built for Blender 2.92 *(excerpt)* | Too old to adopt |
| [Auto-Rig Pro](https://superhivemarket.com/products/auto-rig-pro) | GPL listing; $25 core, $50 full *(excerpt)* | Nothing found on batch use | User's own tool at most |
| [UniRig](https://github.com/VAST-AI-Research/UniRig) | Repository MIT; checkpoint terms not checked | Python, CUDA GPU ≥ 8 GB; Blender optional | **Neural adapter candidate** for non-humanoid skeleton and skin proposals; not run |
| [Meshy rigging](https://docs.meshy.ai/api/rigging) | Service terms | API; "standard humanoid" assets, max 300k faces | Already consumed by `bind from: 'source'` |

## 5. Simulation baked to assets

Sim used in the tests: Blender cloth, 1.6k vertices, 41 frames, 0.92 s on CPU.

| Delivery | Result | Engine use |
|---|---|---|
| **VAT, 16-bit PNG** (1,600 × 41, deltas normalised to the clip's bounds) | 194 kB, decoded error **0.015 mm** max | Needs a vertex shader in the engine, plus bounds metadata and a per-vertex lookup |
| VAT, 8-bit PNG | 35 kB, error **3.9 mm** max | Too coarse for this 1.7 m motion |
| Lookup attribute in glTF | `export_attributes=True` wrote `_VATID` as a custom vertex attribute | Readers must accept `_`-prefixed attributes |
| **Morph flipbook** (every 4th frame, 10 targets, keyed weights) | GLB 267 kB; **42.7 kB with meshopt** | Plays in any glTF reader that supports morphs, no shader, but memory and blend cost grow with targets |
| Bones from a sim: [Dem Bones](https://github.com/electronicarts/dem-bones) | BSD-3-Clause source; prebuilt binaries bundle the FBX SDK and Alembic under their own terms; reads and writes FBX and Alembic | Not run. Gives plain skinning, the most portable result |

`OpenEXR` imports inside Blender 5.3 (module 3.4.10;
[5.3 notes](https://developer.blender.org/docs/release_notes/5.3/python_api/)), but 16-bit PNG was
enough here.

[OpenVAT](https://github.com/sharpen3d/openvat): core add-on GPL-3.0, engine tools (Unity, Unreal,
Godot, EffectHouse) MIT. Its repository says nothing about headless use. Our own encoder took a few
lines of numpy; matching OpenVAT's `-remap_info.json` layout would let its MIT engine tools read the
output *(unverified: the format was not compared)*. ts23d's rule is "assets, not engines", so ship
the textures and metadata, never a runtime shader.

## 6. Export reach and QA

### 6.1 What the 5.3 exporter really does

Add-on version 5.3.43, read from its source and tested.

| Feature | Option | Local result |
|---|---|---|
| `EXT_meshopt_compression` / `KHR_meshopt_compression` ([5.2](https://developer.blender.org/docs/release_notes/5.2/pipeline_io/)) | `export_meshopt_compression_enable`, `export_meshopt_extension` | 675 → 360 kB on a textured morph sphere; re-imported with shape keys. Marked **required** |
| `KHR_draco_mesh_compression` | `export_draco_mesh_compression_enable` | 442 kB; re-imported; marked required |
| `KHR_texture_basisu` ([5.3](https://developer.blender.org/docs/release_notes/5.3/pipeline_io/)) | `export_image_add_compressed_images=True`, `export_compressed_images_type='KTX2'` | Writes `image/ktx2` plus a PNG, extension used but **not** required. `export_image_format='KTX2'` is rejected; `export_use_ktx_compression` alone does nothing |
| `EXT_texture_webp` | `export_image_format='WEBP'` | Works; marked required |
| gltfpack | `export_use_gltfpack`, `export_gltfpack_*` | Options exist; not run (no gltfpack here) |
| `KHR_animation_pointer` | `export_pointer_animation`, `export_convert_animation_pointer` | In the source; not run |
| Also in the source | `KHR_materials_*` (anisotropy, clearcoat, dispersion, emissive strength, ior, iridescence, sheen, specular, transmission, unlit, variants, volume), `KHR_lights_punctual`, `KHR_texture_transform`, `EXT_mesh_gpu_instancing`, `KHR_node_visibility`, `KHR_gaussian_splatting` | Clearcoat and sheen seen in output |

**Consequence:** no new op. ts23d's `meshopt` and `ktx2` tool tasks already cover this, and
`docs/architecture/gltf-capabilities.md` already notes that Godot refuses required extensions it
does not know.

### 6.2 Readers

| Reader | Facts | Source |
|---|---|---|
| Godot (`master`) | Source names `KHR_texture_basisu`, `EXT_texture_webp`, `KHR_animation_pointer`, `KHR_node_visibility`, `KHR_lights_punctual`, `KHR_materials_unlit`, `KHR_materials_emissive_strength`, `KHR_texture_transform`, spec-gloss. **No meshopt, Draco or `MSFT_lod` string** in the files checked | [`gltf_document.cpp`](https://github.com/godotengine/godot/blob/master/modules/gltf/gltf_document.cpp) and [`extensions/`](https://github.com/godotengine/godot/tree/master/modules/gltf/extensions) |
| Unity glTFast 6.8 | Skins yes; morphs partial; legacy animation yes; **Mecanim partial** (clips not assigned, no playback without work); basisu, meshopt, Draco yes; `MSFT_lod` not supported | [features](https://docs.unity3d.com/Packages/com.unity.cloud.gltfast@6.8/manual/features.html) |
| Unreal Interchange | Translator covers textures, materials, static and skeletal meshes ([API](https://dev.epicgames.com/documentation/unreal-engine/API/Plugins/InterchangeImport/UInterchangeGLTFTranslator)); the [import page](https://dev.epicgames.com/documentation/en-us/unreal-engine/importing-gltf-files-into-unreal-engine) gives no feature limits. Forum reports: 4 influences per vertex, and a [5.8 report](https://forums.unrealengine.com/t/ue-5-8-gltf-skinned-gltf-splits-into-several-skeletal-meshes-the-shipped-gltf-pipeline-preset-ships-do-not-combine-regression-from-5-7/2740512) of skinned files splitting *(excerpts; not official)* | As linked |
| [glTF Validator](https://github.com/KhronosGroup/glTF-Validator) | Apache-2.0; npm package or built executable; JSON report. Its list does not include meshopt or `KHR_texture_basisu`, and `KHR_animation_pointer` is partial | Not run (not installed) |

USD: 5.1 to 5.3 notes list many improvements, but nothing in ts23d's scope needs USD now.

## 7. Agent tooling

| Topic | Finding | Evidence |
|---|---|---|
| **Review with no GPU** (open question in the prior doc) | `-b` with Vulkan on lavapipe: Workbench 0.34 s, **EEVEE 3.4 s**, 256², renderer reported as llvmpipe. OpenGL on llvmpipe also rendered (EGL warnings printed; EEVEE took 19.8 s in that earlier run, which rendered the default cube scene, so it is an upper-bound check only). Cycles CPU + OIDN, 16 samples: 0.85 s | Local `t08`. Force with `VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/lvp_icd.json --gpu-backend vulkan`. Vulkan is the default backend on Linux in [5.3](https://developer.blender.org/docs/release_notes/5.3/eevee/) |
| `blender --command` | Local 5.3 lists `asset_listing`, `extension`, `maketx`. `extension` has `build`, `validate`, `install-file`, `server-generate` and more | Local |
| Extensions | Not needed: `--factory-startup` plus scripts passed in keeps runs isolated | Decision |
| Other agent pipelines | [BlenderGym](https://huggingface.co/papers/2504.01786) found vision-language systems struggle with edits that are easy for people; [VIGA](https://arxiv.org/pdf/2601.11109) uses a write, run, render, compare, revise loop. Both *(excerpts, authors' numbers)* | Supports the existing `review` loop |

## A. Brushes without a viewport

### A.1 Current state

ts23d's strokes (`src/primitives/sculpt-stroke.ts`) and VDM stamps (`vdm.ts`, `vdm-scatter.ts`) edit
**signed-distance fields before meshing**. `sculpt-mesh-field.ts` can turn a mesh into such a field
and `sculpt-mesh-detail.ts` keeps its high-pass, but that route re-meshes. A step program can
currently only smooth, inflate or displace an existing mesh within a z-band or sphere mask, or run
free `script` code. A surgical edit along a path on a model's mesh is the gap.

### A.2 What each brush does, and whether numpy can do it

Algorithms read from Blender's source at tag `v5.0.0` (GPL-2.0-or-later; 5.3 was not re-read),
under [`editors/sculpt_paint/brushes/`](https://github.com/blender/blender/tree/v5.0.0/source/blender/editors/sculpt_paint/brushes).
**Blender's algorithms may inform the GPL Python in `examples/blender/`. A TypeScript port in `src/`
would have to be written from the behaviour, not from this source.**

| Brush | Algorithm | Reproducible in numpy along a 3D path? | Prototype result |
|---|---|---|---|
| [Grab](https://github.com/blender/blender/blob/v5.0.0/source/blender/editors/sculpt_paint/brushes/grab.cc) | Factors from **original** positions and normals; translation = grab delta × strength × factor; optional silhouette term from normals | Yes | Yes: 12 mm delta moved 1.18k vertices, 0 flipped |
| [Smooth](https://github.com/blender/blender/blob/v5.0.0/source/blender/editors/sculpt_paint/brushes/smooth.cc) | Up to 4 iterations by strength; each moves toward the neighbour average × factor | Yes | Roughness at the path 0.901 → 0.135 mm, 0 vertices changed beyond the radius |
| Flatten ([Plane](https://github.com/blender/blender/blob/v5.0.0/source/blender/editors/sculpt_paint/brushes/plane.cc)) | Moves vertices along the brush plane's normal to the plane; height and depth scale each side. In 5.0 there is no separate `flatten.cc` | Yes | Mean −2.34 mm on a curved wall, 0 flipped. 4 vertices just past the radius moved (neighbour drift, see below) |
| [Clay Strips](https://github.com/blender/blender/blob/v5.0.0/source/blender/editors/sculpt_paint/brushes/clay_strips.cc) | Local brush matrix on the area plane; only vertices below the plane move, along the plane normal; XY square falloff × parabolic z(1 − z); offset = normal × strength × radius | Yes | 6 mm request: 6.6 mm mean on the path, max 11.5 mm: the strength needs calibration |
| [Crease](https://github.com/blender/blender/blob/v5.0.0/source/blender/editors/sculpt_paint/brushes/crease.cc) | Draw offset along the sculpt normal, plus a pinch "towards a line instead of a single point" with strength from `crease_pinch_factor²` ÷ alpha² | Yes | 8 mm request: −7.55 mm mean, 0 flipped; 92 vertices just past the radius moved because the pinch carries them |
| [Pinch](https://github.com/blender/blender/blob/v5.0.0/source/blender/editors/sculpt_paint/brushes/pinch.cc) | Displacement toward the centre, projected on the stroke-perpendicular axis and the area normal | Yes | Max 3.3 mm, 0 flipped |
| [Inflate](https://github.com/blender/blender/blob/v5.0.0/source/blender/editors/sculpt_paint/brushes/inflate.cc) | Each vertex along its own normal × scale × factor | Yes | 8 mm request: 7.43 mm mean, 0 flipped |
| [Pose](https://github.com/blender/blender/blob/v5.0.0/source/blender/editors/sculpt_paint/sculpt_pose.cc) | Grows a factor by flood fill from an origin, solves an IK chain of segments, then rotates, rolls or scales weighted regions ([manual](https://docs.blender.org/manual/en/latest/sculpt_paint/sculpting/brushes/pose.html)) | Partly. On a bound mesh, `repose`/`weights` is the better tool | My naive single rotation folded **1.75k faces**: not acceptable, do not ship it |
| [Mask](https://github.com/blender/blender/blob/v5.0.0/source/blender/editors/sculpt_paint/brushes/mask.cc) | `mask += factor × current × strength`, clamped 0..1 | Yes | A mask multiplying a stroke's factor: **0 masked vertices moved**. `.sculpt_mask` attribute writable in `-b` |
| [Face Sets](https://github.com/blender/blender/blob/v5.0.0/source/blender/editors/sculpt_paint/brushes/draw_face_sets.cc) | Paints a face-domain integer from face factors | Yes | `.sculpt_face_set` writable in `-b`. Face sets could carry part regions |
| [Cloth](https://github.com/blender/blender/blob/v5.0.0/source/blender/editors/sculpt_paint/sculpt_cloth.cc) | Constraint solver, 5 iterations per step, soft-body pull to the start shape, local / global / dynamic areas ([brush list](https://docs.blender.org/manual/en/latest/sculpt_paint/sculpting/brushes/brushes.html)) | Not as a small op. Use the Cloth modifier with a pinned vertex group, as the `cloth` task does | Not prototyped |
| Multires detail ([smear](https://github.com/blender/blender/blob/v5.0.0/source/blender/editors/sculpt_paint/brushes/multires_displacement_smear.cc), eraser) | Operate on grid displacement | Apply the same numpy displacement to a subdivided copy, then bake (prior doc §2.2, §2.5) | Not re-run |

### A.3 The stroke prototype

Mesh: a 112,640-vertex quad tube bent into a U, so its two legs face each other **3 cm apart**, with
a 0.5 m stroke of radius 6 cm on the inner face of one leg. Dabs every 0.2 radius; falloff
u²(3 − 2u) of **graph-geodesic** distance from the dab's nearest vertex (bounded Dijkstra with a
stable tie-break); area normal and centre per dab; strength normalised over overlapping dabs.

| Check | Result |
|---|---|
| Time | 2.1–2.5 s per path stroke (about 42 dabs), pure Python and numpy, no BVH; single-dab `grab` and `vdm` 0.05–0.08 s |
| Geodesic falloff | `draw`: 9.95k vertices moved, **0 on the facing leg** |
| Euclidean falloff, same stroke | 20,233 moved, **8,378 on the facing leg** |
| Requested vs achieved (`draw`, 8 mm) | 7.46 mm mean along the path, 8.09 mm max |
| Flipped faces | 0 for draw, inflate, clay, flatten, crease, pinch, smooth, VDM, grab |
| Repeatability | Same bytes twice in a process, and **one hash over all brushes equal at `-t 1` and `-t 4`** (`6e3b984aa1cde556`) |

Graph distance overestimates true surface distance a little and depends on edge layout. Run after
`voxelRemesh` or on an evenly tessellated mesh; a raw generator mesh with long triangles will give
uneven falloff *(expected, not measured)*.

### A.4 The windowed lane, and the contradiction

The coordinator saw `sculpt.brush_stroke(override_location=True)` return `FINISHED` and move 0
vertices, against 3,922 in the prior doc. **Cause found: each stroke element's `mouse` still has to
land on the mesh.** Under `xvfb-run` with Vulkan on lavapipe (llvmpipe reported), subdivided Suzanne
(31.7k vertices), the same 16 surface points each time:

| `mouse` in each stroke element | Vertices moved | Max |
|---|---|---|
| Off the mesh, (3, 3) | **0** (still `FINISHED`) | 0 |
| Fixed at the region centre | 150 | 0.111 |
| **Each point projected to the region** (`location_3d_to_region_2d`) | **4,235** | 0.097 |
| Projected, `override_location=False` | 3,851 | 0.118 |

That the fixed mouse moved only 150 vertices suggests stroke spacing follows the mouse path
*(inferred, not traced in source)*. Repeat runs: **identical bytes at `-t 1`; at `-t 2`, the same
vertex count but different bytes, by at most 6e-8 m**. `sculpt.mesh_filter(INFLATE)` moved all
31.7k vertices, with the same hash in every session.

### A.5 Routes compared

| Route | Follows the surface | Repeatable | Needs | Speed here | Verdict |
|---|---|---|---|---|---|
| **numpy/bmesh stroke** | **Yes (geodesic)** | **Yes, across thread counts** | `-b` only | 2 s | **Build** |
| Windowed `sculpt.*` | Blender's own options | Only at `-t 1`; depends on window, view and brush assets | Xvfb, a GL or Vulkan driver | Seconds plus start-up | Keep as a manual escape hatch; not for recipes |
| Geometry Nodes proximity to a path | **No**: Euclidean, 7.97k vertices moved on the facing leg | Yes | `-b` | 0.02–0.04 s | Good for broad masks, wrong for strokes near other surfaces |
| VDM stamp on a mesh (numpy, tangent frame) | Yes when the geodesic region is used | Yes | `-b` | 0.05–0.07 s | **Include as a stroke mode**: 20 mm request reached 20.8 mm, 1.19k vertices. Can reuse ts23d's `.vdm.bin` library |

## B. The professional checklist, verified

Two AI-written guides supplied these items as leads. "Covered" means what ts23d already has.

| Item | Verified finding | ts23d today | Real gap? |
|---|---|---|---|
| Multires detail, then bake on a clean base | Works headless using `object.bake_image` (prior doc §2.5) | `retopo` + `bake` get detail from the source mesh | Only for adding *new* detail; the stroke op on the source covers that first |
| Poly Build | Interactive: all four `mesh.polybuild_*_at_cursor` operators **failed their poll in `-b` edit mode** (local) | None | Not scriptable. Skeleton wrap (§1.2) is the substitute |
| RetopoFlow | [GPL-3.0 code](https://github.com/CGCookie/retopoflow), sold on [Superhive](https://superhivemarket.com/products/retopoflow); listed price conflicts ($59.99 and $85.99 *(excerpts)*); interactive sketching | None | No |
| Mid-poly: bevel + Weighted Normals | Local on a bevelled, cut cube after a glTF round trip: shading error on the large flat faces **9.94° → 1.37°**. The [modifier](https://docs.blender.org/manual/en/5.1/modeling/modifiers/normals/weighted_normal.html) offers face-area weighting and Keep Sharp | Code-built parts: `src/passes/weighted-normals.ts`, `bevel-box.ts` | Only for imported hard-surface meshes: small |
| Boolean + bevel | Local: GN Mesh Boolean's **Intersecting Edges** stored as `bevel_weight_edge` marked 98 edges; a weight-limited Bevel gave 350 faces, 0 non-manifold edges. (The normals test above used an angle-limited bevel: 442 faces, also 0 non-manifold) | SDF operations in `sculpt`; no step op for mesh booleans | Small; a recipe can use `script` |
| Decals | Mesh decals are a texturing style; [DECALmachine](https://superhivemarket.com/products/decalmachine) makes atlases for engines | `src/material/paint` stamps decal cells into the trim sheet, including from PNG | No |
| Apply transforms | Done by the pipeline: `transform` writes into mesh data | Covered | No |
| Merge by distance | `clean.weld` | Covered | No |
| Interior face removal | Local visibility test, 256 directions: **removed 588 of 2.62k faces, exactly the hidden cube**, in 0.3 s | `retopo` shell removes interiors, but `strategy: 'decimate'` keeps them | Small op `dropHidden` for surfaces that must keep their topology |
| Collision meshes | Convex hull is one bmesh call (local). [V-HACD](https://github.com/kmammou/v-hacd) is BSD-3-Clause *(excerpt)*; CoACD's licence was only seen in a forum post | `src/physics`: box, sphere, capsule, cylinder, capped hull **per pivot** | Convex **decomposition** of a single concave model part is the gap; better done in `src/physics` than in Blender |
| Texel density | Measure √(UV area × size² ÷ world area) | `assertTexelDensity`; `uv` averages islands | Report px/m in the `uv` step: small |
| Triangle budgets by class | **No official per-class table was found.** Meta gives per-frame baselines of [1–2 million triangles and 500–1,000 draw calls](https://developers.meta.com/horizon/documentation/native/pc/dg-performance-guidelines/) for PC *(excerpt)*. CRYENGINE's [Character Budgets](https://www.cryengine.com/docs/static/engines/cryengine-5/categories/23756816/pages/23307976) page quotes one game (35,000–70,000 LOD0) *(excerpt; page body did not load)*. Vendor blog ranges disagree with each other | Per-recipe `budget.triangles`, enforced; playbooks give bands | No. Do not import the guide's unsourced numbers |
| FBX settings for Unreal | Blender 5.3 defaults (local): `apply_scale_options='FBX_SCALE_NONE'`, `apply_unit_scale=True`, `mesh_smooth_type='OFF'`, `add_leaf_bones=True`, `use_armature_deform_only=False`, `use_tspace=False`. Forum advice is to change leaf bones, deform-only and scale *(excerpts; no official Epic page confirmed)*. Blender's own importer reading back could not show Unreal's behaviour | None by design | Only if FBX is added |
| FBX settings for Unity | [Unity's importer](https://docs.unity.com/en-us/engine/current/manual/assets-and-media/asset-types/models/importing/fbximporter-model) documents Scale Factor, Convert Units, Bake Axis Conversion, normal and MikkTSpace tangent options | None | As above |
| Is FBX still needed for skeletal assets? | **For Unity with Mecanim, yes in practice**: glTFast lists Mecanim clips as partial. Godot prefers glTF. Unreal imports skeletal glTF, with the forum caveats above | GLB only, by decision | Optional sidecar op, low priority. 5.0 also moved import to `bpy.ops.wm.fbx_import` ([notes](https://developer.blender.org/docs/release_notes/5.0/pipeline_io/)) |
| "Sculptian" | **Not found** in a targeted search. Dropped | — | No |

### Add-ons the guides named

All run inside Blender. None has documented headless use in the pages read, so none belongs in a
pipeline. Prices are from the listings on the research date.

| Add-on | Does | Licence · price | Open route we can script |
|---|---|---|---|
| [Hard Ops / Boxcutter](https://superhivemarket.com/products/hard-ops--boxcutter-ultimate-bundle) | Interactive hard-surface cutting and bevel workflow | GPL · $38 bundle *(excerpt)* | Boolean + weighted bevel + Weighted Normal (tested) |
| [Zen UV](https://superhivemarket.com/products/zen-uv) | Seams, stacking, packing, texel density, trim sheets | GPL · $39 standard | `uv` op, `pack_islands`, trim mapping in ts23d |
| [SimpleBake](https://superhivemarket.com/products/simplebake---simple-pbr-and-other-baking-in-blender-2) | PBR, curvature and thickness baking, channel packing | GPL · $20. Its "background" baking means while the UI stays usable | `bake` op |
| [Auto-Rig Pro](https://superhivemarket.com/products/auto-rig-pro) | Rigging, retargeting, engine export | GPL · $25 / $50 *(excerpt)* | `bind`, `rig`, UniRig adapter |
| [DECALmachine](https://superhivemarket.com/products/decalmachine) | Mesh decals, trim sheets, atlases | GPL · from $54.99 | ts23d trim-sheet cells |
| [Quad Remesher](https://exoside.com/quadremesher/quadremesher-buy/) | Auto quad remeshing | Proprietary · $109.90 | QuadriFlow, Instant Meshes, QuadWild, skeleton wrap |

A GPL listing permits running and redistribution under the GPL; it does not grant access to paid
downloads, and it says nothing about whether a tool suits automation.

## 8. Local tests run

Scripts were throwaway. Each ran with `blender -b --factory-startup -noaudio`, except the windowed
test. Bugs found in the test scripts were fixed and the tests re-run; only final results appear.

| Test | Outcome |
|---|---|
| glTF options and compression round trips | 114 operator options read. Meshopt, Draco, WebP, KTX2 written; meshopt and Draco re-imported with shape keys |
| Skeleton wrap vs decimate vs QuadriFlow, bone heat, posed metrics (two densities) | §1.2 |
| Stroke prototype: nine modes, mask, VDM, geodesic vs Euclidean, `-t 1` vs `-t 4` | §A.2, §A.3 |
| Pose-style rotation | Folded 1.75k faces; rejected |
| Geometry Nodes proximity stroke | Repeatable; leaks across the gap |
| `xvfb-run` sculpt lane, 4 sessions: the 2 that set the thread counts in §A.4 confirmed lavapipe; the first 2 did not force or log the Vulkan driver, and gave the same vertex counts | §A.4 |
| De-lighting by SH fit, with oracle control (RMSE 0.003) | §2.1 |
| Spline IK bake, B-bone export, B-bone resampling, corrective key, slotted action | §4.2 |
| Cloth → 8- and 16-bit VAT, morph flipbook, meshopt, custom attribute | §5 |
| Geometry Nodes inventory, scatter + repeat + bake, closure from Python | §3 |
| Bevel + Weighted Normal, Boolean edge weights, interior removal, hull, Poly Build poll, FBX round trip, KTX2 | §6, §B |
| LOD normal-map reuse vs rebake | §2.2 |
| Fitted cage vs extrusion | §2.2 |
| Workbench, EEVEE, Cycles CPU without a GPU | §7 |

## 9. Not verified

- No test used a real generated mesh, and no engine was run (Godot, Unity and Unreal facts come from
  their sources or documents).
- Blender 4.5 LTS and 5.2 LTS were not run; every result is from 5.3.0. Op code for 4.5 must handle
  the older action API, and any 5.2+ or 5.3-only node needs a version gate.
- QuadWild, Instant Meshes, Dem Bones, UniRig, gltfpack, the glTF Validator and OpenVAT were not
  executed. Licences above come from their repositories unless marked.
- The stroke prototype used an even quad mesh. Long-triangle meshes, non-manifold input and strokes
  crossing UV seams after a bake are untested.
- Skin and joint quality was judged by geometry measures at one elbow, not by eye or by animation.
- Pages that could not be read: Blender's FBX manual page (404 at the URL tried), and the body of
  the CRYENGINE budget, Poly Build and XPBD manual pages (cut off by the fetcher).

## 10. Ranked recommendations

Rank weighs gain for an AI-generated asset, proof, and cost. "Headless proof" means a local run on
Blender 5.3 in this research. All ops are new, or new optional fields without defaults, so no
committed request key changes. Python goes in `examples/blender/tasks/steps/` under GPL-2.0-or-later.

| # | Candidate | What it gains for an AI-generated mesh or asset | Headless proof | Licence | Effort | Risk |
|---|---|---|---|---|---|---|
| 1 | **`stroke` op**: `draw`, `inflate`, `clay`, `flatten`, `crease`, `pinch`, `smooth`, `grab`, `vdm` along a 3D path, geodesic falloff, optional mask | Fix a generated mesh where it is wrong (close a lip line, flatten a lump, raise a brow) with no re-mesh and no window; 0 leak across a 3 cm gap; same bytes across thread counts | **Yes** | Own code, GPL Python | M | Graph distance on bad triangles; run on the source before `retopo`, and refuse it after `bake` unless the bake is redone |
| 2 | **`lodBake` op**: rebake a smaller normal map per LOD, same UVs | LOD2 shading error 10.6° → 0.23° | **Yes** | Own code | M | Adds a texture per LOD; needs `budget.textureSets` and a per-LOD material in `importModel` |
| 3 | **`delight` op**: log-domain SH fit from baked normals, with a `strength` | Removes generator lighting from albedo: RMSE 0.254 → 0.101 on a synthetic test | **Yes** (synthetic) | Own code | S | Takes real countershading for light (0.130 left, correlation 0.37). Report before/after, and keep it opt-in |
| 4 | **`bake.cageFit`**: new optional field, cage offset limited by the opposite wall | Stops fingers, legs and wing folds baking each other: 13.9 % wrong texels → 0 % | **Yes** | Own code | S | Cage must keep topology; a ray per vertex on a heavy source costs time |
| 5 | **`bakeRig` op**: Spline IK to bone keys; B-bones resampled to plain bones | Curve-driven tails and tentacles reach any glTF engine: Spline IK 0.0 mm; B-bone error 149 → 24.4 mm | **Yes** | Own code | M | B-bone result is approximate; separate code path for the 4.5 action API. Coordinate with the locomotion research |
| 6 | **`skeletonShell` op**: Skin-swept quads wrapped from outside | Joint-ready topology with no add-on: 256 vs 85–145 vertices at the elbow, sharp posed edges 1.8 % vs 4.5–5.8 % | **Yes** (synthetic) | Own code | M | Loses ears and horns (11.8 mm); needs bones for every appendage, or a merge with a remeshed part. Validate on real bodies first |
| 7 | **`corrective` op**: joint-driven shape key, baked into the same action in a second slot | Cleaner shoulders and hips, one clip holding skin and weights | **Yes** for Blender and export | Own code | M | `importModel` needs morph-target support first |
| 8 | **`scatter` op**: Geometry Nodes Poisson scatter of scales or studs, realised, for baking | Real relief for dragons, reptiles, armour without keeping the triangles | **Yes** | Own code; Blender's nodes | S–M | Node API differs across lines; pin a tested tree per Blender line |
| 9 | **`simBake` op**: cloth or soft-body to 16-bit VAT + JSON, or a morph flipbook | Capes, flags and banners as assets; 0.015 mm VAT; 42.7 kB flipbook with meshopt | **Yes** | Own code; OpenVAT engine tools MIT if layout is matched | M | VAT needs an engine shader, which ts23d will not ship; morph memory grows with frames |
| 10 | **`dropHidden` op**: remove faces no outside ray reaches | Removes inner shells when topology must be kept: 588/588 hidden faces | **Yes** | Own code | S | Deep cavities can look hidden; limit by a `cavity` setting and report area removed |
| 11 | **Software review path**: document and detect lavapipe for `review` | `t3d blender review` works on a machine with no GPU, and while the GPU is busy | **Yes** | Mesa (user-installed) | S | Vulkan driver must be present; rendering may differ slightly from a GPU's |
| 12 | **`hardSurface` op**: boolean edge weights, bevel, Weighted Normal for imported parts | Flat faces read flat on model-built hard-surface parts: 9.94° → 1.37° | **Yes** | Own code | S–M | Works on clean geometry; a noisy generated surface must be remeshed first |
| 13 | **External remesh adapter**: Instant Meshes first, QuadWild second, as user-installed tools | More choices than QuadriFlow, with crease control | **No** | BSD-3-Clause; GPL-3.0 as a separate program | M | Quality on generated meshes unknown; binaries are old or need building |
| 14 | **UniRig neural adapter** | Proposes a skeleton and weights for non-humanoid models | **No** | MIT code; weights terms to check | M | Needs the GPU box; output must still pass `review` |
| 15 | **Convex decomposition** in `src/physics` | Better collision for concave imported parts | **No** | Own code or BSD-3-Clause V-HACD as a reference | M | Belongs in TypeScript, not Blender |
| 16 | **Dem Bones tool task**: mesh sequence to skinned bones | Simulations become ordinary skinned clips | **No** | BSD-3-Clause source; bundled SDK terms apply to the binary | M | FBX or Alembic bridge required |
| 17 | **FBX sidecar export** | Practical route for Unity Mecanim | Option defaults and round trip only | Blender's exporter; output is yours | S–M | No engine test; contradicts GLB-only unless kept optional |

**Do not build:** a windowed sculpt lane for recipes (thread-dependent bytes, view-dependent input);
exporter-side meshopt or KTX2 ops (tool tasks exist); Geometry Nodes strokes (they cross gaps); a
Pose-brush clone (`repose` and `weights` already serve bound meshes); any dependency on the paid
add-ons above.

**Suggested first slice:** ranks 1, 4 and 11 are independent and small enough to ship together; rank
3 follows once it has been measured on one real generated texture; rank 2 needs its material
decision first.

## Sources

- Blender release notes: [5.0 Geometry Nodes](https://developer.blender.org/docs/release_notes/5.0/geometry_nodes/) · [5.0 Python API](https://developer.blender.org/docs/release_notes/5.0/python_api/) · [5.0 Pipeline & I/O](https://developer.blender.org/docs/release_notes/5.0/pipeline_io/) · [5.1 Geometry Nodes](https://developer.blender.org/docs/release_notes/5.1/geometry_nodes/) · [5.1 Pipeline & I/O](https://developer.blender.org/docs/release_notes/5.1/pipeline_io/) · [5.2 Geometry Nodes](https://developer.blender.org/docs/release_notes/5.2/geometry_nodes/) · [5.2 Animation](https://developer.blender.org/docs/release_notes/5.2/animation_rigging/) · [5.2 Pipeline & I/O](https://developer.blender.org/docs/release_notes/5.2/pipeline_io/) · [5.3 index](https://developer.blender.org/docs/release_notes/5.3/) · [5.3 Geometry Nodes](https://developer.blender.org/docs/release_notes/5.3/geometry_nodes/) · [5.3 Animation](https://developer.blender.org/docs/release_notes/5.3/animation_rigging/) · [5.3 Modeling](https://developer.blender.org/docs/release_notes/5.3/modeling/) · [5.3 Python API](https://developer.blender.org/docs/release_notes/5.3/python_api/) · [5.3 EEVEE & Viewport](https://developer.blender.org/docs/release_notes/5.3/eevee/) · [5.3 Cycles](https://developer.blender.org/docs/release_notes/5.3/cycles/) · [5.3 Pipeline & I/O](https://developer.blender.org/docs/release_notes/5.3/pipeline_io/)
- Blender source and manual: [sculpt brushes at v5.0.0](https://github.com/blender/blender/tree/v5.0.0/source/blender/editors/sculpt_paint/brushes) · [Pose brush](https://docs.blender.org/manual/en/latest/sculpt_paint/sculpting/brushes/pose.html) · [Mesh Sculpt Brush Assets](https://docs.blender.org/manual/en/latest/sculpt_paint/sculpting/brushes/brushes.html) · [Weighted Normal](https://docs.blender.org/manual/en/5.1/modeling/modifiers/normals/weighted_normal.html) · [XPBD Solver](https://docs.blender.org/manual/en/5.2/modeling/geometry_nodes/simulation/xpbd_solver.html) · glTF add-on source as shipped in Blender 5.3 (`scripts/addons_core/io_scene_gltf2`, version 5.3.43; read locally)
- Blender issues: [#52063](https://projects.blender.org/blender/blender/issues/52063) · [#79670](https://projects.blender.org/blender/blender/issues/79670) · [Rigify deform hierarchy PR #104644](https://projects.blender.org/blender/blender-addons/pulls/104644)
- Retopology: [QuadWild Bi-MDF](https://github.com/cgg-bern/quadwild-bimdf) · [QRemeshify](https://github.com/ksami/QRemeshify) · [Instant Meshes](https://github.com/wjakob/instant-meshes) · [Quad Remesher docs](https://exoside.com/quadremesher/quadremesher-doc/) · [SQuadGen](https://microsoft.github.io/SQuadGen/) · [TopGen](https://arxiv.org/html/2603.10606v1) · [NeurCross](https://arxiv.org/html/2405.13745v3) · [RetopoFlow](https://github.com/CGCookie/retopoflow)
- Texture models: [Marigold IID Appearance](https://huggingface.co/prs-eth/marigold-iid-appearance-v1-1) · [Marigold IID Lighting](https://huggingface.co/prs-eth/marigold-iid-lighting-v1-1) · [Hunyuan3D-2](https://huggingface.co/tencent/Hunyuan3D-2) · [StableDelight model](https://huggingface.co/Stable-X/yoso-delight-v0-4-base)
- Simulation and rigging: [OpenVAT](https://github.com/sharpen3d/openvat) · [Dem Bones](https://github.com/electronicarts/dem-bones) · [UniRig](https://github.com/VAST-AI-Research/UniRig) · [Meshy rigging](https://docs.meshy.ai/api/rigging) · [Meshy remesh](https://docs.meshy.ai/en/api/remesh)
- Readers and validation: [Godot glTF module](https://github.com/godotengine/godot/tree/master/modules/gltf) · [glTFast features 6.8](https://docs.unity3d.com/Packages/com.unity.cloud.gltfast@6.8/manual/features.html) · [Unreal glTF import](https://dev.epicgames.com/documentation/en-us/unreal-engine/importing-gltf-files-into-unreal-engine) · [Unity FBX importer](https://docs.unity.com/en-us/engine/current/manual/assets-and-media/asset-types/models/importing/fbximporter-model) · [glTF Validator](https://github.com/KhronosGroup/glTF-Validator)
- Agent work: [BlenderGym](https://huggingface.co/papers/2504.01786) · [VIGA](https://arxiv.org/pdf/2601.11109)
