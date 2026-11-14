# Brief: is a release needed?

Weekly checkup, fired by `schedules: release-due`. The agent judges and, when a release is due, cuts
it. A member can still cut by hand at any time.

A release is a merged `chore: release x.y.z` PR: `release-tag.yml` tags it and `release.yml` runs
the full gate and publishes `@developerz.ai/ts23d` to npm through OIDC (`PUBLISHING.md`). Never tag,
publish or dispatch a workflow by hand; the merge does all of it.

## Decide

```bash
git fetch --quiet --tags origin '+refs/heads/main:refs/remotes/origin/main'
last=$(git tag --list 'v*' --sort=-v:refname | head -1)
[ -n "$last" ] || { echo "no v* tag: unknown"; exit 1; }
npm view "@developerz.ai/ts23d@${last#v}" version   # must print ${last#v}; otherwise health owns it
git log --oneline "$last"..origin/main
gh run list --workflow ci.yml --branch main --event push --limit 1 --json conclusion,headSha
```

Read the window's diffs and `## [Unreleased]` in `CHANGELOG.md`. Users get something from a release
when the window holds a fix they can hit, a new primitive, kind, QA gate, export option or CLI flag,
or a new recipe. Docs, CI, repo tooling and test-only changes do not earn one. A red `main`, or a
`$last` npm does not serve, never gets a release: that is `health`'s.

## Cut

In 0.x: patch for fixes only, minor for anything added or changed (a minor may break).

1. Every user-visible change in the window has an `[Unreleased]` line; add the missing ones first.
2. `git checkout -b chore/release-<next> origin/main && bun run release <next>`.
3. `bun run verify` green, then PR titled exactly `chore: release <next>`, body: the commits since
   `$last` and why this is a patch or a minor.
4. Merge when the `verify` check is green; then confirm `release.yml` succeeded and
   `npm view @developerz.ai/ts23d version` prints `<next>`. A failed publish is `health`'s next ask
   and `PUBLISHING.md` has the recoveries.

**1.0.0 is not the agent's call.** If the window would make it 1.0.0, file one issue,
**Release `1.0.0`?**, with the evidence, and cut nothing.

If no release is due, end the run summary with `no release: <reason>`.

## Rows

- `release-window`: the window was read against a resolved `$last` that npm serves. A failed command is unknown, not "no release".
- `release-judged`: a release was cut and published, or the window holds nothing a user would notice.
