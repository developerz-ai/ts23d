# Publishing

**Merging a `chore: release x.y.z` PR is the release.** Nobody runs `npm publish` after the one-time bootstrap. CI tags, writes the GitHub Release and publishes to npm through OIDC trusted publishing with provenance. No `NPM_TOKEN` exists anywhere.

One package, `@developerz.ai/ts23d`, so one version, one tag, one trusted publisher ([ADR 006](docs/decisions/006-single-package-subpath-exports.md)).

**This page states no current version, on purpose.** Ask the registry:

| Fact | Command |
|---|---|
| What npm serves | `npm view @developerz.ai/ts23d version` |
| Provenance on a release | `npm view @developerz.ai/ts23d@<version> dist.attestations _npmUser` |
| The tree is stamped at a version | `bun run release --check <version>` |
| The tag is annotated and on the remote | `git ls-remote --tags origin 'refs/tags/v<version>*'` (a `^{}` line means annotated) |
| The GitHub Release exists | `gh release view v<version> --json tagName,isDraft,publishedAt` |

## The flow

```
bun run release x.y.z ─► PR "chore: release x.y.z" ─► merge to main ─► ci green
   ─► release-tag.yml: annotated vX.Y.Z tag + GitHub Release (notes = CHANGELOG section)
   ─► dispatches release.yml on the tag ─► check (on main + green ci + stamp + full verify)
   ─► publish (OIDC, provenance)
```

| Step | Who | What happens |
|---|---|---|
| 0. Summary | You / an agent | Under `## [Unreleased]` in `CHANGELOG.md`, write the release's summary: one sentence of what users get, as the first paragraph under the heading, before any `###` |
| 1. Stamp | You / an agent | `bun run release x.y.z` sets `package.json` `version` (and `src/export/version.ts`), turns `## [Unreleased]` in `CHANGELOG.md` into `## [x.y.z] - <date>` (a fresh empty `[Unreleased]` stays on top), moves the link index at the bottom (`[Unreleased]` compares from `vx.y.z`, `[x.y.z]` compares from the previous tag) and regenerates `docs/changelog/` (a page per version plus the `README.md` index). `RELEASE_DATE=YYYY-MM-DD` overrides the date. Refused (`T3D_RELEASE`) when `x.y.z` is not above the current version, when `[Unreleased]` has no entries or no summary sentence, when `[x.y.z]` already exists, or when the `[Unreleased]` link does not compare from the latest version (`bun run changelog` rebuilds the index). Links and pages are generated, never hand-edited; the `conventions` gate step fails on drift |
| 2. PR | You / an agent | `git switch -c release/x.y.z && git add -A CHANGELOG.md docs/changelog && git commit -am 'chore: release x.y.z' && gh pr create --fill`. Title **exactly** `chore: release x.y.z` |
| 3. Merge | Reviewer | Merge to `main` with the title as the commit message (squash keeps it) |
| 4. `ci` | GitHub Actions | On the merge commit: `gate` (`bun run verify`, 12 shards), `shots` (renders; fails if committed `recipes/*/out` are stale), `site` (`bun run site:build`). The `verify` job passes only when all three succeeded; it is the one required check |
| 5. `release-tag.yml` | GitHub Actions | Runs when `ci` succeeds on a push to `main` whose head commit message starts with `chore: release `. Reads the version from `package.json`, checks the stamp, then, each step skipped when already done: annotated tag `vX.Y.Z` on that commit (a tag on another commit fails) → GitHub Release with that CHANGELOG section → `gh workflow run release.yml --ref vX.Y.Z -f version=X.Y.Z` unless npm already serves `X.Y.Z`. Re-running it finishes a half-done release |
| 6. `release.yml` `check` | GitHub Actions | Refuses any ref but `refs/tags/vX.Y.Z`, a tag commit that is not on `origin/main`, and a commit with no successful `ci` push run (`gh run list --commit`); re-checks the stamp; runs the whole gate, `bun run verify`, unsharded (every step, recipes included) |
| 7. `release.yml` `publish` | GitHub Actions, environment `npm-publish` | npm ≥ 11.5.1, `npm publish --access public --provenance` (its `prepack` script runs `bun run build`). Only this job holds `id-token: write`; it restores no cache |

The dispatch in step 5 is needed because a tag pushed with `GITHUB_TOKEN` triggers no workflow by itself.

## What ships

