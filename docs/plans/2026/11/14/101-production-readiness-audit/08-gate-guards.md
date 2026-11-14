# 08 — Gate guards (scripts)

Rule: the gate cannot pass vacuously, and each rule in `CLAUDE.md` that a script can check has one.

## Files
| Path | State | Why |
|---|---|---|
| `scripts/verify.ts` + `verify.test.ts` (new) | changed | reject unknown / empty `--only`; add `conventions`, `pack` steps |
| `scripts/conventions.ts` + `.test.ts` | new | bare-error, header, errors-doc, simplify, real-sources checks |
| `scripts/recipes.ts` + `recipes.test.ts` (new) | changed | `sheet.png` required; run the shard's recipe tests |
| `scripts/ci-parity.test.ts` | changed | pins the new step list |
| `scripts/lib/critique.ts`, `critique.test.ts` | changed | enforce date |
| `lefthook.yml` | changed | fast pre-push |
| `.gitignore` | changed | `/review/`, `/critique/` |

## Depends on
01 (`errors.md` complete; `rng.ts` bare error gone), 05 (`src/testing/measure.ts` bare error gone),
09 (`scripts/pack-smoke.ts` exists before the `pack` step is listed).

## Change
`verify.ts` (`STEPS` at line 10, `--only` parsing at 27-31):
- Unknown step name, or `--only` with no value → exit 2, message lists valid steps; with `--json`, `{ ok: false, error }`. Today `--only lnt --json` prints `{"ok":true,"results":[]}`.
- New steps, order: lint · typecheck · boundaries · determinism · filesize · placeholders · **conventions** · test · recipes · build · **pack**. `pack` runs `scripts/pack-smoke.ts` and, like every non-`recipes` step, only on shard 1.

`conventions.ts` — one script, each check prints `file:line`, the rule and a `fix:`:

| Check | Rule source | Scope |
|---|---|---|
| No `new Error(` / `RangeError(` / `TypeError(` | "No bare `Error` in `src/`" | `src/**`, tests excluded |
| First line is a comment | "header comment states the job" | `src/**/*.ts`, `scripts/**/*.ts`, tests and `index.ts` excluded |
| Every `ErrorCode` member and every `'T3D_…'` literal in `src/` appears in `docs/architecture/errors.md`; every code in `errors.md` exists in `src/` | errors catalogue | env-var names (`T3D_SHARD`, `T3D_UPDATE_GOLDEN`) allowlisted |
| `simplify(` only in files that also call `importGlb` | "LOD-gate, never decimate" (ADR 011) | `recipes/**`, `src/kinds/**` |
| Recipes whose `kind` is a vehicle or building kind declare `real`, `sources`, `measures` | "Real units and references" | `recipes/*/<name>.ts`; take the kind list from `src/kinds/index.ts` |
| Each defect-catalogue row marked `shipped` names a path that exists | "Enforce rules" | `docs/architecture/defect-catalogue.md` |

Existing violations found by a new check: fix when they sit in a file this slice owns; otherwise
start that check with an explicit allowlist in `conventions.ts`, each entry carrying the owning
slice or a reason. No silent skip.

`recipes.ts` (`:90`): require `sheet.png` beside `hero.png` and `manifest.json`; after the build
checks, run `bun test` on the `*.test.ts` files of the recipes in this shard (16 files exist under
`recipes/`, none run today; `recipes/_lib` and `recipes/_parts` tests run on shard 1).

`critique.ts:14`: keep `CRITIQUE_MODE = 'warn'` but add `ENFORCE_FROM = '2027-01-15'`; after that
date the mode is `enforce` unless the constant is edited. 14 of 64 manifests lack `critique.json`:
the script lists them on every run.

`lefthook.yml`: pre-push runs `bun run verify --only lint,typecheck,boundaries,determinism,filesize,placeholders,conventions`; the full gate stays in CI.

## Tests
- `verify.test.ts`: `--only lnt` → exit 2; bare `--only` → exit 2; `--only lint` runs exactly one step.
- `conventions.test.ts`: one temp-dir fixture per check that fails it, then one that passes.
- `recipes.test.ts`: fixture recipe folder without `sheet.png` → reported.
- `ci-parity.test.ts`: `STEPS` names equal the documented gate order.

## Checks
`bun test scripts` · `bun run verify --only conventions` · `bun run verify --only lnt; echo $?` → 2 ·
`T3D_SHARD=3/12 bun run verify --only recipes` runs that shard's recipe tests.

## Docs
Slice 11: `CLAUDE.md` gate order + commands table, `CONTRIBUTING.md` gate table, defect row D40
(gate passes with zero steps / recipe tests never ran).

## Done when
A typo cannot produce a green gate; recipe tests run in CI; every checkable rule has a line in
`conventions.ts`.
