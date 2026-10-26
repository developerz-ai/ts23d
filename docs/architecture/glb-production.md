# Production GLB

**A ts23d GLB is production-ready when it passes glTF-Validator with zero errors and warnings, faces glTF +Z, uses only core glTF 2.0 by default, and keeps engine-bound names stable across LODs. Compression, instancing and draft physics are opt-in profiles, never the default.** Godot 4 refuses any file whose `extensionsRequired` lists something it does not implement, and in 2026-10 that includes `KHR_mesh_quantization`, `EXT_meshopt_compression` and `KHR_draco_mesh_compression` ([Godot `_parse_gltf_extensions` and `get_supported_gltf_extensions_hashset`](https://github.com/godotengine/godot/blob/master/modules/gltf/gltf_document.cpp)). Those extensions must be required, so a "drop into any engine" default cannot use them ([KHR_mesh_quantization §Overview](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_mesh_quantization), [KHR_draco_mesh_compression](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_draco_mesh_compression)).

As of 2026-10. The exporter here is `src/export/glb.ts` (`toGlb`), `bin-writer.ts` (`BinWriter`), `motion.ts` (`motionChannel`) and `merge-pivots.ts` (`mergeToPivots`). These were read on 2026-10-25, while another agent was adding emitter `extras` to `glb.ts`. The spec is cited as [glTF 2.0 Specification.adoc](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/Specification.adoc) by section anchor, written **[spec §anchor]**. The rendered copy is at [registry.khronos.org](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html).

**Status updated 2026-10-25 after the exporter work (G1, G2, G4, G5, G10, surfaces, `rest` clip). Sections (b) and (d) keep the original findings, with an update block on top.**

Status legend: **done** · **partial** · **missing** · **n/a (not yet)**. *Verified by*: `code` means read in the exporter, `val` means glTF-Validator 2.0.0-dev.3.10 output, and `insp` means the byte-level inspection script run on the tiger_1 GLBs (section b).

---

## (a) Production checklist

### Must

| # | Rule | Source | Status | Verified by |
|---|---|---|---|---|
| M1 | 0 validator errors and 0 warnings | [glTF-Validator ISSUES.md](https://github.com/KhronosGroup/glTF-Validator/blob/main/ISSUES.md) | **done**: 0 / 0 on all 6 tiger GLBs; glTF-Validator now runs in the test suite (`src/export/validator.test.ts`, devDependency) and caught a sealed-buffer bug, since fixed | val |
| M2 | `POSITION` accessors carry `min`/`max` that match the data exactly (`ACCESSOR_MIN_MISMATCH`/`MAX_MISMATCH` are errors) | [spec §meshes-attributes](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/Specification.adoc#meshes-attributes): "Accessors for the `POSITION` semantic MUST have their bounds… defined" | **done**: `BinWriter.accessor(…, bounds=true)` computes bounds from the same `Float32Array` | code, val |
| M3 | Animation sampler `input` has `min`/`max` and strictly increasing times | [spec §animations](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/Specification.adoc#animations) | **done**: `motionChannel` passes `bounds=true` | code, val |
| M4 | Vertex attribute offsets are 4-byte aligned; buffer views ≥ accessor extent; no `byteStride` on non-vertex views | [spec §data-alignment](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/Specification.adoc#data-alignment) | **done**: `BinWriter.push` pads every view to 4 bytes and views are tightly packed | code, val |
| M5 | GLB: JSON chunk padded with `0x20`, BIN chunk padded with `0x00`, lengths multiple of 4, header length equals file size | [spec §glb-file-format-specification](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/Specification.adoc#glb-file-format-specification) | **done**: `toGlb` tail and `BinWriter.bytes` | code, val |
| M6 | `bufferView.target` set for vertex (34962) and index (34963) data; unset for animation data | [ISSUES.md `BUFFER_VIEW_TARGET_MISSING`](https://github.com/KhronosGroup/glTF-Validator/blob/main/ISSUES.md) | **done** | code, val (no hint) |
| M7 | Node hierarchy is disjoint strict trees: one parent at most, no cycles | [spec §nodes-and-hierarchy](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/Specification.adoc#nodes-and-hierarchy) | **done**: single root, parents resolved by name; `T3D_PART_UNKNOWN` rejects forward references at authoring | code, val |
| M8 | Normals unit length; rotation quaternions normalised (`ACCESSOR_VECTOR3_NON_UNIT`, `ROTATION_NON_UNIT`) | [ISSUES.md](https://github.com/KhronosGroup/glTF-Validator/blob/main/ISSUES.md) | **done**: 0 non-unit normals out of 37,749 | val, insp |
| M9 | Indices use u8/u16/u32 and never contain the type's max value (primitive restart) | [spec §meshes-topology](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/Specification.adoc#meshes-topology) | **done**: u16 when ≤ 65,535 vertices, else u32 (G4) | code, val |
| M10 | Y-up, metres, **front faces +Z, left faces +X** | [spec §coordinate-system-and-units](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/Specification.adoc#coordinate-system-and-units): "the front side of a glTF asset faces +Z, the left side of a glTF asset faces +X" | **done** (G1): root quaternion `[-0.5,-0.5,-0.5,0.5]` maps authoring +X front → glTF +Z, +Z up → +Y, +Y left → +X, checked numerically. Was `[-√½,0,0,√½]` (assets faced glTF +X, the left side). [ADR 009](../decisions/009-gltf-front-axis.md) | code, insp |
| M11 | `COLOR_0` is linear and in [0,1]; it multiplies baseColor | [spec §meshes-attributes](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/Specification.adoc#meshes-attributes), [spec §metallic-roughness-material](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/Specification.adoc#metallic-roughness-material): "encoded with the linear transfer function" | **done**: `src/material/palette.ts` converts sRGB hex to linear; measured range 0.009–1.0 | code, insp |
| M12 | Every node that engine code binds to (pivots) has a stable, unique name **in every LOD** | Engines bind by node path (glTFast/Godot/Unreal all keep node names) | **partial**: names are unique and stable at LOD0/LOD1 (24 nodes). LOD2 has only `tiger_1, body, turret, gun`, so the 18 wheel/sprocket/idler pivots disappear and game code that drives `wheel_l_0` breaks at LOD2 (G3) | insp |
| M13 | No accidental engine name hints: no node or mesh name ends in a Godot suffix (`-col`, `_col`, `$col`, `-colonly`, `-convcol`, `-convcolonly`, `-noimp`, `-occ`, `-occonly`, `-navmesh`, `-vehicle`, `-wheel`, `-rigid`), and no clip name starts or ends with `loop`/`cycle` unless looping is intended. Suffix matching is case-insensitive and accepts `-`, `$` or `_` | [Godot: node type customization](https://docs.godotengine.org/en/stable/tutorials/assets_pipeline/importing_3d_scenes/node_type_customization.html) | **missing as a gate**. No current recipe violates it (repo grep), but a part named `spare_wheel` would import into Godot as a `VehicleWheel3D` (G6) | code (grep) |
| M14 | A looping clip's last key equals its first key | [spec §animations](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/Specification.adoc#animations) clamps outside the input range; it does not define looping, so any seam is the asset's fault | **done** (G2): clip length 4 s, each motion rounded to whole cycles (`cyclesOf`), spins get ≥ 12 keys per turn, so the last key equals the first. Was a fixed 2 s clip that popped 216° on `rps 0.8` | code, insp |

### Should

| # | Rule | Source | Status | Verified by |
|---|---|---|---|---|
| S1 | Smallest index type that fits: u16 when the primitive has at most 65,535 vertices (index 65,535 is the restart value, so the highest usable index is 65,534), u8 is legal but slow on some GPUs | [spec §meshes-topology](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/Specification.adoc#meshes-topology) | **done** (G4): u16 indices whenever the primitive has ≤ 65,535 vertices | code, insp |
| S2 | `COLOR_0` as normalised `unorm16` VEC4 (8 B/v) instead of float VEC4 (16 B/v). This is core glTF, needs no extension, and every loader supports it | [spec §meshes-attributes](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/Specification.adoc#meshes-attributes): COLOR_n is float32, unorm8 or unorm16 | **done** (G5): COLOR_0 is normalised u16 RGBA (8 B/v). Was float VEC4, 27 % of LOD0 | code, insp |
| S3 | No unused attributes (`UNUSED_OBJECT`) | [ISSUES.md](https://github.com/KhronosGroup/glTF-Validator/blob/main/ISSUES.md) | **done**: the painted trim sheet is bound (embedded or external), so `TEXCOORD_0` is used. Infos remain only with `--sheet none` | val |
| S4 | Reuse one `mesh` index across nodes with identical local geometry; engines then share one mesh asset | [spec §meshes-overview](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/Specification.adoc#meshes-overview) (nodes reference meshes by index) | **missing** (G9) | insp |
| S5 | `asset.copyright`, plus provenance in `asset.extras` (recipe, ts23d version, seed, content hash) | [spec §asset](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/Specification.adoc#asset): "metadata MAY be stored in… `generator` or `copyright`" | **partial**: `generator: "@developerz-ai/ts23d"` has no version; there is no copyright and no provenance | code |
| S6 | Clip names follow engine conventions: Godot loops a clip only if its name starts or ends with `loop`/`cycle` | [Godot node type customization](https://docs.godotengine.org/en/stable/tutorials/assets_pipeline/importing_3d_scenes/node_type_customization.html); [`gltf_document.cpp` `begins_with("loop")`](https://github.com/godotengine/godot/blob/master/modules/gltf/gltf_document.cpp) | **missing** (G7): clips are `rest` and `run`; Godot imports `run` non-looping | code |
| S7 | Default to no clip, or a harmless idle; viewers autoplay the first clip | [spec §animations](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/Specification.adoc#animations) (runtime behaviour undefined); Babylon `animationStartMode = FIRST` ([source](https://github.com/BabylonJS/Babylon.js/blob/master/packages/dev/loaders/src/glTF/glTFFileLoader.pure.ts)); model-viewer `autoplay` plays the first ([docs](https://modelviewer.dev/docs/index.html)) | **done**: `toGlb` exports no clip unless `animations: true`. When it does (and `t3d build` does by default), the first clip is `rest` (static, two keys), so viewers open paused and `run` plays on request | code |
| S8 | One sampler `input` accessor shared by channels with the same keyframe times | [spec §animations](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/Specification.adoc#animations) | **done** (G10): time accessors shared per key count | code |
| S9 | Root transform: rotation-only on one named root; no scale | [Godot import configuration: Apply Root Scale](https://docs.godotengine.org/en/stable/tutorials/assets_pipeline/importing_3d_scenes/import_configuration.html) | **done** (rotation only; corrected quaternion, see M10) | code |
| S10 | `TANGENT` only when a normal map is bound. Without one, omit it (the spec says it "SHOULD NOT" be present without normals). With one, either ship MikkTSpace tangents or accept the `MESH_PRIMITIVE_GENERATED_TANGENT_SPACE` warning | [spec §meshes-usage](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/Specification.adoc#meshes-usage): tangents not specified means "calculated using default MikkTSpace algorithms" | **done**: `TANGENT` is emitted only when a sheet (with its normal map) is bound | code |
| S11 | Collision proxies available in a form each engine imports (section 6) | Per-engine (section c) | **missing** | code |
| S12 | LODs consumable without hand work: one file with MSFT_lod plus `MSFT_screencoverage`, and/or `_LODn` names, plus the per-LOD files | [MSFT_lod](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Vendor/MSFT_lod) | **partial**: three separate files `tiger_1.lod{0,1,2}.glb` with `extras.lod`; no switch distances | code |

### Nice

| # | Rule | Source | Status |
|---|---|---|---|
| N1 | `--profile web`: `KHR_mesh_quantization` + `EXT_meshopt_compression` (or `KHR_meshopt_compression`, Release Candidate) for three.js/Babylon/glTFast | [EXT_meshopt_compression](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Vendor/EXT_meshopt_compression) (Complete, Ratified); [KHR_meshopt_compression](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_meshopt_compression) | missing |
| N2 | `EXT_mesh_gpu_instancing` for bolts, rivets and track links in a web/Unity profile | [EXT_mesh_gpu_instancing](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Vendor/EXT_mesh_gpu_instancing): "files that use the extension should specify it in `extensionsRequired`" | missing |
| N3 | KTX2 (`KHR_texture_basisu`) trim sheet: UASTC for normal and ORM, ETC1S for base colour | [KTX Artist Guide](https://github.com/KhronosGroup/3D-Formats-Guidelines/blob/main/KTXArtistGuide.md) | n/a (no textures yet) |
| N4 | `KHR_materials_emissive_strength` for lit windows and headlights | [spec](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_emissive_strength) (Ratified) | missing |
| N5 | `KHR_xmp_json_ld` with `dc:creator`, `dc:rights`, `xmpRights:UsageTerms` | [KHR_xmp_json_ld](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_xmp_json_ld) (Ratified) | missing |
| N6 | `KHR_physics_rigid_bodies` + `KHR_implicit_shapes` (in `extensionsUsed` only, never required) | Draft PRs [#2424](https://github.com/KhronosGroup/glTF/pull/2424), [#2370](https://github.com/KhronosGroup/glTF/pull/2370), both open | missing (wait) |

---

## (b) Validator results: tiger_1

**Update 2026-10-25, after G1/G2/G4/G5/G10:** tiger_1 is now 88,176 / 16,304 / 648 triangles (the recipe was reworked). LOD0 dropped from 13.0 MB to 11.0 MB with 0 validator errors. Build plus QA at 3 LODs, contact sheet included, takes about 4.7 s. The table below is the original run on the older, smaller recipe.

**Verdict: VALID. 0 errors, 0 warnings, 0 hints on all six files. The only infos are `UNUSED_OBJECT` on `TEXCOORD_0` (one per primitive), because no texture is bound.** The real problems (sideways front, u32 indices, fat colours, loop seam, LOD2 losing pivots) are outside the validator's scope and were found by the inspection script.

The build was `bun run t3d build recipes/tiger_1.ts --out …/glbcheck`, then again with `--animations`. Both print `QA FAIL` (clashes and floating parts in the recipe, not the exporter) and both still write all three GLBs. The validator was npm `gltf-validator@2.0.0-dev.3.10` (`validateBytes`, `maxIssues: 0`), run from the scratchpad.

| File | Bytes | Err | Warn | Info | Hint | Draw calls | Verts | Tris | Anim |
|---|---|---|---|---|---|---|---|---|---|
| `tiger_1.lod0.glb` | 2,209,336 | 0 | 0 | 23 | 0 | 23 | 37,749 | 31,148 | 0 |
| `tiger_1.lod1.glb` | 426,376 | 0 | 0 | 23 | 0 | 23 | 6,592 | 7,212 | 0 |
| `tiger_1.lod2.glb` | 36,012 | 0 | 0 | 3 | 0 | 3 | 584 | 384 | 0 |
| `--animations` lod0 | 2,226,572 | 0 | 0 | 23 | 0 | 23 | 37,749 | 31,148 | 1 (`run`, 20 rotation channels, LINEAR, 0–2 s) |
| `--animations` lod1 | 443,576 | 0 | 0 | 23 | 0 | 23 | 6,592 | 7,212 | 1 |
| `--animations` lod2 | 36,012 | 0 | 0 | 3 | 0 | 3 | 584 | 384 | 0 (no motion pivots left) |

All infos have the same form:

```json
{ "code": "UNUSED_OBJECT", "severity": 2, "pointer": "/meshes/N/primitives/0/attributes/TEXCOORD_0" }
```

Findings from the inspection script, which the validator does not check:

| Check | LOD0 result | Rule |
|---|---|---|
| u32 indices on primitives with fewer than 65k verts | 23/23 | S1 |
| Byte split: POSITION / TEXCOORD_0 / COLOR_0 / indices (NORMAL ≈ POSITION) | 453 K / 302 K / **604 K** / 374 K | S1, S2 |
| Degenerate triangles | 0 | (`ACCESSOR_INDEX_TRIANGLE_DEGENERATE`) |
| Non-unit normals (more than 5e-4 off) | 0 | M8 |
| COLOR_0 range | 0.0092–1.0, alpha always 1 | M11, S2 |
| Root rotation | `[-0.7071, 0, 0, 0.7071]`: authoring +X goes to glTF +X (left) | M10 |
| Node names, LOD0 / LOD2 | 24 / 4 (all wheels gone at LOD2) | M12 |
| Spin loop seam (`rps 0.8`) | key 0 `[0,0,0,1]`, key 24 `[0,-0.951,0,0.309]` | M14 |
| Animation time accessors | 20 identical | S8 |
| `extensionsUsed` | none (core-only, which is good for Godot) | — |

Re-run: write the two `.mjs` scripts below into a scratch directory with `npm i gltf-validator`, then run `node validate.mjs out/*.glb`. `gltf-validator` is now a devDependency used by `src/export/validator.test.ts`; ADR 005 restricts runtime dependencies only.

---

## (c) Per-engine import table

"glTF" below means the engine's default glTF importer, as of 2026-10.

| | **Unity (glTFast 6.x)** | **Unreal 5 (Interchange glTF)** | **Godot 4** | **three.js (GLTFLoader)** | **Babylon.js** |
|---|---|---|---|---|---|
| Importer | glTFast is Unity's glTF package. Unity has no built-in glTF importer ([glTFast manual](https://docs.unity3d.com/Packages/com.unity.cloud.gltfast@6.14/manual/index.html)) | Interchange is the default for glTF static meshes ([format support](https://dev.epicgames.com/documentation/en-us/unreal-engine/gltf-file-format-support-in-unreal-engine)) | Built-in `GLTFDocument` | `examples/jsm` loader | `@babylonjs/loaders` |
| Naming | Node names become GameObject names. Mesh name becomes the asset name | Mesh name becomes the Static Mesh asset name. Interchange has renamed collision meshes in the past ([UE-248981](https://issues.unrealengine.com/issue/UE-248981), fixed May 2025) | Node names are kept. Suffix hints are stripped and acted on (`-col`, `-noimp`, …), with `-`, `$` or `_` and case-insensitive ([docs](https://docs.godotengine.org/en/stable/tutorials/assets_pipeline/importing_3d_scenes/node_type_customization.html)) | `Object3D.name` = node name (sanitised) | `TransformNode.name` = node name |
| Collision | None imported. Add colliders in-engine | Prefixes `UBX_` box, `UCP_` capsule, `USP_` sphere, `UCX_` convex, matched to the unprefixed mesh name (`UCX_body`, `UCX_body_01`) ([Interchange Generic Mesh Pipeline](https://api.unrealengine.com/INT/PythonAPI/class/InterchangeGenericMeshPipeline.html), [FBX pipeline](https://dev.epicgames.com/documentation/en-us/unreal-engine/fbx-static-mesh-pipeline-in-unreal-engine)). **glTF path unverified:** test-import a fixture | `-col` adds a trimesh body, `-convcol` a convex one; `-colonly` and `-convcolonly` replace the mesh with a collider; `-rigid` makes a RigidBody3D. `OMI_physics_body`/`OMI_physics_shape` are the import extensions it declares. `KHR_physics_rigid_bodies` / `KHR_collision_shapes` appear only in its JSON-pointer mapping so far ([physics ext source](https://github.com/godotengine/godot/blob/master/modules/gltf/extensions/physics/gltf_document_extension_physics.cpp)) | None | None (no physics import) |
| LOD | MSFT_lod is listed "not investigated", so only LOD0 loads ([features](https://github.com/Unity-Technologies/com.unity.cloud.gltfast/blob/main/Packages/com.unity.cloud.gltfast/Documentation~/features.md)). Unity's `_LOD0` naming applies to the model importer (FBX), not glTFast ([manual](https://docs.unity3d.com/Manual/importing-lod-meshes.html)) | No glTF LOD import found. Import LOD1/2 files into LOD slots, or auto-generate them | Ignores MSFT_lod (not in the supported set). Generates its own LODs on import ("Generate LODs", [import configuration](https://docs.godotengine.org/en/stable/tutorials/assets_pipeline/importing_3d_scenes/import_configuration.html)). Use [visibility ranges](https://docs.godotengine.org/en/stable/tutorials/3d/visibility_ranges.html) for hand LODs | MSFT_lod not supported ([GLTFLoader docs](https://threejs.org/docs/pages/GLTFLoader.html)). Build `THREE.LOD` from the per-LOD files | **MSFT_lod supported** with progressive loading and `maxLODsToLoad` ([source](https://github.com/BabylonJS/Babylon.js/blob/master/packages/dev/loaders/src/glTF/2.0/Extensions/MSFT_lod.pure.ts)) |
| Animation | Legacy Animation ✅, Mecanim partial (clips not assigned), Playables ⛔ ([features](https://github.com/Unity-Technologies/com.unity.cloud.gltfast/blob/main/Packages/com.unity.cloud.gltfast/Documentation~/features.md)) | Imports node animation as Level Sequence or anim assets (verify on fixture) | AnimationPlayer. A clip loops only if its name starts or ends with `loop`/`cycle` ([source](https://github.com/godotengine/godot/blob/master/modules/gltf/gltf_document.cpp)) | `gltf.animations` holds `AnimationClip`s; no autoplay | Autoplays the **first** clip by default (`animationStartMode = FIRST`) |
| Quantization / meshopt / Draco | ✅ / ✅ (needs package) / ✅ (needs package) | Exporter supports quantization; import support for the three is undocumented | ⛔ / ⛔ / ⛔: the file **fails to import** if they are required | ✅ / ✅ (`setMeshoptDecoder`; `KHR_meshopt_compression` also built in) / ✅ (`setDRACOLoader`) | ✅ / ✅ / ✅ |
| KTX2 basisu | ✅ (KTX package) | Undocumented | ✅ (`gltf_document_extension_texture_ktx`) | ✅ (`setKTX2Loader`) | ✅ |
| GPU instancing | ✅ (no custom `_ID` attrs) | Undocumented | ⛔ (not in supported set) | ✅ (`InstancedMesh`) | ✅ |
| Emissive strength | ⛔ (blank in features table) | Undocumented | ✅ | ✅ | ✅ |
| `extras` | Kept in the glTFast API; not on components | Interchange metadata (verify) | `GLTFNode` metadata (opt-in) | `userData` | `metadata` (`ExtrasAsMetadata`) |

**Consequence:** the default GLB uses core glTF only. A `web` profile adds compression and instancing. An engine profile adds collision naming. Where this table says Unreal is "undocumented" or "verify", import a test file before relying on the behaviour.

---

## Topics 3–7: rules

### 3. Optimisation extensions: when to use

| Extension | Use when | Don't use when | Registry status |
|---|---|---|---|
| `KHR_mesh_quantization` | Web/Unity/Babylon profile. Positions as int16 with a node scale/offset dequantisation, normals as int8 normalised (stride 4) | Default export (Godot refuses it because it must be required) | Complete, Ratified ([spec](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_mesh_quantization)) |
| `EXT_meshopt_compression` | Web profile. Pair with quantization. Decoding is fast, it compresses animation (quaternion filter 2) too, and a `fallback` buffer can keep it optional | Godot targets (unless a fallback buffer is shipped, which doubles the size) | Complete, Ratified ([spec](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Vendor/EXT_meshopt_compression)). `KHR_meshopt_compression` is the RC successor with a v1 bitstream and colour filter ([spec](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_meshopt_compression)) |
| `KHR_draco_mesh_compression` | Only when a target lacks meshopt. Geometry only, slower decode, must be required without a fallback | Prefer meshopt for everything we ship ([meshoptimizer gltfpack](https://github.com/zeux/meshoptimizer/blob/master/gltf/README.md)) | Ratified |
| `KHR_texture_basisu` | When the trim sheet ships. UASTC for normal and ORM, ETC1S for base colour ([KTX Artist Guide](https://github.com/KhronosGroup/3D-Formats-Guidelines/blob/main/KTXArtistGuide.md)). Keep a PNG `source` fallback so it stays optional | Required without a fallback in the default profile | Ratified ([spec](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_texture_basisu)) |
| `KHR_texture_transform` | Only if strips get tiled by material instead of UVs | Our trim sheet bakes the UV rect into `TEXCOORD_0`, so it is not needed | Ratified |
| `EXT_mesh_gpu_instancing` | Bolts, rivets, track links, fence posts: ≥ ~16 copies of one sub-mesh in a web/Unity profile | Default (no fallback, so it should be required; Godot lacks it) | Complete, Ratified ([spec](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Vendor/EXT_mesh_gpu_instancing)) |
| `MSFT_lod` + `extras.MSFT_screencoverage` | Ship a single-file LOD set: extension on the LOD0 root node, `ids` → LOD1/LOD2 roots, coverage like `[0.25, 0.08, 0.01]`. It can live in `extensionsUsed` only, because non-supporting loaders load the highest LOD | — (safe additive; costs about 20 % more bytes) | Vendor ([spec](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Vendor/MSFT_lod)) |

### 4. Materials

| Rule | Source | Us |
|---|---|---|
| ORM packing: one linear texture, R = occlusion (`occlusionTexture`), G = roughness, B = metallic (`metallicRoughnessTexture`), both pointing at the same texture | [spec §additional-textures-occlusion](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/Specification.adoc#additional-textures-occlusion) note: "could point to the same texture that packs all three" | Planned ORM in ADR 003. Bind both slots to one texture index |
| baseColor and emissive textures are sRGB; ORM and normal are linear | [spec §metallic-roughness-material](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/Specification.adoc#metallic-roughness-material) | Painter must write the albedo as sRGB and the ORM as linear |
| `COLOR_0` is linear and multiplies baseColor (texture × factor × COLOR_0) | same | done |
| Foliage cards: `alphaMode: "MASK"`, `alphaCutoff` (default 0.5), `doubleSided: true` | [spec §alpha-coverage](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/Specification.adoc#alpha-coverage), [§double-sided](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/Specification.adoc#double-sided) | **done**: `surface: 'cutout'` ([ADR 008](../decisions/008-surface-materials.md)) |
| Tangents: omit them and let the importer run MikkTSpace (the spec default) unless a baked normal map needs bit-exact tangents. Our tiling trim normals don't | [spec §meshes-usage](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/Specification.adoc#meshes-usage) | correct today |
| Lit windows: `emissiveFactor` up to 1 plus `KHR_materials_emissive_strength`. Unity glTFast ignores the extension and falls back to strength 1 | [spec](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_emissive_strength) | missing |

### 5. Animation

| Rule | Source |
|---|---|
| glTF defines no autoplay, loop or order. Loaders choose: Babylon and model-viewer play the first clip; three and Godot don't autoplay | [spec §animations](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/Specification.adoc#animations) |
| LINEAR on `rotation` is slerp; keep consecutive keys under 180° apart (we use 15° steps or finer) | same, [§interpolation-slerp](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/Specification.adoc#interpolation-slerp) |
| Loops: last key = first key, and the clip length is an integer number of periods for every channel | consequence of clamping (same section) |
| One clip per behaviour, named `<verb>_loop` (Godot loop flag); keep pivot-driving clips out of the first slot | Godot source above |
| Each (node, path) appears at most once per animation | [spec §animations](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/Specification.adoc#animations) |

### 6. Collision and physics

| Approach | Engines | Ship how |
|---|---|---|
| Godot suffix nodes `<pivot>-colonly` / `-convcolonly` | Godot | Engine profile `godot`; the collider node is a child of the pivot |
| Unreal prefix meshes `UCX_<mesh>_NN`, `UBX_`, `USP_`, `UCP_` | Unreal (FBX documented; glTF via Interchange unverified) | Engine profile `unreal`; the collision mesh is a sibling, named after the render mesh |
| `extras.ts23d.collision` on a hidden child node (box/convex hull data) | Unity, three, Babylon (scripts read it) | Default: no visible mesh. Shapes go in extras so nothing renders by accident |
| `KHR_physics_rigid_bodies` + `KHR_implicit_shapes` | None import it yet (Godot imports the OMI equivalents) | Draft PRs [#2424](https://github.com/KhronosGroup/glTF/pull/2424) and [#2370](https://github.com/KhronosGroup/glTF/pull/2370), open as of 2026-10. Emit in `extensionsUsed` only, after ratification |

A collider mesh in a generic GLB renders as visible geometry in Unity, three and Babylon. So collision geometry is never in the default visual file. It goes in extras, an engine profile, or a sibling `*.collision.glb`.

### 7. Metadata

| Field | Rule | Source |
|---|---|---|
| `asset.generator` | `"@developerz-ai/ts23d <version>"` | [spec §asset](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/Specification.adoc#asset) |
| `asset.copyright` | From the recipe (`license`/`author`), else `"ts23d recipe <name>, MIT"` per repo license | same |
| `asset.extras.ts23d` | `{ recipe, version, seed, lod, lodCount, units:"m", up:"+Y", front:"+Z", sourceUp:"+Z", sourceFront:"+X", contentHash }` | [spec §specifying-extensions](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/Specification.adoc#specifying-extensions) and the `extras` property (any JSON) |
| LOD switch distances | `extras.MSFT_screencoverage` on the MSFT_lod node, plus `extras.ts23d.lodScreenCoverage` in each per-LOD file | [MSFT_lod](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Vendor/MSFT_lod) |
| Rights | `KHR_xmp_json_ld` packet with `dc:creator`, `dc:rights`, `xmpRights:UsageTerms` (in `extensionsUsed` only) | [KHR_xmp_json_ld](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_xmp_json_ld) |

Today the exporter writes `extras` at the glTF **root** (`kind, lod, units, up`), not in `asset.extras`. Root `extras` are legal, but many importers surface only node and `asset` extras.

---

## (d) Prioritised gap list

`ZERO-DEP WIN` means pure gain: core glTF only, no new dependency, valid in every engine, byte-deterministic. Every test lives next to the file it tests and runs in `bun run verify`.

| P | Gap | Exact change | Test that proves it | Tag |
|---|---|---|---|---|
| **G1** | Asset faces glTF +X (glTF's left) instead of +Z (M10) | `src/export/glb.ts` `toGlb`: root `rotation` changes from `[-Math.SQRT1_2,0,0,Math.SQRT1_2]` to `[-0.5,-0.5,-0.5,0.5]`, which maps authoring +X front to +Z, +Y left to +X and +Z up to +Y (checked numerically). Amend ADR 004's "one −90° X rotation" line, and set `extras.up/front`. Breaking for anyone who has already placed assets: CHANGELOG | `glb.test.ts`: rotate `[1,0,0]` by the root quaternion and expect `[0,0,1]`; rotate `[0,1,0]` and expect `[1,0,0]` | **done** · ZERO-DEP WIN (breaking) |
| **G2** | Loop seam: spin ends at 1.6 rev (M14) | `src/export/motion.ts` `motionChannel`: replace the fixed `LOOP_SECONDS` with a clip length `D` passed from `toGlb`. Per channel, round cycles to `n = max(1, round(rate·D))` and sample `max(24, 8n)` keys so steps stay under 45°. Record the true rate in `extras.ts23d.motion`. `toGlb` picks `D` = the smallest of 2, 4 or 8 s that keeps every channel's rounding error under 10 % | `motion.test.ts` (new): for spin `rps 0.8`, the first and last output quaternions are equal up to sign (`|dot| > 0.9999`); same for sway and bob | **done** · ZERO-DEP WIN |
| **G3** | Pivots vanish at LOD2 (M12) | `src/cli/run.ts`: collect the LOD0 pivot list (names, parent, `at`) and pass it as `GlbOptions.pivots`. `src/export/glb.ts` `toGlb` emits an empty node for each pivot missing from this LOD, under its LOD0 parent | `glb.test.ts`: an asset whose LOD2 build omits `wheel_0` still has node `wheel_0` in the LOD2 GLB, and its node-name set equals LOD0's | ZERO-DEP WIN |
| **G4** | u32 indices everywhere (S1) | `src/export/bin-writer.ts` `BinWriter.accessor`: accept `Uint16Array` and set `componentType: 5123`. `toGlb` converts to `Uint16Array` when `positions.length/3 <= 65535`. `push` already 4-aligns the following view | `glb.test.ts`: the box crate's index accessor has `componentType === 5123`; a 70k-vertex mesh keeps 5125; scratch run of glTF-Validator stays 0/0 | **done** · ZERO-DEP WIN (−187 KB on tiger LOD0) |
| **G5** | COLOR_0 float VEC4 is 27 % of the file (S2) | `bin-writer.ts`: `accessor` takes `Uint16Array` + `normalized: true` (componentType 5123, add `normalized`). `glb.ts` `toGlb` writes the colour as `Math.round(c·65535)` into VEC4 unorm16 (8 B/v, aligned) | `glb.test.ts`: the COLOR_0 accessor has `componentType 5123`, `normalized: true`, and the decoded value is within 1/65535 of the source | **done** · ZERO-DEP WIN (−302 KB on tiger LOD0) |
| **G6** | No guard against Godot name hints (M13) | New gate `src/qa/` `engineNames` (tier 3; QA already sees all part names): fail on `/[-_$](col|colonly|convcol|convcolonly|noimp|occ|occonly|navmesh|vehicle|wheel|rigid)$/i`, with `fix: rename to <name>_part or opt in via exportHint`. Exporter-side mirror is optional | `qa/*.test.ts`: a part named `spare_wheel` makes `runQa` report `engine-names`; `wheel_l_0` passes | ZERO-DEP WIN |
| **G7** | Clip named `run`: Godot won't loop it, and it is the first clip that viewers autoplay (S6) | `src/export/glb.ts` `toGlb`: name the clip `motion_loop` and set `extras.ts23d.loop: true` | `glb.test.ts`: `animations[0].name` matches `/loop$/` | ZERO-DEP WIN |
| **G8** | No provenance or copyright (S5, section 7) | `glb.ts` `toGlb`: `asset.generator` with the package version (import from `package.json` at build or a `VERSION` const in core). Add `asset.copyright` and `asset.extras.ts23d = {recipe, version, seed, lod, lodCount, up, front, units}`. Move root `extras` into it, keeping the old root `extras` one minor release for compatibility | `glb.test.ts`: `asset.copyright` is a non-empty string; `asset.extras.ts23d.front === '+Z'`; determinism test still passes | ZERO-DEP WIN |
| **G9** | Identical geometry not shared (S4) | `src/export/glb.ts` `toGlb`: hash each merged mesh (positions, normals, uvs, colors, indices bytes) and reuse the `meshes[]` index on a hit. Today only 4 wheel pairs match, because grime noise is seeded per part. Follow-up: let `kinds/vehicle.ts` seed grime per wheel class so all 16 road wheels share a few meshes | `glb.test.ts`: two `ctx.use` copies of the same sub-asset yield two nodes with the same `mesh` index | ZERO-DEP WIN |
| **G10** | 20 duplicate animation time accessors (S8) | `motion.ts` `motionChannel`: take an `inputs: Map<string, number>` cache keyed by `(D, keyCount)` from `toGlb` | `glb.test.ts`: crate with two spinning parts has `new Set(samplers.map(s=>s.input)).size === 1` | **done** · ZERO-DEP WIN |
| G11 | LODs are three files and engines get no switch distances (S12) | `src/cli/run.ts` + new `toGlbLodSet(compiled[])` in `src/export/glb.ts`. One GLB with LOD0 root `extensions.MSFT_lod.ids` → LOD1/LOD2 roots (named `<asset>_LOD1`, `_LOD2`, excluded from `scenes[0].nodes`) and `extras.MSFT_screencoverage` from a new `budget.screenCoverage` (default `[0.25, 0.08, 0.01]`). `extensionsUsed: ["MSFT_lod"]`, never required. Keep the per-LOD files | `glb.test.ts`: `extensionsUsed` has `MSFT_lod`; `extensionsRequired` is undefined; the `ids` length is 2; validator 0/0. Load it in Babylon in the apps gallery smoke test | ZERO-DEP WIN |
| G12 | No collision export (S11) | `src/core/asset.ts`: `ctx.collider(name, {shape:'box'|'convex', of?: part})`. `src/export/glb.ts` gains `GlbOptions.engine: 'generic'|'godot'|'unreal'`. Generic writes `extras.ts23d.collision` on an empty child; godot writes a `<pivot>-convcolonly` mesh node; unreal writes a `UCX_<mesh>_01` sibling mesh. CLI `--engine` | `glb.test.ts` per profile: node and mesh names match the convention, and the generic profile has no extra mesh. Manual: import a fixture into Godot 4 and UE 5 and check that a collider appears | ZERO-DEP (needs an API addition) |
| G13 | Single opaque material blocks foliage cutouts and lit windows (section 4) | `src/material`: add part flags `surface: 'cutout'|'emissive'`. `glb.ts` `toGlb` writes up to three materials: `ts23d_trim`; `ts23d_trim_cutout` (`alphaMode:"MASK"`, `alphaCutoff:0.5`, `doubleSided:true`); `ts23d_trim_emissive` (`emissiveFactor`, `KHR_materials_emissive_strength` in `extensionsUsed` only). `mergeToPivots` splits primitives per material. Needs an ADR 003 amendment ("exactly one material") | `glb.test.ts`: a cutout part lands in a primitive whose material has `alphaMode MASK`; with no flagged parts the GLB still has exactly 1 material | **partial**: cutout, glass, translucent shipped as `surface`; emissive missing · ZERO-DEP (ADR change) |
| G14 | Web profile size (N1, N2) | New optional subpath `src/export/web/` (ADR 005 "behind an optional subpath"): quantize positions (int16 plus a node dequant transform), normals (int8, stride 4) and UVs (unorm16); meshopt encode (own port of the codec or the `meshoptimizer` npm package as an optional peer); `EXT_mesh_gpu_instancing` for repeated sub-parts. All of these go in `extensionsRequired`, so never for Godot | Snapshot: `--profile web` tiger LOD0 is under 40 % of default bytes; validator 0/0; three.js gallery loads it with `setMeshoptDecoder` | **runtime dep (optional)** |
| G15 | Textures (N3) | With the M2 painter: PNG baseColor (sRGB) + ORM + normal, plus an optional KTX2 profile (UASTC for ORM/normal, ETC1S for albedo) with a PNG fallback `source` | Validator 0/0 with `hasTextures: true` and no `UNUSED_OBJECT` on TEXCOORD_0 | **done** (PNG, embedded or external; KTX2 profile still missing) · dep for KTX2 (optional) |
| G16 | Physics extensions (N6) | Wait for #2424/#2370 to ratify. Then emit from the G12 collider data in `extensionsUsed` only | Godot import test | wait |

**Combined size effect of G4 + G5 on tiger LOD0:** 2,209 KB drops to about 1,720 KB (−22 %) with no extension, no dependency and no engine risk. G9 and G10 add a little more.

### Inspection scripts (for reproducibility; not in the repo)

`validate.mjs`: `validateBytes(bytes, { maxIssues: 0 })` from `gltf-validator@2.0.0-dev.3.10`, printing `numErrors/numWarnings/numInfos/numHints`, `info`, and issue counts by code. `inspect.mjs` parses the GLB and reports index component type against vertex count, per-attribute byte totals, normal length, COLOR_0 range, duplicate geometry signatures, root rotation, node names, and animation sampler input sharing and first/last keys.
