# Errors

**Every failure is a `Ts23dError` with a stable `code`, a `cause` in the message, and a `fix`.** The reader is usually an agent: act on `fix`, don't parse prose. Codes are stable across minor versions. Source: `src/core/errors.ts`.

```
T3D_PART_UNKNOWN: part 'gun_barrel' parents to 'gun', which does not exist yet
  fix: add the parent (ctx.group or ctx.part) before its children
```

`--json`: `{"ok":false,"error":{"code":"…","message":"…","fix":"…"}}` on **stdout**; exit 2 for `T3D_CLI_USAGE`, exit 1 otherwise.

## Library codes

| Code | Thrown by | Cause | Fix |
|---|---|---|---|
| `T3D_NOT_IMPLEMENTED` | Anything still in a `planned.ts`, `/neural`, and whatever the roadmap lists as unbuilt | Declared API, not built yet. The message names the doc tracking it | Use a shipped alternative ([roadmap](../plans/roadmap.md)), or implement it ([adding a primitive](adding-a-primitive.md), [adding a kind](adding-a-kind.md)) |
| `T3D_GRAMMAR_SYNTAX` | `parseSplit`, `split`, `parseWhyte` | Bad split term, empty split, a repeat with stretch terms, more than one repeat; or a Whyte string that isn't three even numbers | Split: `sym:<metres>`, `sym:~`, `sym:~<weight>`, `{a:1 \| b:2}*`, joined by `\|`. Whyte: `'4-4-0'`, `'2-8-2'` |
| `T3D_GRAMMAR_OVERFLOW` | `layoutSplit`, `split`, `facade` | Fixed terms sum to more than the strip length | Shrink a fixed term or make one a stretch (`sym:~`) |
| `T3D_GRAMMAR_UNDERFILL` | `layoutSplit`, `split`, `facade` | Fixed terms sum to less than the strip length and nothing can stretch, so the split would leave a silent gap | Add a flex (`sym:~`) or repeat (`{…}*`) term |
| `T3D_PART_DUPLICATE` | `ctx.part`, `ctx.group`, `ctx.use` | A part name added twice in one asset | Suffix the loop index: `wheel_0`, `wheel_1`; give each `ctx.use` a unique `prefix` |
| `T3D_PART_UNKNOWN` | `ctx.part`, `ctx.group` | `parent` names a part not added yet | Add the parent first |
| `T3D_RECIPE_INVALID` | `defineAsset`, `compile`, `ctx.part` / `group` / `use` / `joint`, `createRng`, `rng.pick`, `definePart`, every primitive and kind | Asset name not `[a-z][a-z0-9_]*`; no `budget`, a triangle ceiling ≤ 0 or `budget.draws` not an integer ≥ 1; a `seed` (asset, `compile`, `ctx.use`, `createRng`) that is not a finite integer; `compile` with `lod` outside 0–2; a `real` dimension or measure `value` ≤ 0; a `tolerance` (measure, `real`, joint) outside (0, 0.5], or above its default (measure 0.02, `real` 0.05, joint 0.2) without a non-empty `why`; a group, moving part, emitter, socket or `ctx.use` prefix named `body` (the merged static root); a part with both `yaw` and `motion`; `rng.pick([])`; a `definePart` `lod.map` that is not three non-decreasing LODs; or a primitive/kind given impossible input (zero-length edge, bevel ≥ half a side, roof pitch out of range, SDF grid over the cell cap) | The printed `fix:` names the bad option and its valid range: rename to snake_case; `budget: BUDGETS.prop`; an integer seed; re-derive a loose number from the sources or say `why`; rename the group (`body` is the merged static root); put yaw on a parent `ctx.group`, motion on the child |
| `T3D_QA_FAILED` | `/testing` assertions (`assertQaPass`, `assertBudget`, `assertMeasure`, …) | A recipe test found QA findings; the message lists every one. The CLI itself reports findings and exits 1 instead | Fix each finding's `fix:` line |
| `T3D_RENDER_OPTIONS` | `beauty`, `t3d hero` / `review` flags, render metrics | Bad image size, camera angle or render option | The printed `fix:` names the valid range |
| `T3D_JOINT_MISMATCH` | QA gate `joints` (message prefix), `assertJointsFit` | The sections either side of a `ctx.joint` differ beyond its `tolerance` (default ±20%, at most 0.5; above 0.2 it needs a `why`): a hand twice the wrist, a handle too thin for the fist, a peg wider than its socket. The message gives both sizes and the % | The printed `fix:` names the scale factor: scale one side or taper the other. Never loosen the tolerance to pass |
| `T3D_JOINT_GAP` | QA gate `joints`, `assertJointsFit` | A side of the joint never crosses its plane, the parts stop short along the axis, or a grip's fingers wrap less than half the handle | Move the part (or the joint's `at`) so both meet at the plane |
| `T3D_JOINT_OFFSET` | QA gate `joints`, `assertJointsFit` | The two sections' centres miss by more than 25% of the section | Slide the `to` part in the joint plane by the printed distance |
| `T3D_JOINT_BURIED` | QA gate `joints` (flush joints) | `from` runs through `to` far past the joint (over 1.5 × the section) | Shorten `from` to end at the joint, or move `at` to where they meet |
| `T3D_MASS_MISMATCH` | QA `mass` (`massFindings` in /physics, message prefix) | Mass computed from volume × strip density differs from the declared `real.mass` beyond `real.massTolerance` (default ±15 %); open shells counted as hulls are named | Too heavy: hollow shells with `physics: { shell: 0.06 }` or per-part `shell`; map untyped strips with `physics.density` (`plain` = 1000 kg/m³). Too light: densities, thicker walls, close open shells. Never set `physics.mass` to pass |
| `T3D_PHYSICS_INVALID` | `toGlb(…, { physics })`, `checkPhysics` | A `physics.mass`, `density` or `shell` (asset or part) is not a finite positive number | Give kg, kg/m³ and metres > 0, or omit the field for the default |
| `T3D_ASSERT_INPUT` | `/testing` assertions (`assertClosed`, `assertSilhouetteMatches`, `expectImageClose` …) | An assertion was given something it cannot judge: a `parts` filter matching no part with geometry, bytes that are not a supported PNG | Name the parts as `t3d build` lists them (globs allowed); pass RGBA8/RGB8/grey PNG bytes or `{ width, height, data }` |
| `T3D_PART_PARAMS` | `definePart` calls (`part(ctx, …)`, `.mesh`, `.pieces`, `.params`), and `definePart` itself for non-plain defaults | An override names an unknown parameter, has the wrong type, is outside the part's `min`/`max`, is not one of its `oneOf`, or breaks the part's own `validate` rule. The message names the part and the value | Pass a known name (the fix lists them and the nearest match) with the default's type, inside the printed range; the catalogue (`recipes/_parts/README.md`) lists every part's params |
| `T3D_MATERIAL_INVALID` | `defineMaterial`, `materialVariant`, `palette`, texture sources, `tex.*` graphs | A material definition that cannot paint: a variant index outside 0..VARIANTS−1, a bad palette entry, a malformed texture source, a texture graph that fails its two-tile trial paint | The printed `fix:` names the field and its valid range |
| `T3D_MATERIAL_UNKNOWN` | strip lookups (`materialOf`, `materialVariant`, trim-sheet rows) | A `strip` id that is neither built in nor defined with `defineMaterial` | Use a built-in strip (the fix lists them) or `defineMaterial({ id, … })` first |
| `T3D_MATERIAL_CONFLICT` | `defineMaterial` | The id is a built-in strip, or was already defined with different settings | Pick another id; define each material once in a shared module and import it |
| `T3D_SHEET_FULL` | `defineMaterial` | Every custom strip row of the trim sheet is taken | Reuse a built-in strip with a vertex colour, or restyle an unused built-in strip in your `SheetRecipe` |
| `T3D_TEXTURE_MISSING` | texture-backed materials when painting the sheet | A pinned texture (by sha256) is not in the texture cache | `bun run textures <module defining the material>`, then `provideTextures(await loadTextureCache())` |
| `T3D_SVG_INVALID` | `svgPath`, SVG primitives | SVG path data that does not parse; the message gives the offending position | Fix the path data at the printed position (`M`/`L`/`C`/`A`… with numeric arguments) |
| `T3D_ART_SILHOUETTE` | `silhouetteReads`, `assertArt` (/testing); `art-silhouette` finding in `t3d critique` | LOD2's 32-px solid silhouette from front, side or 3/4 matches LOD0's at soft IoU < 0.85: a mass vanishes or the whole shape shrinks at distance | Keep every big mass and the full extent at LOD2; gate segments and small parts on `ctx.lod`, never whole bodies, limbs or extents |
| `T3D_ART_FOCAL` | `focalPoint`, `assertArt` | The densest cluster of top-5 % local value contrast (greyscale beauty render) is not on the declared `art.focal` part(s), and < 30 % of those pixels are | Raise value contrast on the focal part (darker recesses, lighter planes, sharper detail) and calm the part the message names |
| `T3D_ART_REST` | `restAreas`, `assertArt` | Calm surface (few creases, little bend, < 1 triangle/pixel) covers less than `art.restShare` (default 25 %) of the visible asset, or per-cell detail is uniform (spread < 0.3) | Leave broad planes plain; cluster detail at joints, edges and the focal area |
| `T3D_ART_GROUNDED` | `grounded`, `assertArt` (kinds `character`/`creature`, or `art.grounded: true`) | Mean render luminance falls from base to top (least-squares rise < 0) | Darken the lower body (boots, hem, legs, grime) and keep head and shoulders lighter |
| `T3D_ART_SHAPE` | `shapeLanguage`, `assertArt` | The silhouette's measured class (acute-corner share, straight share) differs from the declared `art.shape` | Sharpen (aggressive), round (friendly) or square (stable) the outline as the printed `fix:` says |
| `T3D_AUDIO_INVALID` | `sound.impact` / `engine` / `mechanism` / `ui`, `encodeWav`, `toGlb` / `soundFiles` (sound sources) | A generator option out of range (size, force, rpm, cylinders, speed…), a firing order that is not a permutation of 1..n, a clip name that is not snake_case, a part with `sound.onMotion` but no `motion`, or a sound source merged away (no node of its own) | The printed `fix:` gives the valid range or a literal option; put sounds on an emitter, a group or a moving part |
| `T3D_AUDIO_MATERIAL` | `sound.impact`, `sound.mechanism` | No acoustic data for the material | Use an `ACOUSTICS` id (steel, cast_iron, brass, aluminium, oak, pine, glass, ceramic, stone, concrete, rubber, plastic) or a mapped strip id (`iron_cast`, `steel_painted`, `wood_painted`…) |
| `T3D_AUDIO_CONFLICT` | `toGlb`, `soundFiles` | Two different clips share one name, so one `<name>.wav` would overwrite the other | Give one its own `name:` |
| `T3D_WARP_INVALID` | `warpTPS`, `tpsWarp` | Landmark lists of different lengths, fewer than 4 landmarks, a non-finite coordinate, a negative stiffness, or landmarks that pin no 3D frame (all coplanar / duplicated) so the spline system is singular | Pass matching `from`/`to` lists of ≥ 4 points spanning 3D (not all on one plane), remove duplicates, or raise `stiffness` above 0 |
| `T3D_TUNE_INVALID` | `defineAsset` (`tune`), `ctx.tuned`, `compile({ tuned })`, `tune`, `loadMasks`, `t3d tune` | A tune param with min ≥ max, a non-finite bound, a default outside its range or a step ≤ 0; no params or no objectives; `ctx.tuned` of an undeclared name; a tune.json value that is out of range or names a param the recipe no longer declares; a silhouette mask that is neither `<svg>` markup nor a readable `.svg`/`.png` beside the recipe; a `measures` objective without `real.measures`; a custom objective returning a non-finite number; `--evals` < 1, `--seed` < 0 or `--method` other than `cmaes`/`coordinate` | Fix the declaration as the printed `fix:` says; for a stale tune.json re-run `t3d tune` (never edit it by hand) |
| `T3D_DATA_QID` | `checkQid`, `parseWikidata`, `readWikidata`, `bun run data wikidata` | Not a Wikidata item id (`Q` + digits), the item is missing/deleted (404 or no entity in the response), or a committed file is not a `ts23d-wikidata/1` record | Pass the Q-number from the item page (`Q243`); re-pin with `bun run data wikidata <QID> --out recipes/<name>/data` |
| `T3D_DATA_PROPERTY` | `quantity`, `realFrom` (/data) | The pinned record lacks a quantity the recipe maps (no `width` statement on the item); the message lists what it has | Take that number from another source and cite it, or add the statement on Wikidata and re-pin |
| `T3D_DATA_UNIT` | `parseWikidata`, `toSi` | A statement uses a unit with no exact SI factor in `WIKIDATA_UNITS`, or a unit of the wrong dimension (a mass unit on a length) | Add the unit's exact factor to `src/data/units.ts` after checking its item page; a mis-typed statement is fixed upstream or mapped to another property |
| `T3D_DATA_HASH` | `verifyPin`, `decodeDem`, `terrainFromDEM`, `bun run data verify` | Pinned bytes do not hash to their recorded sha256: the committed heights or a cached response were edited, truncated or swapped | Restore the committed file, or re-pin on purpose with `bun run data …` and review the diff |
| `T3D_DATA_DEM` | `encodeDem`, `decodeDem`, `readDem`, `tilesFor`, `resampleTerrarium`, `bun run data dem` | A DEM file of another format or truncated; a box out of range (lat ±85°, 1 m–200 km, cells 2–4096, zoom 0–15); a tile that is not 256²; relief too tall for 16 bits at the step; a box outside the conterminous US fetched without `--license` and `--attribution` | Re-pin with `bun run data dem …`; for regional sources look up the required credit in tilezen/joerd `docs/attribution.md` and pass both flags |
| `T3D_FINISH_INVALID` | `finishAsset`, `buildAtlas`, `httpFinish`, `withFinishLayer`, `t3d finish` flags | Finish asked of a LOD other than 0 or a variant preview; an empty prompt; an asset with no opaque unpainted part; charts that do not fit the atlas; an endpoint that is not http(s); `--model` other than mock/http, `--views` outside 1–24, `--atlas` outside 256–4096; `--model http` without `--endpoint`/`--prompt`; a GLB without LOD0 trim primitives | The printed `fix:`: finish `compile(asset, { lod: 0 })`, describe the surface, raise `--atlas`, pass a URL |
| `T3D_FINISH_MODEL` | `httpFinish`, `decodeViews` (/finish) | The model server failed (network, HTTP status, non-JSON, no `images` array), or returned the wrong number of images, a non-PNG, or images of another size than the control maps | Start the server and make it answer `{ images: [base64 PNG per view] }` at the control-map size (docs/idea/22-ai-finish.md), or use `--model mock` |
| `T3D_FINISH_PALETTE_DRIFT` | `assertFinish`, `finishedGlb` (finish QA finding) | A part's mean colour moved more than ΔE76 25 (`maxDeltaE`) from its declared base colour: the model repainted it | Ask for weathering, not a repaint: name the base colours in the prompt/palette; raise `maxDeltaE` only deliberately |
| `T3D_FINISH_MASK_LEAK` | `assertFinish`, `finishedGlb` (finish QA finding) | Baked colour came from another part's pixels (only with `mask: false`), or a model image paints > 20 % of the 2-px ring outside the silhouette: it does not line up with the control maps | Keep part masking on; condition the model on depth + normal at full strength with the given cameras and a flat background |
| `T3D_IMPORT_GLB` | `importGlb`, `readGlb` | Malformed GLB: bad magic, truncated chunk, accessor out of range | Re-export the file as glTF 2.0 binary; check it with the Khronos validator |
| `T3D_IMPORT_UNSUPPORTED` | `importGlb` | Draco/meshopt compression, sparse accessors, external URIs, unusual PNGs or axes | Re-export uncompressed with embedded buffers and textures |
| `T3D_IMPORT_EMPTY` | `importGlb` | The scene has no triangle primitives | Export the mesh, not an empty node tree |
| `T3D_IMPORT_LICENSE` | `importGlb`, `checkLicence` | Unknown or non-commercial licence | Use a CC0/CC-BY source, or pass `allowNonCommercial: true` for private work |
| `T3D_IMPORT_HASH` | `importGlb` | Bytes do not match the pinned `sha256` | Re-download the pinned file, or re-pin after checking the new one |
| `T3D_IMPORT_MISSING` | `importGlb` | The pinned file is not in the import cache | `bun scripts/import.ts cache <file>` |
| `T3D_SIMPLIFY_INVALID` | `simplify` | Target triangle count below 4 or above the input, or a non-manifold input | Pass a sensible `targetTris`; run `cleanMesh` first |
| `T3D_BAKE_INVALID` | `bakeNormals` | Bad map size, low mesh without UVs, or no ray hits | Size 64–4096, give the low mesh UVs, widen `cage` |
| `T3D_REFINE_FAILED` | `refine` | The refine endpoint failed, replied malformed, or missed the cache offline | Check the endpoint; run once online to fill the cache |

