# 01 — Core contracts (tier 0)

Rule: a recipe option that cannot produce a valid asset fails at `defineAsset` / `compile`, coded.

## Files
| Path | State | Why |
|---|---|---|
| `src/core/errors.ts` | changed | new codes for the whole plan (the only slice that edits the union) |
| `src/core/validate-asset.ts` + `.test.ts` | new | definition checks; `asset.ts` is 221 LOC, keep it under the ceiling |
| `src/core/asset.ts`, `asset.test.ts` | changed | call the validator; `lod` / `seed` checks; `ctx.use` child seed |
| `src/core/definition.ts` | changed | `why` on measures / `real`; `budget.draws?` |
| `src/core/define-part-place.ts`, `define-part.ts`, `define-part.test.ts` | changed | mirrored motion axis; `PartLodPolicy.map` check |
| `src/core/rng.ts`, `rng.test.ts` | changed | integer seed; coded `pick([])` |
| `src/core/tune.ts`, `tune.test.ts` | changed | own-property lookup |
| `src/core/mesh.ts`, `mesh.test.ts` | changed | `boundsOf(empty)` |
| `docs/architecture/errors.md` | changed | full catalogue, including codes other slices throw |
| `recipes/dragon/dragon.ts` | changed | `why` on its three wide tolerances (lines 83, 105, 135) |

## Depends on
Nothing. Wave 1; every other slice imports the codes added here.

## Change
New `ErrorCode` members (stable once shipped):

| Code | Thrown by | `fix:` text says |
|---|---|---|
| `T3D_RECIPE_NOT_FOUND` | slice 07 | the path tried + nearest `recipes/*/` match |
| `T3D_RECIPE_THREW` | slice 07 | message + first stack frame inside the recipe file |
| `T3D_CLI_USAGE` | slice 07 | the valid flags / values for that command |
| `T3D_ASSET_DUPLICATE` | slice 07 | both files exporting the name |
| `T3D_GRAMMAR_UNDERFILL` | slice 02 | add a flex (`~`) or repeat (`{…}*`) term |
| `T3D_TEAM_COLOUR_HIDDEN` | `src/cli/icon-cmd.ts:62` (already thrown as a raw string) | unchanged text |

Validation in `validate-asset.ts`, all `T3D_RECIPE_INVALID`:
- `name` non-empty; `budget` present with finite positive `triangles`; `budget.draws` if set is an integer ≥ 1.
- `seed` is a finite integer (also in `compile` and `ctx.use` options).
- Each measure: `value > 0`; `tolerance` finite, `0 < t ≤ 0.5`; `tolerance` above the gate default (0.02 measures, 0.05 `real` proportions; read the constants from where `src/qa/measures.ts:47` and `src/qa/gates.ts:79` get them, moving them to core if they live in qa) requires a non-empty `why`. Same for every `real` dimension (`> 0`).
- Part / group name `body` is reserved (`src/export/merge-pivots.ts:73` `ROOT`); fix text: "rename the group; `body` is the merged static root".
- `compile(asset, { lod })`: `lod ∈ {0, 1, 2}`.

Behaviour fixes:
- `rotateMotion` (`define-part-place.ts:31-35`): for `spin` / `sway`, axis = sign(det of the placement's linear part) · linear(axis), normalised.
- `ctx.use` (`asset.ts:105`): child seed = `o.seed ?? child.seed ?? fork(parentSeed, prefix)`, where the fork hashes the prefix so sibling instances and the parent draw different streams. Byte output of recipes using `ctx.use` with rng changes once.
- `createRng`: non-integer or non-finite seed → `T3D_RECIPE_INVALID`. `pick([])` → `Ts23dError('T3D_RECIPE_INVALID')`.
- `tune.ts:118,165`: `Object.hasOwn` instead of `in` / index.
- `boundsOf` on an empty mesh returns zero-size bounds at the origin; doc comment says so.

`errors.md`: add the 6 undocumented union codes (`T3D_MATERIAL_CONFLICT`, `T3D_MATERIAL_INVALID`, `T3D_MATERIAL_UNKNOWN`, `T3D_SHEET_FULL`, `T3D_SVG_INVALID`, `T3D_TEXTURE_MISSING`), the new codes above, and a "Finding codes" section listing `T3D_QA_<GATE>` for every gate in `DEFAULT_GATES` and `DEFAULT_LOD_GATES` (naming rule in slice 05). State that `--json` errors print on stdout (slice 07).

## Tests
Failure case first, each beside its source:
- Mirrored `oneWay` sway: `placePiece({ motion: sway axis [0,0,1] 90° }, { scale: [-1,1,1] })` → axis `[0,0,-1]`; the unmirrored case keeps `[0,0,1]`.
- `use` of a child with `seed: 42` draws the same first value as compiling the child alone; two prefixed instances without seeds differ from each other and from the parent.
- `compile(asset, { lod: 3 })`, `seed: 1.7`, missing `budget`, `tolerance: 5`, `tolerance: 0.3` without `why`, measure `value: 0`, group named `body` → each `T3D_RECIPE_INVALID` with a `fix`.
- `pick([])` throws `Ts23dError`; `ctx.tuned('constructor')` is rejected; `boundsOf(empty)` has finite size 0.

## Checks
`bun test src/core` · `bun run verify --only lint,typecheck,boundaries,filesize` ·
`bun run t3d build recipes/dragon/dragon.ts --out out` QA PASS.

## Docs
`docs/architecture/errors.md` (this slice). CHANGELOG and defect rows are slice 11 (D26 mirrored
motion, D27 shared rng stream under `use`, D28 unbounded tolerance).

## Done when
Every listed input throws a coded error; mirrored hinges swing as the mirror image; `errors.md`
lists every member of `ErrorCode` and every finding code.
