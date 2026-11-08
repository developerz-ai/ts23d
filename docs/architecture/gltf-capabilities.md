# What a GLB can carry, and what ts23d writes

**glTF 2.0 / GLB stays the output format.** It is open and royalty-free, one compact binary file, and
first-class in Godot, three.js and Babylon, imported by Unreal (Interchange) and Unity (glTFast). FBX is
proprietary (Autodesk SDK) and inconsistent across versions; USD/USDZ is built for film-style scene
composition and Apple AR (a later USDZ export is possible); OBJ/STL carry no hierarchy, motion or
materials. This page maps the whole glTF surface onto the DSL: shipped, next, later, never.

Status legend: **shipped** = on `main` with a test · **next** = the current roadmap slice ·
**later** = wanted, unscheduled · **no** = out of scope, with the reason.

## Core glTF 2.0

| Capability | glTF | ts23d | Status |
|---|---|---|---|
| Named node hierarchy, pivots | `nodes` | `ctx.part` / `ctx.group`, parent + pivot | shipped |
| Static batching | one mesh per pivot | `mergeToPivots` | shipped |
| Vertex colour albedo | `COLOR_0` (u16 normalised) | every primitive's `color` | shipped |
| PBR metal/rough + normal + ORM | `pbrMetallicRoughness`, `normalTexture`, `occlusionTexture` | procedural trim sheet | shipped |
| Alpha modes | `OPAQUE` / `MASK` / `BLEND` | surfaces opaque / cutout / glass / translucent | shipped |
| Node animation (TRS) | `animations` | `spin`, `slide`, `sway` → `rest` + `run` clips | shipped |
| Sockets, emitters | `extras` on empty nodes | `ctx.socket`, `ctx.emitter` | shipped |
| Skins (bones) | `skins`, `JOINTS_0` / `WEIGHTS_0`, `inverseBindMatrices` | `ctx.bone` + skinned sculpt (below) | later |
| Morph targets | `targets` + `weights` | face shapes: blink, jaw open, snarl | later |
| Cameras | `cameras` | preview / hero camera per asset | later |

