# 101 — Production-readiness audit: fix what a full scan found

## Goal
After this plan an agent can trust every green: bad input fails with a coded `fix:` instead of
building wrong geometry, QA and the exported GLB agree, the CLI never prints a raw stack, the gate
cannot pass vacuously, and the published tarball is tested as a consumer installs it.

## Roadmap
Cross-cutting hardening; no single milestone owns it. Touches `docs/plans/roadmap.md`:

| Line | Item | Effect |
|---|---|---|
| 37 | M0 "First npm publish" | tick: 0.4.0 is on npm with provenance |
| 5 | "Status as of 2026-11-07" | re-date |
| 156 | critique gate ticked while `CRITIQUE_MODE = 'warn'` | add the enforce date decided in slice 08 |
| new | M0 "Hardening sweep (plan 101)" | add + tick when this plan completes |

Not shipped here: line 49 (cross-machine determinism), line 144 (`licence` check), any `planned.ts`
stub. `src/kinds/planned.ts` is empty; `localGenerator`, `kubeezImages`, `silhouetteIoU`,
`photoMatch` stay `notImplemented()`.

## Baseline (2026-11-14, `main` @ 5e1180f)
`bun run verify --json` → all 9 steps ok. `test` 71 s, `recipes` 494 s unsharded, the rest < 1 s.
Every finding below is a defect the green gate does not see.

## Falsified
| Claim | Where | Found |
|---|---|---|
| "One draw call per asset" | `CLAUDE.md` Rules first | `t3d build recipes/t34/t34.ts` prints `draws 19/19/19`; `docs/idea/01-vision.md:37` says draws = moving parts. Nothing checks either |
| "Every error has a code and `fix:`" | `CLAUDE.md` | missing file, throwing recipe, missing `budget` → raw Bun stack; QA findings have `fix` but no code; bare `RangeError` at `src/core/rng.ts:36`, `src/testing/measure.ts:15` |
| `assertQaPass` is "the same gate `t3d build` runs" | `src/testing` | `t3d build` never calls `runLodQa`; `scripts/recipes.ts` and `assertQaPass` do |
| "Node ≥ 22 works too" | `examples/build-with-bun.ts:2`, `package.json` `engines` | `node dist/cli/bin.js build …` → `ReferenceError: Bun is not defined`; library subpaths do run under Node |
| Release "runs `bun run verify`" | `PUBLISHING.md` step 6 | `release.yml:44` omits `placeholders` and `recipes` |
| "Only after ci passed on that commit" | `release.yml` header | not enforced; any `v*` tag on any commit can publish |
| "Test files ship to no one" | `CONTRIBUTING.md` | 16 `recipes/**/*.test.ts` are in the tarball, and none of them run in the gate |
| `importGlb` / neural adapters "(planned)" | `SECURITY.md`, `docs/idea/08-neural-adapters.md:3` | `importGlb`, `refine`, `finish --model http` ship |
| AGENTS.md ships in the package | `llms.txt`, `CLAUDE.md` | not in `package.json` `files` |
| Shipped QA lists "degenerate triangles" | `README.md:178` | `degenerateTriangles` is exported but not in `DEFAULT_GATES` |
| Every asset has a contact sheet | `CLAUDE.md` | `scripts/recipes.ts:90` checks `hero.png` + `manifest.json`, not `sheet.png` |
| `errors.md` is the catalogue | `docs/architecture/errors.md` | 6 union codes undocumented; `T3D_TEAM_COLOUR_HIDDEN` thrown as a raw string outside the union |

Checked and true: zero runtime deps; byte-identical GLB/PNG on rebuild; Khronos validator 0 errors
/ 0 warnings on ~30 GLBs; every action SHA-pinned; every recipe lands in exactly one shard; no
secrets tracked; `dist/` reproducible; physics inertia/COM exact; mirrored `place` keeps winding.

## Slices
Waves respect the ≤ 4 parallel rule. Files are disjoint across slices.

