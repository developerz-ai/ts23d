# 07 — CLI (tier 5)

Rule: every `t3d` exit is 0, a QA failure with findings, or one coded error with a `fix:`; with
`--json`, exactly one JSON envelope on stdout.

## Files
| Path | State | Why |
|---|---|---|
| `src/cli/run.ts`, `run.test.ts` | changed | error wrapping, LOD QA, duplicate names, index merge |
| `src/cli/build-one.ts` + `.test.ts` | new | `buildOne` moved out: `run.ts` is 286 LOC against a 300 ceiling |
| `src/cli/report.ts` + `.test.ts` | new | envelope + finding printing (fold LODs) |
| `src/cli/args.ts`, `args.test.ts` | changed | strict flags, per-command help, `--version`, `--timeout` |
| `src/cli/load.ts` + test | changed | not-found / load errors |
| `src/cli/bin.ts` | changed | exit codes, stream choice |
| `src/cli/manifest.ts` + test | changed | relative paths, per-LOD keys, `draws` budget |
| `src/cli/icon-cmd.ts` | changed | `T3D_TEAM_COLOUR_HIDDEN` now typed by the union |
| `src/cli/finish-cmd.ts` | changed | pass `--timeout` to the HTTP model |

## Depends on
01 (codes, `budget.draws`), 05 (`Finding.code` / `gap`), 04 (`timeoutMs`), 06 (manifest parent, if handed over).

## Change
Errors:
- `load.ts:8`: missing file → `T3D_RECIPE_NOT_FOUND`; syntax / import failure → `T3D_RECIPE_THREW` with the module error as cause.
- `run.ts` `fail` (~176-178) rethrows non-`Ts23dError`: wrap anything thrown inside `build()` as `T3D_RECIPE_THREW`, cause = message + first stack frame inside the recipe file.
- Multi-recipe runs collect per-asset errors into `data[]` and continue; exit 1 if any failed.

Flags (`args.ts` ~163-194 and the trailing `else files.push(a)`):
- Unknown `--flag` → `T3D_CLI_USAGE`; `--sheet`, `--lods`, `--sheet-size` outside their sets → `T3D_CLI_USAGE` naming the set; `--out` without a value → `T3D_CLI_USAGE`.
- `t3d --help`, `-h`, `t3d <cmd> --help` → exit 0; `t3d --version` prints the version from `src/export/version.ts`; unknown command → `T3D_CLI_USAGE` with the closest command name, exit 2, usage on stderr.
- `--animations` listed in help; `--sheet-size 2048` note says ~3 s.

Output:
- `--json`: `{ ok, data }` or `{ ok: false, error: { code, message, fix } }` on **stdout** for every command, including thrown errors (today on stderr) and `list` (today NDJSON). Human text goes to stderr under `--json`.
- Findings identical across LODs print once as `LOD0-2`; each line shows `code`, and `gap` / `nearest` when present.

Build:
- `buildOne` adds `runLodQa(lods)` findings when more than one LOD is built (`run.ts:~61-63`). Repro: an asset picking 8 / 32 / 128 segments for LOD0 / 1 / 2 prints `QA PASS tris 32/128/512` today.
- `budget.draws` set and exceeded at any LOD → finding `T3D_QA_DRAW_CALLS` (computed here because draws exist only after export's merge; qa cannot import export sideways).
- Two exported assets with one `name` → `T3D_ASSET_DUPLICATE` (`run.ts:56`). `index.json` (~262) merges with the existing file, keyed by asset name, sorted.
- `manifest.json` paths relative to `<out>/<asset>/`; arrays that are per-LOD become keyed by LOD so `--lods 0` is unambiguous. Check `apps/site` and `scripts/recipes.ts` readers of the manifest before changing shape; if either reads the arrays, keep the array and add `lods: [0]` beside it instead.

Node: no port. Help text and the bin header state "requires Bun" (decision in overview).

## Tests
Spawn `bun src/cli/bin.ts` in `run.test.ts`, failure first:
- Missing file, recipe that throws, recipe without `budget`, `--nope`, `--lods 7`, trailing `--out`, `biuld` → exit code, one code, non-empty `fix`, no `at ` stack lines.
- Same seven with `--json` → stdout parses as one JSON object with `ok: false`; stderr has no JSON.
- `--help`, `build --help`, `--version` → exit 0.
- The 8 / 32 / 128 asset → exit 1 with `lod-triangles` findings.
- Two builds into two absolute `--out` dirs → `manifest.json` byte-identical.
- Duplicate asset name → error; building A then B into one `--out` leaves both in `index.json`.

## Checks
`bun test src/cli` · `bun run verify --only lint,typecheck,boundaries,filesize` ·
`bun run t3d build recipes/t34/t34.ts --out out` QA PASS · `bun run verify --only recipes`
(LOD QA is new in `build`; `scripts/recipes.ts` already ran it, so no recipe should newly fail).

## Docs
Slice 11: README CLI section, `docs/architecture/errors.md` is already updated by 01; defect rows
D38 (`t3d build` skipped LOD gates), D39 (uncoded CLI failures / flags read as files).

## Done when
The seven bad invocations each print one coded error; `run.ts` and its new siblings are each < 300
LOC; manifests are location-independent.