### Skins: how ts23d will rig without auto-rigging
Heat-diffusion auto-rigging (Pinocchio, Baran & Popović 2007; Blender "bone heat"; Maya heat map) guesses
which bone owns which vertex, and fails on messy meshes. ts23d knows. A sculpted character is an ordered
list of SDF edits (Dreams' model: Evans, SIGGRAPH 2015). Tag each edit with its bone, and the per-vertex
smooth-min blend weights that already mix the edits' colours *are* the skin weights. Keep the strongest
4 per vertex (`JOINTS_0`/`WEIGHTS_0`; Unreal's Interchange importer truncates to 4) and renormalise.
`skin.joints` order must match `inverseBindMatrices`; that ordering is the classic broken-skin bug, so
a test pins it. Rigid parts (`ctx.part`) stay node-animated: a tank has no skin.

## Ratified extensions worth writing

| Extension | Use in ts23d | Status |
|---|---|---|
| `KHR_materials_emissive_strength` | lit windows, lamps, sci-fi panel glow | shipped |
| `KHR_lights_punctual` | headlamps, street lamps, cockpit lights as light nodes | shipped |
| `KHR_materials_variants` | liveries / camo schemes as switchable sets in one file: `paint` slots + `variants` | shipped (below) |
| `KHR_xmp_json_ld` | licence, author, generator version, `sources` inside the file | shipped |
| `KHR_materials_clearcoat` | lacquered paint slots (`paint: { body: { colour, clearcoat } }`) and finishes | shipped (below) |
| `KHR_materials_transmission` + `ior` + `volume` | `glass`, `translucent`, `ice`, `liquid`, `jelly` surfaces + `optics` overrides | shipped (below) |
| `KHR_materials_sheen` · `_anisotropy` · `_iridescence` · `_specular` | named `finishes`: velvet, brushed metal, heat tint, satin | shipped (below) |
| `KHR_texture_transform` | strip offset / scale without re-baking UVs | later |
| `EXT_mesh_gpu_instancing` | rivets, bolts, scatter trees: one mesh, N transforms | later |
| `KHR_mesh_quantization` + `EXT_meshopt_compression` | `web` profile (smaller files) | later (opt-in: Godot rejects *required* extensions) |
| `MSFT_lod` (vendor, complete) | three LODs in one file with screen-coverage hints: `<asset>.glb`, `toLodGlb` | shipped (below) |
| `KHR_animation_pointer` | animate material / light values (blinking lamp, heat glow) | later |
| `KHR_texture_basisu` | KTX2 GPU-compressed trim sheet | later |
| `KHR_draco_mesh_compression` | — | no: meshopt is faster to decode and preferred |
| `KHR_gaussian_splatting` | — | no: we generate meshes, not captures |
| `KHR_interactivity` | — | no: behaviour is engine code, out of scope |

## LODs in one file: `MSFT_lod`

`t3d build` writes `lod0/1/2.glb` **and** `<asset>.glb` holding all three (`--lods split|single|both`,
default `both`). Default is `both` because separate files import into every engine's LOD tooling
today, while the single file serves MSFT_lod-aware loaders and one-file pipelines; disk is the only cost.

Layout (per the [spec](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Vendor/MSFT_lod)):
- LOD0's root node is the only scene root. It carries `extensions.MSFT_lod.ids` = the LOD1, LOD2 root
  nodes (lower quality in order) and `extras.MSFT_screencoverage` = one value per LOD: the screen-height
  fraction where that LOD hands over to the next, the last one being the cull (`[0.43, 0.086, 0.01]`
  for tiger_1: LOD0 above 43 %, LOD1 to 8.6 %, LOD2 to 1 %, then nothing). Same convention as Unity
  LODGroup's screen-relative transition height.
- LOD1/LOD2 roots (`<asset>_LOD1`, `<asset>_LOD2`) are parentless and **not** in `scenes[0].nodes`: the
  spec says a client without the extension loads the highest LOD and ignores the rest, which only
  holds if the alternates are outside the scene graph. Part names inside each LOD are unchanged
  (`turret`, `wheel_l_0`), so game code binds the same names at any LOD.
- `MSFT_lod` is in `extensionsUsed`, never `extensionsRequired` (Godot refuses unknown required
  extensions). Materials, the trim sheet, lights and identical motion samplers are written once; the
  `rest` and `run` clips hold one channel per LOD node.
- Thresholds: `lodCoverage: [a, b, cull]` on `defineAsset`, else derived: a LOD with r × the
  triangles reads equally dense at √r × the screen size (a ∈ [0.1, 0.6], b ∈ [0.02, a/2]); cull 1 %
  for props, 0.2 % for anything ≥ 10 m so landmarks stay on the skyline.

| Loader | Reads MSFT_lod? | What a single file shows | Verified how |
|---|---|---|---|
| Babylon.js | yes, node + material level (progressive: loads low LODs first, ends on LOD0) | all LODs, switching | Babylon docs / spec "Known Implementations" |
| three.js `GLTFLoader` | no (community plugin `three-gltf-extensions`, in progress) | LOD0 only; the mixer warns "No target node found" for the alternates' tracks (harmless) | loaded tiger_1.glb with three 0.186: 23 meshes, same bounds as lod0.glb |
| Godot 4.5+ | no (not in `GLTFDocument` supported list) | LOD0 only (scene roots only, `gltf/naming_version` 2 default) | Godot master `gltf_document.cpp` |
| Godot 4.0–4.4 (or naming_version < 2) | no | **all three overlapping**: treats every parentless node as a root. Use `lod0.glb` there | same source, `_compute_node_heights` |
| Unity glTFast | "not investigated yet" in its docs | expected LOD0 only (instantiates the scene) — unverified | glTFast 6.0 features page |
| Unreal Interchange | not documented | unverified; use `lod0/1/2.glb` and Unreal's LOD import | — |
| Khronos glTF-Validator | info `UNSUPPORTED_EXTENSION` | 0 errors, 0 warnings (test `src/export/lod-glb.test.ts`) | test |
| ArcGIS Pro | yes, node level on the scene's first node | all LODs | Esri docs |

Engines that build LOD groups from names (Unity's FBX `_LOD0/_LOD1` convention) don't apply it to glTF
imports, so the split files plus each engine's own LOD importer remain the portable path.

## Liveries in one file: `KHR_materials_variants`

glTF base colour = `baseColorTexture × COLOR_0 × baseColorFactor`. ts23d paints with `COLOR_0`, which a
variant cannot switch, so switchable colour goes through **paint slots** (opt-in; without `paint` the
GLB is byte-identical to before, test `src/export/variants.test.ts`):

```ts
defineAsset({
  paint: { body: '#84402d', letter: '#e8e2d2' },          // slot → default colour (sRGB hex or linear)
  variants: { oxide_red: { body: '#74382a' }, faded: { body: '#a0644f', letter: '#cfc6b4' } },
  build(ctx) {
    ctx.part('body', sides, { paint: 'body' });            // this part's colour belongs to the slot
    ctx.part('lettering', text, { paint: 'letter' });
  },
});
```

- **Export.** Each slot is one material: the opaque trim material with `baseColorFactor` = the slot
  colour. A painted vertex stores `COLOR_0` = its colour ÷ the slot colour (`tone` in
  `src/core/paint.ts`), so the default looks exactly as authored and a variant keeps every grime,
  wear and shading tone. Channels the slot barely has (blue of a pure red) borrow the mean ratio of
  the others. A painted part brighter than its slot (bare iron, chrome) would clamp, so `compile`
  refuses it: give those bits their own part.
- **Variants.** Root `extensions.KHR_materials_variants.variants` lists them in declaration order;
  each painted primitive carries `mappings` from variant indices to that slot's material (one
  material per distinct repaint, shared by every LOD and pivot). No variant selected = `paint`.
  `extensionsUsed` only, never `extensionsRequired`: a loader without it shows the default paint.
- **Cost.** Merging puts painted geometry in `<pivot>_paint_<slot>` children: **one extra draw call
  per slot per pivot** that has painted geometry (boxcar: 9 → 13 draws at LOD0, 2 slots, 3 painted
  pivots). Paint only what a livery changes. Glow beats paint; glass/cutout can't be painted.
- **Looking at one.** `t3d hero|shot|build --variant <name>` renders `hero_<name>.png` /
  `sheet_<name>.png` (`compile(asset, { variant })` multiplies the painted tones by the variant
  colours, exactly what an engine shows). The GLBs are the same either way. `manifest.json` lists
  `paint` and `variants` as sRGB hex.

| Loader | Reads KHR_materials_variants? | Verified how |
|---|---|---|
| Babylon.js | yes: `KHR_materials_variants.SelectVariant(root, name)` | Babylon loader typedoc |
| `<model-viewer>` | yes: `variant-name` attribute, `availableVariants` | model-viewer docs (not run here) |
| three.js `GLTFLoader` | not in core; the official `webgl_loader_gltf_variants` example implements it in page code; plugins: `three-gltf-extensions`, threepipe | threejs.org GLTFLoader docs |
| Blender (glTF importer, 3.3+) | yes, import + export, variants panel | Blender manual change, July 2022 (bf-docboard r9400) |
| Unity glTFast | yes (6.x/7.0 feature table; `MaterialsVariantsControl` API) | Unity glTFast docs |
| Unreal | glTF **exporter** writes it (Variant Manager); Interchange import not documented: expect default paint | Epic Python API `GLTFVariantSetsMode`; import unverified |
| Godot 4 | not found in `GLTFDocument`'s supported extensions: default paint | unverified (no source found either way) |
| glTF-Transform | yes, `KHRMaterialsVariants` (pipelines, inspection) | gltf-transform.dev |
| Khronos glTF-Validator | yes | 0 errors, 0 warnings: split and single-file (test) |

## Physics: rigid body, colliders, mass (`physics: true`, opt-in)

`KHR_physics_rigid_bodies` + `KHR_implicit_shapes` are **Khronos review drafts** (spec repo:
github.com/eoineoineoin/glTF_Physics; the registry lists rigid bodies as Review Draft, PR #2424). ts23d
writes them only when asked, listed in `extensionsUsed`, never `extensionsRequired`: a reader without
them shows the same model. API: `toGlb(asset, { physics: true })` / `exportGlb(...).physics` (the
report: body, mass, centre of mass, inertia, colliders). CLI flag `--physics`: planned (wiring pending).

| Piece | What is written | Status |
|---|---|---|
| Body | `motion` on the LOD0 root: `mass`, `centerOfMass`, `inertiaDiagonal`, `inertiaOrientation` (principal axes, Jacobi); `isKinematic` for `body: 'kinematic'`; no `motion` for `static` (default for kinds `building`, `terrain`, `structure`, `scene`; else `dynamic`) | shipped |
| Colliders | one node `<pivot>_collider` per pivot (groups, moving parts, static `body` on the root), a child of the pivot so it moves with turrets and doors | shipped |
| Shapes | `auto`: smallest enclosing box (axis-aligned or PCA) / sphere / capsule / cylinder; if it overshoots the convex hull by > 25 %, a ≤ 64-vertex convex hull; static bodies get the exact trimesh instead; a hull over 1.6× its parts' hulls (a mantlet + barrel cone) splits into a compound of ≤ 8 biggest parts. Per part: `collider: 'box' \| 'sphere' \| 'capsule' \| 'cylinder' \| 'convex' \| 'mesh' \| 'none'`; `surface: 'cutout'` parts get none by default | shipped |
| Invisible colliders | implicit shapes are JSON; hulls and trimeshes are meshes **no node instances**, so no viewer draws them (test walks the scene like three.js) | shipped |
| Mass | per shell (welded connected triangles): closed → signed tetrahedron volume × density of the strip carrying most of its area; open → its convex hull, counted in `openShells`; `physics.shell` / part `shell` (wall metres) → area × wall, capped at solid. `physics.mass` overrides the total, keeping the distribution | shipped |
| Physics material | friction / restitution per collider from its dominant strip | shipped |
| QA `mass` | `real.mass` (+ `massTolerance`, default 15 %) vs computed mass → `T3D_MASS_MISMATCH` (`massFindings`; gate wiring in /qa pending) | shipped (function) |
| Engine conventions | opt-in `physics: { conventions: ['unreal', 'godot'] }`: `UCX_<pivot>_NN` hull nodes; Godot `<pivot>-convcolonly` (hull) / `-colonly` (static trimesh). These are **visible meshes** to any other reader; they carry `extras.ts23d.collider` for loaders to hide | shipped |
| `OMI_physics_body` / `OMI_physics_shape` (Godot's native glTF physics) | — | later |

Density (kg/m³; engineeringtoolbox.com "Densities of Solids", "Metals and Alloys - Densities", "Wood
Species - Densities"): steel / iron / chrome-plated / galvanised 7850, wrought iron (`iron_rust`) 7700,
cast iron 7200, brass 8500, copper 8960, aluminium 2700, oak 750, pine 500, generic wood 600, weathered
550, glass 2500, brick 1900, concrete 2400, stone / cobblestone / rock 2600, slate 2800, rubber 1100,
plastic (ABS) 1050, leather 860, canvas 600 (effective), ice 917, snow 300, sand 1600, soil 1300,
gravel 1700, mud 1700, rock strata 2300, cliff 2700, moss 400, grass 300, bark (oak/pine/birch) 500, lava 2800, asphalt 2300. `plain` is untyped paint: 1000 (water) as the honest unknown;
map it per recipe, `physics: { density: { plain: 7850 } }`. Table: `src/physics/density.ts`.

Friction (static / dynamic, dry, engineeringtoolbox.com "Friction and Friction Coefficients") and
restitution (typical rigid-body values, approximate): steel 0.74 / 0.57 / 0.5, cast iron 1.1 / 0.15,
wood 0.5 / 0.3 / 0.4, masonry 0.62 / 0.55 / 0.2, rubber 1.0 / 0.8 / 0.7, glass 0.94 / 0.4 / 0.6, ice
0.1 / 0.03. Table: `src/physics/surface.ts`. Engines combine per contact pair (`average` by default).

Measured (LOD0, all strips decoded from UVs, no recipe changes):

| Asset | Solid | With wall | Real | Colliders |
|---|---|---|---|---|
| tiger_1 | 199.6 t | 54.6 t at `shell: 0.06` (−4 %) | 57 t combat weight | body box, 16 road-wheel + 2 idler cylinders, sprocket / turret hulls, gun = mantlet + barrel hulls (compound) |
| boxcar | 137.2 t | 54.7 t at `shell: 0.03` | not declared | body box, truck boxes, axle cylinders, door hulls |
| boulders | 7.6 t | — | — | compound: one hull per rock (3) |
| water_tower (static) | 263.6 t | 12.3 t at `shell: 0.03` | — | trimeshes |

Engine support (as of 2026-11; unverified rows say so):

| Reader | KHR physics | Conventions |
|---|---|---|
| Blender | glTF_Physics Blender add-on (eoineoineoin) imports/exports both | — |
| Babylon.js | listed as a known importer by the spec repo; unverified which version | — |
| Godot 4 | not in the built-in importer (it reads OMI physics); community `glTF_Physics_Godot_Importer` plugin, experimental | `-convcolonly` / `-colonly` scene-import hints: built in |
| Unity (glTFast) | no | — (add colliders in an import post-processor reading `extras.ts23d.collider`) |
| Unreal (Interchange) | no | `UCX_` prefix: FBX convention; glTF honouring it unverified |
| three.js / model-viewer | ignored (colliders stay invisible) | conventions render: hide nodes with `userData.ts23d.collider` |
| Khronos glTF-Validator | `UNSUPPORTED_EXTENSION` / `UNUSED_OBJECT` infos only: 0 errors, 0 warnings (test) | same |

## PBR extensions: lacquer, optics, finishes

All Khronos **Ratified**; written in `extensionsUsed` only, never `extensionsRequired`, so a loader
without one shows the base PBR material. Assets that use none of it export byte-identical files
(`src/export/pbr.test.ts`); the glTF-Validator passes every combination (`pbr-validator.test.ts`).

| DSL | Extension blocks | Material |
|---|---|---|
| `paint: { body: { colour, clearcoat?, clearcoatRoughness?, metallicFlake? } }` | clearcoat; flake → metallicFactor = flake, roughness 0.5 → 0.3 | `ts23d_paint_<slot>` (+ every livery keeps the lacquer) |
| `surface: 'glass' \| 'translucent' \| 'ice' \| 'liquid' \| 'jelly'` | transmission + ior + volume (+ attenuation for ice/water/`optics`) | `ts23d_<surface>`, one per surface |
| `optics: { glass: { ior, thickness, attenuationColour, attenuationDistance, roughness, transmission } }` | overrides the surface preset | same |
| `finishes: { velvet: { sheen }, brushed: { metallic, roughness, anisotropy }, heat: { iridescence }, satin: { specular, clearcoat } }` + part `{ finish: 'velvet' }` | sheen · anisotropy · iridescence · specular · clearcoat | `ts23d_finish_<name>`, children `<pivot>_finish_<name>` |

Presets (`OPTICS` in core): glass IOR 1.5 / 10 mm · translucent 1.45 · ice 1.31, blue absorption ·
liquid (water) 1.33, faint cyan over 1.5 m · jelly 1.35, roughness 0.25. A finish or lacquer that
declares metallic/roughness replaces the sheet's metallicRoughness texture with factors (occlusion
stays) and carries `extras.ts23d.ownFactors`. Anisotropy follows the TANGENT direction (+U of the
strip); without a thickness texture, iridescence uses `thicknessMaximum` (spec).

Loader support (three.js checked in this repo's `node_modules`; the rest from vendor docs, **untested here**):

| Extension | three.js r186 GLTFLoader | Babylon 7 | Unity glTFast 6 | Godot 4.3 | Unreal 5.4 Interchange | Blender 4.x |
|---|---|---|---|---|---|---|
| clearcoat | yes (verified) | yes | yes | yes | yes | yes |
| transmission | yes (verified) | yes | yes (URP/HDRP) | partial (as alpha) | yes | yes |
| ior · volume | yes (verified) | yes | partial | ior only | yes | yes |
| sheen | yes (verified) | yes | yes | no | yes | yes |
| anisotropy | yes (verified) | yes | no | no | yes | yes |
| iridescence | yes (verified) | yes | no | no | yes | no |
| specular | yes (verified) | yes | yes | no | yes | yes |
| emissive_strength | yes (verified) | yes | yes | yes | yes | yes |

The beauty render shades the same blocks: GGX + height-correlated Smith + Schlick (glTF Appendix B),
Karis' split-sum fit with multiple-scattering compensation, a clearcoat lobe on the geometric
normal, Charlie sheen, anisotropic GGX with a bent reflection normal, a two-beam thin film, and
screen-space transmission (an opaque-only buffer sampled at the refraction offset over the
volume thickness, tinted by base colour × Beer–Lambert). It is an approximation: no caustics,
no rough-transmission blur, no multiple bounces inside a volume.

## Engine export profiles: `--profile unreal|unity|godot|rt|web`

`toGlb(a, { profile })` / `t3d build --profile <p>`: the GLB stays standard glTF 2.0; a profile
only sets defaults (explicit flags win) and records `extras.profile`. Light units need no profile:
`KHR_lights_punctual` is physical (lux / candela) everywhere (below).

| Profile | LOD files | Sheet | Baked AO texture | Colliders (with `--physics`) | Import note | Verified here |
|---|---|---|---|---|---|---|
| `unreal` | split `lod0/1/2.glb` | 4096 | on | `UCX_<pivot>_00` | Interchange; enable Nanite on `lod0.glb` (Nanite builds its own LODs) or assign lod1/2 as LOD slots | **untested here** |
| `unity` | split | 4096 | on | none (add Mesh Colliders) | glTFast; put lod0/1/2 in a LOD Group | **untested here** |
| `godot` | split | 4096 | on | `<pivot>-convcolonly` / `-colonly` | drop `lod0.glb` into the project | **untested here** |
| `rt` | split | 4096 | off (path tracers compute occlusion) | none | render `lod0.glb`; AO a recipe baked into COLOR_0 (`bakeAo`, `grime`) remains | **untested here** |
| `web` | one `<asset>.glb` (MSFT_lod) | 2048 | on | none | three.js / Babylon / model-viewer | three.js loader verified; KHR_mesh_quantization is planned, not written |

## Everything else: `extras`
Any JSON fits in `extras` on any object. ts23d uses `extras.ts23d` for sockets, emitters, the
generator version and provenance. Engines read it on import (Godot `meta`, Unity glTFast extras
callbacks, three.js `userData`).

## Sources
- Khronos extension registry: https://github.com/KhronosGroup/glTF/blob/main/extensions/README.md
- glTF 2.0 BRDF (Appendix B): https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#appendix-b-brdf-implementation · Karis, "Physically Based Shading on Mobile" (EnvBRDFApprox, 2014) · Fdez-Agüera, "A Multiple-Scattering Microfacet Model for Real-Time Image-based Lighting" (2019) · Estevez & Kulla, "Production Friendly Microfacet Sheen BRDF" (2017)
- Skins tutorial: https://github.khronos.org/glTF-Tutorials/gltfTutorial/gltfTutorial_020_Skins.html
- Unreal Interchange 4-influence truncation: https://forums.unrealengine.com/t/interchange-gltf-importer-truncates-skeletal-mesh-bone-influences-to-4-per-vertex/2745391
- glTF physics drafts: https://github.com/eoineoineoin/glTF_Physics (KHR_implicit_shapes capsule `height` = distance between cap centres, Y-aligned)
- Godot glTF physics importer plugin: https://github.com/eoineoineoin/glTF_Physics_Godot_Importer
- OMI physics: https://github.com/omigroup/gltf-extensions/tree/main/extensions/2.0/OMI_physics_body
- Mass properties: Blow & Binstock, "How to find the inertia tensor of a 3D solid body represented by a triangle mesh" (2004)
- Densities / friction: https://www.engineeringtoolbox.com/density-solids-d_1265.html · https://www.engineeringtoolbox.com/friction-coefficients-d_778.html
- Automatic rigging: Baran & Popović, "Automatic Rigging and Animation of 3D Characters", SIGGRAPH 2007
- KHR_materials_variants spec: https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_variants
- Babylon: https://doc.babylonjs.com/typedoc/classes/_babylonjs_loaders.GLTF2.KHR_materials_variants
- three.js GLTFLoader: https://threejs.org/docs/pages/GLTFLoader.html · https://npmjs.com/package/three-gltf-extensions
- Blender manual change: https://lists.blender.org/pipermail/bf-docboard-svn/2022-July/005751.html
- Unity glTFast: https://docs.unity3d.com/Packages/com.unity.cloud.gltfast@7.0/manual/features.html
- Unreal glTF exporter: https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/GLTFVariantSetsMode?application_version=5.1
- glTF-Transform: https://gltf-transform.dev/modules/extensions/classes/KHRMaterialsVariants
- Dreams SDF sculpting: Alex Evans, SIGGRAPH 2015, https://advances.realtimerendering.com/s2015/AlexEvans_SIGGRAPH-2015-sml.pdf

## Light units and tangents
**Light units.** `KHR_lights_punctual` intensities are physical: directional in lux, point/spot in candela. Sockets without `intensity` export a clear-sky sun (100 000 lx) or a ~1000 lm lamp (point 79.6 cd; spot = 1000 lm ÷ its cone's solid angle). three.js ≥ r155, Babylon, Godot (physical light units) and Unreal read these directly; viewers with legacy units need exposure.
**Tangents.** TANGENT is written whenever the normal map is bound: without it glTF-Validator warns `MESH_PRIMITIVE_GENERATED_TANGENT_SPACE` and engines fall back to their own tangents. Ours are Lengyel + Gram-Schmidt per vertex: equal to MikkTSpace on flat-shaded trim, close on curved parts.

## Sound
`KHR_audio_emitter` (Khronos draft, `extensionsUsed` only): positional emitters on LOD0 nodes, external `<clip>.wav` files beside the GLB; see [17-sound](../idea/17-sound.md).
