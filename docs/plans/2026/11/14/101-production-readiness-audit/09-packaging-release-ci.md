# 09 — Packaging, release, CI

Rule: what npm serves is what the gate tested; a release cannot skip the gate.

## Files
| Path | State | Why |
|---|---|---|
| `package.json` | changed | `exports`, `files`, `engines` note (the only slice that edits it) |
| `scripts/pack-smoke.ts` + `.test.ts` | new | install the tarball as a consumer |
| `scripts/build.ts` + `build.test.ts` (new) | changed | rewrite inline `import("…ts")` in `.d.ts` |
| `scripts/release.ts` + `release.test.ts` (new) | changed | guards |
| `.github/workflows/ci.yml`, `pages.yml`, `release.yml`, `release-tag.yml` | changed | below |
| `.github/pull_request_template.md` | changed | `recipes/<name>/<name>.ts` |
| `.dz/maintainer/maintainer.yml` | checked | `required_checks: [verify]` becomes true via the aggregate job |
| `PUBLISHING.md` | changed | matches the workflows |
| `examples/build-with-bun.ts` | changed | header: library runs on Node ≥ 22, this file and the CLI need Bun |

## Depends on
04: `dist/neural/refine.d.ts:23` leaks `RequestInit` / `Response`; slice 04 replaces them with a local structural type, which step (3) of the smoke test then proves. `pack-smoke.ts` lands before slice 08 lists the `pack` step.

## Change
`package.json`:
- `exports`: replace `"./*"` with one explicit entry per module in `scripts/lib/tiers.ts` `TIERS` except `cli` (16 subpaths), plus `"./package.json"`. Today `@developerz.ai/ts23d/cli` and `/types` are advertised and fail to resolve. Add a test in `scripts/pack-smoke.test.ts` that the list equals `TIERS` minus `cli`.
- `files`: add `AGENTS.md`, `!recipes/**/*.test.ts`, `!recipes/**/*.png`, `!dist/**/*.map` (tarball today: 4.57 MB packed, 1,492 files, 3.4 MB of maps, 1.3 MB of demo PNGs).
- `engines`: keep both; add `"prepack": "bun run build"`.

`scripts/pack-smoke.ts`: `bun pm pack` into a temp dir → `bun add <tarball>` in an empty project →
(1) `bunx t3d build` on a two-box recipe written by the script → QA PASS, exit 0; (2) import every
`exports` subpath under `bun` and under `node` (skip Node with a printed notice if `node` is not on
PATH); (3) `tsc --noEmit` on a file importing the root with `skipLibCheck: false` and no DOM lib;
(4) tarball contains no `*.test.ts`, no `recipes/**/*.png`, and does contain `AGENTS.md`. Errors
are `Ts23dError('T3D_RELEASE')` with the failing step in `fix`.

`scripts/build.ts`: the `.ts` → `.js` specifier rewrite also covers `import("…/index.ts")` type
imports (5 files today, e.g. `dist/physics/mass.d.ts:32`).

`scripts/release.ts`: refuse when the version is not greater than the current one, when
`[Unreleased]` is empty, or when the version section already exists (`T3D_RELEASE`).

Workflows (every new `uses:` SHA-pinned, top-level `permissions: contents: read`):
- `ci.yml`: add job `site` (`bun run site:build`); add aggregate job named exactly `verify` with `needs: [<matrix verify job>, shots, site]`, `if: always()`, failing unless all succeeded (rename the matrix job's id so check names do not collide). `shots` ends with `git diff --exit-code -- recipes/*/out` (fallback in overview risks). Weighted sharding is out of scope (`scripts/lib/shard.ts` belongs to no slice); the 5 m 16 s vs 46 s imbalance is already in `status.yml` notes.
- `release.yml:41`: pass `inputs.version` through `env:`, not inline in `run:`. Line 44: run the full `bun run verify` (no `--only`). `check` job: fail unless the tag commit is an ancestor of `origin/main` and has a successful `ci` run (`gh run list --commit`).
- `release-tag.yml`: each step idempotent — skip tag creation if the tag exists, skip release creation if the release exists, always dispatch `release.yml` unless the version is already on npm.
- `pages.yml`: `apt-get update` before installing `webp`; fail if `cwebp` is missing instead of silently shipping PNGs.

## Owner actions
Repo settings an agent must not change on its own; list them in the PR body for the owner:
- `main` ruleset: require a pull request and the `verify` status check.
- Tag ruleset for `v*`: restrict creation to the release workflow / maintainers.
- `npm-publish` environment: required reviewer + deployment tag policy `v*`.

## Tests
- `pack-smoke.test.ts`: `exports` keys equal `TIERS` minus `cli`; a fixture file list containing a `.test.ts` is rejected.
- `build.test.ts`: a `.d.ts` string with `import("../index.ts")` is rewritten.
- `release.test.ts`: lower version, empty Unreleased, double stamp → each `T3D_RELEASE`.
- Workflow changes: `scripts/ci-parity.test.ts` (owned by slice 08) is the pin; hand it the new job names.

## Checks
`bun test scripts/pack-smoke.test.ts scripts/build.test.ts scripts/release.test.ts` ·
`bun run scripts/pack-smoke.ts` · `bun run verify --only lint,typecheck,build`.

## Docs
`PUBLISHING.md` here. Slice 11: README install section, CHANGELOG ("`exports` is now an explicit
list; `./cli` and `./types` never resolved").

## Done when
`pack-smoke` passes locally; a PR shows one `verify` check; `release.yml` runs the whole gate and
refuses a tag that is not on a green `main` commit.
