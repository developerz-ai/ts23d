---
description: Cut a release of @developerz-ai/ts23d (stamp → PR → merge = publish via OIDC)
argument-hint: <x.y.z>
---

Version: $ARGUMENTS — follow `PUBLISHING.md`.

1. `bun run verify` on fresh main.
2. `bun run release $ARGUMENTS` (stamps package.json + CHANGELOG), review the CHANGELOG section.
3. Branch `release/$ARGUMENTS`, commit `chore: release $ARGUMENTS`, `gh pr create --fill`.
4. Merge on green. `release-tag.yml` tags `v$ARGUMENTS`, creates the GitHub Release, dispatches
   `release.yml` → npm publish with provenance via OIDC. Never tag, `gh release create` or
   `npm publish` by hand.
5. Confirm: `npm view @developerz-ai/ts23d version` and `gh release view v$ARGUMENTS`.
