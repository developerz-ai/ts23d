# Changelog

All notable changes to `@developerz.ai/ts23d`. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/); in 0.x a minor bump may break. Each version opens with a one-sentence summary for users: the first paragraph under its heading, before any `###`; write it under `[Unreleased]` before a release. `bun run release <x.y.z>` turns `[Unreleased]` into the dated version section, advances the link index at the bottom and regenerates [docs/changelog/](docs/changelog/README.md) ([PUBLISHING.md](PUBLISHING.md)); `bun run changelog` rebuilds both.

## [Unreleased]

## [0.17.0] - 2026-11-20

Team-painted parts can carry wear that survives livery swaps, contact sheets shade per pixel like an engine, and beauty renders keep fur, hair and grime detail. A fourth pass over the weakest assets, re-judged independently: criteria below the pass mark of 8 fell from 296 to 272, and four assets now pass on all seven.

### Added
- Paint slots can carry wear: `paint: { team: { colour, wear: true } }` keeps bare steel, primer, rust, mud and dust on team-painted parts in their own colour in every livery (in the GLB, bare triangles sit in the trim material with no `KHR_materials_variants` mapping). Assets without `wear` are byte-identical. Used across the RTS set.
- `cardWear(cards, { paint, keep }, at)`: hair and fur cards painted from the skin under their root and shortened over caked mud and scars, so wear shows through a coat.
- Creature kind `options.body(bones, lod)`: a sculpt hook for the body, mirroring `options.head` (leg landmarks, split toes).
- Scalp cards take an opt-in lock style, `locks: { narrow, under, fly }`: a dark under-layer, narrow clumped locks and flyaways on a new `hair_locks` strip, and no far cards at LOD2.

### Changed
- The contact sheet, thumbnail and blueprint shade per pixel like an engine (vertex colour, smooth normals, trim-sheet albedo per pixel) and show glass as see-through; they render about 30 % faster. Every committed sheet changes.
- Beauty renders keep fur, hair-card gaps, groove grime and small highlights: the path tracer's film records per-pixel variance and the denoiser smooths only differences within the noise. Every committed hero changes.
- `text(..., { surface, wrap: true })` costs about 1.2x the triangles of flat lettering (was 1.5–1.6x).
- The critique's `colourDetail` measures what is drawn: trim-sheet or texture-set albedo x vertex colour.
- A fourth pass over the weakest assets: busts (skin finish, eyes, garments, hair), code-built creatures (head planes, mud, leg landmarks, fur that carries wear), asteroids, terrain, city block, pine and the RTS set.

### Fixed
- Review of this release's changes: chip cuts on skinned parts blend the skin weights of both ends; the lock style's under-layer keeps the layer's tint; `colourDetail` no longer reads zero for a strip repeated in step with its samples; a one-sample hero is denoised from a spatial noise estimate; the fox's far tail tip and the cobra's near belly dust are back; tests that could not fail now can.
- The defect catalogue matches the numbers the code cites again (one row per number), and the conventions step fails when code cites a defect number with no row.
- Path tracer: hair and fur cards cast soft, strand-tinted shadows as drawn instead of solid card-sized ones, and strand shading conserves energy, so furred coats lose the dark specks and cards no longer read darker than the skin. Opaque shadows are byte-identical.
- Wear slots cut each chip's edge through triangles at ragged points, so chips are irregular instead of a lattice sawtooth.
- Fixes from an independent re-judge of every asset: bust cheeks, collars, beards and scalps; the cobra's, tiger's and wolf's far LODs; RTS chips, far rubble and roof slates; the station's far brick; board, barrel-head, drum-lid and far-ground texture mappings; asteroid ejecta and rim slivers; clean snowfields.
- Asteroid contour rings, terrain contour lines and the barracks' smeared slab rim: texture projection chosen per face, not per vertex.
- Hair and fur cards no longer show pale specks along their edges.
- `heightfield` skirt walls share the surface's rim vertices exactly.

## [0.16.0] - 2026-11-20

Meshes carry which project materials they were mapped with, so a mesh built outside an asset's build can no longer be painted as the wrong material. A third pass over every asset, re-judged independently: criteria below the pass mark of 8 fell from 352 to 296, and three assets now pass on all seven.

### Added
- `mappedOnto(mesh, ...strips)` and `Mesh.mapped`: a mesh records the project materials its UVs map onto. Every primitive sets it; passes and `merge` carry it.

