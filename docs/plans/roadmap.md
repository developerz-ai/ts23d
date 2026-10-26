# Roadmap

**Each milestone ships something an agent can use end to end, gated by `bun run verify`.** Ticked = on `main` with a test and, where it makes geometry, a recipe. Order within a milestone is a suggestion; order between milestones is a dependency. No dates promised.

Status as of 2026-10-25: **M0 done, M1 under way.** Every exported entry point that isn't ticked throws `T3D_NOT_IMPLEMENTED` with a pointer here.

## M0: Scaffold (0.x)

- [x] Mesh IR, `MeshBuilder`, seeded forkable RNG, vector math
- [x] `defineAsset` / `compile` / `ctx.part` / `ctx.group` / `ctx.use`, LODs by re-run
- [x] `real` dimensions + `sources` on `defineAsset`
- [x] Mesh transforms: `place`, `affine`, `frame`, `applyAffine`
- [x] `Ts23dError` with code + cause + fix
- [x] Split grammar (`split`, `parseSplit`, `layoutSplit`), Whyte notation
- [x] Trim-sheet layout, palettes, `hex()`
- [x] Primitives: `box`, `lathe`, `cylinder`
- [x] Kinds: `facade`, `setbacks`, `axle`, `trackRun`, `whyteAxles`, `propeller`
- [x] `grime` pass
- [x] QA: `triangle-budget`, `floating-parts` (surface contact), `clashes` (swept motion, `clearOf`), `part-names`, `proportions`, `measures` (`real.measures`)
- [x] GLB writer: one material, baked spin/slide clip, Z-up → Y-up root
- [x] `defineFamily`: variants and derived families
- [x] `ctx.emitter`: particle sources as named nodes
- [x] `sway` motion; `run` clip baked by `t3d build`, opt-in in `toGlb`
- [x] Recipe `checks` (`clear`, `noOverlap`, `touches`, `symmetric`) and `inspect`
- [x] `ctx.socket`; surfaces (opaque / cutout / glass / translucent, ≤ 4 materials)
- [x] CLI output: `out/<asset>/` with GLBs, sheet, manifest; `out/index.json`
- [x] `heightfield` terrain
- [x] GLB production pass: front axis +Z, seamless loops, `rest` + `run` clips, u16 indices, u16 colours, shared time accessors, glTF-Validator in tests ([glb-production.md](../architecture/glb-production.md) G1, G2, G4, G5, G10)
- [x] `mergeToPivots`: static geometry batched into its nearest pivot (default in `toGlb`; `keepParts` opts out)
- [x] CPU contact sheet: six views, metre grid, header dims
- [x] CLI: `t3d build | shot | list`, `--out`, `--json`
- [x] Repo gates: lint, typecheck, boundaries, determinism, filesize, tests, recipes (QA + double-build hash), build
- [x] Release flow: stamp → PR → tag → OIDC publish
- [x] Gallery site (browser compile + three.js viewer)
- [x] Recipes: `tiger_1`, `t34` + `t34_1941` (family), `loco_440` (family; the Jupiter, drivers 1.626 m sourced), `material_swatches`
- [x] Gallery `#play`: a drivable tank
- [ ] First npm publish (bootstrap, [PUBLISHING.md](../../PUBLISHING.md))

## M1: Architecture primitives

