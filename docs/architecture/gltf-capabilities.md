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
| `MSFT_lod` | three LODs in one file with screen-coverage hints | later |
| `KHR_animation_pointer` | animate material / light values (blinking lamp, heat glow) | later |
| `KHR_texture_basisu` | KTX2 GPU-compressed trim sheet | later |
| `KHR_draco_mesh_compression` | — | no: meshopt is faster to decode and preferred |
| `KHR_gaussian_splatting` | — | no: we generate meshes, not captures |
| `KHR_interactivity` | — | no: behaviour is engine code, out of scope |

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
