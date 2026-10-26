# Publishing

**Merging a `chore: release x.y.z` PR is the release.** Nobody runs `npm publish` after the one-time bootstrap. CI tags, writes the GitHub Release and publishes to npm through OIDC trusted publishing with provenance. No `NPM_TOKEN` exists anywhere.

One package, `@developerz-ai/ts23d`, so one version, one tag, one trusted publisher ([ADR 006](docs/decisions/006-single-package-subpath-exports.md)).

**This page states no current version, on purpose.** Ask the registry:

| Fact | Command |
|---|---|
| What npm serves | `npm view @developerz-ai/ts23d version` |
| Provenance on a release | `npm view @developerz-ai/ts23d@<version> dist.attestations _npmUser` |
| The tree is stamped at a version | `bun run release --check <version>` |
| The tag is annotated and on the remote | `git ls-remote --tags origin 'refs/tags/v<version>*'` (a `^{}` line means annotated) |
| The GitHub Release exists | `gh release view v<version> --json tagName,isDraft,publishedAt` |

## The flow

```
bun run release x.y.z ─► PR "chore: release x.y.z" ─► merge to main ─► ci green
   ─► release-tag.yml: annotated vX.Y.Z tag + GitHub Release (notes = CHANGELOG section)
   ─► dispatches release.yml on the tag ─► check (stamp + verify) ─► publish (OIDC, provenance)
```

| Step | Who | What happens |
|---|---|---|
| 1. Stamp | You / an agent | `bun run release x.y.z` sets `package.json` `version` and turns `## [Unreleased]` in `CHANGELOG.md` into `## [x.y.z] - <date>` (a fresh empty `[Unreleased]` stays on top). `RELEASE_DATE=YYYY-MM-DD` overrides the date |
| 2. PR | You / an agent | `git switch -c release/x.y.z && git commit -am 'chore: release x.y.z' && gh pr create --fill`. Title **exactly** `chore: release x.y.z` |
| 3. Merge | Reviewer | Merge to `main` with the title as the commit message (squash keeps it) |
| 4. `ci` | GitHub Actions | `bun run verify` on the merge commit |
| 5. `release-tag.yml` | GitHub Actions | Runs when `ci` succeeds on a push to `main` whose head commit message starts with `chore: release `. Reads the version from `package.json`, checks the stamp, and if `vX.Y.Z` isn't tagged yet: annotated tag → GitHub Release with that CHANGELOG section → `gh workflow run release.yml --ref vX.Y.Z -f version=X.Y.Z` |
| 6. `release.yml` `check` | GitHub Actions | Refuses any ref but `refs/tags/vX.Y.Z`, re-checks the stamp, runs `bun run verify` |
| 7. `release.yml` `publish` | GitHub Actions, environment `npm-publish` | npm ≥ 11.5.1, `bun run build`, `npm publish --access public --provenance`. Only this job holds `id-token: write`; it restores no cache |

The dispatch in step 5 is needed because a tag pushed with `GITHUB_TOKEN` triggers no workflow by itself.

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

Repository → Settings → Environments → **New environment** `npm-publish`. Add a deployment tag rule `v*` so only release tags can deploy to it. Required reviewers: optional (the `check` job and the tag rule are the gate).

### 3. Trusted publisher on npmjs.com

`npmjs.com/package/@developerz-ai/ts23d` → **Settings** → **Trusted Publisher** → **GitHub Actions**:

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
npm view @developerz-ai/ts23d@<version> dist.attestations _npmUser
```

`_npmUser` should be GitHub Actions with an attestation present. A person's name means it was a hand publish.

## Recovery

| Symptom | Cause | Fix |
|---|---|---|
| Merged, no tag | `ci` failed, or the commit message didn't start with `chore: release ` | Fix and re-run `ci`; or tag by hand (`git tag -a vX.Y.Z -m vX.Y.Z <sha> && git push origin vX.Y.Z`) then `gh workflow run release.yml --ref vX.Y.Z -f version=X.Y.Z` |
| Tag + Release exist, npm doesn't have it | `release.yml` failed or wasn't dispatched | `gh workflow run release.yml --ref vX.Y.Z -f version=X.Y.Z` |
| `publish` fails at OIDC exchange (`E404` / `ENEEDAUTH`) | No trusted publisher, or workflow / environment mismatch | Bootstrap step 3; field values must match exactly |
| `check` says not stamped | `package.json` or `CHANGELOG.md` at the tag isn't at that version | You can't republish a tag. Stamp the next patch and release that |
| Published a bad version | — | `npm deprecate @developerz-ai/ts23d@X.Y.Z "<why, what to use>"`, then release a fix. Never unpublish |