- [x] `prism`: extrude a 2D profile in the `xy` / `xz` / `yz` plane
- [x] `beam`: member between two points, square or round
- [x] `planar`: flat polygon in 3D
- [x] `triangulate`: ear clipping
- [ ] `tiled`: quad tiling a strip at true scale
- [ ] `cell`: quad mapped to a decal cell
- [ ] `roof`: hip, gable, pyramid, mansard
- [ ] Opt-out for genuinely floating parts (aircraft in flight, hanging signs)
- [ ] Cross-machine determinism check; a `t3d build` flag for users' recipes
- [x] Recipe: `eiffel_tower` (188,016 / 21,860 / 1,062 triangles, 1 draw call; profile from Weidman & Pinelis 2004 and Eiffel's 1887 drawing)
- [ ] `lattice` truss primitive
- [ ] Recipes: a terrace street, a station, an Art Deco tower, townhouse, gas lamp (landing)

## Recipe-agent backlog (unscheduled)

- [ ] `orbit` motion + `phase` for side rods and quartering
- [ ] Sector sweep for `sway` clashes (today: full revolution)
- [ ] `recipes/_lib/` shared helpers: `trackLoop`, `roadWheel`, decal font with Cyrillic
- [ ] `subdivide(mesh, maxEdge)` pass for vertex-colour camo
- [ ] Exact-match option for measure `parts` (today: prefix match)
- [ ] TriangleGrid filling only the cells a triangle crosses

## M2: High definition, cheap to draw

Materials:
- [x] `paintTrimSheet`: procedural albedo / normal / ORM; strips bond, planks, plates, noise, flat, slate, concrete, glass; 6 decal + 11 foliage cells
- [x] Sheet in the GLB: embedded or shared external PNGs (`--sheet`, `--sheet-size`)
- [ ] KTX2 profile; fix mip bleed between strips; per-face V mapping on `box`
- [ ] Image-stamped cells (decals from any `ImageSource`)

Optimisation and GLB production (gap ids from [glb-production.md](../architecture/glb-production.md)):
- [ ] `optimize(mesh)`: vertex weld + vertex-cache reorder, reports ACMR
- [ ] Gate: ACMR ceiling
- [ ] Opt-in `web` profile: `KHR_mesh_quantization` + `EXT_meshopt_compression` (G14). Default stays core glTF: Godot refuses required extensions
- [ ] `MSFT_lod` single-file LOD set + screen-coverage switch hints (G11)
- [ ] Placeholder pivots at LOD2 so engine-bound names exist in every LOD (G3)
- [ ] `engine-names` gate against Godot suffix hints like `_wheel`, `-col` (G6)
- [ ] Clip naming Godot loops (`*_loop`) (G7)
- [ ] Asset metadata: generator version, copyright, `asset.extras.ts23d` provenance (G8)
- [ ] Mesh dedupe: identical geometry shares one mesh (G9)
- [ ] Emissive surface (`KHR_materials_emissive_strength`) for lit windows (G13 remainder)

Shape:
- [x] `sweep`: parallel-transport frames, taper, twist
- [x] `loft` over `rings`, `ringXY` with wobble
- [ ] `hull` (vessel kind) from length / beam / draft / freeboard
- [ ] Lofted vehicle bodies, fuselages, wings

Checking:
- [ ] `photoMatch(asset, { photo, camera })`: photo · model · overlay in one PNG + silhouette IoU
- [ ] `silhouetteIoU` gate on top of it
- [ ] Gates: manifold + outward normals, texel density

Exit bar: a 4-4-0 with tender matching [`docs/reference/loco-photo-match.png`](https://raw.githubusercontent.com/developerz-ai/ts23d/main/docs/reference/loco-photo-match.png) (predecessor output: ~16k triangles, 17 named nodes, one embedded trim-sheet material, baked `run`). Recipes: that loco, a harbour tug, a biplane.

## M3: Vegetation and engine adapters

- [x] `tree`: Weber–Penn skeleton, leaf cards; presets oak / pine / palm / birch / willow; `trees` family; `treeReal`
- [x] Recipes: `oak`, `pine`, `palm`
- [ ] Per-vertex wind weights (crown `sway` today)
- [ ] LOD2 impostors as crossed billboards from the foliage cells
- [ ] Species presets as data
- [x] `threeMaterialSource` (TSL) and `godotShaderSource`: wind, window glow, wear
- [ ] Unity import settings; engine adapters beyond shader sources: Three.js, Godot, Unity (map extras + hints onto each engine's material)
- [ ] Engine collision naming: `ctx.collider` → Godot `-convcolonly`, Unreal `UCX_`, generic extras (G12)
- [ ] Motion baked into vertex attributes (pivot + spin axis per vertex): a shader animates every wheel in one draw call
- [ ] Recipes: a park, an orchard

## M4: Creatures

- [ ] `sdf`: marching-cubes meshing of a signed-distance field
- [ ] `creature`: SDF flesh over biped / quadruped / bird skeletons, bones as named parts
- [ ] Recipes: stylised critters, rocks

## M5: Neural adapters and import

- [ ] `localGenerator`: HTTP adapter for a local TRELLIS.2 / Hunyuan3D 2.1 / SF3D server
- [ ] Content-hash cache under `.ts23d/neural/`; a CI cache miss is an error naming the regenerate command
- [ ] `importGlb`: any GLB as a part, fitted and recoloured onto the trim sheet
- [ ] `kubeezImages`: kubeez.com image source for references, decals, texture sources
- [ ] Recipe: a code-built cart drawn by a generated horse

## M6: Reverse direction and reach

- [ ] Camera solve for `photoMatch` from ≥ 4 marked correspondences
- [ ] Reverse direction: a VLM proposes recipe params from photos, scored by silhouette IoU, best kept
- [ ] MCP server: `build`, `shot`, `list` as tools, PNG inline
- [ ] Playground: edit a recipe in the browser, see GLB + contact sheet live