## CLI codes

Thrown by `t3d` itself. Like every code they print as `T3D_…: cause` + `fix:`; with `--json` the envelope goes to **stdout** (never stderr), one JSON object; exit 2 for `T3D_CLI_USAGE`, exit 1 otherwise.

| Code | Where | Cause | Fix |
|---|---|---|---|
| `T3D_NO_ASSET_EXPORT` | CLI loader | The module exports no `defineAsset` result | `export const my_thing = defineAsset({ … })`. Named export, no default |
| `T3D_RECIPE_NOT_FOUND` | CLI loader | The recipe path does not exist | The `fix:` prints the path tried and the nearest `recipes/*/` match |
| `T3D_RECIPE_THREW` | CLI loader / build | Importing or building the recipe threw something that is not a `Ts23dError` | The `fix:` prints the message and the first stack frame inside the recipe file |
| `T3D_CLI_USAGE` | every `t3d` command | Unknown command or flag, a missing value, a value outside its allowed set | The `fix:` lists the valid flags / values for that command |
| `T3D_ASSET_DUPLICATE` | `t3d` commands that scan many recipes | Two files export an asset with the same name (one GLB would overwrite the other) | The `fix:` names both files; rename one asset |

`T3D_TEAM_COLOUR_HIDDEN` (`t3d icon`, `src/cli/icon-cmd.ts`) is a review **warning** in the icon result, not a throw: team colour covers under the minimum share of the LOD2 silhouette from the RTS camera. Fix: put `paint: 'team'` on large top-facing parts and keep them at LOD2.