- `dmath` (`import { dmath } from '@developerz.ai/ts23d'`): `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `atan2`, `exp`, `expm1`, `log`, `log1p`, `log2`, `log10`, `pow`, `cbrt`, `sinh`, `cosh`, `tanh`, `hypot` (2 to 4 components) and `norm(v)` that give the same bits on every CPU, C library and engine. Accuracy has input ranges, so they are not full-domain `Math` replacements: within 1–2 ulp of the true value; `sin`, `cos` and `tan` to under 1 ulp for |x| < 1.6e6 radians, beyond that an absolute error growing as |x|·1.2e-16; `hypot` and `norm` square without rescaling, so components above about 1e150 overflow to Infinity and below about 1e-150 lose precision; a whole exponent up to ±1000 in `pow` is repeated multiplication, so `pow(10, n)` is exact for |n| ≤ 22. Use them in recipes instead of the `Math.sin` family and `**`: `bun run determinism` now refuses those under `src/`, `recipes/`, `apps/site/src/` and `examples/`.
- `roundNumber`, `roundJson`, `gltfText`, `GLTF_ROUNDING`, `MANIFEST_ROUNDING`: the one rounding for numbers written into shipped text.
- `weather({ read: 'hero' })`: stains sized to read with the whole asset in frame (patches at least 6 % of its longest side, a taller splash band, longer streaks, a graded wash). Default `'close'` unchanged.
- `weather({ tessellation: 'exact' })`: vertices `resolution` apart instead of halved until they fit; about a quarter of the triangles on flat panels. Default unchanged.
- `text(..., { surface, wrap: true })`: pixel lettering painted across relief also covers the steps between pieces at different depths. Default off.
- Creature kind: `face.earWidth` and `options.head`, a hook for a recipe's own sculpt edits on the head.
- `wearMetrics` / `wearOf`: `wearBroad` and `wearPlaced` measure hand-wide, exposure-placed colour variation on LOD0. Reported only: the calibrated wear score is saturated (ceiling 6.2) until panel-scored rows carry the new metric.

### Changed
- Recipes: a third quality pass over all 76 committed assets, worked from the independent critiques: hero cameras that fill the frame, wear sized to read at hero distance, far LODs that keep identity (an alpha-cut lattice for `eiffel_tower`, lettering on `station_halt`'s board, colour blocks on tanks and creatures), a resting coil and stacked pile for `king_cobra`, flap-capable wings 40 % larger on `dragon_hybrid`, de-lit coats on the model-built creatures. `cargo_container_scifi`'s far LOD is 170 triangles (was 736), `hydra` 161k (was 210k), `city_block`'s mid LOD 13k (was 29k).
- `tune_demo`'s tune files are regenerated from the current recipe and reproduce byte for byte again.

### Fixed
- Review of this release's changes: 61 of 74 findings fixed and 13 shown not to be defects (D404–D444). Among them: a hair card that could be turned under the skin, a determinism rule that a line break could bypass, false slopes along UV island rims in the model-built creatures' normal maps, a Tiger barrel sleeve placed past the muzzle, road spray that never reached the roadster's nose, city trees that changed size between LODs, and ten tests that could not fail.
- A mesh built at module level and added in `build()` registers its material in the asset that uses it. On a row the asset holds for another material it is `T3D_MATERIAL_CONFLICT` naming both and the part, where it used to be painted as the other material without an error (D354).
- The same source now gives the same bytes on any CPU and C library, for geometry, textures, sounds, manifests and renders. A path-traced hero could differ between machines (1,432 pixels on `loco_440` between the dev box and CI), and a C library one last bit different changed GLBs at every LOD (normals, tangents, a vertex count on `t34`): the platform's sine, cosine, exponent, power and hypot differ in the last bit by CPU and version. Every module, recipe, the gallery and the examples now compute with `dmath`. Committed GLB, PNG and manifest bytes change once (D403).
- Numbers in a GLB's JSON chunk are written at 9 significant digits (a float32 exactly) and in `manifest.json` at 6 decimals, instead of all seventeen digits of a float64: `measured: 5.920000076293945` is now `5.92`.
- Path-traced hero: clear glass and other see-through surfaces no longer speckle at 16 samples, and light reaching a surface through glass is no longer counted twice (a white furnace behind glass is 1.000, was 1.021). Opaque assets render the same bytes.
- `fox`: a face override was dropping the sourced 11 cm ear to the kind's 6 cm default.
- Hair cards no longer leave the skin by more than their lift: a card that runs off a shelf edge (lip, brow ridge) hangs from it instead of pointing out of the face.
- A `stripRect` rectangle kept in a module-level constant records its material when a build reads it.
- `sheetFor` and `materialsOf` throw `T3D_MATERIAL_UNKNOWN` (with a fix) for a part whose UVs sample a row the asset holds for one material while a mesh built outside every `build()` was mapped onto another material of that row: the part may be that mesh with its record lost, and it used to be painted as the held material. `paintTrimSheet(recipe, ids?)` is unchanged: `ids` stays optional, and without it every defined material is painted.

## [0.15.0] - 2026-11-19

Contact sheets show the hero's base colour, triangle budgets are checked against the playbook bands, custom materials are per asset, and every committed asset was reworked and independently re-judged: criteria below the pass mark of 8 fell from 416 to 352, and two assets now pass on all seven.

### Added
- `contactSheet(asset, { sheet })`, `thumbnail(asset, { sheet })` and `previewSheet()` (a 512² default sheet). Omitting `sheet` keeps the previous vertex-colour output pixel for pixel.
- `sheetFor(compiled, recipe)`, `sheetWith(ids, recipe)`, `materialsOf(compiled)`, `CompiledAsset.materials`, `paintTrimSheet(recipe, ids)`, `previewSheet(assets)`, `ReviewOptions.sheetRecipe`.
- Blender `isolate` step: optional `contact` (metres) for a chain generated fused to the body along its length (a tail lying on a thigh). Weights within that distance of an edge joining chain skin to body skin are blended. No default: committed programs keep their request keys.
- Per-asset hero view: `hero: { azDeg, elDeg, fovDeg }` or `hero: { eye, target, fovDeg }` on the definition; `t3d hero`, `bun run shots`, `review` and `critique` use it by default, `--az` / `--el` / `--fov` override.
- `glow` parts emit in the raster and path-traced hero, visible through glass and translucent shells; in the path tracer they light their neighbours.
- `modelChain`, `modelRig` and `modelBody` take `extra`: bone chains the creature plan lacks (wings, fins, a second tail), each declared by its joints along the mesh, the bone it hangs from, a limit per bone with a source, and an optional `motion` clip. Blender `bind` weights the skin to them; QA `deform` and `model` cover them. `tracePath(mesh, from, to, { cell })` finds a limb's centre line for placing the joints.
- `dragon_hybrid`: three bones a wing and a `flap` clip (0.9 Hz, design values); the wings settle in `idle` and are carried in the walk.
- Creature kind: `options.cells { body, head }` sets sculpt density directly; `spec.fur { density, guard }` sets fur card counts; `build.hock`, `build.heel`, `build.track` and `build.topline` give a shoulder hump, a plantigrade heel under the hip and a stance that holds its width; `CreatureInfo.rig` / `.bare` and `creatureHeadFur` let a recipe groom its own coat with the kind's skinning.
- Triangle bands per asset class: the `conventions` gate fails a committed asset whose triangles at any LOD exceed its class band from the playbooks (`T3D_BUDGET_BAND`, `scripts/lib/budget-bands.ts`), unless its README says `Budget why: <reason>`. The assets over band on 2026-11-19 are listed in `scripts/lib/budget-baseline.ts`; they warn until reduced or justified, new offenders fail now, and the list only shrinks.

### Fixed
- `king_cobra`: `idle_ground` is a resting loose coil instead of a straight stick, `rear` lifts the front from a body that stays planted, and the coil rests on the ground instead of floating 2–7 cm above it.
- Review of the quality wave: 58 of 60 findings fixed (D340–D396), among them open holes in `joint_demo`'s sword, scar discs painted at both ends of every creature scar, normals left stale after four deformations, river ribbons under flat terrain, a shared trim sheet repainted by a later build into the same folder, and nine tests that could not fail.
- Gallery: `bear_hybrid`'s page shows the model-built bear. It has no CPU asset named `bear` to pair with, so the page used to compile the code creature instead.
- Creature kind: far-LOD legs are 8-sided with a ring wherever the coat's colour turns, on rounded paws, so stockings and leg colour survive at LOD2; QA connections no longer flips on a 2–5 % change of chest width or limb thickness.
- `tree` kind: LOD2 is the tree's own LOD0 crown as card clumps over a visible trunk and main limbs (palms: one folded card per frond); silhouette IoU ≥ 0.8 for oak, pine and palm (was 0.55–0.72). `impostor` takes `'clumps' | 'fronds'` (`'blob' | 'cards'` still accepted).
- `cityBlock`: walls use `wallStrip` (default `brick`) at true scale; windows are LOD-gated (LOD1 about 0.2 × LOD0 triangles, LOD2 keeps window rows as dark bands); with `trim`, LOD0 gets a cornice, belt course and plinth.
- `terrainFromDEM`'s default ground no longer bands: welded mesh, classes blended per vertex, rock strata on cut sides. Default output changes; `strips: false` is unchanged.
- QA `skin` (`T3D_SKIN_CROSSED`) reads a paired limb that stands on its roots (raised wings) the right way up.
- A model body whose Blender skin has a bone that is neither the plan's nor a declared `extra` chain fails with `T3D_MODEL_SKELETON` naming the bones; it used to re-bind silently.
- Contact sheet and thumbnail alpha-test cutout cards against the trim sheet, so foliage and fur show their real silhouette.
- See-through parts no longer put what they hold in opaque shadow in the raster hero; they dim the sun instead.
- `rts_faction` builds again: far-LOD tool handles are six-sided, so a grip joint agrees at any heading.
- Shared recipe libraries: mud contrasts with the paint instead of being near-black, `reproject` handles project materials, and the parts kit's hose, ladder, crate and painted door read correctly.
- The gallery binds each asset's own trim sheet instead of one sheet per worker.
- `wolf_hybrid` passes QA `deform` with no declared tolerance: hip stretch ×5.7 → ×2.2 through `isolate`'s `contact: 0.04`; both `limitTolerances` are removed (D253, open since 0.13.0).

### Changed
- Recipes: a quality pass over all 76 committed assets (wear, materials, far-LOD identity, triangle counts). `roadster_v10` ships 155k / 23k / 3k triangles (was 909k / 78k / 5.5k), `hydra` 210k (was 348k), `weather_demo` 21k (was 95k); the over-band baseline went from 44 assets to 10. Every `critique.json` was re-judged by a reviewer other than the author; the typical overall score rose from about 6.3 to 7.0.
- The trim sheet's 14 custom rows are per asset. Define any number of materials; a conflict is two materials on one row in the same asset (`T3D_MATERIAL_CONFLICT` from `compile`), including assets composed with `ctx.use`. `T3D_SHEET_FULL` now means one asset maps onto more than 14.
- Breaking (0.x): `checkSheetFor(sheet, assets)` takes compiled assets, not UVs; `paintTrimSheet(recipe)` throws once two defined materials share a row (use `sheetFor`); `stripCredits` takes an optional material list.
- `t3d build --sheet external` writes an asset's own `trim_sheet_*.png` beside its GLBs when its materials cannot share the run's sheet; `--sheet embed` bytes no longer depend on what else the run loaded. A single-recipe build no longer paints rows of materials it defines but never maps onto.
- `sheet.png` and `thumb.png` show the hero's base colour (trim-sheet albedo × vertex colour, flat per triangle) and draw glass, ice and liquid parts see-through. Wood, bark, leather and terrain no longer read white or grey in the sheet (ADR 007 revisited). Every committed `sheet.png` and `thumb.png` changed. `blueprint.png` stays vertex colour.

## [0.14.0] - 2026-11-19

Several agents can share one machine through a resource queue, the npm package shrinks from 40 MB to 4 MB, CI runs in under five minutes, and the check that committed renders are fresh now works.

### Added
- Machine-wide resource queue (ADR 017): agents sharing a machine take turns at `cpu` tokens, `blender` and `gpu` through ticket files under `$TS23D_HOME/queue/`, first come, first served, no daemon. A dead or killed command frees its place; a queue that cannot be written warns once and the command runs unqueued.
- `t3d queue status` (`--json`), `t3d queue clear --stale | --pid <n> | --all`, `t3d queue run [--cpu <n|all>] [--blender] [--gpu] -- <command…>`, `t3d queue hold -- <command…>`.
- `--no-wait` and `--max-wait <s>` on every command; `T3D_QUEUE=wait|fail|off`, `T3D_QUEUE_MAX_WAIT`; machine settings in `$TS23D_HOME/queue.json`. Off when `CI` is set.
- Error codes `T3D_QUEUE_BUSY` and `T3D_QUEUE_TIMEOUT`, each naming the holder and the fix.
- `t3d doctor` has a `queue` group; `onToolChild` in `/neural` reports each tool as it starts.
- `bun run scripts/recipe-costs.ts [--tests] [--plan]` re-measures the per-recipe and per-test costs CI shards by; `bun run recipes <name…>` checks only the named folders.

### Changed
- `build`, `shot`, `hero`, `review`, `critique`, `blueprint`, `icon`, `gaps`, `tune`, `finish`, `concept` and `neural run` take one CPU token; `hero --quality path` takes 8 and traces on the threads granted (same bytes). `blender review` and `blender session start|run|finish` take `blender`; Blender adapter jobs and jobs sent to a loopback model URL take `blender` / `gpu` while they run. A waiting command prints one `t3d queue: waiting …` line on stderr.
- `bun run verify` holds one place in the queue for the whole gate; tests run with the queue off.
- CI: `gate` and `shots` are one 16-shard `gate` job (26 jobs → 18) balanced by measured cost (`scripts/lib/recipe-costs.json`, `scripts/lib/test-timings.json`); `bun test` is split across the shards; docs-only changes skip the recipe gate and the renders. `verify` stays the single required check.
- `bun run shots` renders each folder's sheet, hero, blueprint and icon in one process and from one compile per asset and LOD (`human_head` renders 242 s → 88 s locally), byte-identical to the four separate commands. The shared compile is off everywhere else, so `t3d mcp` never serves an old compile.
- `bear_hybrid`, `wolf_hybrid` and `dragon_hybrid` are model-first with no CPU build: `t3d build` with a model output missing stops with one `T3D_NEURAL_MISSING` instead of building a code creature that fails QA. `modelChain` takes `required: true` and `ctx.neural` asks take `{ required: true }`; `ranger` and `human_head` keep their CPU fallback.
- CI: 18 gate shards with costs calibrated from a real run: `bun run scripts/recipe-costs.ts --from-run <run id>` reads a green `ci` run's logs and rewrites the cost files in GitHub seconds; `--plan` marks the shard count to pick. Measured 5.5 min and 67 runner-minutes before rebalancing (jobs 155–299 s); measured 4.6 min push → green after (slowest job 269 s), under the 5-minute target for the first time since it was set.

### Fixed
- The npm package is 4.2 MB instead of 40.6 MB: model recipes' generated outputs (`recipes/*/neural/`) stay in git. 0.13.0 shipped them without the concept images they need, so they never built from the package. The `pack` gate step now fails when the tarball goes over 5.3 MB packed or 16 MB unpacked, holds a file over 1 MB, or holds anything under `recipes/*/neural/`.
- `T3D_NEURAL_MISSING` for a recipe inside the installed package says the package ships no model outputs and to clone the repo or copy the recipe folder; a `--require-neural` miss no longer says "using the CPU path".
- Model creatures: a rigger's terminal stub bone on a leg (UniRig, 6 mm past the toe) no longer shifts hip, stifle, hock and paw one joint down and gets the rig refused (`T3D_MODEL_SKELETON`).
- Critiques: every committed asset has a well-formed critique bound to its current renders, re-judged from the images, with a fix note under every score below 10. Malformed critiques had been hiding their scores from the gate.
- CI's "committed renders match a fresh render" check never failed: its pathspec `recipes/*/out` matches no file under `out/`. It now uses `:(glob)recipes/*/out/**`, and a test proves the pathspec lists the committed outputs (D286).
- `rts_faction`: committed renders refreshed; they still showed the tank's old belt weathering, which the broken check let through.

## [0.13.0] - 2026-11-19

A correctness sweep across the library, CLI, gates, gallery and recipes: over a hundred and fifty defects fixed, stricter input validation and QA gates, track belts that move in any glTF reader, and PNG bytes that no longer depend on the runtime.

### Added
- `isTs23dError(e)`: a brand check that recognises a coded error from another copy of the library (the CLI's `bunx -p` copy against the project's `node_modules`), so its code and fix survive.
- Neural adapters can declare `paid: true` and `estimate(job)`; `openaiImageAdapter({ paid: true })` marks a billed endpoint. `t3d neural run` prices Kubeez jobs at the model's listed cost.
- QA gate `empty` (`T3D_QA_EMPTY`): a LOD with no triangles. QA gate `mesh-arrays` (`T3D_QA_MESH_ARRAYS`): mesh arrays of the wrong length; it runs first.
- `stripAtV`, `stripCredits` and `checkSheetFor` accept a triangle's indices or three V values, so a vertex on a shared row edge is attributed to the row its triangle samples.
- `cityPlan` plans carry `shared`: the stretches of each wall a neighbour stands against.
- Beauty renders carry `assetSum` and `hits` (the asset's colour without the backdrop); transparent icons use them.
- The DSL docs say where each primitive's `at` sits (box on its base, cylinder centred), and the docs recommend `t3d build … --no-shot --sheet none` while clearing QA findings.
- Track belts move in the baked `run` clip in any glTF reader: morph targets and a `weights` channel, no extension and no runtime code. One link pitch per cycle, at the road wheels' rim speed rounded to whole pitches per loop; `--no-animations` writes no targets; `extras.ts23d.tread` stays for engines that drive the belt themselves. GLBs with animations grow by the belt targets (t34 LOD0 +588 KB, LOD1 +65 KB, LOD2 +28 KB).
- The `treads` gate fails a `tread` belt whose loop is not a whole number of pitches or whose mesh does not repeat every pitch (`T3D_QA_TREADS`, with the pitch to pass in the fix). `BeltLoop` and `beltRun` in `/passes` (belt centre-line ruler; rigid link travel over one pitch).
- `defineMaterial` takes an optional `row` (0..13) that replaces the id's hash row. A bad row is `T3D_MATERIAL_INVALID`; a taken row is `T3D_MATERIAL_CONFLICT`, whose fix lists the free rows.
- QA: a `touches` / `clear` / `noOverlap` selector that matches no part at any LOD fails as `T3D_QA_CHECK` and lists the closest part names.
- `--json` (additive, nothing removed or renamed): every `ok: false` envelope carries `error`; a run that only failed QA reports `T3D_QA_FAILED` with the count and a fix pointing at `data[].qa.findings`. Each build item gains `dir`, the folder its relative `files` live in.
- Manifest `trianglesCompiled`: the compiled count that `budget.triangles` is checked against, written when it differs from `triangles`.
- A conventions rule refuses `instanceof Ts23dError` outside tests, so `isTs23dError` stays the one check.
- QA `deform`: a joint limit may declare its own edge-stretch tolerance, `limit: { …, stretch, why }`, or `limitTolerances: { <bone>: { stretch, why } }` for limits a kind generates. Default ×4, cap ×6; above ×4 it needs a `why`. Declared tolerances are listed in `manifest.json` under `deformTolerances`, and a failing finding quotes them. Volume and intersection have no tolerance.

### Changed
- **`connections` no longer credits contact across a gap.** A part hovering within 2 cm of its support used to count as held; it now fails with `T3D_CONNECT_POINT` ("hover N cm off …"). This is the change most likely to fail an existing asset. Remedy: seat the part on or a few millimetres into its support, or model what carries it (bracket, hinge pin, hanger). Parts seated all round on a rim and parts crossing their support count as held. A `grown` or `socket` part that does not reach its declared partner fails, and `connect.to` may not name the part itself.
- Every PNG (contact sheets, hero renders, trim sheets) and every GLB with an embedded sheet changes bytes once: the library now compresses with its own deflate encoder instead of `node:zlib`, which differs between Bun and Node. Pixels are unchanged; encoding takes 20–35 ms longer per image.
- Review warnings have stable codes: `T3D_REVIEW_LOD_POPPING`, `_TINY_IN_FRAME`, `_TOO_DARK`, `_WASHED_OUT`, `_LOW_CONTRAST`, `_CRUSHED_BLACKS`, `_BLOWN_WHITES` replace `lod-popping` and the like in `review.json`. `t3d finish` reports re-run QA findings under their own `T3D_QA_*` codes.
- `defineMaterial`: a custom strip's row depends on its id only. An id whose row is taken throws `T3D_MATERIAL_CONFLICT` and names a free id, instead of taking a row that depended on registration order.
- Input that used to build broken output now throws `T3D_RECIPE_INVALID` with a fix:
  - `ctx.part` / `ctx.group` / `ctx.use`: names and prefixes that are not snake_case, non-finite `at` or `yaw`; `tread` motion with a bad path or pitch; an unknown `motion.kind`.
  - Primitives: a missing or malformed `color` (a misspelt key such as `colour` is named); `planar` with fewer than 3 points, NaN or no area; `beam` with `up` along its axis, coincident ends or `segments` of 1 or 2; `sweep` with non-finite points, scale or twist; erosion and noise options out of range (`octaves: 0`, NaN rates); hair card lengths that are NaN or negative.
  - Lights: a spot `cone` outside [0.5, 89], a negative or non-finite `intensity`, `range` or `inner`.
  - Materials: finish and optics colours that are not three channels, a non-finite `anisotropy.rotation`, weather `params` and effect `strength` outside 0..1 (`T3D_MATERIAL_INVALID` from `defineMaterial`).
  - Kinds: `hull` (`bootTop`, `camber`, `deadriseDeg`), `mass` (non-finite `size` / `at`), `facade` (`floors`, `floorHeight`, `windowRatio`), roof chimneys (`size`, `height`, position), `hairRig` `segments` outside 1..12, a partial override of a head field the preset leaves null, `modelRig({ register: 'joints' })` without joints, a mirrored body-plan chain hung from one named copy of a mirrored chain, `radialPulseClip` with `inflate > 0` and `timing.inflate: 0`, a `cityPlan` height at or below `minHeight`.
  - Measures: exactly one of `parts` or `between`, and `between` needs exactly two part names.
  - Export: a pivot named like a generated node (`<pivot>_glass`, `<socket>_light`); non-finite values in a node transform or accessor; an instanced scene with neither base nor sets.
- `parseMotion` refuses rotation keys that are not unit quaternions and root keys that are not 3 numbers; `resampleCycles` refuses a motion shorter than one cycle (`T3D_NEURAL_OUTPUT_INVALID`). `heatWeights` refuses a `cell` that is not finite and positive (`T3D_SKIN_INVALID`).
- CLI: a bad `--profile` or `--size` value and a bare `t3d` are `T3D_CLI_USAGE` (exit 2); `--watch` outside `t3d build` is a usage error; `--seed ""` is refused; `-o` suggests `--out`.
- `t3d neural run` refuses a paid job it cannot price (no estimate, NaN or Infinity) unless `--yes-spend` is given, and lists requests it did not reach within 5 rounds as `T3D_NEURAL_MISSING`.
- Geometry that changes for existing recipes: `prism` / `planar` V on faces exactly one band tall or crossing a band edge; trees (ground line, trunk diameter per LOD, root flare); `cityBlock` windows, shared walls and street edges; the `iron` strip's rivet rows at 1024 px and above; `terrace` for a sharpness strictly between 0 and 1.
- Texture-set samplers in GLB are `CLAMP_TO_EDGE` on both axes, matching the renderers.
- Contact-sheet 3/4 views are framed from the projected extent, so cube-like assets are no longer cropped; the sixth cell names the LOD it shows.
- `expectImageClose` throws on a missing golden when `CI` is set; `assertValueRange` throws `T3D_ASSERT_INPUT` on an unknown strip id; `assertTouches` checks every matching part.
- A clip left with no channels on a LOD (a morph clip on a LOD without morph targets) is left out of that file.
- Gallery downloads omit sound references (the site does not ship the WAV files); the viewer's parts list shows the nodes of the exported GLB.
- `assets/<name>/<name>.ts` is the documented layout for a project's recipes, matching what `t3d init` writes.
- Gate scripts: `boundaries` resolves every import (wrapped, dynamic, side-effect, nested folders, the root barrel); `determinism` also refuses `localeCompare`, `Intl`, crypto randomness, `Date()`, `process.hrtime` and aliased `Math.random`; `placeholders` catches `// ... existing code ...` and similar; `release` refuses an unknown mode.
- Other gates that now catch what they claimed to: `deform` measures a joint whose skin is hard-weighted across the seam; `gait` fails a skating foot whatever the root bob, and a travelling clip whose foot is never planted; `gaps` exempts only `cutout` rims (a slit beside glass is reported); `assertQaPass` checks `budget.draws` as `t3d build` does.
- Gates that no longer misfire: `floating-parts` accepts a part embedded in or passing through its support and reports true gaps; `hidden-parts` ignores parts inside see-through hosts; `model` and `T3D_MODEL_DOUBLED` skip ground rules for `medium: 'water'`. Edge contact in `floating-parts` and `connections` is exact (segment against triangle), and both gates run faster.
- Manifest `triangles` and `drawCalls` are what the GLB holds (degenerate and duplicate triangles dropped, no draw for a pivot left without triangles); the LOD strip and review pack show the same numbers. The manifest lists `run` for an asset whose only motion is a track belt.
- The library materials `fur` and `dragon_scales` sit on explicit rows (2 and 5), so every shipped material fits one process in any load order; assets using them change UV bytes once. 13 of the 14 custom sheet rows are in use.
- Reproducibility across runtimes: bytes are reproducible under the pinned Bun. Under Node the same source gives the same PNG encoding and the same geometry within float rounding, because the two engines' `Math` functions differ in the last bits.
- The `treads` gate fails a belt whose colour or UV does not repeat every pitch (`T3D_QA_TREADS`: weather one link, then place it). `t34`, `tiger_1` and `rts_tank` weather their belts per link, so their mud no longer jumps when the run clip wraps.
- `heatWeights`: a `maxVoxels` below the coarsest grid the mesh fits (64 for a solid) is refused with `T3D_SKIN_INVALID` instead of silently falling back to straight-line weights.
- `cityPlan`: a body under 1 m (height − minHeight) is refused with `T3D_RECIPE_INVALID` instead of building a wall of negative depth.
- `assertQaPass` runs the LOD-chain gates for a single LOD too, matching `t3d build`: a check selector that matches no part fails at `{ lods: [0] }`.

### Fixed
- `t3d build --watch` and `t3d hero --quality path` work from the installed package (the CLI entry and the path-tracer worker that ship are the ones spawned).
- MCP: a directory `recipe` argument has every entry confined to the project before anything is imported. A recipe's direct `process.stdout.write`, `console.info` or `console.debug` no longer corrupts the JSON-RPC stream or the `--json` envelope.
- Ctrl-C (or SIGTERM) on `t3d` also stops the Blender, Godot, basisu or gltfpack process it is running. Network adapters wait as long as `Retry-After` asks on HTTP 429. Every view of a multi-image `mesh` request is checked before sending.
- Coded errors keep their code and fix when the recipe and the CLI load different copies of the library. A throw from library code shows the top three stack frames; a missing package says to run `bun install`.
- `clashes` catches thin moving parts (rotors and sliding doors a few cm thick). `proportions` measures yawed parts correctly. `measures` and the blueprint flag every selector that matches no part. QA reports a NaN or Infinity `at` / `yaw`.
- Clips in a single-file LOD GLB key each LOD from its own rest pose. Skin weights always sum to exactly 1 in the GLB. `EXT_mesh_gpu_instancing` is declared only when used.
- `heightfield` normals on non-square cells and skirt walls below the skirt; `planar` loops starting at a reflex or collinear corner; `split` repeats that fit exactly (`{bay:1.1}*` over 3.3 m).
- `place` / `applyAffine` transform morph deltas; `weightedNormals`, `simplify`, weathering and `warpTPS` keep joints, weights and morph targets; `ctx.use` of a skinned asset binds to the prefixed bones; `bakeAoAsset`, `weather` and the `joints` gate no longer crash on a mix of skinned and rigid parts.
- `thermalErosion` on non-square tiles; weather `bleach` pushing vertex colours above 1; a fur zone far over `maxCards` reports the cap instead of overflowing the stack.
- Paint and finish slots named like `Object.prototype` members are ordinary names; redefining a material with the same fields in another key order is not a conflict.
- Model creatures skinned in TS keep their weight on the root bone; the `model_surface` crease covers skin, scales and feathers bodies; a one-pass `symmetric` model creature emits the mesh its skeleton was fitted into; `faceMorphs` puts `blink` / `talk` / `breathe` first and `headClips` keys every target.
- `sound.engine` loops no longer click at the seam for some seeds; one-shot `hiss` clips shorter than 0.5 s fade in and out.
- A declared `physics.mass` is honoured on flat or open parts with no volume. `whyteAxles` centres the layout. Foot lock keeps rotations on the short path near 180°. `tilesFor` and `resampleTerrarium` wrap across ±180° and clamp at the Web-Mercator edge.
- `treeReal`'s "total height" measure names only parts that carry a mesh. A gambrel's `knee` is a share of the half-span for either ridge direction.
- Photo (CC0) texture strips take `wet`, `age`, `wear` and paint tone, and are downsampled in linear light; flat normal maps stay flat. Stamped PNG cells have no dark fringes; custom `weave` pitches tile; `tex.scales` stacks correctly above overlap 2/3. `threeMaterialSource()` passes the glow colour as sRGB hex.
- A spot light never exports `"intensity": null`. Transparent icons and portraits have no halo. The blueprint legend prints tolerances below 1 % as they are and grows to fit every joint row; bitmap text is clipped at the canvas edge.
- The README's first recipe builds with QA PASS, and a test keeps it building. `t3d --help` shows the scoped `bunx -p @developerz.ai/ts23d t3d`. `t3d tune` leaves no placeholder `tune.json` after a failure. `artMetrics` caches per full set of render options.
- Gallery: downloads, size and framing follow the asset and tier on screen; the home showcase moves on after a failed compile; a malformed hash no longer stops navigation; "Skip to content" stays on the asset page; order is the same in every browser locale; measuring tools free their overlays; the home page keeps its scroll position when the catalog loads; the credits table covers every model-tier recipe.
- `floating-parts` fix text states each primitive's anchor correctly (`box` `at.z` is the bottom; `cylinder` is centred on `at`); parts that float together name their root first instead of each getting a misleading distance to the ground.
- `proportions`: the fix names a units slip when `real` or the model is about 1000× or 100× the other. `ref.json` with a null view or no views is refused, and `bun run ref` no longer writes one.
- A track belt runs at the same ground speed at every LOD, including LODs that keep the wheels as empty pivots. A skinned asset placed with `ctx.use` (at the origin, or at an offset and yaw) passes the `skin` gate and exports; its morph targets turn with the yaw.
- Loading every recipe in one process (gallery, `t3d build recipes/*/*.ts`) no longer fails on a material row clash.
- Recipes:
  - `tiger_1`: Zimmerit rebuilt as a true-scale material (horizontal ridges in vertical trowel columns, as the photos show, with flaked patches) in place of rows of bars; tow shackles, tail light, escape hatch and turret digits seated; the LOD2 track keeps its outboard edge.
  - `t34`: the turret slogan follows the real turret shell; the LOD2 track keeps its outboard edge. `rts_tank`: belt pitch is loop ÷ links, the LOD2 belt loops, and the `run` clip drives forward.
  - Parts seated on what carries them: `boxcar` (door hangers and guide shoes, handles, uncoupling lever brackets), `roadster_v10` (grille, splitter air dam, hinge pins, interior and lamp fittings), `loco_440` (lettering, rivets, bands, stanchions, dome rings on the real boiler facets and taper), `dropship` (decal lift, seam strips, pitot masts), `signal_gantry` (arms on a modelled bearing), `station_halt`, `water_tower` (chain, ladder stays, `clear` checks that tested nothing), `cargo_container_scifi`, `weather_demo`, `pbr_showcase`, `rts_soldier` (pack).
- `wolf_hybrid`: the hip web between the tail and the right thigh is a mesh defect that is still open (D253). It is now declared (`limitTolerances`, with the cause as the `why`) instead of passing unmeasured, and a ratchet test keeps it from getting worse. The fix needs a re-generated mesh (GPU).
- Review follow-up to the sweep (D255–D282): `t3d concept --json` prints its usage error as the one stdout envelope with `error.fix`; a table test holds every command to that contract.
- Ctrl-C reaps running tools on every signal when the host handles SIGINT itself, not only the first time.
- Gallery: switching an asset's tier while its Scene plays keeps the scenario playing.
- Transparent icons: see-through surfaces (glass, ice, water) keep their own surface light and their alpha is coverage × opacity, so the studio backdrop no longer shows inside the glass.
- `manifest.json` `clips` lists only what the GLBs hold: none with `--no-animations`, and a clip only when a built LOD keeps a channel of it. `manifestOf` takes `{ animations }` as an optional sixth argument.
- A spot light's `cone` must be at least 0.5° (`MIN_CONE`): narrower beams gave an absurd or infinite default candela (written as `null`).
- Morph-target accessors declare the real min/max of their values (Khronos `ACCESSOR_MIN_MISMATCH`).
- A track belt mesh reused with reversed wheels, another wheel speed or another LOD no longer runs at the first export's speed, direction and tolerance; belt binding looks for twins in a grid instead of all pairs.
- `beltRun().pose(f)` leaves a body with no twin at rest, as documented; `BeltRun` gains `twins` and `look()`.
- `limitTolerances`: a bone named like an `Object.prototype` member (`constructor`, `toString`) keeps its own stretch tolerance.
- `hairCards`: `maxCards` counts cards, not roots; a zone whose length is zero no longer hits the cap.
- `applyWarp` / `warpTPS`: morph deltas are taken before Float32 rounding, so a still morph stays still far from the origin.
- `rowsSampled` without indices keeps every row spanned edge to edge, so `checkSheetFor` and `stripCredits` no longer miss a material between two others.
- `floating-parts`: the fix for a floating chain says to move the hanging parts with the root (or their shared `ctx.group`).
- `bun run boundaries` ignores imports written in comments and message strings.
- `tiger_1`: the mantlet's Zimmerit uses the turret's ridge pitch.
- `manifestOf` shares `toGlb`'s animations default (`GLB_ANIMATIONS_DEFAULT`, off), so a manifest built with defaults lists no `clips` for GLBs written without them. Pass `{ animations: true }` when the GLBs were exported with it; `t3d build` is unchanged.
- City windows: the top row on a body under about 1.43 m is clamped to the wall top and no longer cuts into the cornice.
- `hairCards` computes each root's card length once instead of twice; `t34` no longer builds an unused track slab at LOD0. Output bytes unchanged.
- `bun run boundaries` no longer misses an import on the line after a `//` comment ending in a backslash.