`package.json` `files` and `exports` decide it; `bun run scripts/pack-smoke.ts` proves it. It packs the tarball (`prepack` builds `dist/`), installs it into an empty project and, as a consumer: builds a two-box recipe with `bunx t3d build` to QA PASS, imports every `exports` subpath under Bun and Node, type-checks them with `tsc` (`skipLibCheck: false`, no DOM lib), and fails if the tarball carries `*.test.ts`, `recipes/**/*.png` or `dist/**/*.map`, lacks `CLAUDE.md`, or misses an `exports` target. `exports` is an explicit list: the root, one subpath per module in `scripts/lib/tiers.ts` except `cli`, and `./package.json`. The library imports under Node ≥ 22 (the `default` condition, `dist/`); the `t3d` CLI and the examples need Bun. `AGENTS.md` is a symlink to `CLAUDE.md` and npm skips symlinks, so the package ships `CLAUDE.md` only.

## Versioning

0.x: minor = may break, patch = fixes and additions. Breaking changes get a `### Changed` / `### Removed` entry saying what to do. 1.0 freezes the DSL surface, the IR conventions ([ADR 004](docs/decisions/004-z-up-metres.md)) and the `T3D_*` codes.

## One-time bootstrap (manual, needs npm auth)

A trusted publisher can only be attached to a package that **already exists** on npm. So the very first version is published by hand; every later version goes through the workflow.

### 1. First publish by hand

From a clean checkout of the stamped commit on `main`, logged in as a member of the `developerz-ai` npm org:

```sh
npm login
bun install --frozen-lockfile
bun run verify
bun run build
npm publish --access public
```

This version carries **no provenance** (`_npmUser` is a person, no `dist.attestations`). That's expected for the bootstrap only. If the workflow already tagged it, the GitHub Release exists; otherwise tag it by hand: `git tag -a vX.Y.Z -m vX.Y.Z && git push origin vX.Y.Z`.

### 2. GitHub environment

Repository → Settings → Environments → **New environment** `npm-publish`. Add a deployment tag rule `v*` so only release tags can deploy to it. No required reviewer: ts23d is AI-maintained (`.dz/maintainer/maintainer.yml`), and what stands behind each publish is the full gate in `release.yml` plus its check that the tag commit is on a green `main`.

### 2b. Repository rules

- Ruleset on `main`: require a pull request and the `verify` status check (the `ci` aggregate job; one check, not the 25 shard jobs).
- Tag ruleset on `v*`: restrict creation to maintainers and the release workflow, so nobody else can mint a release tag.

### 3. Trusted publisher on npmjs.com

`npmjs.com/package/@developerz.ai/ts23d` → **Settings** → **Trusted Publisher** → **GitHub Actions**:

| Field | Value |
|---|---|
| Organization or user | `developerz-ai` |
| Repository | `ts23d` |
| Workflow filename | `release.yml` |
| Environment | `npm-publish` |

**Set the environment.** Blank means npm accepts a token from any run of `release.yml`, whatever job produced it. `npm-publish` makes the registry refuse a token minted outside that environment, and it must match `environment.name` in the workflow exactly.

Optionally, under **Publishing access**, require 2FA and disallow tokens, so the trusted publisher is the only way in.

### 4. Prove it

Cut the next patch through the normal flow, then:

```sh
npm view @developerz.ai/ts23d@<version> dist.attestations _npmUser
```

`_npmUser` should be GitHub Actions with an attestation present. A person's name means it was a hand publish.

## Recovery

| Symptom | Cause | Fix |
|---|---|---|
| Merged, no tag | `ci` failed, or the commit message didn't start with `chore: release ` | Fix and re-run `ci` (a green re-run triggers `release-tag.yml`); or tag by hand (`git tag -a vX.Y.Z -m vX.Y.Z <sha> && git push origin vX.Y.Z`) then `gh workflow run release.yml --ref vX.Y.Z -f version=X.Y.Z` |
| Tag exists, no Release, or npm doesn't have it | `release-tag.yml` or `release.yml` failed midway | Re-run the failed `release-tag` run: every step it already did is skipped. Or `gh workflow run release.yml --ref vX.Y.Z -f version=X.Y.Z` |
| `check` says not on main / no green ci | The tag was cut by hand on a commit outside `main`, or `ci` on it failed | Delete that tag; release from a merged, green `main` commit |
| `publish` fails at OIDC exchange (`E404` / `ENEEDAUTH`) | No trusted publisher, or workflow / environment mismatch | Bootstrap step 3; field values must match exactly |
| `check` says not stamped | `package.json` or `CHANGELOG.md` at the tag isn't at that version | You can't republish a tag. Stamp the next patch and release that |
| Published a bad version | — | `npm deprecate @developerz.ai/ts23d@X.Y.Z "<why, what to use>"`, then release a fix. Never unpublish |
