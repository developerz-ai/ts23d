# Brief: is a release needed?

Weekly checkup, fired by `schedules: release-due`. A member can still cut by hand at any time.

A release is a merged `chore: release x.y.z` PR: `release-tag.yml` tags it and `release.yml` publishes
`@developerz.ai/ts23d` to npm through OIDC (`PUBLISHING.md`). This brief only judges and files; it never
stamps, tags or publishes.

## Decide

```bash
last=$(git tag --list 'v*' --sort=-v:refname | head -1)
git log --oneline "$last"..origin/main
gh run list --workflow ci.yml --branch main --event push --limit 1 --json conclusion,headSha
```

Read the window's diffs and `## [Unreleased]` in `CHANGELOG.md`. Users get something from a release when
the window holds a fix they can hit, a new primitive, kind, QA gate or export option, or a new recipe.
Docs, CI, repo tooling and test-only changes do not earn one. A red `main` never gets a release: leave that to `health`.

## The ask

If a release is due, file one issue, **Release `<next>`**, unless an open issue already has that exact title.
In 0.x: patch for fixes, minor for anything added or changed (a minor may break). The body lists the commits
since `$last`, flags any `[Unreleased]` entry missing for a user-visible change, and states the steps:
`bun run release <next>` → PR titled exactly `chore: release <next>` → merge.

## Rows

- `release-window`: the window was read against a resolved `$last`. A failed command is unknown, not "no release".
- `release-judged`: a release was filed, or the window holds nothing a user would notice.