## Repo tooling codes

In `ErrorCode`, raised by this repo's scripts and test tooling rather than by the library at runtime.

| Code | Where | Cause | Fix |
|---|---|---|---|
| `T3D_AMBIENT_RANDOM` | Test preload (`scripts/test-setup.ts`) | Code under test called `Math.random` | Use `ctx.rng` or `createRng(seed)` |
| `T3D_RELEASE` | `scripts/release.ts` | Bad version string, missing `## [Unreleased]`, or tree not stamped at the version | The printed `fix:` (usually `bun run release <x.y.z>`) |
| `T3D_BENCH` | `scripts/bench.ts --write` | `README.md` has no bench block | The printed `fix:`; the markers are `<!-- bench:start -->` / `<!-- bench:end -->` on their own lines |

Guards (`boundaries`, `determinism`, `filesize`, `recipes`) print `file:line`, message and `fix:` without a code.

## QA findings are not errors

A gate returns `Finding { gate, code, part?, message, fix }` (code: [Finding codes](#finding-codes)). Findings don't throw; `t3d build` prints them all and exits 1. Gate list: [06-qa](../idea/06-qa.md). The `/testing` assertions (`assertNoGaps`, `assertTouches`, `assertFlush`, the mesh/image/sheet helpers of [15-testing](../idea/15-testing.md) among them) turn findings into one `T3D_QA_FAILED` that lists each finding's code. Bad inputs to them are `T3D_ASSERT_INPUT`.

## Finding codes

QA findings carry a code too (outside the `ErrorCode` union, like `T3D_CONNECT_*`). A gate whose message already embeds a `T3D_*` code (connections, joints, mass, weather) uses that code; every other gate uses `T3D_QA_<GATE>`, the gate name in upper snake case (`floating-parts` → `T3D_QA_FLOATING_PARTS`).

| Gate (`DEFAULT_GATES`, `src/qa/gates.ts`) | Finding code |
|---|---|
| `triangle-budget` | `T3D_QA_TRIANGLE_BUDGET` |
| `floating-parts` | `T3D_QA_FLOATING_PARTS` |
| `connections` | `T3D_CONNECT_*` (below) |
| `gaps` | `T3D_QA_GAPS` |
| `clashes` | `T3D_QA_CLASHES` |
| `treads` | `T3D_QA_TREADS` |
| `part-names` | `T3D_QA_PART_NAMES` |
| `proportions` | `T3D_QA_PROPORTIONS` |
| `measures` | `T3D_QA_MEASURES` |
| `joints` | `T3D_JOINT_*` (library table) |
| `mass` | `T3D_MASS_MISMATCH` |
| `check` (recipe `checks`) | `T3D_QA_CHECK` |
| `non-finite` | `T3D_QA_NON_FINITE` |
| `vertex-colors` | `T3D_QA_VERTEX_COLORS` |
| `hidden-parts` | `T3D_QA_HIDDEN_PARTS` |
| `normals-winding` | `T3D_QA_NORMALS_WINDING` |
| `degenerate-triangles` | `T3D_QA_DEGENERATE_TRIANGLES` |
| `weather` | `T3D_WEATHER_*` (below) |

| Gate (`DEFAULT_LOD_GATES`, `src/qa/lods.ts`) | Finding code |
|---|---|
| `lod-triangles` | `T3D_QA_LOD_TRIANGLES` |

Computed by `t3d build`, not a gate function: `T3D_QA_DRAW_CALLS`, draw calls of a LOD above `budget.draws`. Opt-in gates follow the same rule: `z-fighting` → `T3D_QA_Z_FIGHTING`, `lod-silhouette` → `T3D_QA_LOD_SILHOUETTE`, `lod-pivots` → `T3D_QA_LOD_PIVOTS`. The critique attestation (`critiqueFindings`, `src/qa/critique.ts`) reports `T3D_QA_CRITIQUE`: missing, malformed, stale or under-scored `critique.json`.

Kind checks that `defineCreature` adds to `checks` report under the `check` gate as `T3D_QA_CHECK`, told apart by the message prefix (`src/kinds/creature-biology.ts`):

| Message prefix | Check | Cause | Fix |
|---|---|---|---|
| `balance:` | `balanced` | The centre of mass projects outside the support polygon of the feet | Move the feet under the body or shift head/tail mass back over them |
| `fore share:` | `foreShareCheck` (quadrupeds) | The forelegs carry a share of the standing weight outside the spec's `foreShare` / family band (default 55–66 %; dog 60.4 %, horse 57–60 %, `equid` 55–62 %) | The printed `fix:` gives the target centre-of-mass x: lighten or shorten the tail and hindquarters (rear-heavy), or the head and neck (front-heavy); or move the feet |

### Assertion finding codes (`/testing`)

Each assertion collects findings with these codes and throws one `T3D_QA_FAILED` listing them (the `T3D_ART_*`, `T3D_CONNECT_*` and gate codes above are reused where an assertion wraps a gate).

| Code | Assertion | Cause |
|---|---|---|
| `T3D_QA_BUDGET` | `assertBudget` | triangles at a LOD above the cap |
| `T3D_QA_PARTS` | `assertParts` | no part matches a required name or glob |
| `T3D_QA_MEASURE` | `assertMeasure` | a `measures` entry is out of tolerance, or matches no part |
| `T3D_QA_SIZE` | `assertSize` | overall length / width / height outside the wanted range |
| `T3D_QA_BETWEEN` | `assertBetween` | distance between two parts outside the range, or a name matches nothing |
| `T3D_QA_TOUCHES` | `assertTouches` | two parts do not touch, or a name matches nothing |
| `T3D_QA_FLUSH` | `assertFlush` | two parts never meet flush (from the given view) |
| `T3D_QA_GROWN` | `assertGrown` | no part with geometry matches the grown part's name |
| `T3D_QA_GROUND` | `assertUprightOnGround` | a part reaches below z = 0, or the lowest point floats above it |
| `T3D_QA_BALANCE` | `assertCentreOfMassInside` | centre of mass outside the ground contact polygon |
| `T3D_QA_MOTION` | `assertPartMotionClear` | no part matches the name, or it has no motion to sweep (a swept clash is `T3D_QA_CLASHES`) |
| `T3D_QA_CLOSED` | `assertClosed` | a part's surface has open (boundary) edges |
| `T3D_QA_MANIFOLD` | `assertManifold` | edges shared by 3+ triangles |
| `T3D_QA_OUTWARD` | `assertOutward` | inward-facing triangles |
| `T3D_QA_SELF_INTERSECTION` | `assertNoSelfIntersection` | a part folds through itself |
| `T3D_QA_SYMMETRIC` | `assertSymmetric` | surface with no mirror across the axis |
| `T3D_QA_THICKNESS` | `assertMinThickness` | a wall thinner than the minimum |
| `T3D_QA_POLYGON` | `assertPolygonValid` (`polygonFindings`) | degenerate, crossing or mis-wound contour |
| `T3D_QA_NOT_EMPTY` | `assertNotEmpty` | a rendered view is (almost) empty |
| `T3D_QA_IMAGE_CLOSE` | `expectImageClose` | a render differs from its golden beyond tolerance (diff PNG written) |
| `T3D_QA_SILHOUETTE` | `assertSilhouetteMatches` | outline IoU against the reference mask below the minimum |
| `T3D_QA_HOLES` | `assertNoHoles` | see-through holes inside the outline |
| `T3D_QA_TILEABLE` | `assertTileable` | a texture's wrap seam jumps |
| `T3D_QA_BLEED` | `assertNoBleed` | a trim-sheet strip's pixel rows differ from its edge row (mips mix strips) |
| `T3D_QA_VALUES` | `assertValueRange` | mean albedo outside the plausible sRGB range |
| `T3D_QA_TEXEL_DENSITY` | `assertTexelDensity` | a part's px/m outside the wanted range |

### Weathering (`weather` gate, `T3D_WEATHER_*`)

| Code | Cause | Fix |
|---|---|---|
| `T3D_WEATHER_COVERAGE` | a weathering effect's measured coverage misses its declared `amount` beyond tolerance | check the selector matches enough surface, or adjust `amount` |
| `T3D_WEATHER_NO_SURFACE` | an effect's `where` selector matched no surface | pick a selector that exists on this geometry (see `WEATHER_SELECTORS`) |
| `T3D_WEATHER_MISPLACED` | an effect landed where physics says it can't (dust on undersides, moss on sunlit tops) | tighten the selector, e.g. `up-facing & !shaded` |
| `T3D_WEATHER_STREAK_UP` | a streak segment flows upward | streak sources must sit above the surface they run down; check `fasteners` positions |
| `T3D_WEATHER_SHAPE` | a dent/sag/warp exceeds its declared `max` or appears at LOD2 | lower `depth`/`max`; shape effects are LOD0/1 only |

### Connections (`connections` gate, `T3D_CONNECT_*`)

Gate findings start with the code (`T3D_CONNECT_POINT: …`); `T3D_CONNECT_INVALID` for `connect: { as: 'free' }`
without a `why` is thrown by `compile`. Every finding draws on `connectionsOverlay(asset)`.

| Code | Cause | Fix |
|---|---|---|
| `T3D_CONNECT_INVALID` | `connect: { as: 'free' }` without `why` (thrown), or `connect.to` names no part (finding) | Say why it is loose; name an existing part (globs ok, `ctx.use` prefixes added) |
| `T3D_CONNECT_ISLAND` | A piece (a shell of a part — merged meshes hide them) comes within 2 cm of nothing that holds it | Move/extend it into its holder by the printed distance, or drop it |
| `T3D_CONNECT_POINT` | A piece or cluster touches its holders only at points or edges: contact below 10 % of its section² and no span between two contacts | Seat it on a face (sink it ≥ the printed depth), or declare `connect: { as: 'rest' \| 'hinge' }` |
| `T3D_CONNECT_GLUED` | A `grown` piece sits on its parent: part of its root ring is not buried ≥ δ (10 % of root radius, 2 mm–2 cm) | Sink the root by the printed depth along the printed axis |
| `T3D_CONNECT_CREASE` | A `grown` piece (horn, spine, ear, wing, tail; not teeth/claws) leaves its parent at a hard angle (median normal jump > 55°): no boss or fillet | Grow a boss / flared base with the printed blend radius, or merge the root into the sculpt |
| `T3D_CONNECT_POKE` | A `grown` piece comes out through the far side of its parent, or runs > 5 % of its surface into an unrelated part | Shorten or re-aim it; or declare `connect.to` the part it really grows from |
| `T3D_CONNECT_BURIED` | Warning: > 60 % of a grown piece's length is inside its parent | Pull it out or shorten the root |
| `T3D_CONNECT_SOCKET` | A `socket` piece is < 25 % seated in its holder | Sink it deeper or declare it welded/rest |
| `T3D_CONNECT_EYE_EXPOSED` | An eyeball is < 50 % enclosed by the head (inside it, or covered along its normal) | Push it back into the orbit / deepen the socket |
| `T3D_CONNECT_EYE_STARE` | Visible sclera above the iris > 15 % of the visible iris: the upper lid does not reach it | Lower the upper lid by the printed amount |
| `T3D_CONNECT_EYE_GAZE` | A left/right pair is > 6° off mirror-symmetric, or (characters) diverges > 2° (wall-eyed) | Aim both pupils at one point in front of the face |
| `T3D_CONNECT_SEAM` | A concave crease line inside one sculpted mesh (organic kinds): smooth-shaded fold with a radius of curvature < 1.5 % of the mesh size, ≥ 4 % of it long | Raise the blend radius between the edits that meet there, or declare it in `creases` |

## Adding a code

1. Add it to `ErrorCode` in `src/core/errors.ts`. `T3D_` + area + problem, upper snake case.
2. Throw `new Ts23dError(code, { cause, fix })`. `cause` names the offending value; `fix` is an action, ideally a literal snippet.
3. Add a row here in the same PR.
4. Never rename or reuse a code. Retire by leaving it in the union, documented as unused.
