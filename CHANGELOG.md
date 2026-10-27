# Changelog

All notable changes to `@developerz-ai/ts23d`. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/); in 0.x a minor bump may break. `bun run release <x.y.z>` turns `[Unreleased]` into the dated version section ([PUBLISHING.md](PUBLISHING.md)).

## [Unreleased]

### Added
- Programmatic builds without the CLI documented in the README, with a runnable `examples/build-with-bun.ts` that CI executes.
- CLI `--lods <list>`: build only the detail levels you need (`--lods 0` for the hero mesh alone); QA, GLBs and `manifest.json` cover exactly those. Every output is opt-in or opt-out: `--sheet none|external|embed`, `--no-animations`, `--no-shot`.
- Asset DSL: `defineAsset` (with `real` dimensions + `sources`), `compile`, `ctx.part` / `ctx.group` / `ctx.use`, LODs by re-running the recipe.
- Core: Mesh IR, `MeshBuilder`, seeded forkable RNG, vector math, mesh transforms (`place`, `affine`, `frame`, `applyAffine`), `Ts23dError` with code + cause + fix.
- Grammar: CGA-style split grammar, Whyte notation.
- Material: shared trim-sheet layout, era/region palettes, `hex()`.
- Primitives: `box`, `lathe`, `cylinder`, `prism`, `beam`, `planar`, `triangulate`.
- Kinds: `facade`, `setbacks`, `axle`, `trackRun`, `whyteAxles`, `propeller`.
- Passes: `grime`.
- QA gates: `triangle-budget`, `floating-parts` (true surface contact), `clashes` (moving parts swept through their motion; `clearOf` for intended interlocks), `part-names`, `proportions`, `measures` (`real.measures` spec-sheet dimensions).
- Export: zero-dependency GLB writer, one material, baked `run` loop; `mergeToPivots` batches static geometry into its nearest pivot by default (`toGlb(asset, { keepParts: true })` opts out).
- Render: zero-GPU contact sheet (six orthographic views, metre grid).
- CLI: `t3d build | shot | list` with `--out` and `--json`.
- Materials: `paintTrimSheet(recipe = DEFAULT_SHEET)` paints albedo / normal / ORM (RGBA8; 1024² ≈ 0.8 s). Strips bond, planks, plates, noise, flat, slate, concrete, glass; 6 decal cells, 11 foliage cells (coloured, alpha leaf mask). `toGlb(a, { sheet })` embeds or `{ sheet: { external: true, prefix } }` references shared PNGs; `TANGENT` only with a sheet.
- Shader sources: `threeMaterialSource(hints)` (TSL) and `godotShaderSource(hints)` (.gdshader): wind, window glow, wear.
- CLI: `--sheet external|embed|none` (default external: `out/trim_sheet_{albedo,normal,orm}.png` once, GLBs reference `../trim_sheet_*.png`), `--sheet-size 512|1024|2048`.
- Primitives: `sweep` (parallel-transport frames, taper, twist), `loft` over `rings` + `ringXY` with wobble; `beam` gains `up` and `caps`.
- Vegetation: Weber–Penn `tree` kind, presets oak / pine / palm / birch / willow, `trees` family, `treeReal`.
- Recipes: `tiger_1`, `t34` + `t34_1941`, `loco_440` (4-4-0 Jupiter), `eiffel_tower`, `oak`, `pine`, `palm`, `material_swatches`. Asset gallery site.
- README benchmarks block filled by `bun run bench --write`.
- Declared, not built (throw `T3D_NOT_IMPLEMENTED`): `tiled`, `cell`, `sdf`, `roof`, `hull`, `creature`, `optimize`, `photoMatch`, `silhouetteIoU`, `localGenerator`, `importGlb`, `kubeezImages`.
- `defineFamily`: one typed build, many variants (`variant`), derived families (`extend`).
- `ctx.emitter`: smoke / steam / dust / muzzle / fire / sparks sources as named nodes with `extras.ts23d.emitter`.
- `sway` motion (`axis`, `degrees`, `hz`); the `clashes` gate sweeps it as a full revolution.
- `heightfield` primitive for terrain and dioramas.
- glTF-Validator (Khronos) runs in the test suite on every exported shape: 0 errors required.
- Recipe checks: `checks: Check[]` on `defineAsset`; builders `clear`, `noOverlap`, `touches`, `symmetric` in `/qa`; gate `check` at every LOD.
- `inspect(compiled)`: `parts`, `mesh`, `bounds`, `distance`, `penetration` by glob, plus `glob()` and `insideSolid()`, for debugging scripts.
- `ctx.socket`: seat / mount / camera / audio / attach / spawn / interact / light points as named nodes with `extras.ts23d.socket`.
- Surfaces: `surface: 'opaque' | 'cutout' | 'glass' | 'translucent'` per part; at most 4 shared materials (glass and translucent via `KHR_materials_transmission`, `_volume`, `_ior`); batching splits per pivot and surface.

### Changed
- Bun 1.4.4 is the floor (`.bun-version`, `engines.bun`).
- The site is an asset gallery only; the play mode was removed. ts23d produces assets for your engine and ships no engine or game code.
- `merge` preallocates its buffers. `symmetric` matches side tokens as whole name segments. `touches` skips LODs where either part is absent. The boundaries guard skips tests and `src/types`.
- **Breaking:** exported GLBs now face glTF +Z. Root rotation is `[-0.5, -0.5, -0.5, 0.5]` (authoring +X front → glTF +Z, +Z up → +Y). GLBs placed by hand before this face 90° off; rotate them −90° about Y ([ADR 009](docs/decisions/009-gltf-front-axis.md)).
- Seamless loops: the `run` clip is 4 s, every motion rounded to whole cycles, spins ≥ 12 keys per turn. A static `rest` clip comes first so viewers open paused.
- Smaller GLBs, core glTF only: u16 indices when ≤ 65,535 vertices; `COLOR_0` as normalised u16 RGBA; shared animation time accessors. tiger_1 LOD0: 13.0 MB → 11.0 MB.
- QA is much faster: indexed point-in-solid with short-circuited majority rays, cached world meshes and samples, a numeric triangle grid with per-triangle AABB rejection, incremental distance radius. tiger_1 LOD0 QA: minutes → 1.35 s.
- Animations: `toGlb()` exports none unless `{ animations: true }` (glTF has no autoplay flag; engines drive named pivots from code). `t3d build` bakes the `run` clip by default so viewers show play controls; `--no-animations` skips it.
- CLI output is one folder per asset: `out/<asset>/{lod0,lod1,lod2}.glb`, `sheet.png`, `manifest.json`, plus `out/index.json`. `t3d build` renders the sheet too (`--no-shot` to skip); `t3d shot` writes sheet + manifest only.
