# Changelog

All notable changes to `@developerz.ai/ts23d`. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/); in 0.x a minor bump may break. `bun run release <x.y.z>` turns `[Unreleased]` into the dated version section ([PUBLISHING.md](PUBLISHING.md)).

## [Unreleased]

## [0.1.0] - 2026-11-07

### Added
- Primitives: `tiled` (true-scale strip tiling, V banded to the strip's real height), `cell` (decal quad with `inset` reveals or raised plaques), `lattice` (Warren / Pratt / Howe / X trusses, square or angle-iron members, planar or box, tapered), `box({ bevel })` (one-segment chamfer for the mid-poly hard-surface look; `bevel: 0` is byte-identical to before).
- Lettering: `text` sets name boards, wagon lettering, hull markings and signs as geometry from a built-in 5×7 font (Latin, digits, punctuation, Cyrillic; `block` weight), flush or raised, aligned, fitted to `maxWidth`, and kept on top of stepped surfaces with `surface(u, v)`; `measureText` gives the width. `lathe({ uv: 'metres' })` maps the strip at true scale; `lathe({ faceted: true })` makes flat-shaded n-sided solids.
- Sculpt edits may be groups (`{ group, op, blend, color }`: a subtract inside a group trims only that group); `sculpt({ mirror: 'y' })` / `sdf({ symmetry: 'y' })` give exactly mirror-symmetric meshes; evaluation skips edits whose bounds cannot affect a point (2.4× faster, bit-identical). `bakeAo` reuses its ray grid and walks it allocation-free: 3–4× faster, byte-identical (tiger_1 LOD0 7.2 s → 2.4 s).
- Organic modelling: `sdf` (surface nets by default, marching cubes on request, gradient normals, sparse evaluation), `sd.*` combinators (sphere, ellipsoid, box, capsule, cone, torus, union, smooth union / subtract, displace), seeded `valueNoise`, and `sculpt` — a Dreams-style ordered edit list (add / subtract / intersect / paint, smooth blends, per-edit colour, `mirror: 'y'`).
- Characters: `head` kind — a parametric stylised head and bust sculpted from SDF edits, with race presets (`HEADS`: orc, goblin, human, dwarf, elf), a separately pivoted `jaw` (optional sway), aimable `eye_l` / `eye_r`, baked vertex AO, and `headParams` / `headEdits` / `checkHead` for custom races.
- Terrain: seeded `gradientNoise2` / `valueNoise2`, `fbm`, `billow`, `ridged` (Musgrave), `warp` (domain warping), `terrace`; `terrainGrid`, `sampler`, `slopeMap`; `hydraulicErosion` (droplet erosion with flow and deposit maps; 100k droplets on 257² in ≈0.4 s) and `thermalErosion` (talus); `terrainColor` (forest / grass / scree / rock / snow by altitude, slope and flow); `heightfield({ skirt })` closes a tile into a solid.
- Kinds: `roof` / `roofMesh` (gable, hip, pyramid, mansard, gambrel, shed; slab, soffit, fascia, ridge and hip caps, gable infill, chimneys; LOD-gated), `opening` window/door kit and `facade({ kit })`, `mass` (true-scale masonry block), `hull` / `hullMesh` / `hullLines` (lofted vessel hull: sheer, stem, round or transom stern, bulwarks, plank deck, waterline and boot-top bands, fenders).
- Passes: `optimize` (weld, degenerate and duplicate triangle removal, Forsyth vertex-cache order, vertex-fetch order; reports ACMR / ATVR) — on by default in GLB export (tiger_1 LOD0: 254k → 95k vertices, ACMR 2.88 → 1.16, 15.4 → 6.3 MB); `weightedNormals` (face-area × angle weighted, hard-edge split); `bakeAo` / `bakeAoAsset` (deterministic per-vertex ambient occlusion in vertex colour).
- Export: `exportGlb` returns the bytes plus an optimiser report; `KHR_lights_punctual` from light sockets; emissive glow materials (`KHR_materials_emissive_strength`) from `glow` rules; `KHR_xmp_json_ld` provenance (title, creators, licence, sources) and `asset.copyright`; `asset.generator` names the package version. The glTF-Validator test now demands zero warnings, not just zero errors.
- Motion: `oneWay: true` on `slide` / `sway` moves from rest to the peak and back (a sliding door, a signal arm dropping) instead of to both sides; the `clashes` gate sweeps a `sway` through its real sector (5° bins) instead of a full revolution, and a one-way slide only along its stroke.
- Asset definition: `license`, `copyright`, `creators` and `glow` fields; `description` and `sources` travel into the GLB.
- QA: gates `non-finite`, `vertex-colors`, `hidden-parts`, `normals-winding` (default), `degenerate-triangles`, `z-fighting` (opt-in); cross-LOD gates `lod-triangles` (default, run by the recipes gate), `lod-silhouette`, `lod-pivots` (opt-in).
- Render: `beauty` / `t3d hero` — a zero-GPU product shot (perspective, trim-sheet textures, sun with soft shadows, sky fill, AO, 2× supersampling, ground contact shadow; tiger_1 at 1600×900 in ≈2.8 s, byte-deterministic). `t3d build` writes `hero.png` too.
- AI visual QA: `t3d review` writes a review pack — hero, contact sheet, close-ups, an LOD0/1/2 strip, `review.md` (a checklist prompt for a vision agent, pointing at the recipe's dossier) and `review.json` (silhouette coverage, LOD popping IoU per view, exposure, crushed blacks; warnings past thresholds). `maskIoU` is the silhouette core `photoMatch` will use.
- Site: presentation-first gallery — a live orbiting showcase above the fold, category filters, cards from the committed hero renders (WebP), asset pages with a Studio / Scene viewer, LOD switch, wireframe, part outlines on hover, measures with Δ%, dossier links and GLB downloads; `bun run site:shots` regenerates `docs/media/*.png` with headless Chrome.
- Recipes are folders: `recipes/<name>/<name>.ts` + `README.md` (the sourced dossier) + committed `out/<asset>/{hero.png, sheet.png, manifest.json}`, refreshed by `bun run shots`; the recipes gate fails on a missing dossier, a stray file or stale outputs.
- Gallery: `station_halt` (GWR Toddington), `water_tower` (Frisco Beaumont tank), `boxcar` + `boxcar_nw` (USRA single-sheathed), `signal_gantry` + `signal_gantry_4`, `dropship`, `cargo_container_scifi` (ISO 668), `asteroid` ×3, `mountain_range` ×3 (eroded alpine tiles), `boulders`, `orc_head`, `goblin_head`, `human_head`.
- `@developerz.ai/ts23d/testing`: `assertQaPass`, `assertBudget`, `assertParts`, `assertMeasure`, `assertMotionClear`, `assertDeterministic`, `snapshotHash` — framework-agnostic helpers for your own recipe tests.
- Docs: [glTF capability map](docs/architecture/gltf-capabilities.md) — every ratified extension, skins and morph targets, physics drafts, what ts23d writes and what is next.
- `AGENTS.md` is now a link to `CLAUDE.md`: one brain for every coding agent; `CLAUDE.md` gained the "using the library" loop.

### Fixed
- `applyAffine` / `place` / `frame` with a mirror (negative determinant) left triangles wound inside-out; they are flipped back now (tiger_1's mirrored spare track links).
- `lathe` smoothed normals across sharp profile folds (the T-34 idler's lip shaded dark); a `creaseDeg` option (default 50°) splits them. Profiles without a fold keep identical bytes.
- `heightfield` V wrapped per vertex, stretching texture across any triangle that crossed the wrap; it mirrors continuously now.
- `lathe` / `cylinder` on axis `x` or `y` were wound inside-out (a mirrored frame): every wheel and gun barrel rendered hollow in engines that cull back faces.
- `SolidIndex` cell size scales with the mesh: the Eiffel tower's 28 solids index in 228 ms (was 4.2 s), which speeds up `clashes` too.

### Added (0.0.x scaffold)
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
- Declared, not built (throw `T3D_NOT_IMPLEMENTED`): `creature`, `localGenerator`, `importGlb`, `kubeezImages`.
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