| Wave | Slice | One line |
|---|---|---|
| 1 | [01-core-contracts](01-core-contracts.md) | New error codes, asset/option validation, mirrored motion axis, child seeds, `errors.md` |
| 2 | [02-material-grammar](02-material-grammar.md) | `hex` parsing, stable custom-strip rows, strict `split` / `parseWhyte` |
| 2 | [03-primitives-passes-audio](03-primitives-passes-audio.md) | Reject inside-out / NaN / zero-segment geometry, pass option ranges, unique audio names |
| 2 | [04-untrusted-input-network](04-untrusted-input-network.md) | GLB reader hardening, import scale checks, fetch timeouts, Wikidata ranking |
| 2 | [05-qa-gates](05-qa-gates.md) | Clash face sampling, sunk parts, finding codes + distances, degenerate gate |
| 3 | [06-export-pivots](06-export-pivots.md) | Pivot reparenting on merge, unknown-parent error, reserved `body` |
| 3 | [07-cli](07-cli.md) | Coded errors everywhere, strict flags, `--json` on stdout, LOD QA in `build`, relative manifest paths |
| 3 | [09-packaging-release-ci](09-packaging-release-ci.md) | `exports`/`files`, pack smoke test, release guards, CI aggregate + site job |
| 4 | [08-gate-guards](08-gate-guards.md) | `--only` typo fails, recipe tests in the gate, `conventions` + `pack` steps, `sheet.png` check |
| 4 | [10-site](10-site.md) | Worker crash handling, WebGL fallback, meta tags |
| 5 | [11-docs](11-docs.md) | Every doc claim in "Falsified" corrected; defect-catalogue rows D26–D40; CHANGELOG; roadmap |

End: coordinator runs `bun run shots` for changed recipes, then the full `bun run verify` once.

## Done when
- `bun run verify` green including the new `conventions` and `pack` steps; `--only lnt` exits non-zero.
- Every repro listed in slices 01–07 has a test that failed before its fix.
- `t3d build` on a missing file, a throwing recipe and an unknown flag each prints one `T3D_*` code + `fix:`; with `--json`, one JSON envelope on stdout.
- The `sound_demo` GLB places `crate_knock` at its QA world position.
- Packed tarball installs into an empty project; `bunx t3d build` passes and every `exports` subpath imports under Bun and Node.
- Defect catalogue has one shipped row per defect class (D26–D40), each naming its test.
- No doc in the "Falsified" table still makes its claim.

## Risks / open questions
| Item | Default taken in this plan | Alternative |
|---|---|---|
| CLI under Node | Declare the CLI Bun-only (shebang is already `bun`; stack rule is "Bun only"); library stays Node-importable and `pack` proves both | Port 29 `Bun.*` calls in `src/cli` to `node:fs` / `node:crypto` |
| Draw-call rule | Reword to "one material; one draw per moving pivot"; optional `budget.draws` enforced by `t3d build` | Hard gate at 1 draw: breaks every animated asset |
| Wide `tolerance` | Above the gate default requires a `why`; hard cap 0.5; `recipes/dragon` gets `why`s | Cap at 0.10: dragon measures must be re-derived |
| `split` underfill now throws | Recipes relying on silent gaps fail `recipes`; coordinator fixes each by adding a flex term | Keep silent underfill (leaves `gaps` to catch it) |
| Stable custom-strip rows | Rows change for recipes using `defineMaterial` (wolf, dragon, amur_tiger, creature heads): sheets and UVs move once; refresh with `bun run shots` | none: current rows depend on process history |
| `shots` job diffing committed renders | Enforce `git diff --exit-code recipes/*/out`; if CI and a dev box differ by float rounding, fall back to manifest-only and link roadmap line 49 | Keep triangle-count staleness only |
| Recipe tests in CI time | Run inside the sharded `recipes` step, so no shard grows by more than its own recipes' tests | Add `recipes` to the `test` script (shard 1 grows ~1 min; CI is already 5 m 20 s) |
| Owner-only repo settings (not executable by agents; outward-facing) | Listed in slice 09 `## Owner actions`: require PR + `verify` check on `main`, `v*` tag ruleset, reviewers on the `npm-publish` environment | none |
| Repo weight (100 MB tracked, 482 PNGs, no LFS) | Out of scope; noted for a later plan | LFS migration rewrites history |
| `src/cli/run.ts` is 286 LOC (ceiling 300) | Slice 07 splits it before adding code | none |
