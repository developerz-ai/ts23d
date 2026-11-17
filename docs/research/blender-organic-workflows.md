# Research — Blender organic workflows, headless: what character artists do and what `blender -b` can script

**Almost the whole character-artist pipeline runs under `blender -b --python`: block-out (Skin
modifier, metaballs, SDF grid nodes), voxel remesh, QuadriFlow, decimate, UV unwrap + pack, Cycles
high→low bakes (CPU and OptiX), Rigify wolf/human rigs, bone-heat weights, weight transfer and
clean-up, hair-curve cards, review renders and glTF export all returned `FINISHED` in local tests on
Blender 5.3. The one stage that does not is hand sculpting: every `bpy.ops.sculpt.*` operator tried
either failed its poll or segfaulted in background mode, and only ran with a real window (Xvfb). So
the adapter should treat sculpting as "scripted deformation" (modifiers, geometry nodes, multires +
displacement, bmesh) and keep a windowed lane as an opt-in escape hatch. Automatic retopology
(QuadriFlow) gives even quads but no joint loops; it is adequate for bodies that bend broadly and
for LODs, and not for faces. Three traps cost the most time: operators that report `FINISHED` while
doing nothing (bone heat, multires `object.bake`), QuadriFlow refusing fine voxel meshes until
`remove_doubles` is run, and voxel remesh bytes that change with the thread count.**

Research as of 2026-11-16. Sources: Blender manual and Python API (5.2/5.3), Blender release notes,
projects.blender.org issues, Blender Studio training pages, Polycount and Unreal forum threads,
vendor guides (marked *(vendor)*), plus local tests on `Blender 5.3.0 (build 2026-11-10)`, Linux,
16 threads, RTX 3090, run with `blender -b --factory-startup --python <script>`. Statements not
checked against a primary source or a local run are marked *(unverified)*; values that are studio
convention rather than documented are marked *(convention)*. Nothing here ran a GPU model. Blender
4.5 LTS and 5.2 LTS were not installed: API differences for them come from release notes only.

Related: [`meshy.md`](meshy.md) (the image-to-3D source for path (a)),
[`animal-anatomy.md`](animal-anatomy.md), [`hair.md`](hair.md),
[`surfaces-volumes.md`](surfaces-volumes.md), ADR 011 (imported meshes may be decimated).

## 1. Ground rules for `blender -b`