## [0.12.0] - 2026-11-18

Swimming and many-limbed creatures with motion from published biomechanics, one open Blender session for chained work, and brushes for existing meshes.

### Added
- `t3d blender session`: keep one Blender open and run chained step batches with undo and review; `finish` writes a program that replays through `t3d neural run`.
- Blender `stroke` step: nine brushes (`draw`, `inflate`, `clay`, `flatten`, `crease`, `pinch`, `smooth`, `grab`, `vdm`) on an existing mesh, with falloff measured along the surface.
- `bake.cageFit`, Blender review without a GPU (`--software-gpu`), and `--scripts` / `T3D_BLENDER_SCRIPTS` for installs without the GPL scripts.
- `defineBodyPlan`: bodies built from bone chains (mirrored fins, radial arms, many necks), with `swimClips`, `snakeClips`, `hydraClips` and `octopusClips` baked from published biomechanics numbers.
- `medium: 'water'` on assets: no ground rules, no studio floor in renders, and the new `swim` QA gate.
- QA: `chain-cross` (limbs passing through each other in clips), `T3D_DEFORM_TWIST`, and a refusal of crease declarations that blanket a whole body.
- Recipes `great_white`, `bluefin_tuna`, `king_cobra`, `common_octopus` and `hydra`; a gallery swim show in deep water.
- `blender-artist` skill and research notes on Blender and on swimming, snake, neck and tentacle motion.
- `formatCount`: counts people read now appear as `188k`, `21.9k`, `1.23M` in the README, gallery, CLI summaries and benchmark table; JSON and manifests keep exact numbers.

