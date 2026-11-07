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
| `KHR_materials_variants` | liveries / camo schemes as switchable sets in one file | later: variants swap materials, and ts23d colour is vertex colour, so a livery needs a per-asset baked albedo first |
| `KHR_xmp_json_ld` | licence, author, generator version, `sources` inside the file | shipped |
| `KHR_materials_clearcoat` | glossy vehicle paint over the base | later |
| `KHR_materials_transmission` + `ior` + `volume` | real glass (bottles, cockpit canopies) | later |
| `KHR_materials_sheen` | cloth, banners, upholstery | later |
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

## Physics (drafts: write behind a flag, plus engine conventions)

`KHR_physics_rigid_bodies` and `KHR_collision_shapes` (formerly `KHR_implicit_shapes`) are **Khronos
review drafts**, with importers in Blender, Godot and Babylon. ts23d will write:
- **Collision shapes** per part: box / sphere / capsule / cylinder fitted from the part's own geometry,
  or a convex hull. Also as engine-convention nodes for importers without the extension:
  `UCX_<name>` (Unreal) and `<name>-col` / `-colonly` (Godot).
- **Mass and centre of mass** from real volume × material density (steel 7850 kg/m³, oak 750,
  brick 1900). A 57 t Tiger I is a QA check, not a guess: `real.mass` + tolerance.
- **Physics material**: friction / restitution per surface kind.
Status: later, behind `--physics`.

## Everything else: `extras`
Any JSON fits in `extras` on any object. ts23d uses `extras.ts23d` for sockets, emitters, the
generator version and provenance. Engines read it on import (Godot `meta`, Unity glTFast extras
callbacks, three.js `userData`).

## Sources
- Khronos extension registry: https://github.com/KhronosGroup/glTF/blob/main/extensions/README.md
- Skins tutorial: https://github.khronos.org/glTF-Tutorials/gltfTutorial/gltfTutorial_020_Skins.html
- Unreal Interchange 4-influence truncation: https://forums.unrealengine.com/t/interchange-gltf-importer-truncates-skeletal-mesh-bone-influences-to-4-per-vertex/2745391
- glTF physics drafts: https://github.com/eoineoineoin/glTF_Physics
- Automatic rigging: Baran & Popović, "Automatic Rigging and Animation of 3D Characters", SIGGRAPH 2007
- Dreams SDF sculpting: Alex Evans, SIGGRAPH 2015, https://advances.realtimerendering.com/s2015/AlexEvans_SIGGRAPH-2015-sml.pdf