| Rule | Why (source / test) |
|---|---|
| Prefer data API and modifiers over operators; where an operator is needed, select + set active first | Operators read context; `bpy.context.window` exists in `-b` (1 window, 11 screens after factory startup) but no drawable region. `RuntimeError: Operator … poll() failed, context is incorrect` is the normal failure ([operator gotchas](https://docs.blender.org/api/5.0/info_gotchas_operators.html)) |
| Never call `bpy.ops.sculpt.*` / `paint.mask_*` in `-b` | Local: `sculpt.mesh_filter`, `sculpt.symmetrize`, `sculpt.face_sets_init`, `paint.mask_flood_fill` **segfault** (exit 139), with or without `temp_override(window, screen, area, region)`; `sculpt.brush_stroke` and `sculpt.detail_flood_fill` fail their poll. Background-only sculpt crashes are a known class ([#71605](https://developer.blender.org/T71605), [#100687](https://developer.blender.org/T100687)) |
| A wrong `temp_override` can crash instead of raising | [#107805](https://projects.blender.org/blender/blender/issues/107805), [#84964](https://projects.blender.org/blender/blender/issues/84964), [#129578](https://projects.blender.org/blender/blender/issues/129578); run each step list in its own process and treat a non-zero exit as a step failure |
| Check results, not return values | `parent_set(type='ARMATURE_AUTO')` returned `{'FINISHED'}` with 9188/9188 vertices unweighted (only a console `Warning:`); `object.bake()` with `use_multires` returned `{'FINISHED'}` and wrote a black image; `quadriflow_remesh` returns `{'CANCELLED'}` without raising |
| One process per asset, fixed `-t <n>`, `--factory-startup` | No user prefs or add-ons leak in; thread count changes voxel-remesh bytes (§5) |
| Enable bundled add-ons with `bpy.ops.preferences.addon_enable(module='rigify')` | `addon_utils.enable('rigify', default_set=False)` left Rigify half-registered: `KeyError: … "rigify" not found`, then generation failed with `'RigifyParameters' object has no attribute 'make_custom_pivot'` |
| Geometry Nodes modifier inputs differ by version | 5.2+: `mod.properties.inputs.<identifier>.value = x` ([5.2 Python API notes](https://developer.blender.org/docs/release_notes/5.2/python_api/)); local 5.3: `mod["Socket_2"] = x` raises `id properties not supported for this type`. 4.5 LTS: `mod["Socket_2"] = x`. Version-proof alternative (verified): wrap the group in your own tree and set the group node's `inputs[name].default_value` |
| A windowed lane exists: `xvfb-run -a blender --factory-startup --python step.py` + `bpy.app.timers` | Local: with a real window and `temp_override(window, area, region)`, `sculpt.mesh_filter` (SMOOTH / INFLATE / ENHANCE_DETAILS), `sculpt.symmetrize`, `face_sets_init`, `mask_flood_fill` and `sculpt.brush_stroke(override_location=True)` all ran. Needs a GL-capable display; slower to start; not tested for repeatability |

## 2. The artist pipeline, stage by stage

Columns: what artists do · headless recipe (exact API) · verified locally on 5.3 · pitfalls.

### 2.1 Block-out and base mesh

| Stage | What artists do | Headless bpy recipe | Verified? | Pitfalls |
|---|---|---|---|---|
| Skin modifier ("ZSpheres" in Blender) | Draw a vertex/edge skeleton, scale radii per vertex (Ctrl+A), subdivide, then sculpt | `mesh.from_pydata(verts, edges, [])`; `ob.modifiers.new('skin','SKIN')`; `mesh.skin_vertices[0].data[i].radius = (rx, ry)`; `.use_root = True` on one vertex; add `SUBSURF` levels 2; `object.modifier_apply` | Yes: 6-bone quadruped → 4330 verts, 0 non-manifold edges, 0.07 s | Branch hubs come out lumpy; follow with voxel remesh. One root per connected island. Reverse direction also works: `object.skin_armature_create(modifier='skin')` built 3 bones + 3 vertex groups |
| Metaballs | Blobby masses that fuse; quick creature bulk | `bpy.data.metaballs.new`; `mb.resolution = 0.04`; `mb.threshold = 0.6`; `mb.elements.new(type='BALL'|'CAPSULE'|'ELLIPSOID')` with `co`, `radius`, `size_x`, `rotation`; `object.convert(target='MESH')` | Yes: 4 elements → 3000 faces | All metaball objects sharing a name family fuse into one; mesh is triangle soup, remesh after |
| SDF / volume in Geometry Nodes | Union, smooth-union and offset of masses; "clay" merging | `GeometryNodeMeshToSDFGrid` (`Voxel Size`, `Band Width`) → `GeometryNodeSDFGridBoolean` / `SDFGridOffset` (`Distance`) / `SDFGridFillet` / `SDFGridMean` / `SDFGridLaplacian` → `GeometryNodeGridToMesh` (`Threshold`, `Adaptivity`); also `PointsToSDFGrid` (`Radius`, `Voxel Size`) for capsule chains; older path `MeshToVolume` → `VolumeToMesh` | Yes: all four chains produced meshes; 5.3 ships 45 grid/volume node types | **Mesh to SDF Grid returned an empty mesh** for `Voxel Size` ≤ 0.03 with default `Band Width` 3 on a 2 m object; `Band Width` 6 gave 25 184 verts. Cause not identified: gate on vertex count > 0 |
| Base-mesh library | Start from a neutral body with animation topology and reshape it | Append from a `.blend`: `with bpy.data.libraries.load(path) as (src, dst): dst.objects = [...]`. Blender Studio **Human Base Meshes v1.4.1** (49 MB, CC0, [blender.org asset bundles](https://www.blender.org/download/demo-files/)); MPFB2 / MakeHuman (assets and exported meshes CC0, add-on code GPLv3: [licence page](https://static.makehumancommunity.org/about/license.html)) | Not run (bundle not downloaded) | The bundle has realistic and stylised humans, heads, hands, feet, no animals *(unverified for 1.4.1 contents)*; quadrupeds need path (a) or the Skin/SDF path |
| Image-to-3D mesh (path a) | Treat as a scan: clean, remesh, never rig directly | `import_scene.gltf(filepath=…, merge_vertices=True)`; then §2.8 clean-up | Import/round-trip yes | ~1 M triangles, internal shells, baked lighting, fused mouth and eyes ([meshy.md §5](meshy.md)) |

### 2.2 Sculpt stage

| Stage | What artists do | Headless bpy recipe | Verified? | Pitfalls |
|---|---|---|---|---|
| Voxel remesh | Re-mesh to uniform quads whenever stretching appears; fuse separate masses | `me.remesh_voxel_size = 0.02`; `me.remesh_voxel_adaptivity = 0`; `me.use_remesh_fix_poles = True`; `bpy.ops.object.voxel_remesh()`. Modifier form: `REMESH`, `mode='VOXEL'`, `voxel_size` | Yes: 1.31 M tris → 142 k quads in 1.8 s at 6 mm | Destroys UVs and weights; "doesn't clean up intersecting geometry" beyond fusing it; operator and modifier give different meshes for the same size (15 325 vs 16 788 verts) |
| Multires + displacement | Subdivide a clean base, sculpt detail on levels, bake down | `ob.modifiers.new('mr','MULTIRES')`; `object.multires_subdivide(modifier='mr', mode='CATMULL_CLARK')` ×n; detail by applying a `DISPLACE` modifier *above* the multires (`modifier_apply` writes into the multires levels) or by `object.multires_reshape(modifier='mr')` from a detailed copy with identical topology | Yes: 3 levels; displace applied into multires; reshape `FINISHED` | Reprojection after a topology change needs shrinkwrap *before* multires ordering care ([Blender Studio retopology chapter](https://studio.blender.org/training/realistic-human-research/chapter/retopology-layering)) |
| Dyntopo | Local adaptive tessellation under the brush | None headless | `dynamic_topology_toggle` returned in `-b`, `detail_flood_fill` poll failed in `-b` and under Xvfb | Skip; voxel remesh covers the need |
| Brush strokes | Clay, crease, grab, smooth by hand | Windowed lane only: `sculpt.brush_stroke(stroke=[{name, location(3), mouse(2), mouse_event(2), pressure, size, x_tilt, y_tilt, time, is_start}], mode='NORMAL', override_location=True)` | `-b`: poll fails. Xvfb: `override_location=False` → `FINISHED`, 0 verts moved; `override_location=True` → 3922 verts moved | `pen_flip` is an operator argument, not a stroke-element key (`keyword "pen_flip" unrecognized`). Stroke results depend on view and brush assets; treat as non-reproducible until measured |
| Mesh filters | Global smooth / inflate / relax / sharpen | Windowed lane: `sculpt.mesh_filter(type='SMOOTH'|'INFLATE'|'ENHANCE_DETAILS'|'RELAX'|'SHARPEN'…, strength, iteration_count)`. Headless equivalents: `SMOOTH`, `LAPLACIANSMOOTH` (`iterations`, `lambda_factor`), `CORRECTIVE_SMOOTH` modifiers; `bmesh.ops.smooth_vert`; `v.co += v.normal * d` for inflate; edit-mode `mesh.vertices_smooth`, `mesh.vertices_smooth_laplacian`, `transform.shrink_fatten` | Modifiers, bmesh and edit-mode ops: yes. `sculpt.mesh_filter` in `-b`: segfault | — |
| "Scripted sculpting" with modifiers | Lattice / mesh-deform cages for proportion changes, shrinkwrap to a reference, displace for surface breakup | `DISPLACE` (`texture` = `bpy.data.textures.new(…, 'VORONOI'|'CLOUDS'|'IMAGE')`, `strength`, `mid_level`, `vertex_group`, `texture_coords='UV'`); `LATTICE` (edit `lattice.points[i].co_deform`); `MESH_DEFORM` + `object.meshdeform_bind`; `SHRINKWRAP` (`wrap_method='NEAREST_SURFACEPOINT'|'PROJECT'`, `offset`); `CAST`; `SIMPLE_DEFORM` | Yes, all changed the mesh; `meshdeform_bind` → `is_bound=True` | Vertex-group masks are the stand-in for sculpt masks |
| VDM brushes | Stamp ears, horns, scales from vector-displacement images | No headless stamp. Equivalent: bake VDM (`bake.type='VECTOR_DISPLACEMENT'`) offline, apply via geometry nodes "Set Position" from a sampled image | Not run | Open question §6 |

### 2.3 Retopology

| Stage | What artists do | Headless bpy recipe | Verified? | Pitfalls |
|---|---|---|---|---|
| QuadriFlow | Auto-quad a sculpt to a subdividable base, then reproject detail with multires ("use Quadriflow to calculate a low poly subdividable mesh", ≤ 50 k target: [#70358](https://projects.blender.org/blender/blender/issues/70358)) | `bpy.ops.object.quadriflow_remesh(mode='FACES', target_faces=N, seed=0, use_mesh_symmetry=True, use_preserve_sharp=False, use_preserve_boundary=False, smooth_normals=True)`; symmetry axis from `me.use_mirror_x = True` | Yes: 15 k quads → 2658 quads, 1.9 s; symmetry run 3038/3038 verts mirrored; 1.31 M tris direct → 4535 faces, 25 s | **`{'CANCELLED'}` on voxel meshes of 51 k and 142 k faces** ("The mesh needs to be manifold and have face normals that point in a consistent direction") although bmesh found 0 non-manifold edges; `mesh.remove_doubles(threshold=0.05 × voxel)` first made it finish (5–6 s). Face count is a target, not exact (3000 → 2658). No joint loops, spiral flow |
| Quality bar | Hand retopo for faces and hands; auto-retopo accepted for static props, background creatures, LODs | — | — | Manual: automatic remeshers "generally don't result in topology that lends itself to deformation" ([retopology manual](https://docs.blender.org/manual/en/latest/modeling/meshes/retopology.html)). Forum rule of thumb: ~3 loops per joint, closer together at the bend ([Polycount wiki: Limb Topology](http://wiki.polycount.com/wiki/Limb_Topology), page not fetched) |
| Decimate | Triangle LODs and props; planar for hard shapes; un-subdivide for grids | `DECIMATE` modifier: `decimate_type='COLLAPSE'` + `ratio`, `use_collapse_triangulate`, `use_symmetry`/`symmetry_axis`, `vertex_group`; `'UNSUBDIV'` + `iterations`; `'DISSOLVE'` + `angle_limit`, `delimit={'UV','SEAM',…}` | Yes: 1.31 M → 26 k in 19.9 s; UV layer kept; un-subdivide 7872 → 1968 | `delimit` only applies to planar dissolve; collapse keeps UVs but smears seams |
| Shrinkwrap after remesh | Snap the new low mesh back onto the sculpt | `SHRINKWRAP`, `target=high`, `wrap_method='NEAREST_SURFACEPOINT'`, then `CORRECTIVE_SMOOTH` 3–5 iterations | Yes | Thin parts (ears, fingers) snap to the wrong side; use `'PROJECT'` with `use_negative_direction` there |
| External remeshers | Quad Remesher (Exoside; commercial, $109.90 perpetual pro: [pricing](https://exoside.com/quadremesher/quadremesher-buy/)); QRemeshify (GPL, QuadWild Bi-MDF: [repo](https://github.com/cgg-bern/quadwild-bimdf)); Instant Meshes CLI (`-o out.obj` batch mode; `-f`/`-v` counts, `-d` deterministic, `-c` crease angle *(flags beyond `-o` unverified)*) | Subprocess on an exported OBJ/PLY | Not run | GPL code cannot ship inside the MIT package; a subprocess adapter the user installs is the only fit |

### 2.4 UVs

| Stage | What artists do | Headless bpy recipe | Verified? | Pitfalls |
|---|---|---|---|---|
| Seams | Hand-placed seams along hidden lines (inner limbs, belly, behind ears) | Automatic stand-ins: `mesh.edges_select_sharp(sharpness=…)` + `mesh.mark_seam()`; or `uv.smart_project` then `uv.seams_from_islands()` to turn its islands into seams; or seams from a recipe-declared vertex-group boundary | Yes: 830 seam edges from Smart UV islands | Sharp-angle seams are meaningless on smooth organics; prefer anatomical cut planes computed from the skeleton |
| Unwrap | Angle-based for organics; since 4.3 "Minimum Stretch" (SLIM) for least distortion ([4.3 notes](https://developer.blender.org/docs/release_notes/4.3/modeling/)) | Edit mode, select all: `bpy.ops.uv.unwrap(method='MINIMUM_STRETCH'|'ANGLE_BASED'|'CONFORMAL', margin=0.002)` | Yes, all three `FINISHED` in `-b`; repeat run byte-identical | Needs seams or it makes one stretched island. Angle-based and conformal gave identical bytes in our test (not investigated) |
| Smart UV Project | Fast fallback, many small islands | `uv.smart_project(angle_limit=radians(66), island_margin=0.005, area_weight=0, correct_aspect=True, scale_to_bounds=False)` | Yes | Many seams → visible normal-map seams and wasted padding |
| Pack + texel density | Equalise density, then pack with padding sized for mips | `uv.select_all(action='SELECT')`; `uv.average_islands_scale()`; `uv.pack_islands(rotate=True, margin=0.004, margin_method='FRACTION', shape_method='CONCAVE')` | Yes: UVs within 0.004–0.991 | Density targets *(convention)*: ~512 px/m third-person, ~1024 px/m hero ([Unreal forum](https://forums.unrealengine.com/t/textel-density-for-2048-texture-for-3rd-person-game/678150)); faces usually get 1.5–2× |
| External | UVPackmaster 3 (commercial, from $44 *(3rd-party listing)*); xatlas via `xatlas` Python bindings (MIT: [PyPI](https://pypi.org/project/xatlas)) | xatlas needs a pip install into Blender's Python | Not run | Not needed for a first version |

### 2.5 Baking (Cycles, selected → active)

| Stage | What artists do | Headless bpy recipe | Verified? | Pitfalls |
|---|---|---|---|---|
| Set-up | High selected, low active, image node active in the low material | `scene.render.engine='CYCLES'`; image via `bpy.data.images.new(name, w, h, float_buffer=…, is_data=True)`; add `ShaderNodeTexImage`, set `nodes.active`; select high, then low active | Yes | No active image node → error; albedo images need `is_data=False` |
| Normal | Tangent-space, OpenGL (+Y) | `bpy.ops.object.bake(type='NORMAL', use_selected_to_active=True, cage_extrusion=0.05, max_ray_distance=0.1, margin=16, margin_type='ADJACENT_FACES', normal_space='TANGENT', normal_r='POS_X', normal_g='POS_Y', normal_b='POS_Z')` | Yes: CPU 0.2 s (512², 2 k faces), mean RGB (0.501, 0.504, 0.991) | Blender bakes and the glTF exporter writes MikkTSpace; glTF expects +Y and MikkTSpace when tangents are absent ([spec](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html)). Low mesh must be smooth-shaded and triangulated the same way at bake and export |
| AO, albedo, others | AO from high; colour transfer from the AI texture or vertex colour | `type='AO'` (samples 32–128); `type='DIFFUSE', pass_filter={'COLOR'}`; `type='ROUGHNESS'`; `type='EMIT'` for anything custom | Yes: AO, diffuse (from a colour attribute) | `DIFFUSE` with lighting passes on bakes the scene lights in |
| Curvature, position, thickness | Masks for wear, cavity dirt, SSS thickness | Temporarily wire an Emission shader on the *high* material and bake `type='EMIT'`: `ShaderNodeNewGeometry.outputs['Pointiness']` (curvature), `.outputs['Position']`, `ShaderNodeAmbientOcclusion(inside=True)` (thickness), `ShaderNodeBevel` (rounded-edge normals) | Yes: all three baked into float images | Pointiness is per-vertex: needs a dense high mesh |
| Cage vs extrusion | Extrusion for simple shapes; a cage object where rays cross (fingers, mouth) | `cage_extrusion` = inward ray start offset; `max_ray_distance` only without a cage; `use_cage=True, cage_object='name'` ([manual](https://docs.blender.org/manual/en/latest/render/cycles/baking.html)). Starting values *(convention)*: extrusion 1–3 % of the bounding-box diagonal, max ray distance ≈ 2× extrusion, margin 8/16/32 px at 1K/2K/4K | Extrusion + ray distance yes; cage object not run | Skewed detail comes from averaged low normals: add supporting loops or a cage ([Polycount thread](https://polycount.com/discussion/comment/1288543)). "Exploded" bakes (move part pairs apart) stop neighbouring parts hitting each other |
| From multires | Bake level-N detail to the base without a second mesh | 5.3: `scene.render.bake.use_multires=True`; `bake.type='NORMALS'|'DISPLACEMENT'|'VECTOR_DISPLACEMENT'`; **`bpy.ops.object.bake_image()`** | Yes with `bake_image` (normals mean 0.487/0.494/0.940). `object.bake()` returned `FINISHED` and wrote zeros | 4.x names differ (`scene.render.use_bake_multires`, `scene.render.bake_type`) *(unverified locally)* |
| GPU, denoise, bit depth | GPU for AO-heavy bakes; 16-bit normals against banding | `scene.cycles.device='GPU'`; `preferences.addons['cycles'].preferences.compute_device_type='OPTIX'`; `get_devices()`; `d.use=True` | Yes: OptiX normal 0.4 s, AO 0.5 s in `-b` | Bake has no denoiser option; raise samples. Whether the glTF exporter keeps 16-bit PNG is *(unverified)* |

### 2.6 Texturing and look

| Topic | What artists do | Headless approach | Verified? |
|---|---|---|---|
| De-light AI albedo | Remove baked shading before PBR use; classic tools need AO + normal + bent-normal maps ([Unity De-Lighting tool](https://blog.unity.com/en/technology/experimental-feature-de-lighting-tool), [Agisoft De-Lighter](https://www.cgchannel.com/2019/06/download-free-texture-de-lighting-tool-agisoft-de-lighter/)) | Bake AO from the cleaned mesh, then divide the albedo by a blurred AO/irradiance estimate in numpy; clamp to a plausible albedo range (30–240 sRGB) *(convention)* | Not run; heuristic, quality unknown |
| Cavity / AO multiply | AO into its own channel; a light cavity multiply on albedo for stylised looks | Baked AO → glTF occlusion (R of ORM); curvature bake → roughness and dirt masks | Bakes yes |
| Roughness from albedo | Invert-and-level the luminance as a first guess, then paint | numpy: `rough = clamp(a − b·luma + c·cavity)` per material class | Not run |
| Skin | Subsurface with reddish radius | Principled `subsurface_method='RANDOM_WALK_SKIN'`, radius (1.0, 0.2, 0.1), small scale *(convention)*. Core glTF has no subsurface: useful for `hero.png` only | Not run |
| Eyes | Separate eyeball; cornea shell with a bulge over an inset iris ([Polycount thread](https://polycount.com/discussion/comment/1076785)) | Build as code primitives (UV sphere + scaled cap), place at recipe-declared sockets; never recover them from the fused AI mesh | Not run |
| Teeth / mouth bag | Separate teeth and tongue meshes inside an inward "bag" attached to the lips | Boolean-cut a cavity (`BOOLEAN`, `solver='EXACT'` or `'MANIFOLD'`), insert modelled teeth | Boolean cut yes (1754 → 1354 verts) |
| Fur for games | Hair cards: a few textured strips per clump, alpha-tested; shells/fins for short fur; density lower at silhouette edges ([Sketchfab tutorial](https://sketchfab.com/blogs/community/tutorial-real-time-fur-hair)) | `bpy.ops.object.curves_empty_hair_add()` on the body (needs a UV map); load groups from `datafiles/assets/nodes/procedural_hair_node_assets.blend` (32 groups: `Generate Hair Curves`, `Clump Hair Curves`, `Trim Hair Curves`, `Set Hair Curve Profile`, …); `GeometryNodeCurveToMesh` with a line profile → `object.convert(target='MESH')` = card strips. Shells: `SOLIDIFY`/`DISPLACE` copies along normals with an alpha noise texture | Yes: hair object created, asset groups loaded, 118 default curves → 15 576 card faces |
| Feathers / scales | Cards for feathers; scales as tiling height + normal detail, larger scales modelled | Instance on points (geometry nodes) for feathers; `DISPLACE` with a Voronoi texture then bake for scales | Displace + bake yes |

### 2.7 Rigging and skinning

| Stage | What artists do | Headless bpy recipe | Verified? | Pitfalls |
|---|---|---|---|---|
| Armature | Hand-placed or Rigify metarig fitted to the mesh | Own bones: `arm.edit_bones.new(name)` in edit mode. Rigify: `object.armature_wolf_metarig_add()` (also `cat`, `horse`, `bird`, `shark`, `basic_quadruped`, `basic_human`, `human`), move metarig bones, `bpy.ops.pose.rigify_generate()` | Yes: wolf metarig 190 bones → rig 823 bones, **197 deform**, 5.3 s; human → 706 bones, 160 deform | Rigify's `DEF-` bones are not one clean hierarchy and the count is high for games ([#57536](https://developer.blender.org/T57536)); a ts23d-owned skeleton of 30–60 bones is the simpler export. Rigify is GPL code; a rig it generates is data |
| Automatic weights | Parent with automatic weights, then fix | `bpy.ops.object.parent_set(type='ARMATURE_AUTO')` with mesh selected, armature active | Yes: 9188-vert body, 0 unweighted, max 5 influences, 1.5 s | "Bone Heat Weighting: failed to find solution" on tiny scale (reproduced at 0.01 scale: all verts unweighted), loose or overlapping shells, non-manifold geometry ([#84609](https://projects.blender.org/blender/blender/issues/84609), [#103409](https://projects.blender.org/blender/blender/issues/103409)). Only a console warning: assert `all(v.groups)` |
| Proxy + transfer | Weight a clean voxel-remeshed proxy, transfer to the real mesh | Duplicate → `voxel_remesh` → auto-weights → on the target: create same-named groups, `DATA_TRANSFER` modifier (`use_vert_data=True`, `data_types_verts={'VGROUP_WEIGHTS'}`, `vert_mapping='POLYINTERP_NEAREST'`, `layers_vgroup_select_src='ALL'`, `layers_vgroup_select_dst='NAME'`), apply, add `ARMATURE` modifier | Yes: messy 5-shell mesh fully weighted from the proxy | Nearest-surface transfer bleeds between touching limbs; transfer in the rest pose with legs apart |
| Clean-up | Limit to 4, normalise, smooth, prune | `object.vertex_group_limit_total(group_select_mode='ALL', limit=4)`; `vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)`; `vertex_group_clean(limit=0.01)`; `vertex_group_smooth(factor=0.5, repeat=2)` | Yes: max influences 5 → 4, sums 1.000 | `vertex_group_smooth` polls for weight-paint mode: `mode_set(mode='WEIGHT_PAINT')` first (works in `-b`) |
| Correctives | Shape keys driven by joint angles at shoulders, hips, jaw | `ob.shape_key_add(name=…)`; edit `key.data[i].co`; driver via `key.driver_add('value')` | Yes; exported with `export_morph=True` | Drivers do not export to glTF; engines need their own pose-driver set-up |
| Add-ons | Voxel Heat Diffuse Skinning (commercial, from $30; bundles Surface Heat Diffuse: [listing](https://superhivemarket.com/products/voxel-heat-diffuse-skinning)) | — | Not run | Not redistributable; the proxy route covers the same failure |
| Quadruped specifics | Scapula slides on the ribcage; digitigrade hind leg has three bending segments; tail and ears as chains; jaw as one bone | Own skeleton IR mapped to bones; weights by proxy route | Wolf metarig yes | See [`animal-anatomy.md`](animal-anatomy.md) |

### 2.8 Fitting an AI-generated mesh

| Step | What artists do (guides are mostly *(vendor)*: [Tripo clean-up](https://www.tripo3d.ai/blog/how-to-clean-up-ai-generated-3d-models-in-blender), [Neural4D](https://blog.neural4d.com/user-guide/ai-3d-model-blender-cleanup-complete-mesh-fix-guide-2026/)) | Headless recipe | Verified? |
|---|---|---|---|
| Audit | Count shells, non-manifold edges, flipped normals | bmesh: `e.is_manifold`, island flood-fill; `mesh.select_non_manifold()` | Yes (84 non-manifold edges found on Suzanne) |
| Repair | Merge by distance, delete loose, dissolve degenerate, recalc normals, fill holes | `mesh.remove_doubles(threshold=1e-4)`, `mesh.delete_loose()`, `mesh.dissolve_degenerate()`, `mesh.normals_make_consistent(inside=False)`, `mesh.fill_holes(sides=0)` | Yes, all `FINISHED` |
| Drop floaters | Keep the largest shell | `mesh.separate(type='LOOSE')`, sort by vertex count | Yes |
| Pose | Ask the generator for A/T-pose (`pose_mode` in Meshy); otherwise re-pose with a temporary rig | No automatic pose normalisation found; the registration step in `wolf_hybrid` is ts23d's own answer | — |
| Symmetrise | Bisect + mirror, or symmetrize | `mesh.symmetrize(direction='POSITIVE_X', threshold=1e-4)`; or `mesh.bisect(plane_co, plane_no, clear_inner=True)` + `MIRROR` modifier (`use_clip`, `merge_threshold`) | Yes, both |
| Split fused parts | Cut the jaw, hollow the mouth, replace eyes and teeth with modelled parts; fused fingers and palms are the usual failure ([Tripo rigging guide](https://www.tripo3d.ai/blog/how-to-rig-an-ai-generated-character)) | `BOOLEAN` difference with a cutter from the skeleton's jaw plane; inserted code-built eyes and teeth | Boolean yes; quality on a real AI mesh not tested |
| Rebuild | Remesh, UV after final topology, re-bake textures from the original | §2.2 voxel → §2.3 QuadriFlow → §2.4 → §2.5 with the AI mesh as the high | Chain run end to end on a stand-in mesh |

### 2.9 LODs and 2.10 review renders

| Topic | What artists do | Headless recipe | Verified? |
|---|---|---|---|
| LOD meshes | Collapse from LOD0, keep UVs, share LOD0's textures; re-bake only when silhouettes change a lot | `DECIMATE` collapse `ratio` 0.5 / 0.15 with `use_symmetry`; keep seams by weighting a vertex group | Collapse + UVs yes |
| LOD normals | Transfer LOD0 normals so shading matches | `DATA_TRANSFER` with `data_types_loops={'CUSTOM_NORMAL'}`, or `WEIGHTED_NORMAL` | Not run for normals |
| LOD weights | Decimate preserves vertex groups; re-limit to 4 and normalise | §2.7 clean-up | Not run after decimate |
| Beauty | Cycles, 64–256 samples, denoised | `scene.cycles.samples=32`, `use_denoising=True`, `denoiser='OPENIMAGEDENOISE'` (CPU) or `'OPTIX'` | Yes: CPU 1.5 s, OptiX 0.5 s at 512² |
| Clay / matcap | Judge form without texture | `render.engine='BLENDER_WORKBENCH'`; `scene.display.shading.light='MATCAP'`, `.studio_light='clay_brown.exr'`, `.show_cavity=True`, `.cavity_type='BOTH'`, `.color_type='SINGLE'` | Yes in `-b`, 1.2 s (GPU present; no-GPU box not tested) |
| Wireframe | Judge topology | Duplicate + `WIREFRAME` modifier (`thickness=0.004`, `use_replace=True`) with a black material over the shaded mesh, rendered in Cycles | Yes |
| Turntable | 8–12 views | Parent the camera to an empty, rotate per frame, `render.render(write_still=True)` per view | Single views yes |

### 2.11 glTF import/export options that matter (5.3 defaults, read from the operator)

| Option | Default | Use |
|---|---|---|
| `export_yup` | `True` | Keep; Blender Z-up → glTF Y-up |
| `export_tangents` | `False` | `True` wrote a `TANGENT` attribute (201 kB → 239 kB); leave off unless a consumer lacks MikkTSpace |
| `export_skins` / `export_all_influences` / `export_influence_nb` | on / `False` / 4 | Leave; export kept max 4 influences and 197 joints on re-import |
| `export_def_bones` | `False` | `True` to drop control bones |
| `export_apply` | `False` | `True` only for unskinned meshes (it removes shape keys) |
| `export_image_format` | `AUTO` (`JPEG`, `WEBP`, `NONE`) | `AUTO` wrote `image/png` for a packed bake |
| `export_vertex_color` | `MATERIAL` (`ACTIVE`, `NAME`, `NONE`) | `NONE` unless the recipe uses vertex colour |
| `export_morph`, `export_rest_position_armature`, `export_hierarchy_flatten_bones` | — | Shape keys; rest pose; flatten for Rigify chains |
| Import: `merge_vertices`, `import_shading`, `bone_heuristic`, `guess_original_bind_pose`, `import_pack_images` | — | `merge_vertices=True` for AI meshes that arrive split per triangle |

## 3. Determinism (local, same binary, same machine)

| Step | Same run twice | `-t 1` vs `-t 16` | Note |
|---|---|---|---|
| `object.voxel_remesh` | identical | **different bytes**, same counts (15 325 v) | Pin `-t`; hash after a canonical vertex sort or accept and cache |
| `object.quadriflow_remesh` | identical for a seed | identical | `seed` changes the result (2658 vs 2818 faces) |
| Decimate collapse, Smart UV, `uv.unwrap` + pack | identical | identical | — |
| Cycles bake CPU (normal, AO) | identical image hash | identical | `cycles.seed=0`, no denoise |
| Cycles bake OptiX | not repeated | — | Differs from the CPU image; pick one device per cache key |
| glTF export | identical bytes for two exports in one process | not tested | — |
| Rigify generate, bone heat, sculpt lane | not measured | — | Open |

Cross-version (4.5 / 5.2 / 5.3) and cross-machine equality is not expected; ts23d's content-hash
cache with the Blender version in the key is the reproducibility boundary, as for neural adapters.

## 4. What ts23d should script: step list for a Blender adapter

Priority 1 is the minimum chain for path (a); 2 adds path (b) and rigging; 3 is polish.

| P | Op | Parameters (default) | Implementation | Gate after the step |
|---|---|---|---|---|
| 1 | `import_glb` | `path`, `merge_vertices` (true) | `import_scene.gltf` | ≥ 1 mesh; report tris, shells |
| 1 | `cleanup` | `merge_dist` (1e-4), `keep` (`largest`), `fill_holes` (true) | §2.8 repair ops | non-manifold edge count reported |
| 1 | `voxel_remesh` | `voxel_m` (bbox diagonal / 250), `adaptivity` (0), `fix_poles` (true) | mesh props + `object.voxel_remesh`, then `remove_doubles(0.05 × voxel)` | closed, 1 shell |
| 1 | `quad_remesh` | `faces` (LOD0 budget / 2), `seed` (0), `symmetry` (`x`\|none), `preserve_sharp` (false) | `object.quadriflow_remesh` | result ≠ `CANCELLED`; face count within ±25 % |
| 1 | `project` | `target`, `method` (`nearest`), `smooth_iters` (3) | `SHRINKWRAP` + `CORRECTIVE_SMOOTH` | max distance to target reported |
| 1 | `uv_unwrap` | `seams` (`islands`\|`sharp`\|`groups`), `method` (`MINIMUM_STRETCH`), `margin` (0.004) | §2.4 | UVs in 0–1, stretch reported |
| 1 | `bake` | `maps` (`normal`,`ao`,`albedo`), `size` (2048), `extrusion` (2 % diag), `max_ray` (2× extrusion), `margin_px` (16), `samples` (normal 4, AO 64), `device` (`cpu`) | §2.5 | non-background coverage > threshold; normal mean B > 0.9 |
| 1 | `decimate` | `ratio` or `faces`, `symmetry` (true) | `DECIMATE` collapse | UV layer present |
| 1 | `render_review` | `views` (6), `modes` (`matcap`,`wire`,`beauty`), `size` (1024) | §2.10 | files written |
| 1 | `export_glb` | `tangents` (false), `def_bones` (true), `influences` (4) | `export_scene.gltf` | re-import: joints, max influences ≤ 4 |
| 2 | `blockout_skin` | `joints[] {pos, radius}`, `edges[]`, `subdiv` (2) | Skin modifier | 0 non-manifold edges |
| 2 | `blockout_sdf` | `capsules[]`, `voxel_m`, `smooth` (mean iterations), `band` (6) | `PointsToSDFGrid` → `SDFGridMean` → `GridToMesh` | vertex count > 0 |
| 2 | `deform` | `kind` (`displace`\|`smooth`\|`laplacian`\|`lattice`\|`cast`\|`inflate`), `mask` (vertex group), kind-specific values | modifiers / bmesh | mesh changed |
| 2 | `multires_detail` | `levels` (3), `displace` texture params | multires + displace, `bake_image` | bake non-zero |
| 2 | `symmetrize` | `axis` (`+x`), `threshold` (1e-4) | `mesh.symmetrize` | mirrored vertex ratio |
| 2 | `rig` | `bones[]` from the skeleton IR, or `rigify: wolf\|cat\|horse\|human` | edit bones / Rigify | bone count |
| 2 | `skin` | `mode` (`auto`\|`proxy`), `proxy_voxel_m` | bone heat, proxy + `DATA_TRANSFER` | 0 unweighted vertices |
| 2 | `weights_finish` | `limit` (4), `smooth` (0.5 × 2), `clean` (0.01) | §2.7 | max influences ≤ 4, sums = 1 |
| 3 | `boolean_cut` | `cutter`, `solver` (`EXACT`) | `BOOLEAN` | manifold result |
| 3 | `hair_cards` | `density`, `length_m`, `clump`, `card_width_m`, `seed` | hair curves + asset groups + `CurveToMesh` | card triangle count under budget |
| 3 | `shape_key` | `name`, `deltas` or `from_pose` | shape keys | exported morph target present |
| 3 | `sculpt_gui` | `filters[]`, `strokes[]` | Xvfb lane, separate process | opt-in, flagged non-reproducible |

Dispatcher contract: one JSON step list in, one JSON report out (`step`, `status`, `stats`,
`seconds`, `T3D_*` code + `fix:` on failure); every step ends with its gate so a silent no-op is a
failure, and the process exit code is checked for crashes.

## 5. Local tests run (Blender 5.3.0, `-b --factory-startup`, one process per test)

| Test | Result |
|---|---|
| `object.voxel_remesh`; Remesh modifier | OK, 0.3 s; operator and modifier outputs differ |
| `object.quadriflow_remesh` (seed 0 twice, seed 7, symmetry, non-manifold input, 1.31 M tris) | OK; non-manifold Suzanne also finished (922 quads) |
| QuadriFlow on 51 k / 142 k voxel meshes | `CANCELLED`; fixed by `remove_doubles`; triangulate + decimate also worked |
| Decimate collapse / un-subdivide / planar | OK |
| `uv.unwrap` ×3 methods, `average_islands_scale`, `pack_islands`, `smart_project`, `seams_from_islands`, `cube_project` | OK |
| `mode_set(SCULPT)`, `mesh.symmetrize`, multires subdivide / reshape | OK |
| `sculpt.mesh_filter`, `sculpt.symmetrize`, `sculpt.face_sets_init`, `paint.mask_flood_fill` in `-b` | Segfault (exit 139) |
| `sculpt.brush_stroke`, `sculpt.detail_flood_fill` in `-b` | Poll failed |
| Same sculpt ops under `xvfb-run` (no `-b`) | OK except `detail_flood_fill`; strokes need `override_location=True` |
| Skin modifier body, `skin_armature_create`, metaballs → mesh | OK |
| SDF grid node chains | OK; empty output at fine voxel with band width 3 |
| Displace, Laplacian, corrective smooth, smooth, cast, shrinkwrap, lattice, mesh deform, bmesh, edit-mode smooth | OK |
| Bone heat: clean body / 5 intersecting shells / 0.01 scale | OK / OK / silent failure with warning |
| Envelope weights | OK, max 8 influences |
| Proxy weights + Data Transfer + limit / normalise / smooth / clean | OK after switching to weight-paint mode for smooth |
| Rigify list, wolf, human generate; wolf rig + auto weights + GLB export + re-import | OK (17.8 s end to end; 13 126 verts, 0 unweighted, max 4 influences) |
| Cycles bakes: normal, AO, diffuse colour, emit (pointiness, position, thickness) CPU; normal + AO OptiX | OK |
| Multires bake | `bake_image` OK; `object.bake` silent no-op |
| glTF export with and without tangents, byte repeat, option defaults | OK |
| Cycles CPU + OIDN, OptiX + OptiX denoise, Workbench matcap, EEVEE, wireframe render | OK |
| Hair curves, bundled hair node groups, cards via Curve to Mesh | OK |
| AI-mesh clean-up ops, bisect + mirror, loose-part split, boolean cut | OK |
| Thread determinism (`-t 1` vs `-t 16`) | §3 |

## 6. Open questions

- Why `Mesh to SDF Grid` returns nothing at fine voxel sizes with band width 3, and what QuadriFlow's
  manifold check rejects in fine voxel meshes that bmesh reports as manifold.
- Whether the Xvfb sculpt lane is repeatable (brush assets, view matrix, stroke spacing), and whether
  it works on a machine without a GPU (software GL).
- Blender 4.5 LTS and 5.2 LTS: rerun §5 there; multires bake property names and the geometry-nodes
  input API differ.
- QuadriFlow quality on a real Pixal3D / TRELLIS.2 / Meshy creature: deformation at shoulders and
  hips against ts23d's deformation QA, versus a base mesh with authored loops shrinkwrapped onto it.
- Seams for organics without an artist: skeleton-derived cut planes versus Smart UV islands, judged
  by normal-map seam visibility in `sheet.png`.
- De-lighting: no open, scriptable tool found; the AO-division heuristic needs a measured before/after.
- Hair cards: alpha atlas baking from curves (card texture) was not attempted; only card geometry.
- VDM stamping without sculpt mode (geometry-nodes image sampling) is untested.
- Licence boundaries: Rigify and QRemeshify are GPL code driven as tools; confirm that generated
  rigs and meshes are unencumbered data before committing outputs, and keep Quad Remesher, UVPackmaster
  and Voxel Heat Diffuse Skinning out of any default path.
- Whether the glTF exporter preserves 16-bit normal maps, and Workbench/EEVEE in `-b` without a GPU.

## Sources

- Blender manual: [Render baking](https://docs.blender.org/manual/en/latest/render/cycles/baking.html) · [Retopology and remeshing](https://docs.blender.org/manual/en/latest/modeling/meshes/retopology.html) · [glTF 2.0 add-on](https://docs.blender.org/manual/en/latest/addons/import_export/scene_gltf2.html) (page too large for our fetcher; quotes taken from search excerpts)
- Blender Python API: [Sculpt operators 5.3](https://docs.blender.org/api/5.3/bpy.ops.sculpt.html) · [Using operators (gotchas)](https://docs.blender.org/api/5.0/info_gotchas_operators.html)
- Release notes: [5.2 Python API](https://developer.blender.org/docs/release_notes/5.2/python_api/) · [4.3 Modeling & UV](https://developer.blender.org/docs/release_notes/4.3/modeling/)
- Blender issues: [#71605](https://developer.blender.org/T71605) · [#100687](https://developer.blender.org/T100687) · [#107805](https://projects.blender.org/blender/blender/issues/107805) · [#84964](https://projects.blender.org/blender/blender/issues/84964) · [#129578](https://projects.blender.org/blender/blender/issues/129578) · [#70358](https://projects.blender.org/blender/blender/issues/70358) · [#84609](https://projects.blender.org/blender/blender/issues/84609) · [#103409](https://projects.blender.org/blender/blender/issues/103409) · [#57536](https://developer.blender.org/T57536)
- Blender Studio: [Realistic character workflow: retopology and layering](https://studio.blender.org/training/realistic-human-research/chapter/retopology-layering) · [Stylized character workflow](https://studio.blender.org/training/stylized-character-workflow/base-meshes/) · [Asset bundles (Human Base Meshes, CC0)](https://www.blender.org/download/demo-files/)
- Licences and tools: [MakeHuman / MPFB licence](https://static.makehumancommunity.org/about/license.html) · [QuadWild Bi-MDF](https://github.com/cgg-bern/quadwild-bimdf) · [Quad Remesher pricing](https://exoside.com/quadremesher/quadremesher-buy/) · [xatlas Python bindings](https://pypi.org/project/xatlas) · [Voxel Heat Diffuse Skinning](https://superhivemarket.com/products/voxel-heat-diffuse-skinning) · [Instant Meshes](https://github.com/wjakob/instant-meshes) (licence text not read)
- glTF: [glTF 2.0 specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html)
- Practice: [Polycount baking thread](https://polycount.com/discussion/comment/1288543) · [Polycount wiki: Limb Topology](http://wiki.polycount.com/wiki/Limb_Topology) (not fetched) · [Polycount: eyes](https://polycount.com/discussion/comment/1076785) · [Unreal forum: texel density](https://forums.unrealengine.com/t/textel-density-for-2048-texture-for-3rd-person-game/678150) · [Sketchfab: real-time fur and hair](https://sketchfab.com/blogs/community/tutorial-real-time-fur-hair) · [Unity de-lighting tool](https://blog.unity.com/en/technology/experimental-feature-de-lighting-tool) · [Agisoft De-Lighter](https://www.cgchannel.com/2019/06/download-free-texture-de-lighting-tool-agisoft-de-lighter/)
- AI-mesh clean-up *(vendor)*: [Tripo: clean up AI models in Blender](https://www.tripo3d.ai/blog/how-to-clean-up-ai-generated-3d-models-in-blender) · [Tripo: rig an AI character](https://www.tripo3d.ai/blog/how-to-rig-an-ai-generated-character) · [Neural4D clean-up guide](https://blog.neural4d.com/user-guide/ai-3d-model-blender-cleanup-complete-mesh-fix-guide-2026/)