### Fixed
- `serpent` skeletons parented the head to the tail tip.
- The `gait` gate no longer reads tentacle or snake tips as feet.

## [0.11.0] - 2026-11-17

Two more model-first creatures, a brown bear and a winged drake, and the library options and QA rules they needed.

### Added
- `recipes/bear_hybrid`: a model-first brown bear (Pixal3D mesh kept whole, UniRig joints, Blender steps; plantigrade `idle`, `look`, `walk`; QA PASS), at average-adult sourced numbers; `recipes/brown_bear` stays the code-built big male.
- `recipes/dragon_hybrid`: Emberwing, a model-first invented drake (3.2 m body, 1.6 m shoulder; horns, claws and both membrane wings in one textured skin on three LODs; `idle`, `look`, `walk`; QA PASS). The wings carry no bones and do not flap; `recipes/dragon` stays the code-built winged dragon.
- `modelChain({ register: 'joints' })`: registers a model on its rigger's joints (yaw, scale, level on the skin under the feet) when the plan's flesh cannot describe it (wings); `take` accepts `'tail'` (the plan's tail along the rigger's tail chain, kept inside the mesh).
- `modelChain({ nose: true })` / `modelRig({ nose })`: the head bone runs from the skull base to the model's nose when a rigger ends its trunk at the snout.

### Changed
- QA `model` fit check is build-independent: instead of an absolute share of the skeleton's height (calibrated on a lean wolf, wrong for a barrel-bodied bear) it fails when a copy of the skeleton turned a quarter or half a turn hugs the surface clearly better (`hugTurn` > 1.15), or when the skeleton reaches under 60 % of the body's longest side (`skeletonSpan`).
- QA `model` and `gait`: a tail resting on the ground is not a foot; leg outlines are counted apart from the tail's; the ground tolerance is 1 cm or 1.2 % of the skeleton's height, whichever is more.
- The model leg trace tells legs apart at the lowest slab that shows them all (spread claws may touch on the ground).
- With `nose`, a head bone that leaves the mesh at once fails with `T3D_MODEL_SKELETON` instead of keeping its outside end.

## [0.10.0] - 2026-11-17

Creatures and humanoids go model-first and Blender-first: an image-to-3D body, finished by an ordered list of headless Blender steps the recipe writes, kept whole with its own textures on every LOD, while code keeps real scale, skeleton, clips, budgets and QA.

### Added
- Textured parts: `PartOptions.textures` (`TextureSet`: PNG albedo, normal and ORM, name, factors, credit) on every LOD, `Budget.textureSets` (`count`, `size` 1024 / 2048 / 4096), `T3D_TEXTURE_INVALID` ([ADR 016](docs/decisions/016-textured-parts.md)). The GLB writer emits one material per set on all LODs (a pivot's draw count still holds per set); the raster beauty, path tracer and contact sheet sample the maps.
- The `blender` neural task: a typed, ordered step program written in the recipe (`blenderProgram`; order rules fail with `T3D_RECIPE_INVALID` and the step index) run headless on `bpy` or a Blender app (4.5 LTS, 5.2 LTS and 5.3 accepted). Ops: `transform`, `clean`, `symmetrize`, `voxelRemesh`, `smooth`, `displace`, `inflate`, `skinBody`, `metaballs`, `unweb`, `amputate`, `retopo` (a measured solid shell by default, with `close`, `skin`, `focus`), `uv`, `bake` (albedo as EMIT, normal, AO into ORM), `bind` (bone heat with a voxel-proxy fallback; `from: 'source'` keeps a model's rig and clips), `repose`, `joint`, `weights`, `script` (inline bpy, `why` required), `review`, `lods`, `export`. Every step is gated (UV islands and degenerate triangles, bake hit rate, unweighted vertices, LOD drift, lost surface, new tunnels). Ops and gates: `examples/blender/README.md`.
- `t3d blender review <recipe.ts> --out <dir>` (or `--mesh <glb> --program <json>`): clay, wire, weights, poses and turnaround PNGs plus `review.md`, for the look-adjust-look loop; needs Blender, never cached.
- `importModel`: a GLB with LOD nodes, UVs, PNG textures, skin, armature and clips as IR values; a cycle that arrives one frame short of its period is closed at import (`closeLoops`, with a warning).
- Model chains and kinds: `modelChain` (image, local mesh, Blender proxy, optional learned `rig`, TS fit, Blender final), `modelRig`, `fitSkeleton`, `modelFit`, repose targets, `modelBody`, `defineModelCreature` (our sourced quadruped skeleton and gait clips on a model surface; `bite` and `blink` dropped on a fused head), and `riggedChain`, `riggedBody`, `defineModelCharacter` (a rigged humanoid with the model's own skin and clips).
- QA `model` gate (`T3D_MODEL_FIT`, `T3D_MODEL_SKELETON`, `T3D_MODEL_TEXTURE`, `T3D_MODEL_DOUBLED`) and an in-place foot-sink check in QA `gait` (the skin of a foot may not dip more than 3 mm under the floor in a clip that stays in place).
- Neural cache: outputs of an ask with `keep: 'local'` stay on the machine that made them (`local-<i>.*`, git-ignored; sha256 and length committed; a fresh clone resolves the chain from the committed outputs); every served output carries `sha256`; the committed cap per recipe is 12 MB (was 8); `t3d neural run` fills a chain in up to 5 rounds ([ADR 014](docs/decisions/014-neural-outputs-are-cached-inputs.md) amended).
- Meshy: multi-image and pose-mode mesh, `rig` (rigging plus library animation clips by name), `texture` (retexture), `estimate` and `balance` helpers; `t3d neural run` prints the balance and each estimate and refuses a run estimated above 50 credits without `--yes-spend`. Meshy is a hosted, paid option ([docs/research/meshy.md](docs/research/meshy.md) section 8).
- `recipes/ranger`: the first model-built humanoid (44 Meshy credits, QA PASS, 10.15 MB Blender output), with `idle`, `walk` and `jog` clips.
- Gallery: textured parts in the viewer and a "CPU tier / Model tier" switch for model-first assets.
- Docs: [blender-organic-workflows](docs/research/blender-organic-workflows.md); the model-first workflow in the creature, character, rigger, technical and author-recipe skills and the characters playbook.

### Changed
- `CLAUDE.md` rules: the decimation exception now covers model-built meshes (gated `retopo` / `lods` steps), and the one-material rule allows a declared texture set per model-built part.
- The reference server's UniRig plug-in rigs a 30 k-triangle three-LOD bear (27 bones, skin weights on every LOD, about 60 s on an RTX 3090).
- `wolf_hybrid` is rebuilt model-first (Pixal3D mesh kept whole, UniRig joints, Blender steps; idle, look, walk, trot; QA PASS); the earlier blend of a model's skin onto the code body is gone. The `brown_bear` and dragon model tiers are planned.

### Fixed
- The GLB exporter let a moving pivot's `paint` slot or `finish` colour bleed onto its unpainted merged children; they now stay on their own material.
- The `cropped` input-image rule fired on a studio floor band that reaches the frame edge; it now reads only a subject cut by the frame.
- Code creatures' in-place clips (`idle`, `look`, `bite`) keep every paw planted while the body breathes: the fore paws used to swing up to 13 mm under the floor (bear) once per cycle.
- `t3d neural run a.ts b.ts` holds one 50-credit limit for the whole command, not one per file.
- A Meshy task found after a create that got no reply is adopted only when it echoes this request; a refused download never drops task ids, so a rerun resumes at no charge.
- The recipe cache cap counts real file lengths, and a `record.json` that understates a file is refused.

## [0.9.0] - 2026-11-16

An optional model tier (any model through an adapter, outputs cached so builds stay offline and deterministic), one-command setup and diagnosis, hybrid recipes, game-project commands, a hero texture tier and scale tools, with a gallery that shows the CPU tier and the model tier side by side.

### Added
- Optional model tier: `NeuralAdapter` contract (`t3d-neural/1` HTTP), adapters for an HTTP server, ComfyUI, OpenAI-compatible image APIs and Kubeez (recommended for image generation without a GPU; partner, disclosed); outputs cached by content hash under `recipes/<name>/neural/` with `record.json` (model, licence, weights sha256, request); `t3d neural ls|run`, `--require-neural`.
- Reference model server (`examples/neural-server`, not in the npm package): plug-ins for Pixal3D, TRELLIS.2, Z-Image-Turbo, DINOv2 and MediaPipe motion, each GPU model in its own process; one model per machine at a time with free VRAM and RAM checks (D54).
- Tool adapters: Blender (`bpy` or the `blender` binary) for cloth drape, Rigify, cell fracture and hair grooming with ordered groom ops (comb, puff, cut, clump, curl, frizz, smooth…); gltfpack, Basis Universal KTX2 and a Godot headless import check.
- `t3d doctor`, `t3d setup tools|gpu-min|gpu-full` (into `~/.ts23d`, no sudo, idempotent) and `t3d server start|stop|status`.
- Hybrid recipes: `ctx.neural`, imported meshes as sculpt fields, piecewise fit to the skeleton, texture transfer, `t3d concept` (prompts and seeds as TypeScript); `mesh` inputs must pass input-image rules (`T3D_NEURAL_INPUT`, D55); demo `wolf_hybrid`.
- Hero texture tier: `t3d finish --hero` bakes normal, AO, height and ORM from the sculpt field onto a lighter LOD0 (wolf 141.9k → 39.9k triangles).
- Game projects: `t3d init --engine godot|three|unity|unreal|babylon`, `assets/PLAN.md` + `t3d plan check`, `t3d build --watch`, engine import conventions; `t3d mcp` (optional stdio MCP server).
- Scale: style coherence across a set (`T3D_STYLE_OUTLIER`), scene budgets (`T3D_SCENE_BUDGET`), pinned OpenStreetMap blocks (ODbL) and instanced export; new recipes `city_block`, `fox`, `brown_bear`.
- Gallery: a "CPU tier / With models" switch for assets with a committed hybrid, model and licence credits read from `record.json` (ODbL attributions for OpenStreetMap data), a clip picker and skeleton display, and the model outputs verified by hash before a model-tier compile.
- Hybrid wolf head: `similarityBlend` (a fraction of a similarity, for bending a neck between a fitted head and a body that stays); head landmarks register the model's head separately from its body in `recipes/wolf_hybrid`. Hybrid human and orc heads are in progress and not part of this release's claims.
- Heads: eyebrows and upper lashes as strand cards and a scalp-coverage recipe check (D57).
- Gate: `bun run conventions` fails on a duplicate defect ID in `docs/architecture/defect-catalogue.md`.
- `meshyAdapter`: the `mesh` task on meshy.ai (image-to-3D, or text-to-3D preview with an optional texturing refine) with `MESHY_API_KEY`; GLB only, per-model face caps, PBR / pose / texture / ultra-geometry options, both kinds of HTTP 429 waited out, an interrupted task resumed instead of charged twice; outputs recorded with licence `own`, the Meshy terms URL and the credits charged; `t3d doctor` reports whether `MESHY_API_KEY` is set.
- `t3d neural run --allow-bad-input` sends `mesh` inputs that fail the input-image rules anyway and records the override in `record.json`.

### Fixed
- Small-pawed claws, the gait check's planted-foot band and plantigrade swing (D50–D52); a brick SDF build that never finished on near-duplicate triangles (D56).
- Wolf fur: cards no wider than a third of their length, a shallower root sink and LOD1 cards 1.5x (was 2x) wider, so flecks and banding no longer show (D59); the build re-renders once when compiling moved the material set, and retries when the renderer refused a stale sheet.

## [0.8.0] - 2026-11-16

Assets ship rigged and animated: creatures export a skinned skeleton with walk, trot and gallop clips that keep their feet planted and their joints in shape, heads blink and talk, hero images are path traced, and organic detail is stamped on with vector displacement.

### Added
- Skinning: `skinWeights` (weights from the sculpt's own bone fields, ≤ 4 influences), glTF skins with inverse bind matrices, morph targets, named clips, per-bone hitbox capsules and props on bones; the `skin` QA gate (#38).
- Motion: procedural walk / trot / gallop (Hildebrand phases, two- and three-bone IK, planted feet), baked tail and ear springs, scapula bones, joint limits from each asset's own clips; head `blink` / `talk` / `breathe` clips on a `face` node; `deform` and `gait` QA gates; a pose strip in `t3d review` (#38).
- Path tracer: `t3d hero --quality path` (deterministic CPU path tracing with subsurface skin, hair lobes and denoise); committed hero images are path traced; skin exports `KHR_materials_diffuse_transmission` / `KHR_materials_volume` (#38).
- VDM stamps: vector-displacement sculpt edits (`scalePatch`, `wart`, `hornBase`, `toothSocket`, `poreField`, `scarWelt`, `furrow`) with declared Lipschitz bounds and anchored `scatterStamps`; `bun run vdm:import` (#38).

### Changed
- Busts: card hair rooted on the finished skull in layers with partings; the orc is rebuilt on the skull pipeline with rooted tusks; garments with thickness, folds, hems and seams from a cloth-fold library, and a check that no skin shows through declared cloth (#38).
- The dragon's scales and horn collars are VDM stamps (#38).

### Fixed
- `optimize` dropped joints, weights and morph targets of skinned meshes (D46) (#38).
- Materials defined while a recipe loads or builds (fur and hair strand strips) never reached the painted trim sheet in the CLI or the default beauty renderer (D47) (#38).

## [0.7.0] - 2026-11-15

Realism groundwork: a calibrated critique and reference-photo matching so "looks real" is measured, a stronger sculpt engine, wolves built from bones and muscles with strand-card fur, and human, elf and goblin busts rebuilt from skull to skin with card hair.

### Added
- Reference matching: `photoMatch` now ships (photo · model · overlay, per-view IoU, error map) with a DLT camera solve from ≥ 4 marks (`solveCamera`); `fingerprint` / `compareFingerprints` (silhouette, Lab histogram, frequency spectrum, edge density); the `silhouetteIoU` gate; `bun run ref <recipe>` writes derived numbers only (`ref.json`), never photos (#36).
- Calibrated critique: a metric vector per asset scored by a fit on 40 CC0 game assets and degraded copies (`calibratedScore`, `bun run golden`); a ratchet against `recipes/critique-baseline.json` (`T3D_CRITIQUE_REGRESSED`, `T3D_CRITIQUE_INFLATED`); a blind three-reviewer agent panel (`golden brief` / `golden attest`) decides the flagship floor, report-only for now (#36).
- Sculpt engine: C2 `kernel: 'cubic'` blends, `roundCone` and `superellipsoid` shapes, `crease` / `clay` / `inflate` / `flatten` / `pinch` strokes with a declared Lipschitz bound (`probeLipschitz`), finer-cell `detail` regions, and a crease-preserving `fair()` pass (#36).
- Core: `ctx.bone` and `Armature`, named `Clip`s, skin (`joints` / `weights`) and morph attributes on `Mesh`, `budget.bones` / `budget.heroTextures`, neural task and style types; ADRs 012–015 (hero texture tier, skinned meshes, neural outputs as cached inputs, models by adapter) (#36).
- Fur and hair cards: `hairFlow` (combed tangent field), `hairCards` (Poisson roots, clumps, roots proven inside the surface), a strand atlas on the cutout strip (`strandCells`), `creatureFur` and head fur on creatures, card hair and beards on busts, and `T3D_FUR_SILHOUETTE` (#36).
- Derived maps: `bakeField` (curvature, cavity, thickness, AO from the SDF), the `tex.lic` strand node, finish roughness and normal from the strip height graph, and an LSCM unwrap (`lscmCharts`) replacing box projection with a stretch gate (#36).
- `src/material/shader.test.ts` typechecks the module `threeMaterialSource` emits with strict `tsc` against the gallery's pinned `three` / `@types/three`, so a three bump that breaks the TSL module fails the gate (#33).
- `scripts/public-tree.test.ts`: no tracked file names an internal host or the internal setup mode; a failure names the file, never the value (#21, D43).

### Changed
- `creature()`: the trunk is a ribcage, loin and pelvis plus 19 fibre-aligned muscles and landmarks with tight blends; the neck runs into the skull behind the jaw; the jaw is its own part; 28 bones are exported; canid chest depth and neck continuity are checked. The wolf's `real.width` is now its coated width (0.29 m, sourced guard-hair lengths) (#36).
- Busts: human, elf and goblin heads are built skull → planes → muscles → features → skin on the CC0 MakeHuman base, with sourced proportion checks (eye depth, neck width, face thirds) (#36).

### Fixed
- Cutout cards (fur, hair) rendered as flat pale blobs in `hero.png`: alpha mips now preserve coverage and thin cards pick their mip from the narrow axis (D44) (#36).

### Removed
- `.mcp.json` no longer declares an internal MCP server; add it locally with `claude mcp add --scope local` (#21).

## [0.6.0] - 2026-11-14

Tooling for a repo that runs itself (per-release changelog pages and a written ten-year maintenance contract), plus crank-linkage motions that keep the Jupiter locomotive's rods on their crank pins.

### Added
- `docs/changelog/`: one generated page per release plus an index, and a compare-link index at the foot of `CHANGELOG.md`; `bun run changelog` writes them and the `conventions` gate fails on drift. `bun run release` now refuses a release without a summary sentence under `[Unreleased]` and keeps both current.
- `docs/maintenance.md`: what wears out over a decade and which AI-maintenance lane catches it; the monthly `cleanup` checkup moves the Bun pin and runs a January yearly review; Dependabot bumps Actions monthly.
- Motion kinds for linkages: `orbit` (parallel circular translation: a coupling rod follows its crank pins), `crank` (a connecting rod on the exact slider-crank: rotates and translates) and `piston` (the crosshead / piston on the same linkage, x = r·cosθ + √(L² − r²sin²θ), not a sinusoid). All three read throw, phase and rod length from the rest pose, validate with `T3D_RECIPE_INVALID`, survive mirrored `place`, bake as glTF translation (+ rotation) channels at 48 keys per cycle and sweep their real path in `clashes`.
- `assertFollows(asset, { part, follows, point })` in `/testing`: a point shared by two parts at rest stays on both through the clip (exact poses; the export test holds the baked keys to them); `motionPose`, `cyclesOf` and `LOOP_SECONDS` in core.

### Fixed
- `loco_440`: the side rods moved straight up and down and the main rods and crossheads slid sinusoidally, so the rods left the crank pins by up to 76 cm; they now run as `orbit` / `crank` / `piston` driven by the wheelsets' own crank pins (D42).

## [0.5.0] - 2026-11-14

A production-readiness release: bad recipe input, hostile GLBs and dead servers now fail with coded errors and a `fix:` instead of wrong output, the package exports an explicit list of subpaths, and the creature kind follows sourced animal biology.

### Fixed
- `defineAsset` accepted a missing budget, a fractional seed and any tolerance; bad input now throws `T3D_RECIPE_INVALID` with a `fix:` (D26).
- Mirrored `place` flipped a door's mesh but not its spin / sway axis, so the hinge swung the wrong way; mirrored axes are now flipped (D27).
- `ctx.use` children and unseeded instances shared the parent's random stream; children now get forked seeds (D28).
- A mistyped colour (`#12345`, `red`) turned into NaN in a palette; `hex` is strict (D29).
- Custom `defineMaterial` strips took rows in registration order, so sheets and UVs changed with unrelated code; rows now come from a stable hash of the id (D30).
- `split` left a silent gap when fixed terms underfilled the strip, and parsed stray braces; both now throw coded errors (D31).
- Primitives accepted NaN, zero-segment and inside-out input; `lathe` poles (radius 0) emitted zero-area slivers. Options are validated and poles are clean (D32).
- The GLB reader trusted hostile accessor counts and offsets; it is bounded and capped, and import scale is checked (D33).
- `refine`, `t3d finish --model http` and the data / texture scripts could hang forever on a dead server; all fetches have a timeout (D34).
- `clashes` missed a thin spinning rotor through a panel: face interiors are sampled and thin spin volumes filled (D35).
- A part wholly below ground counted as grounded; `floating-parts` reports it as its own finding (D36).
- A pivot under a static part that merged away exported at the wrong place (`sound_demo`'s `crate_knock`, wheels under a yawed hull); it re-parents to the nearest surviving pivot (D37).
- `t3d build` printed raw stacks for a missing file, a throwing recipe or an unknown flag, and never ran the LOD-chain gates; it now prints coded errors with `fix:` and runs them (D38, D39).
- `bun run verify --only <typo>` went green having run nothing; recipe `*.test.ts` never ran in the gate; a recipe without `sheet.png` passed (D40).
- `signal_gantry` knee braces landed beside the posts; a recipe check now holds both ends (D41).
- Gallery: a crashed compile worker no longer hangs the page; WebGL-off browsers see the committed hero; 404 page, canonical and social meta added.

### Changed
- Creature kind holds animals to sourced biology (docs/research/animal-anatomy.md): a `family` (`canid`, `felid`, `ursid`, `equid`, `bovid`, `cervid`, `suid`) sets the orbit angle the eyelids and rest gaze face (Heesy 2004: cat 65°, dog 50°, horse 24° convergence; `face.orbit`), digits per paw with the fore dewclaw (`digits`; bears 5 / 5), cloven hooves with two dewclaws on artiodactyls (`hoof`), tail ÷ head-body defaults (bear 0.07, deer 0.075, tiger 0.51), and a new QA check `fore share:` (`T3D_QA_CHECK`) that fails a quadruped whose forelegs carry outside 55–66 % of its weight (dog 60.4 %, horse 57–60 %). The generic quadruped tail default is now the wolf's 0.37 (was 0.4); the wolf gains its fore dewclaws.
- Breaking in 0.x: `hex()` accepts only `#rgb` / `#rrggbb` (else `T3D_MATERIAL_INVALID`).
- Breaking in 0.x: `split` throws `T3D_GRAMMAR_UNDERFILL` when fixed terms leave metres nothing can absorb; add a stretch (`~`) or repeat term. `parseWhyte` is strict.
- Breaking in 0.x: `package.json` has explicit `exports`: the 16 module subpaths, `.` and `./package.json`. Deep imports into `dist/` or `src/` no longer resolve. The tarball drops source maps, recipe tests and PNGs (4.6 MB to 2.35 MB packed). `AGENTS.md` is a symlink and is not shipped; `CLAUDE.md` is.
- Breaking in 0.x: with `--json`, errors are one `{ ok: false, error: { code, message, fix } }` envelope on stdout; `list --json` is one envelope; a multi-recipe run with failures adds `data`. Exit codes are 0 ok, 1 QA or build failure, 2 usage.
- Breaking in 0.x: `Finding.code` is required (`T3D_QA_<GATE>` or the lifted `T3D_*`); findings may carry `gap` and `nearest`; `t3d build` folds identical findings across `LOD0-2`.
- Breaking in 0.x: a `tolerance` above its default (measures 0.02, real proportions 0.05, joints 0.2) needs a `why`; hard cap 0.5 (the joint cap was (0, 1)).
- Breaking in 0.x: a pivot named `body` is reserved for the merged root (a static part named `body` is fine). Seeds must be integers.
- Breaking in 0.x: `manifest.json` paths are relative to the manifest, and it gains a `lods` key; `index.json` merges across runs.
- Breaking in 0.x: `degenerate-triangles` is now a default QA gate (it was exported but never run).
- Breaking in 0.x: custom `defineMaterial` rows move once, to their hashed home rows; refresh committed renders with `bun run shots`.
- Breaking in 0.x: the `_parts` wheel is redesigned from a 225/45 R17 reference, with the spoked face on -Y.
- One-material rule reworded to what the exporter does: one draw per moving pivot plus one merged static body, capped by the optional `budget.draws` (`T3D_QA_DRAW_CALLS`); `t3d build` now runs the LOD-chain gates and the draw budget.
- The CLI needs Bun; the library imports under Node >= 22 (proved by the pack smoke test).
- Docs: README, CLAUDE.md, llms.txt, SECURITY.md, CONTRIBUTING.md and the QA, neural-adapter and roadmap pages now match the code (shipped vs planned). README gains badges and a links line; new `NOTICE` for the Hershey fonts and the MakeHuman CC0 base mesh.

### Added
- AI-maintained policy: the repo is fully AI-maintained: `.dz/maintainer/maintainer.yml` adds a monthly `cleanup` lane, a `security-release` lane, and `release-due` cuts releases.
- `bun run verify` has `conventions` (CLAUDE.md rules a script can check; every shipped defect row names an existing test) and `pack` (installs the packed tarball in an empty project, imports every `exports` subpath under Bun and Node, runs `t3d build`) steps; an unknown `--only` name exits 2.
- CLI: `--version`, per-command `--help`, strict flags with did-you-mean, `--timeout <s>` for `finish`; coded errors `T3D_RECIPE_NOT_FOUND`, `T3D_RECIPE_THREW`, `T3D_CLI_USAGE`, `T3D_ASSET_DUPLICATE`.
- `timeoutMs` on `refine` (default 600 s) and the finish HTTP model (default 300 s); script fetches time out after 60 s (whole-file texture downloads after 10 min) and send browser-like headers (Wikidata keeps its identifying User-Agent).
- `budget.draws` (optional draw-call ceiling) is enforced by `t3d build` as `T3D_QA_DRAW_CALLS`.
- Research docs for animals: `docs/research/animal-anatomy.md` and `docs/research/animal-species-sheets.md`.
- Release guards: the release runs the full gate and refuses a tag not on a green `main` commit; `release-tag.yml` is idempotent; CI has an aggregate `verify` check, a `site` job and a `shots` job that fails on any change under `recipes/*/out`.
- `bun run verify` has a `placeholders` step: elided or stubbed code (a bare `// ...` or `/* … */`, "rest of the code", "same as above", `TODO: implement`, "for brevity") fails the gate; planned work still throws `notImplemented()`.
- Repo tooling: a `/planx` command writes path-disjoint execution plans under `docs/plans/<YYYY>/<MM>/<DD>/<1NN>-<slug>/` for `/feature` to run; the developerz.ai maintainer bot gets daily `health`, weekly `release-due` and monthly `improve` checkups (`.dz/briefs/`); with the AI-maintained policy above, `release-due` also cuts and merges releases.

## [0.4.0] - 2026-11-08

Tank tracks now run round their wheels through a new `tread` motion, and `text` sets smooth lettering in four vector typefaces.

### Fixed
- Gallery demo tanks (t34, tiger_1, rts_tank) drove with spinning wheels and frozen tracks: the belt had no motion, so the export merged it into the static body.

### Changed
- The project's name is spelled out as TypeScript to 3D (ts23d) in the README, llms.txt, package description and gallery.

### Added
- Track belts that run: a fourth motion kind, `{ kind: 'tread', path, pitch }` (helper `tread(beltLine, y, linkPitch)` in /kinds), makes a tank's `track_l` / `track_r` its own pivot node and writes the closed belt centre line to `extras.ts23d.tread` (`{ path, pitch }`, node-local, Z up) so an engine can run the links round the loop. glTF has no way to slide vertices round a curve, so treads add no `run` channel, and `clashes` skips them. The gallery's Driving scene runs every belt round its wheels at the wheels' speed while the ground run stays put. t34, tiger_1 and rts_tank use it. New default QA gate `treads`: a `track_l` / `track_r` with geometry but no tread fails (defect D25). Gallery tests (`apps/site/src`) now run in the gate's `test` step.
- Smooth lettering in four vector typefaces: `text(str, { font: 'sans' | 'serif' | 'script' | 'gothic' })` sets printable ASCII (upper and lower case) from the public Hershey stroke fonts (Simplex Roman, Complex Roman, Complex Script, Gothic English; embedded as TypeScript by `scripts/fonts-hershey.ts`, no file reads at runtime; acknowledgements in each `src/primitives/font-hershey-*.ts`). Strokes are inked by a pen of `weight` (fraction of cap height; defaults sans 0.12, serif 0.07, script 0.06, gothic 0.055) with `cap: 'round'` (default) or `'square'` ends and joins; curved runs are Catmull-Rom subdivided by `segments` (1–8, the LOD knob, e.g. `[3, 2, 1][ctx.lod]`; corners and stems stay exact). Proportional advances, optical kerning measured from the glyph shapes (`kerning`, off for joined script), a narrower word space than Hershey's. Flush (2 mm lift) or raised (`depth`), `align`, `maxWidth`, `tracking` and `surface(u, v)` work as for the pixel font; `measureText` measures ink edge to ink edge. `TEXT_FONTS` and `VECTOR_FONTS` list the faces. The 5 × 7 pixel font (`'5x7'`, `'block'`, still the default and the only one with Cyrillic) is byte-identical to before. Recipe `type_specimen`: a notice board with every face, flat and raised.

## [0.3.0] - 2026-11-08

The big feature release: switchable liveries, SVG drawings to 3D, physics colliders and mass, checked joints and blueprints, reusable parts, test helpers, weathering, creatures, mesh import, the AI finish layer, pinned real-world data, offline tuning, sound and PBR finishes, with new QA gates and the first animal, car and strategy-game assets.

### Added
- Switchable liveries in one GLB (`KHR_materials_variants`, opt-in): `defineAsset({ paint: { body: '#84402d' }, variants: { oxide_red: { body: '#74382a' } } })` plus `ctx.part(name, mesh, { paint: 'body' })`. Each paint slot becomes a material (`baseColorFactor` = slot colour, `COLOR_0` = colour ÷ slot so grime and wear survive any repaint); variants map per primitive, shared across LODs, used never required. Cost: one extra draw per slot per painted pivot. `compile(asset, { variant })` and `t3d hero|shot|build --variant <name>` render a livery (`hero_<name>.png`); the manifest lists `paint` and `variants`. Painted parts brighter than their slot are refused (they would clamp). Assets without `paint` export byte-identical GLBs. `boxcar` carries three liveries (mineral red, oxide red, faded).
- Draw → 3D from SVG: `svgShape` parses path data (M L H V C S Q T A Z, relative, implicit repeats, compact arc flags) or a small `<svg>` (`path`, `polygon`, `polyline`, `rect`, `circle`, `ellipse`, viewBox → metres via `scale`/`size`) into flattened contours (proven chord-error bounds; coarser at LOD1/2); `extrudeSvg` (even-odd holes, ear clipping with hole bridges, smooth walls split at corners, optional chamfer bevel, front/side/top views, closed and outward); `latheSvg` (half profile → `lathe`); `visualHull` / `sd.silhouette` (front/side/top silhouettes intersected as exact 2D polygon distances, optional `round`), usable as a `sculpt` edit through the new `{ field, bounds }` field edit; `polygonSdf`. New error code `T3D_SVG_INVALID`. Recipe: `svg_showcase` (gear, amphora, silhouette-sculpted creature head, star emblem).
- QA gate `gaps` (default, LOD0): finds slits you can see light through — a door short of its header, a plate short of its rail, a panel that misses its frame — from axis depth views (part id per pixel); each finding gives width, length, depth, the two parts, `(x, y, z)` and side. Real openings are declared on the asset: `gaps: [{ parts: ['track_*'], why: '…' }]`; running clearance around spinning parts, non-opaque surfaces, slits inside one part and the underside are skipped. `t3d gaps` (once wired) / `gapOverlay` + `gapZoom` draw them red on six views and up close. Testing helpers `assertNoGaps`, `assertTouches` (2 mm, not the 2 cm that keeps a part attached), `assertFlush` (faces level where they meet; `flushness` in /qa). `clashes` tests a sway sector's edge bins at their real angles (no slack bin): a leaf hung 3 mm off its post swings clear.
- Physics (opt-in, Khronos drafts): `toGlb(asset, { physics: true })` writes `KHR_physics_rigid_bodies` + `KHR_implicit_shapes` (in `extensionsUsed` only) — a rigid body on the LOD0 root (mass, centre of mass, principal inertia + orientation; `static` for buildings/terrain, else `dynamic`, or `physics.body`) and one collider per pivot, fitted from its geometry: the tightest box (axis-aligned or PCA) / sphere / capsule / cylinder, else a ≤ 64-vertex convex hull, a compound of the biggest parts when one hull would swallow them (a mantlet + barrel), the exact trimesh for static bodies. Hulls and trimeshes are meshes no node instances: no viewer draws them. Mass is volume × density per shell (strip read from the UVs; table sourced in gltf-capabilities.md), hollow walls via `physics.shell` / part `shell`, overrides `physics.density` / `physics.mass` / part `density`; friction and restitution per strip. Part option `collider: 'auto' | 'box' | 'sphere' | 'capsule' | 'cylinder' | 'convex' | 'mesh' | 'none'`. Opt-in engine-convention nodes: `physics: { conventions: ['unreal', 'godot'] }` (`UCX_<pivot>_NN`, `<pivot>-convcolonly` / `-colonly`). New module `@developerz.ai/ts23d/physics` (`massProperties`, `fitCollider`, `convexHull`, `cappedHull`, `massFindings`, `DENSITY`, `physicsMaterialOf`); `real.mass` + `massTolerance` and `T3D_MASS_MISMATCH` (QA gate wiring pending), `T3D_PHYSICS_INVALID`. tiger_1: 199.6 t solid, 54.6 t with `shell: 0.06` vs 57 t real.
- Measuring and fit: `ctx.joint(name, { from, to, at, axis, tolerance?, kind?: 'flush' | 'socket' | 'grip' })` declares where parts connect (carried through `ctx.use`, listed in the manifest as `joints`); the new default QA gate `joints` cuts both sides at the joint plane and fails with `T3D_JOINT_MISMATCH` (sizes off beyond ±20%, both numbers, the % and the scale fix: "scale hand ×0.51 at the joint, or flare forearm…"), `T3D_JOINT_GAP`, `T3D_JOINT_OFFSET` or `T3D_JOINT_BURIED`; a `grip` compares the handle's diameter with the fist's opening. Core: `jointFit`, `section` (plane cut: width, depth, area with holes, centroid), `picks`. QA: `ruler(compiled)` — `bounds`, `size`, `between(a, b, 'centre' | 'closest')`, `gap`, `section`. Testing: `assertSize`, `assertBetween`, `assertJointsFit`. Recipe `joint_demo`: an arm, hand and sword from separate module files, three checked joints.
- `t3d blueprint` → `blueprint.png`: side, front and top orthographic views on a metre grid (major/minor adapting to size), overall L × W × H dimension lines, every `real.measures` entry dimensioned between its parts with model vs spec (green within tolerance, red outside), joints marked by their fit, a 1.8 m figure for scale, a 3/4 view and a legend. Zero-GPU, deterministic; `bun run shots` now also writes it, and renders into a temp dir so a failing render keeps the previous `out/`. `t3d gaps` wired into the CLI (exit 1 on an undeclared slit).
- Gallery asset page: a Measure bar — metre grid floor, L × W × H dimension overlay, 1.8 m figure, click-two-points ruler — and a livery picker for assets with `variants`. `bun run site:shots --assets x --measure` photographs it.
- Reuse, define once: `definePart({ name, description, tags, params, schema?, validate?, lod?, build })` returns a typed callable part — `part(ctx, name, overrides?, { at, yaw, parent, place, upTo, clearOf, … })` adds it as one named part or a group of named pieces (with surface, motion and sibling `clearOf`); `part.mesh(overrides, lod)` / `part.pieces(…)` give meshes to place and merge; parts call parts through the builder (`b.mesh(other, …)`, `b.pieces`). Params are typed from the defaults (string-literal unions via `as`), validated (unknown name with a did-you-mean, type, `min`/`max`, `oneOf`, the part's own rule) with the new `T3D_PART_PARAMS`; builds are cached per (name, params, LOD), so N identical calls build once; `lod: { upTo, map }` drops or reuses detail per LOD; `catalogueOf(parts)` / `part.info` describe them. A starter kit of 21 real-scale parts in `recipes/_parts/` (ISO metric hex bolt / nut / washer, rivet row, butt/piano hinge, door handle, wheel + tyre, pipe/hose with filleted bends and end flanges, flange, valve wheel, I/C/L steel beam, ladder, railing, casement window, panel door, pendant/bulkhead lamp with a glow piece, crate, steel drum / oak cask, chair/stool, chain, spring), each closed, outward and LOD-gated, checked at every LOD and style by `scripts/parts-catalogue-parts.test.ts`. `bun run scripts/parts-catalogue.ts` writes the searchable index `recipes/_parts/README.md` with a beauty thumbnail per part (`--check` reports a stale index). Showcase asset `parts_catalogue`. Docs: [14-parts](docs/idea/14-parts.md).
- Critique, the scored look before an asset counts as done: `t3d critique` (wiring pending) writes a pack per asset — hero and sheet byte-identical to the committed outputs, a raking-light side view and close-up, LOD0 beside LOD2, `refs.md` (the dossier's links, never downloaded), `rubric.md` (fixed criteria: silhouette, proportions, materials, detail, wear, LOD consistency, technical + the QA summary) and `critique.template.json` with every image's sha256. A vision agent commits `out/<asset>/critique.json` (score 0–10, reason, fixes per criterion); the recipes gate reports missing, malformed, stale (hero/sheet changed since judged) or < 8 critiques — warn-only for now (`CRITIQUE_MODE` in `scripts/lib/critique.ts`). API in /qa: `CRITERIA`, `RUBRIC`, `parseCritique`, `critiqueFindings`, `rubricMarkdown`, `critiqueTemplate`, `referenceLinks`, `refsMarkdown`. First critiques: boxcar 6.7, cargo_container_scifi 5.9, tiger_1 6.0.
- Test helpers so agents catch errors with code (`@developerz.ai/ts23d/testing`, [15-testing](docs/idea/15-testing.md)). Mesh: `assertClosed`, `assertManifold`, `assertOutward` (ray parity per connected shell), `assertNoSelfIntersection` (grid-accelerated triangle pairs), `assertMinThickness` (inward rays), `assertSymmetric`. Asset: `assertUprightOnGround`, `assertCentreOfMassInside` (physics centre of mass vs the ground-contact hull), `assertPartMotionClear`, `assertLodSilhouette` (LOD0 vs LOD2 IoU from six axis views), `assertTexelDensity`. 2D: `assertPolygonValid`, `assertTileable`, `assertNoBleed`, `assertValueRange`. Renders: `assertNotEmpty`, `expectImageClose` (writes `<golden>.diff.png`; `T3D_UPDATE_GOLDEN=1`), `assertSilhouetteMatches` (framing-agnostic mask IoU), `assertNoHoles`. Failures throw `T3D_QA_FAILED` with the measured value and a fix. New code `T3D_ASSERT_INPUT` for bad inputs.
- Weathering ([18-weathering](docs/idea/18-weathering.md)): `weather(mesh, opts)` → `{ mesh, coverage }` and `weather(ctx, { leaf, bolt_0, … }, opts)` → weathered meshes, with four controls — random (`seed`, world-space value noise, same patches at LOD0/1), where (selector expressions over geometry: `up-facing`, `down-facing`, `side-facing`, `convex-edges`, `cavities`, `ground-near`, `shaded`, `sunlit`, `wet`, `fasteners`, `below-fasteners`, `touched`, `long-spans`, `exposed-panels`, combined with `&` `|` `!` and parentheses), how (vertex-colour chips, rust with gravity-traced streaks that drip off edges onto the surface below, dust, moss, mud splash, bleach, scratches; dents, sag ∝ span² and warp as LOD0/1 deformation via `imperfect()`), and % (`amount` = exact area fraction of the eligible surface, measured and reported). `age` scales omitted amounts; `climate: 'dry' | 'wet' | 'coastal' | 'snow' | 'desert'` adds typical effects. Weathered meshes are tessellated to `resolution` (default `[0.04, 0.1, 0]` m) by crack-free red-green refinement (`subdivideTo`). Coverage goes on the compiled asset (`ctx.weathered`, `CompiledAsset.weather`, carried through `ctx.use`), into the manifest (`weather: { chips: { target, actual, eligible, area, by } }`), and the new default QA gate `weather` (`T3D_WEATHER_COVERAGE`, `T3D_WEATHER_NO_SURFACE`, `T3D_WEATHER_MISPLACED`, `T3D_WEATHER_STREAK_UP`, `T3D_WEATHER_SHAPE`). Recipe `weather_demo`: steel door, crate, concrete block and 55-gal drum, each new beside weathered.
- `creature` kind (M4): `creature(ctx, spec)` / `defineCreature` sculpt a whole animal from a skeleton type (`quadruped`, `winged`, `biped`, `bird`, `fish`, `serpent`), a stance (digitigrade / plantigrade / unguligrade) and a few sourced proportions — staged sculpt (block-out → planes → features → head with seated, lidded eyes, grown ears, rooted fangs → coat zones + tone), seeded asymmetric patterns (`stripes`, `spots`, `rosettes`, `patches`), fur/scales/feathers relief at LOD0, LOD2 legs as tubes. Biology built in: allometric limbs (Campione & Evans 2012; a stick-legged elephant is refused with `T3D_RECIPE_INVALID`), furred-body effective density for the `mass` gate, eye size from mass, wing loading, the `balance` check (centre of mass over the support polygon), declared anatomical creases. Parts `body`, `head`, `eye_l`/`eye_r`, `claws`. `creature()` no longer throws `T3D_NOT_IMPLEMENTED`.
- `wolf`: adult grey wolf (1.15 m head-body, 0.80 m shoulder, 0.42 m tail, 40 kg; Wikipedia: Wolf) in one `CreatureSpec` (96 lines), QA PASS incl. connections, mass and balance; a test reproduces a tiger-like big cat with the same kind.
- Import ([21-import](docs/idea/21-import.md), [ADR 011](docs/decisions/011-imported-meshes-may-be-decimated.md)): licensed meshes in, game-ready assets out. `importGlb(source, opts)` (replaces the planned stub; now takes `{ path, sha256, license, author, url, bytes? }`) reads any uncompressed GLB with a strict pure-TS reader (all accessor component types, node TRS/matrix baked, mirrored transforms re-wound), gates the licence (CC0 / CC-BY / MIT / own; non-commercial refused unless `allowNonCommercial`, then a loud warning and a NON-COMMERCIAL credit), serves bytes offline by sha256 (`provideImports`; inline bytes hash-checked), converts glTF Y-up/+Z-front to Z-up/+X-front, scales/fits/places, cleans (`cleanMesh`: weld, degenerate + duplicate faces, consistent outward winding, small holes filled, specks dropped, per-shell report) and projects a PNG baseColor into vertex colour (pure-TS inflate + PNG reader, browser-safe). `simplify(mesh, { targetTris, preserveBorders, preserveUVSeams })`: Garland–Heckbert quadric decimation with half-edge collapses, attribute-aware cost, border/seam constraint planes, link condition (closed meshes stay closed), deterministic — for imported meshes only. `bakeNormals(high, low, { size, cage })`: closest-hit grid ray cast, glTF green-up tangent-space normal map + albedo, dilated; `uvTangents`. `withOwnTextures(glb, [{ part, albedo, normal }])` gives a part its own material (TANGENT, no COLOR_0) on every LOD, flagged in `extras.ts23d.ownMaterials` (Khronos-valid). `onSheet` keeps imports on the one trim-sheet material by default. `refine({ mesh, prompt }, { endpoint, model })`: adapter + sha256 cache for a user-run local refine server (no model shipped). `bun scripts/import.ts hash|cache|fixture|textured`. Codes `T3D_IMPORT_GLB`, `T3D_IMPORT_UNSUPPORTED`, `T3D_IMPORT_EMPTY`, `T3D_IMPORT_LICENSE`, `T3D_IMPORT_HASH`, `T3D_IMPORT_MISSING`, `T3D_SIMPLIFY_INVALID`, `T3D_BAKE_INVALID`, `T3D_REFINE_FAILED`. Recipe `import_demo`: a stand-in head scan made from the CC0 MakeHuman hm08 base (35k tris, its own UVs and texture, typical scan defects) cleaned, simplified to 12k / 4k / 1.2k, given code-built eyes and seated by a checked `socket` joint in a leather collar (sized from the neck measured on the mesh) on a code-built bust in muted dyed wool.
- Faces from one anatomical base ([face-base](docs/research/face-base.md)): `warpTPS(mesh, from, to, { stiffness })` and `tpsWarp` in `/primitives` — a deterministic 3D thin-plate-spline landmark warp (normals turned by the warp's Jacobian; singular or mismatched landmarks fail `T3D_WARP_INVALID`). `recipes/_lib/face`: the MakeHuman hm08 base head (CC0 1.0, pinned by sha256, 5.7k quads committed), 82 named landmarks, race presets declared as ratios against the human (orc, elf, dwarf, goblin), age / weight / seeded asymmetry, an ear deformer, Catmull–Clark LOD0, a distance-field LOD2, code eyes, teeth, tusks and sculpted hair against the warped scalp. `recipes/face_demo`: five busts from the one base.
- AI finish layer ([22-ai-finish](docs/idea/22-ai-finish.md), [ADR 010](docs/decisions/010-ai-finish-layer.md)): new module `@developerz.ai/ts23d/finish` (tier 4). Code builds the structure; an image model adds surface detail on top. `controlViews` / `exportControlMaps` render deterministic per-view depth, view/world normals, part ids (+ legend), atlas UVs, unlit albedo and optional beauty, plus cameras.json; `FinishModel` adapters `mockFinish` (procedural, world-space grime/rust/wear/moss, deterministic) and `httpFinish({ endpoint })` for the user's ComfyUI / diffusers server; results cached by sha256 (`fileStore` in `.ts23d/finish/`, `memoryStore`), so re-runs replay offline and the gate never runs a model. `finishAsset` builds a per-asset atlas (box-projected charts, shelf-packed), projects the images back with depth test, part masking and (n·v)² blending, fills unseen texels, derives heuristic roughness/metal/detail normal, re-runs QA. `finishedGlb` writes LOD0 on one extra `ts23d_finish` material (LOD1/2 keep the trim sheet; nodes, pivots, animations and LOD1/2 meshes identical — tested); provenance in `extras.ts23d.finish`. Export: `withFinishLayer`, `readGlbChunks`, `FINISH_MATERIAL`. `t3d finish <recipe> --model mock|http --endpoint … --prompt "…" --views 8 --atlas 1024 --force`. Codes `T3D_FINISH_INVALID`, `T3D_FINISH_MODEL`, `T3D_FINISH_PALETTE_DRIFT`, `T3D_FINISH_MASK_LEAK`. Recipe `finish_demo`: a EUR pallet, crate and oak cask with a committed before/after.
- Real data, pinned and offline ([23-real-data](docs/idea/23-real-data.md)): new module `@developerz.ai/ts23d/data` (tier 3). `bun run data wikidata <QID…>` fetches Wikidata items (CC0) at a revision-pinned URL and writes `recipes/<name>/data/wikidata-<QID>.json` (lengths in m, masses in kg from exact unit factors, coordinates, gauge / wheel arrangement by label, sha256 of the raw response); `readWikidata`, `realFrom(record, { map, measures })` → `real` values + citation, `crossCheck` (conflicts beyond tolerance), `quantity`, `citeWikidata`. `bun run data dem --centre <lat,lon> --size <m>` fetches AWS Terrain Tiles (terrarium), pins every tile by sha256 and writes one 16-bit DEM JSON with licence + attribution (USGS 3DEP public domain filled in for the US; elsewhere `--license` / `--attribution` required); `readDem`, `decodeDem` (re-hashes the heights), `terrainFromDEM(dem, { lod, size, vertical, base, detail, ground, strips, water })` (heightfield + skirt, slope/altitude nature strips, optional seeded erosion, water at a level), terrarium/Web-Mercator helpers, a pure-TS `sha256` / `verifyPin` usable in the browser. Codes `T3D_DATA_QID`, `T3D_DATA_PROPERTY`, `T3D_DATA_UNIT`, `T3D_DATA_HASH`, `T3D_DATA_DEM`. Recipe `real_valley`: Yosemite Valley east end, 4 × 4 km at true scale from USGS 3DEP, Half Dome's summit cross-checked against Wikidata (0.15 m apart).
- Offline tuning ([20-tuning](docs/idea/20-tuning.md)): `defineAsset({ tune: { params: { name: { min, max, default, step? } }, objectives, saved } })` and `ctx.tuned('name')` (trial override → committed `tune.json` → default; `compile(asset, { tuned })`). New module `@developerz.ai/ts23d/tune` (tier 4; `cli` moves to tier 5): deterministic CMA-ES and coordinate search on the unit box (seeded from the core RNG, bounds by clamp + penalty, early stop on radius/stall/target, evaluation cache by snapped values), objectives `silhouette` (1 − IoU vs an SVG/PNG reference mask, framing-agnostic), `measures`, `art`, `budget`, `custom`; `tune`, `scoreValues`, `loadMasks`, `maskOfSvg`, `tuneJson`, `reportMd`, `tuneStrip`. `t3d tune <recipe> [--evals N] [--seed s] [--method cmaes|coordinate]` writes `tune.json`, `tune-report.md` and a before/after `tune-strip.png` beside the recipe; same seed + budget → same bytes. Code `T3D_TUNE_INVALID`. Recipe `tune_demo`: an amphora fitted to a drawn front outline, IoU 0.643 → 0.940 in 791 evaluations.
- `amur_tiger`: adult male Amur tiger, the first quadruped mammal — sourced measurements (1.96 m head-body, 0.99 m tail, 237 kg), seeded asymmetric stripes, furred-body density for the mass gate, eye-socket probe tests, anatomical creases declared.
- `elf_head` bust and `docs/research/head-analysis.md` (measured human ratios; declared stylisations per race); busts rebuilt on a shared `recipes/_lib/bust` library.
- QA gate `connections`: every shell reaches the body over a real contact face; grown appendages are rooted and blended; eyes sit in sockets and look one way; sculpts carry no unblended seams. `connect` part option, `creases`, `connectionsOverlay`, `assertConnected` / `assertGrown`.
- Strategy-game kit ([19-rts-kit](docs/idea/19-rts-kit.md)): an original sample RTS faction, the Saltmarch Accord — `rts_worker` (5.8k / 330 tris), `rts_soldier` (9.0k / 380, carbine on a hand socket with a `grip` joint, muzzle emitter), `rts_tank` (18k / 380: turret spin, gun sway, spinning wheels/idlers/sprockets with pivots kept at LOD2, link-by-link tracks), `rts_barracks` as one `defineFamily` in 3 build stages × 3 damage states (nine assets: holes, scorch, smoke/fire emitters, rubble heaps from one seeded cell plan), `rts_resource` + `rts_resource_depleted` (SDF basalt outcrop, glowing sunstone crystals, team claim stake), and the `rts_faction` lineup scene. Every asset carries the `team` paint slot convention with 8 liveries (red, blue, green, yellow, purple, orange, teal, white; KHR_materials_variants) on large top-facing parts; a recipe test proves ≥ 8 % of each LOD2 silhouette is team colour from a 58° / 64 px strategy camera and runs `silhouetteReads` + `assertArt` on the units.
- `t3d icon` → `<out>/<asset>/icon.png` (256² unit icon), `portrait.png` (512² close-up on `art.focal`, else the top 40 %, ≤ 3× zoom) and `rts.png` (64² strategy camera), one fixed 3/4 high camera and studio light for every asset; warns `T3D_TEAM_COLOUR_HIDDEN` when a `team` slot covers < 8 % of the RTS view. Render API (zero-GPU, deterministic): `icon`, `portrait`, `renderIcon`, `renderPortrait` (`size`, `backdrop: 'studio' | 'transparent'`, `focus`, `maxZoom`, `sheet`), `ICON_CAMERA`, `rtsView`, `RTS_CAMERA`, and `teamCoverage(a, b)` — the share of the strategy-camera silhouette that changes between two liveries.
- `roadster_v10` + `roadster_v10_open`: an original front-mid-engine V10 roadster in 7.7k lines / 32 modules — opening hood, doors, trunk, fuel flap, steering; full engine bay, chassis, brakes, interior; clearcoat paint slots with four liveries, glass optics, brushed finishes, light sockets; every measure within 0.2 %.
- Sound ([17-sound](docs/idea/17-sound.md)): new zero-dependency module `@developerz.ai/ts23d/audio` (tier 2) — `sound.impact` (modal synthesis: modes from material E/ρ/η and size, f ∝ √(E/ρ)/L, bar/plate/hollow/block mode ratios, striker mass and force set brightness), `sound.engine` (four-stroke firing frequency rpm/60 × cylinders/2, firing order, quarter-wave exhaust, seamless whole-cycle loops), `sound.mechanism` (creak, squeak, whine, rattle, hiss, clunk), `sound.ui` (sfxr-style blip, pickup, laser, hit, powerup), 16-bit PCM `encodeWav`, clip measurements `peakFrequency` / `magnitudeAt` / `rms` / `seamJump`; deterministic (same options, same WAV bytes). DSL: `ctx.emitter(name, { kind: 'sound', clip, loop?, gain?, when?, refDistance?, maxDistance? })` and part option `sound: { onMotion: clip }`. Export: `KHR_audio_emitter` (Khronos draft, `extensionsUsed` only) — positional emitters on LOD0 nodes, clips as `<clip>.wav` beside the GLB (`t3d build` / `shot` write them; `--no-sounds` / `{ sounds: false }` skip), trigger in `extras`; manifest `sounds` + `files.sounds`; `soundFiles`, `soundUses`. Codes `T3D_AUDIO_INVALID`, `T3D_AUDIO_MATERIAL`, `T3D_AUDIO_CONFLICT`. Recipe `sound_demo`: a creaking door, a ringing steel bell, a knocking crate and a V10 idle loop.
- Measurable art checks ([16-art-as-text](docs/idea/16-art-as-text.md)): `defineAsset({ art: { focal, shape, grounded, restShare } })`; `/testing` `silhouetteReads` (LOD2 vs LOD0 32-px soft IoU ≥ 0.85, front/side/3/4), `focalPoint` (top value contrast on the focal part), `restAreas` (calm surface ≥ 25 %, non-uniform detail), `grounded` (luminance rises base → top), `shapeLanguage` (aggressive / friendly / stable from the outline), `assertArt` (all, `T3D_ART_*` with measured value + fix). `t3d critique` adds `silhouette.png`, `value.png`, `detail.png`, a Measured table in `rubric.md` and `metrics` in critique.json (optional, backward compatible).
- PBR: lacquered paint slots (`KHR_materials_clearcoat`), ice/liquid/jelly surfaces + `optics` (transmission/ior/volume), named `finishes` (sheen, anisotropy, iridescence, specular); preview renderer uses the glTF reference BRDF (GGX/Smith/Schlick) with clearcoat, sheen, anisotropy, thin film and screen-space transmission; `--profile unreal|unity|godot|rt|web`; metal strips write binary metalness; `recipes/pbr_showcase`.
- Flagship `dragon` recipe (Cinderhorn): multi-file creature (head, neck, body, legs, wings, tail, scales modules) with shared helpers in `recipes/_lib/creature/` (skin/roundCone tubes, horns as log spirals from bosses, membranes, tone pass, probes) and biology tests (mass, limb load, wing loading).
- docs: 37 class playbooks in `docs/playbooks/` (vehicles, buildings, props, nature, characters); `docs/idea/16-art-as-text.md` (art principles as measurable definitions); `docs/research/reading-list.md` (free, legal sources).
- Trim sheet v3: 4096² house size (CLI and site paint 2048² by default; `--sheet-size 4096` for final exports), 56 strip rows (1/64), per-strip U span (4 m library, 16–32 m nature); 18 nature strips (sand, soil, gravel, mud, rock strata, cliff, moss, grass, snow, ice, three barks, leaf litter, cobblestone, asphalt, water, lava); `tex` texture-graph DSL with a define-time tileability probe; `materialVariant`, `weathered`, wet/wear/age dials; `CREATURE_MATERIALS`; `bun run textures search|add` for Poly Haven + ambientCG. Every asset's UVs change once.
- Physics: fitted colliders per part, mass / centre of mass / inertia from volume × density, `KHR_physics_rigid_bodies` + `KHR_implicit_shapes` (drafts) behind `--physics`; default `mass` QA gate when `real.mass` is declared (tiger_1: 57 t).
- `definePart` + `recipes/_parts` (21 reusable real-scale parts) + `parts_catalogue` showcase; `bun run parts` regenerates the catalogue.
- `t3d critique` scored-review pack and critique.json attestation (recipes gate, warn mode for now).

### Fixed
- D24 (tinted coats looked muddy): `CREATURE_MATERIALS.fur_neutral`, a neutral near-white fur strip so the vertex colour carries the coat; the `fur` id is unchanged.
- Physics mass counts overlapping solids once (D22): shells merged into one part whose bounds overlap are integrated as a UNION along a grid of +Z rays (exact top-left crossing rule, per-shell winding) — closed shells keep their exact signed-volume moments and only the overlap/open-shell correction is sampled, so non-overlapping shells stay exact. Overlaps take the densest covering material. Open shells use their own crossings where a ray balances and their convex hull only where it falls through a hole (was: the whole hull). Shells whose edges balance but are non-manifold (touching boxes, pinched sculpts) now count as closed (`Shell.balanced`). New `PartMass.volumeError` / `MassProperties.volumeError` (conservative bound, m³). dragon LOD0 19.53 t → 8.30 t (LOD1 8.13 t, LOD2 6.67 t); boxcar 137.6 t → 78.0 t (the open body shell was a 59 t solid hull); tiger_1 unchanged (hollow `shell` path).
- Recipes: `cargo_container_scifi` doors now fill the rear opening like an ISO box (sill to header, between the posts, flush with the frame face; they hung 6.6 cm proud and stopped 1.6 cm short of the header and 1.8 cm above the sill); floor and roof plates reach the rails (1–2 cm daylight slots along their edges); the keypad sits on its panel (it floated 1.75 cm off). `t34`: front mudguards tuck under the hull side (3 cm see-through slit). `t34` and `tiger_1` declare their track running clearance.
- `place()` / `applyAffine` transform normals by the inverse transpose (sign(det) · cofactor) when the matrix is not a rotation × uniform scale: `scale: [1, 1, 4]` tilted normals by up to 62°. Rotations, uniform scales and mirrors keep their exact bytes.
- One robust ear clipper (`triangulate.ts`, shared by `triangulate` and the SVG fill) on the new exact `orient2d` predicate: polygons with a repeated point (a closing duplicate, a seam) were silently half-filled; the scan is O(n²), not O(n³). `convexHull` decides visibility with the exact `orient3d` (eps only gates which points join), so near-coplanar input no longer leaves open hulls. `orient2d` / `orient3d` exported from core.
- `qa/clash`: no `Math.min(...samples)` spread (overflowed the stack at ~1 M samples).
- `clashes` sweeps a hinged part (sway) to millimetres, not 5° bins (D23): the rest-pose surface (triangle interiors too) is rasterised into an occupancy grid of axial slice (≤ 2 cm) × radial ring (1 cm) × angular bin (≤ 5 mm of arc at the part's reach); a point is swept only if its own ring, and the rings 1 cm either side, held body at a rest angle the travel carries onto it, with the travel ends shrunk by 1 cm of arc (a tolerance in metres, not degrees). The old per-bin max radius filled the whole fan from the hinge out to the tip, so anything a few cm under a long closed panel read as swept. New `src/qa/clash-sector.ts`; spins keep their solid of revolution (`clash-sweep.ts`). roadster_v10: 26 of the hood/trunk/door/fuel-flap `clearOf` entries no longer suppress anything; gate time unchanged (≈ 1.4 s roadster_v10, 45 ms boxcar, 130 ms cargo_container_scifi).
- Light sockets without an `intensity` export physical defaults (KHR_lights_punctual units): directional 100 000 lx (sun), point / spot ≈ 1000 lm (point 79.6 cd; spot = 1000 lm over its cone). Was 3 lx / 20 cd / 100 cd, near-black in engines with physical light units.
- Faster, same bytes: `t3d build` merges + optimises each LOD once for the split and single-file GLBs (tiger_1 export 1.50 → 0.69 s); QA gates share per-mesh bounds / triangle grids / solid indices and an allocation-free point–triangle distance; silhouette views memoise the exact 2D polygon distance per lattice coordinate (svg_showcase LOD0 1.65 → 0.95 s); hydraulic erosion is simulated once per (grid, droplets, options) across LODs (mountain_range LOD1 605 → 231 ms, LOD2 528 → 235 ms).

### Changed
- CI: `verify` and `shots` run as 12 parallel shards (`T3D_SHARD=k/n`, `scripts/lib/shard.ts`); shard 1 runs every step, each shard compiles and checks its slice of the recipes. Locally `bun run verify` is still the whole gate. `release.yml` re-runs the fast steps (ci already proved the recipes on the tagged commit).
- Recipes gate rejects imports into another asset folder's modules or data (`scripts/lib/recipe-imports.ts`); shared code moved to `recipes/_lib/rts`, `recipes/_lib/bust/human`.
- QA `connections` seams: size-aware fold scale (capped at 2.5 cm, or a single edge ≥ 40°) and declared creases count when they hold the seam's centre or ≥ 80 % of its trace, so regions sit on the fold.
- Module tiers: `data` 3, `tune` and `finish` 4, `cli` 5.

## [0.2.0] - 2026-11-07

The first release under the `@developerz.ai/ts23d` name adds a 16-strip PBR material library, re-sculpted busts, a better-lit gallery and one GLB that carries all three LODs through `MSFT_lod`.

### Added
- Package published as `@developerz.ai/ts23d` (the npm organisation's scope).
- Material library v2: 16 new PBR strips on a 2048² trim sheet (oak, pine, weathered and painted wood; rusty, cast, painted and galvanised iron/steel; brass, copper, aluminium, chrome; rubber, canvas, leather, plastic) with their own roughness and metalness. `defineMaterial()` registers project materials; opt-in CC0 photo strips (Poly Haven) via `bun run textures` — sha256-pinned, offline compile, credited in the GLB. The beauty renderer reflects metals. `t3d` paints the sheet at 2048² by default.
- Orc and goblin busts re-sculpted (anatomy, faces, mouths, gear, collectible plinth, painted tone pass); `head` gains `bust.mass`, `wrinkles`, `'vest'` bust style.
- Boxcar reads as painted planks, weathered roof walk, cast and rusty iron.
- Gallery: per-category studio lighting, PBR Neutral tone mapping, contact shadows, GTAO + MSAA on a high-quality tier with a phone fallback.
- Research docs: sculpting, material authoring, Blender bridge design, pro asset pipeline and CC0 libraries.
- One GLB with all three LODs: `t3d build` also writes `<out>/<asset>/<asset>.glb` — LOD0 in the scene, LOD1/LOD2 as `MSFT_lod` alternates outside it (listed in `extensionsUsed`, never required, so viewers without the extension show LOD0 only), `MSFT_screencoverage` view-distance hints, one shared material/texture set, motion channels on every LOD. `--lods split|single|both` (default `both`); the manifest records `files.single` and `lodCoverage`. API: `toLodGlb` / `exportLodGlb`; recipes may set `lodCoverage: [lod0→1, lod1→2, cull]`, otherwise it is derived from triangle density and size. tiger_1: one 7.07 MB file vs 7.09 MB for three split files (shared sheet); with `--sheet embed`, 10.7 MB vs 17.9 MB.

### Fixed

## [0.1.0] - 2026-11-07

The first published version: the asset DSL with primitives, organic sculpting, terrain, building and vessel kinds, glTF export with lights and provenance, build-failing QA gates, zero-GPU contact sheets and beauty renders, and a starter gallery of recipes.

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

[Unreleased]: https://github.com/developerz-ai/ts23d/compare/v0.17.0...HEAD
[0.17.0]: https://github.com/developerz-ai/ts23d/compare/v0.16.0...v0.17.0
[0.16.0]: https://github.com/developerz-ai/ts23d/compare/v0.15.0...v0.16.0
[0.15.0]: https://github.com/developerz-ai/ts23d/compare/v0.14.0...v0.15.0
[0.14.0]: https://github.com/developerz-ai/ts23d/compare/v0.13.0...v0.14.0
[0.13.0]: https://github.com/developerz-ai/ts23d/compare/v0.12.0...v0.13.0
[0.12.0]: https://github.com/developerz-ai/ts23d/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/developerz-ai/ts23d/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/developerz-ai/ts23d/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/developerz-ai/ts23d/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/developerz-ai/ts23d/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/developerz-ai/ts23d/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/developerz-ai/ts23d/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/developerz-ai/ts23d/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/developerz-ai/ts23d/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/developerz-ai/ts23d/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/developerz-ai/ts23d/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/developerz-ai/ts23d/releases/tag/v0.1.0
